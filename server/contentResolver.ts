import type {
  Event,
  LayoutTemplate,
  LiveOverride,
  Playlist,
  Programme,
  ProgrammeVersion,
  ScheduleBlock,
  Screen,
} from "@shared/schema";
import {
  DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
  describeTzOffset,
  getWallPartsInTz,
  parseHHMMString,
  startOfDayInTz,
  endOfDayInTz,
} from "@shared/timezone-utils";

export type ContentResolveOutcomeSource =
  | "live-override"
  | "block"
  | "fallback-layout"
  | "fallback-playlist"
  | "nothing";

export type BlockDecision =
  | "matched"
  | "matched-block-fallback-playlist"
  | "target-mismatch"
  | "outside-date-range"
  | "wrong-day-of-week"
  | "outside-time-of-day"
  | "layout-deleted"
  | "no-layout-no-fallback"
  | "not-considered";

export type ContentResolveStep =
  | {
      kind: "screen-info";
      screenId: string;
      screenName: string;
      lastSeen: string | null;
      fallbackLayoutId: string | null;
      fallbackPlaylistId: string | null;
      serverNow: string;
      serverTz: string;
    }
  | {
      kind: "live-override-check";
      matched: boolean;
      overrideId: string | null;
      overrideName: string | null;
      reason: string;
    }
  | {
      kind: "active-event";
      matched: boolean;
      eventId: string | null;
      eventName: string | null;
      reason: string;
    }
  | {
      kind: "version-considered";
      programmeId: string;
      programmeName: string;
      versionId: string;
      versionNumber: number;
      status: string;
      included: boolean;
      reason: string;
    }
  | {
      kind: "block-evaluated";
      blockId: string;
      blockName: string;
      priority: number;
      layoutTemplateId: string | null;
      layoutName: string | null;
      decision: BlockDecision;
      detail: string;
    }
  | {
      kind: "fallback-layout";
      pass: boolean;
      layoutId: string | null;
      layoutName: string | null;
      reason: string;
    }
  | {
      kind: "fallback-playlist";
      pass: boolean;
      playlistId: string | null;
      playlistName: string | null;
      reason: string;
    }
  | {
      kind: "outcome";
      source: ContentResolveOutcomeSource;
      blockId: string | null;
      blockName: string | null;
      layoutId: string | null;
      layoutName: string | null;
    };

export interface ResolverDeps {
  getLiveOverrides(): Promise<LiveOverride[]>;
  getCurrentEventForScreen(
    screenId: string,
    now?: Date,
  ): Promise<Event | undefined>;
  getProgrammes(): Promise<Programme[]>;
  getProgrammeVersions(): Promise<ProgrammeVersion[]>;
  getScheduleBlocks(programmeVersionId: string): Promise<ScheduleBlock[]>;
  getLayoutTemplate(id: string): Promise<LayoutTemplate | undefined>;
  getScreenGroupIds(screenId: string): Promise<string[]>;
  getPlaylist(id: string): Promise<Playlist | undefined>;
}

export interface ResolveResult {
  layout: LayoutTemplate | null;
  activeZoneSources: any[];
  liveOverride: LiveOverride | null;
  activeEvent: Event | null;
  /** All published-version blocks for the active event, in storage order.
   *  Exposed so callers (player endpoint) can compute next-session info
   *  without re-fetching. Empty array when no event matched. */
  eventBlocks: ScheduleBlock[];
  trace: ContentResolveStep[];
}

interface BlockTarget {
  type: "screen" | "group";
  id: string;
}

interface BlockTimeRule {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
}

type TimeMatch =
  | { ok: true }
  | { ok: false; decision: BlockDecision; detail: string };

