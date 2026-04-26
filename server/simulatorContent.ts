import { canAccessBooking } from "@shared/booking-utils";
import {
  resolveScreenContent,
  type ResolverDeps,
  type ResolveResult,
} from "./contentResolver";
import type { Screen } from "@shared/schema";
import { DEFAULT_SCHEDULE_TIMEZONE_FALLBACK } from "@shared/timezone-utils";

export type SimulatorLayoutSource =
  | "none"
  | "live_override"
  | "scheduled"
  | "fallback";

export interface SimulatorContentSummary {
  layoutId: string | null;
  layoutSource: SimulatorLayoutSource;
  layoutSourceDetail: string | null;
  fallbackPlaylistId: string | null;
}

/**
 * Wrap a base resolver `deps` with simulator-specific client-scope filtering
 * applied to the active-event lookup. Block / live-override / fallback
 * resolution stays bit-for-bit identical to the player endpoint, but an
 * account manager will not see scheduled content from events whose client
 * is outside their allowed set.
 *
 * `allowed === null` means "no restriction" (admins / system). Anything else
 * is the explicit allow-list and an empty array means "no access".
 */
export function withSimulatorClientScope(
  deps: ResolverDeps,
  screen: Pick<Screen, "clientId">,
  allowed: readonly string[] | null,
): ResolverDeps {
  return {
    ...deps,
    getCurrentEventForScreen: async (screenId, asOf) => {
      const raw = await deps.getCurrentEventForScreen(screenId, asOf);
      if (!raw) return undefined;
      const ok = canAccessBooking(
        screen.clientId ?? null,
        raw.clientId ?? null,
        allowed,
      );
      return ok ? raw : undefined;
    },
  };
}

/**
 * Translate the structured resolver outcome into the simulator UI's
 * legacy `layoutSource` / `layoutSourceDetail` shape so the in-app
 * preview keeps its existing badge labels and "Fallback Playlist"
 * discriminator.
 */
export function summariseForSimulator(
  result: ResolveResult,
  screen: Pick<Screen, "fallbackPlaylistId">,
): SimulatorContentSummary {
  const outcome = result.trace.find((s) => s.kind === "outcome");
  const source =
    outcome && outcome.kind === "outcome" ? outcome.source : "nothing";
  const blockName =
    outcome && outcome.kind === "outcome" ? outcome.blockName : null;

  let layoutSource: SimulatorLayoutSource;
  let layoutSourceDetail: string | null;
  switch (source) {
    case "live-override":
      layoutSource = "live_override";
      layoutSourceDetail = "Live Override";
      break;
    case "block":
      layoutSource = "scheduled";
      layoutSourceDetail = blockName;
      break;
    case "fallback-layout":
      layoutSource = "fallback";
      layoutSourceDetail = "Fallback Layout";
      break;
    case "fallback-playlist":
      layoutSource = "fallback";
      layoutSourceDetail = "Fallback Playlist";
      break;
    case "nothing":
    default:
      layoutSource = "none";
      layoutSourceDetail = null;
      break;
  }

  return {
    layoutId: result.layout?.id ?? null,
    layoutSource,
    layoutSourceDetail,
    fallbackPlaylistId:
      !result.layout && screen.fallbackPlaylistId
        ? screen.fallbackPlaylistId
        : null,
  };
}

/**
 * Run the shared player resolver for the simulator preview, applying the
 * simulator's client-scope filtering, and return both the raw resolver
 * result and the simulator UI summary.
 */
export async function resolveSimulatorContent(
  screen: Screen,
  now: Date,
  deps: ResolverDeps,
  allowed: readonly string[] | null,
  tz: string = DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
): Promise<{ result: ResolveResult; summary: SimulatorContentSummary }> {
  const scopedDeps = withSimulatorClientScope(deps, screen, allowed);
  const result = await resolveScreenContent(screen, now, scopedDeps, tz);
  const summary = summariseForSimulator(result, screen);
  return { result, summary };
}