function evaluateTimeRule(
  rule: BlockTimeRule | undefined,
  now: Date,
  tz: string,
): TimeMatch {
  if (!rule) return { ok: true };

  const wall = getWallPartsInTz(now, tz);

  if (rule.startDate) {
    const sd = startOfDayInTz(rule.startDate, tz);
    if (sd && now < sd) {
      return {
        ok: false,
        decision: "outside-date-range",
        detail: `Block starts on ${rule.startDate}, which is in the future (${tz}).`,
      };
    }
  }
  if (rule.endDate) {
    const ed = endOfDayInTz(rule.endDate, tz);
    if (ed && now > ed) {
      return {
        ok: false,
        decision: "outside-date-range",
        detail: `Block ended on ${rule.endDate} (${tz}).`,
      };
    }
  }
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    if (!rule.daysOfWeek.includes(wall.dayOfWeek)) {
      return {
        ok: false,
        decision: "wrong-day-of-week",
        detail: `Block only plays on days ${rule.daysOfWeek.join(", ")} (0=Sun); today in ${tz} is ${wall.dayOfWeek}.`,
      };
    }
  }
  if (rule.startTime && rule.endTime) {
    const startHM = parseHHMMString(rule.startTime);
    const endHM = parseHHMMString(rule.endTime);
    if (startHM && endHM) {
      const startMins = startHM.hours * 60 + startHM.minutes;
      const endMins = endHM.hours * 60 + endHM.minutes;
      const nowMins = wall.minuteOfDay;
      // Window is [startMins, endMins) — end is exclusive at minute
      // granularity so adjacent blocks (A 10:00–10:05, B 10:05–10:10)
      // hand off cleanly at 10:05:00 instead of overlapping for the
      // entire 10:05 minute. This matches the convention already used
      // by `derivePlaybackStatus` in `shared/playback-derivation.ts`.
      let inside = true;
      if (endMins <= startMins) {
        // Overnight wrap: [startMins, 24:00) ∪ [00:00, endMins).
        if (nowMins < startMins && nowMins >= endMins) inside = false;
      } else {
        if (nowMins < startMins || nowMins >= endMins) inside = false;
      }
      if (!inside) {
        return {
          ok: false,
          decision: "outside-time-of-day",
          detail: `Block plays ${rule.startTime}-${rule.endTime} (${tz}); current wall time is ${formatWallHHMM(wall)}.`,
        };
      }
    }
  } else {
    if (rule.startTime) {
      const hm = parseHHMMString(rule.startTime);
      if (hm) {
        const startMins = hm.hours * 60 + hm.minutes;
        if (wall.minuteOfDay < startMins) {
          return {
            ok: false,
            decision: "outside-time-of-day",
            detail: `Block starts at ${rule.startTime} (${tz}); current wall time is ${formatWallHHMM(wall)}.`,
          };
        }
      }
    }
    if (rule.endTime) {
      const hm = parseHHMMString(rule.endTime);
      if (hm) {
        const endMins = hm.hours * 60 + hm.minutes;
        // End is exclusive at minute granularity (see comment above).
        if (wall.minuteOfDay >= endMins) {
          return {
            ok: false,
            decision: "outside-time-of-day",
            detail: `Block ended at ${rule.endTime} (${tz}); current wall time is ${formatWallHHMM(wall)}.`,
          };
        }
      }
    }
  }
  return { ok: true };
}

function formatWallHHMM(wall: { hour: number; minute: number }): string {
  const h = String(wall.hour).padStart(2, "0");
  const m = String(wall.minute).padStart(2, "0");
  return `${h}:${m}`;
}

function describeTargets(targets: BlockTarget[]): string {
  if (targets.length === 0) return "all screens";
  return targets
    .map((t) => `${t.type}:${t.id}`)
    .join(", ");
}

export async function resolveScreenContent(
  screen: Screen,
  now: Date,
  deps: ResolverDeps,
  tz: string = DEFAULT_SCHEDULE_TIMEZONE_FALLBACK,
): Promise<ResolveResult> {
  const trace: ContentResolveStep[] = [];
  let layout: LayoutTemplate | null = null;
  let liveOverride: LiveOverride | null = null;
  let activeZoneSources: any[] = [];
  let outcomeSource: ContentResolveOutcomeSource = "nothing";
  let outcomeBlock: { id: string; name: string } | null = null;

  trace.push({
    kind: "screen-info",
    screenId: screen.id,
    screenName: screen.name,
    lastSeen: screen.lastSeen ? screen.lastSeen.toISOString() : null,
    fallbackLayoutId: screen.fallbackLayoutId ?? null,
    fallbackPlaylistId: screen.fallbackPlaylistId ?? null,
    serverNow: now.toISOString(),
    // `serverTz` is the *evaluation* timezone (the screen's client/site
    // timezone) — NOT the server runtime's timezone. Naming kept for
    // backwards compatibility of the trace shape.
    serverTz: `${tz} (${describeTzOffset(now, tz)})`,
  });

  // ===== Live override =====
  const overrides = await deps.getLiveOverrides();
  const activeOverride = overrides.find((o) => {
    if (
      !o.isActive ||
      new Date(o.startTime) > now ||
      new Date(o.endTime) < now
    )
      return false;
    const targets = (o.targets as BlockTarget[] | null) || [];
    if (targets.length === 0) return true;
    return targets.some((t) => t.type === "screen" && t.id === screen.id);
  });

  if (activeOverride && activeOverride.layoutTemplateId) {
    // Mirror the previous inline player-endpoint behaviour: when a live
    // override is active and references a layoutTemplateId, set
    // liveOverride + activeZoneSources unconditionally — even if the layout
    // itself has since been deleted. The downstream payload still reports
    // the override and its zone sources; only `layout` is null in that case.
    const overrideLayout = await deps.getLayoutTemplate(
      activeOverride.layoutTemplateId,
    );
    layout = overrideLayout ?? null;
    liveOverride = activeOverride;
    activeZoneSources = (activeOverride.zoneSources as any[]) || [];
    if (layout) {
      outcomeSource = "live-override";
      trace.push({
        kind: "live-override-check",
        matched: true,
        overrideId: activeOverride.id,
        overrideName: activeOverride.name,
        reason: `Active override "${activeOverride.name}" supplied layout "${layout.name}".`,
      });
    } else {
      // Override applied (liveOverride + zone sources reported) but the chosen
      // layout has been deleted. Parity with the legacy inline player code:
      // we set `liveOverride`/`activeZoneSources` here AND still fall through
      // to block resolution below — a matching scheduled block can therefore
      // replace `layout`/`activeZoneSources`/`outcomeSource`. The outcome
      // source remains "live-override" only when nothing else matches.
      outcomeSource = "live-override";
      trace.push({
        kind: "live-override-check",
        matched: true,
        overrideId: activeOverride.id,
        overrideName: activeOverride.name,
        reason: `Active override "${activeOverride.name}" matched, but its layout has been deleted; zone sources still apply (and any matching block may further override layout/zone sources).`,
      });
    }
  } else if (activeOverride) {
    trace.push({
      kind: "live-override-check",
      matched: false,
      overrideId: activeOverride.id,
      overrideName: activeOverride.name,
      reason: `Override "${activeOverride.name}" matched but has no layout assigned.`,
    });
  } else {
    trace.push({
      kind: "live-override-check",
      matched: false,
      overrideId: null,
      overrideName: null,
      reason: "No live override is currently active for this screen.",
    });
  }

  // ===== Active event + published versions + blocks =====
  const activeEvent = (await deps.getCurrentEventForScreen(screen.id, now)) || null;
  if (!activeEvent) {
    trace.push({
      kind: "active-event",
      matched: false,
      eventId: null,
      eventName: null,
      reason:
        "No screen-event booking covers the current time for this screen.",
    });
  } else {
    trace.push({
      kind: "active-event",
      matched: true,
      eventId: activeEvent.id,
      eventName: activeEvent.name,
      reason: `Active event "${activeEvent.name}" resolved for this screen at ${now.toISOString()}.`,
    });
  }

  let eventBlocks: ScheduleBlock[] = [];
  let publishedVersionsCount = 0;
  if (activeEvent) {
    const [programmes, allVersions] = await Promise.all([
      deps.getProgrammes(),
      deps.getProgrammeVersions(),
    ]);
    const eventProgrammes = programmes.filter(
      (p) => p.eventId === activeEvent.id,
    );
    const programmeById = new Map(eventProgrammes.map((p) => [p.id, p]));
    const eventVersions = allVersions.filter((v) =>
      eventProgrammes.some((p) => p.id === v.programmeId),
    );
    for (const v of eventVersions) {
      const included = v.status === "published";
      if (included) publishedVersionsCount++;
      const programme = programmeById.get(v.programmeId);
      trace.push({
        kind: "version-considered",
        programmeId: v.programmeId,
        programmeName: programme?.name ?? "(unknown programme)",
        versionId: v.id,
        versionNumber: v.versionNumber,
        status: v.status ?? "draft",
        included,
        reason: included
          ? `Published version v${v.versionNumber} contributes its blocks.`
          : `Skipped: version v${v.versionNumber} is in status "${v.status ?? "draft"}".`,
      });
    }

    const publishedVersions = eventVersions.filter(
      (v) => v.status === "published",
    );
    const blocksByVersion = await Promise.all(
      publishedVersions.map((v) => deps.getScheduleBlocks(v.id)),
    );
    eventBlocks = blocksByVersion.flat();
  }

  const screenGroupIds = await deps.getScreenGroupIds(screen.id);
  const screenGroupSet = new Set(screenGroupIds);

  if (!layout && activeEvent) {
    const flatBlocks = [...eventBlocks].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );

    let chosen = false;
    for (const block of flatBlocks) {
      const blockLayoutName = block.layoutTemplateId
        ? "(see layout fetch)"
        : null;

      if (chosen) {
        trace.push({
          kind: "block-evaluated",
          blockId: block.id,
          blockName: block.name,
          priority: block.priority ?? 0,
          layoutTemplateId: block.layoutTemplateId ?? null,
          layoutName: blockLayoutName,
          decision: "not-considered",
          detail: "An earlier (higher-priority) block already matched.",
        });
        continue;
      }

      const targets = (block.targets as BlockTarget[]) || [];
      const targetMatch =
        targets.length === 0 ||
        targets.some(
          (t) =>
            (t.type === "screen" && t.id === screen.id) ||
            (t.type === "group" && screenGroupSet.has(t.id)),
        );
      if (!targetMatch) {
        trace.push({
          kind: "block-evaluated",
          blockId: block.id,
          blockName: block.name,
          priority: block.priority ?? 0,
          layoutTemplateId: block.layoutTemplateId ?? null,
          layoutName: blockLayoutName,
          decision: "target-mismatch",
          detail: `Block targets ${describeTargets(targets)}; this screen is not in that set.`,
        });
        continue;
      }

      const rule = ((block.timeRules as BlockTimeRule[]) || [])[0];
      const timeMatch = evaluateTimeRule(rule, now, tz);
      if (!timeMatch.ok) {
        trace.push({
          kind: "block-evaluated",
          blockId: block.id,
          blockName: block.name,
          priority: block.priority ?? 0,
          layoutTemplateId: block.layoutTemplateId ?? null,
          layoutName: blockLayoutName,
          decision: timeMatch.decision,
          detail: timeMatch.detail,
        });
        continue;
      }

      if (block.layoutTemplateId) {
        const fetchedLayout = await deps.getLayoutTemplate(
          block.layoutTemplateId,
        );
        if (!fetchedLayout) {
          trace.push({
            kind: "block-evaluated",
            blockId: block.id,
            blockName: block.name,
            priority: block.priority ?? 0,
            layoutTemplateId: block.layoutTemplateId,
            layoutName: null,
            decision: "layout-deleted",
            detail: `Block references layout ${block.layoutTemplateId}, which no longer exists.`,
          });
          continue;
        }
        layout = fetchedLayout;
        activeZoneSources = (block.zoneSources as any[]) || [];
        outcomeSource = "block";
        outcomeBlock = { id: block.id, name: block.name };
        chosen = true;
        trace.push({
          kind: "block-evaluated",
          blockId: block.id,
          blockName: block.name,
          priority: block.priority ?? 0,
          layoutTemplateId: block.layoutTemplateId,
          layoutName: fetchedLayout.name,
          decision: "matched",
          detail: `Matched. Using layout "${fetchedLayout.name}" with ${activeZoneSources.length} zone source(s).`,
        });
        continue;
      }

      const blockZoneSources = (block.zoneSources as any[]) || [];
      const hasFallback = blockZoneSources.some(
        (zs: any) =>
          zs.zoneId === "__fallback__" &&
          zs.type === "playlist" &&
          zs.playlistId,
      );
      if (hasFallback) {
        activeZoneSources = blockZoneSources;
        outcomeSource = "block";
        outcomeBlock = { id: block.id, name: block.name };
        chosen = true;
        trace.push({
          kind: "block-evaluated",
          blockId: block.id,
          blockName: block.name,
          priority: block.priority ?? 0,
          layoutTemplateId: null,
          layoutName: null,
          decision: "matched-block-fallback-playlist",
          detail: `Matched. Block has no layout but supplies a fallback playlist via zone sources.`,
        });
        continue;
      }

      trace.push({
        kind: "block-evaluated",
        blockId: block.id,
        blockName: block.name,
        priority: block.priority ?? 0,
        layoutTemplateId: null,
        layoutName: null,
        decision: "no-layout-no-fallback",
        detail:
          "Matched targets and time, but block has no layout and no fallback playlist zone source.",
      });
    }

    if (!chosen && publishedVersionsCount === 0) {
      // Already explained per-version above; nothing extra to add here.
    }
  }

  // ===== Screen-level fallback layout =====
  if (!layout && activeZoneSources.length === 0 && screen.fallbackLayoutId) {
    const fbLayout = await deps.getLayoutTemplate(screen.fallbackLayoutId);
    if (fbLayout) {
      layout = fbLayout;
      outcomeSource = "fallback-layout";
      trace.push({
        kind: "fallback-layout",
        pass: true,
        layoutId: fbLayout.id,
        layoutName: fbLayout.name,
        reason: `Used screen's fallback layout "${fbLayout.name}".`,
      });
    } else {
      trace.push({
        kind: "fallback-layout",
        pass: false,
        layoutId: screen.fallbackLayoutId,
        layoutName: null,
        reason: `Screen's fallback layout ${screen.fallbackLayoutId} no longer exists.`,
      });
    }
  } else if (!layout && activeZoneSources.length === 0) {
    trace.push({
      kind: "fallback-layout",
      pass: false,
      layoutId: null,
      layoutName: null,
      reason: "No fallback layout configured on this screen.",
    });
  }

  // ===== Screen-level fallback playlist =====
  if (!layout && activeZoneSources.length === 0 && screen.fallbackPlaylistId) {
    const fbPlaylist = await deps.getPlaylist(screen.fallbackPlaylistId);
    if (fbPlaylist) {
      activeZoneSources = [
        {
          zoneId: "__fallback__",
          type: "playlist",
          playlistId: screen.fallbackPlaylistId,
        },
      ];
      outcomeSource = "fallback-playlist";
      trace.push({
        kind: "fallback-playlist",
        pass: true,
        playlistId: fbPlaylist.id,
        playlistName: fbPlaylist.name,
        reason: `Used screen's fallback playlist "${fbPlaylist.name}".`,
      });
    } else {
      trace.push({
        kind: "fallback-playlist",
        pass: false,
        playlistId: screen.fallbackPlaylistId,
        playlistName: null,
        reason: `Screen's fallback playlist ${screen.fallbackPlaylistId} no longer exists.`,
      });
    }
  } else if (!layout && activeZoneSources.length === 0) {
    trace.push({
      kind: "fallback-playlist",
      pass: false,
      playlistId: null,
      playlistName: null,
      reason: "No fallback playlist configured on this screen.",
    });
  }

  trace.push({
    kind: "outcome",
    source: outcomeSource,
    blockId: outcomeBlock?.id ?? null,
    blockName: outcomeBlock?.name ?? null,
    layoutId: layout?.id ?? null,
    layoutName: layout?.name ?? null,
  });

  return {
    layout,
    activeZoneSources,
    liveOverride,
    activeEvent,
    eventBlocks,
    trace,
  };
}
