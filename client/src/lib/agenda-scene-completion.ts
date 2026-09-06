/**
 * Coordinates one player's current scene activation.  It deliberately has no
 * React dependency so Player and Simulator can use the same rules.
 *
 * An Agenda activation may finish only after its minimum scene duration and
 * after every expected zone has settled.  A settled failed/unmounted zone is
 * not viable; a ready zone is viable and must report completion.  The safety
 * timer is a last resort for a zone which never gets a chance to settle.
 */

export type PlayerId = string & { readonly __playerId: unique symbol };
export type SceneId = string & { readonly __sceneId: unique symbol };
export type ZoneId = string & { readonly __zoneId: unique symbol };
export type ActivationId = string & { readonly __activationId: unique symbol };

export const playerId = (value: string): PlayerId => value as PlayerId;
export const sceneId = (value: string): SceneId => value as SceneId;
export const zoneId = (value: string): ZoneId => value as ZoneId;
export const activationId = (value: string): ActivationId => value as ActivationId;

export const AGENDA_COMPLETION_GRACE_MS = 10_000;
export const MIN_AGENDA_SAFETY_TIMEOUT_MS = 30_000;
export const MAX_AGENDA_SAFETY_TIMEOUT_MS = 10 * 60_000;
/** Lets mounted Agenda zones register before readable scene time begins. */
export interface AgendaZoneBinding {
  playerId: PlayerId;
  sceneId: SceneId;
  zoneId: ZoneId;
  activationId: ActivationId;
  register(expectedCycleDurationMs?: number): boolean;
  ready(expectedCycleDurationMs?: number): boolean;
  complete(): boolean;
  fail(): boolean;
  unregister(): boolean;
}

export interface AgendaZonePlan {
  zoneId: ZoneId;
  /** Expected duration of one Agenda cycle, in milliseconds. */
  expectedCycleDurationMs?: number;
}

export interface StaticSceneActivation {
  kind: "static";
  playerId: PlayerId;
  sceneId: SceneId;
  activationId: ActivationId;
  /** Preserved exactly; this is the existing non-Agenda scene duration. */
  durationMs: number;
}

export interface AgendaSceneActivation {
  kind: "agenda";
  playerId: PlayerId;
  sceneId: SceneId;
  activationId: ActivationId;
  minimumDurationMs: number;
  expectedAgendaZoneIds: readonly ZoneId[];
  /** Optional plans known before zones mount, used to improve timeout sizing. */
  expectedZonePlans?: readonly AgendaZonePlan[];
}

export type SceneActivation = StaticSceneActivation | AgendaSceneActivation;

export interface AgendaCompletionDiagnostic {
  type:
    | "activation-started"
    | "zone-registered"
    | "zone-ready"
    | "zone-failed"
    | "zone-unregistered"
    | "zone-completed"
    | "minimum-elapsed"
    | "safety-timeout"
    | "advanced";
  sceneId: SceneId;
  activationId: ActivationId;
  zoneId?: ZoneId;
}

export interface AgendaCompletionSnapshot {
  activation: SceneActivation;
  minimumElapsed: boolean;
  settledZoneIds: readonly ZoneId[];
  completedZoneIds: readonly ZoneId[];
  advanced: boolean;
}

export interface AgendaCompletionTimer {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AgendaSceneCompletionCoordinatorOptions {
  timer: AgendaCompletionTimer;
  onAdvance(activation: SceneActivation): void;
  onDiagnostic?(diagnostic: AgendaCompletionDiagnostic): void;
  graceMs?: number;
  minSafetyTimeoutMs?: number;
  maxSafetyTimeoutMs?: number;
}

type ZoneState = "pending" | "loading" | "ready" | "completed" | "failed" | "unregistered";

interface ActiveState {
  activation: SceneActivation;
  startedAt: number;
  minimumElapsed: boolean;
  advanced: boolean;
  zones: Map<ZoneId, ZoneState>;
  cycleDurations: Map<ZoneId, number>;
  minimumTimer?: unknown;
  safetyTimer?: unknown;
  safetyDueAt?: number;
  presentationArmed: boolean;
}

function nonNegativeMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * The deadline is based on the slowest known zone cycle plus grace.  It has a
 * 30-second floor so a missing mount cannot cause a surprising short cutoff,
 * and a ten-minute ceiling so a malformed plan cannot stall playback forever.
 * The scene minimum is always a hard lower bound, even if it is longer than
 * that ceiling.
 */
export function calculateAgendaSafetyTimeoutMs(
  minimumDurationMs: number,
  cycleDurationsMs: readonly number[],
  options: {
    graceMs?: number;
    minSafetyTimeoutMs?: number;
    maxSafetyTimeoutMs?: number;
  } = {},
): number {
  const graceMs = nonNegativeMs(options.graceMs ?? AGENDA_COMPLETION_GRACE_MS);
  const floor = nonNegativeMs(options.minSafetyTimeoutMs ?? MIN_AGENDA_SAFETY_TIMEOUT_MS);
  const ceiling = Math.max(floor, nonNegativeMs(options.maxSafetyTimeoutMs ?? MAX_AGENDA_SAFETY_TIMEOUT_MS));
  const slowestCycle = cycleDurationsMs.reduce(
    (slowest, duration) => Math.max(slowest, nonNegativeMs(duration)),
    0,
  );
  const minimum = nonNegativeMs(minimumDurationMs);
  return Math.max(
    minimum,
    Math.min( Math.max(ceiling, minimum), Math.max(floor, Math.max(minimum, slowestCycle) + graceMs)),
  );
}

/** A pure-ish, timer-injected state machine for a single active player scene. */
export class AgendaSceneCompletionCoordinator {
  private active?: ActiveState;
  private readonly graceMs: number;
  private readonly minSafetyTimeoutMs: number;
  private readonly maxSafetyTimeoutMs: number;

  constructor(private readonly options: AgendaSceneCompletionCoordinatorOptions) {
    this.graceMs = options.graceMs ?? AGENDA_COMPLETION_GRACE_MS;
    this.minSafetyTimeoutMs = options.minSafetyTimeoutMs ?? MIN_AGENDA_SAFETY_TIMEOUT_MS;
    this.maxSafetyTimeoutMs = options.maxSafetyTimeoutMs ?? MAX_AGENDA_SAFETY_TIMEOUT_MS;
  }

  begin(activation: SceneActivation): void {
    this.dispose();
    const zones = new Map<ZoneId, ZoneState>();
    const cycleDurations = new Map<ZoneId, number>();
    if (activation.kind === "agenda") {
      for (const id of activation.expectedAgendaZoneIds) zones.set(id, "pending");
      for (const plan of activation.expectedZonePlans ?? []) {
        if (zones.has(plan.zoneId) && plan.expectedCycleDurationMs !== undefined) {
          cycleDurations.set(plan.zoneId, nonNegativeMs(plan.expectedCycleDurationMs));
        }
      }
    }
    const state: ActiveState = {
      activation, startedAt: this.options.timer.now(), minimumElapsed: false,
      advanced: false, zones, cycleDurations, presentationArmed: false,
    };
    this.active = state;
    this.diagnostic("activation-started", state);
    if (activation.kind === "static") this.armPresentation(activation.activationId);
    else {
      // A missing or never-ready zone is released by this independent safety
      // deadline; it must not consume the readable scene minimum.
      this.scheduleSafety(state);
      this.armWhenSettled(state);
    }
  }

  registerZone(activationIdValue: ActivationId, id: ZoneId, expectedCycleDurationMs?: number): boolean {
    const state = this.currentAgenda(activationIdValue);
    if (!state || !state.zones.has(id)) return false;
    if (expectedCycleDurationMs !== undefined) {
      state.cycleDurations.set(id, Math.max(
        state.cycleDurations.get(id) ?? 0,
        nonNegativeMs(expectedCycleDurationMs),
      ));
    }
    // A terminal zone may be from an old/unmounted renderer.  Never turn it
    // back into pending: a late registration must not invalidate dwell that
    // has already been armed.
    if (state.zones.get(id) === "pending") state.zones.set(id, "loading");
    this.scheduleSafety(state);
    this.diagnostic("zone-registered", state, id);
    return true;
  }

  markZoneReady(activationIdValue: ActivationId, id: ZoneId): boolean {
    const state = this.currentAgenda(activationIdValue);
    if (!state || (state.zones.get(id) !== "pending" && state.zones.get(id) !== "loading")) return false;
    state.zones.set(id, "ready");
    this.diagnostic("zone-ready", state, id);
    this.armWhenSettled(state);
    this.tryAdvance(state);
    return true;
  }

  completeZone(activationIdValue: ActivationId, id: ZoneId): boolean {
    const state = this.currentAgenda(activationIdValue);
    if (!state || state.zones.get(id) !== "ready") return false;
    state.zones.set(id, "completed");
    this.diagnostic("zone-completed", state, id);
    this.tryAdvance(state);
    return true;
  }

  failZone(activationIdValue: ActivationId, id: ZoneId): boolean {
    return this.setNonViable(activationIdValue, id, "failed");
  }

  unregisterZone(activationIdValue: ActivationId, id: ZoneId): boolean {
    return this.setNonViable(activationIdValue, id, "unregistered");
  }

  snapshot(): AgendaCompletionSnapshot | undefined {
    const state = this.active;
    if (!state) return undefined;
    return {
      activation: state.activation, minimumElapsed: state.minimumElapsed, advanced: state.advanced,
      settledZoneIds: [...state.zones].filter(([, value]) => value !== "pending" && value !== "loading").map(([id]) => id),
      completedZoneIds: [...state.zones].filter(([, value]) => value === "completed").map(([id]) => id),
    };
  }

  dispose(): void {
    if (!this.active) return;
    if (this.active.minimumTimer !== undefined) this.options.timer.clearTimeout(this.active.minimumTimer);
    if (this.active.safetyTimer !== undefined) this.options.timer.clearTimeout(this.active.safetyTimer);
    this.active = undefined;
  }

  private setNonViable(activationIdValue: ActivationId, id: ZoneId, value: "failed" | "unregistered"): boolean {
    const state = this.currentAgenda(activationIdValue);
    if (!state || !state.zones.has(id)) return false;
    state.zones.set(id, value);
    this.diagnostic(value === "failed" ? "zone-failed" : "zone-unregistered", state, id);
    this.armWhenSettled(state);
    this.tryAdvance(state);
    return true;
  }

  private minimumElapsed(activationIdValue: ActivationId): void {
    const state = this.active;
    if (!state || state.activation.activationId !== activationIdValue || state.advanced) return;
    state.minimumElapsed = true;
    this.diagnostic("minimum-elapsed", state);
    this.tryAdvance(state);
  }

  /**
   * Starts presentation time.  It is public so a host that knows its render
   * transaction has settled can arm presentation explicitly.
   */
  armPresentation(activationIdValue: ActivationId): boolean {
    const state = this.active;
    if (!state || state.activation.activationId !== activationIdValue || state.presentationArmed || state.advanced) {
      return false;
    }
    state.presentationArmed = true;
    const duration = state.activation.kind === "agenda"
      ? state.activation.minimumDurationMs
      : state.activation.durationMs;
    state.startedAt = this.options.timer.now();
    if (state.safetyTimer !== undefined) this.options.timer.clearTimeout(state.safetyTimer);
    state.safetyTimer = undefined;
    state.safetyDueAt = undefined;
    state.minimumTimer = this.options.timer.setTimeout(
      () => this.minimumElapsed(activationIdValue), nonNegativeMs(duration),
    );
    if (state.activation.kind === "agenda") this.scheduleSafety(state);
    return true;
  }

  private armWhenSettled(state: ActiveState): void {
    if (state.activation.kind === "agenda" && [...state.zones.values()].every(
      (value) => value !== "pending" && value !== "loading",
    )) {
      this.armPresentation(state.activation.activationId);
    }
  }

  private currentAgenda(activationIdValue: ActivationId): ActiveState | undefined {
    const state = this.active;
    return state?.activation.kind === "agenda" && state.activation.activationId === activationIdValue && !state.advanced
      ? state : undefined;
  }

  private scheduleSafety(state: ActiveState): void {
    const activation = state.activation as AgendaSceneActivation;
    const hasMountedLoadingZone = !state.presentationArmed && [...state.zones.values()].some(
      (value) => value === "loading",
    );
    const timeout = hasMountedLoadingZone
      ? Math.max(nonNegativeMs(activation.minimumDurationMs), nonNegativeMs(this.maxSafetyTimeoutMs))
      : calculateAgendaSafetyTimeoutMs(activation.minimumDurationMs, [...state.cycleDurations.values()], {
        graceMs: this.graceMs, minSafetyTimeoutMs: this.minSafetyTimeoutMs, maxSafetyTimeoutMs: this.maxSafetyTimeoutMs,
      });
    const dueAt = state.startedAt + timeout;
    // Duration updates are high-water only: never bring an existing safety
    // deadline forward after a credible later plan has been observed.
    if (state.safetyDueAt !== undefined && dueAt <= state.safetyDueAt) return;
    if (state.safetyTimer !== undefined) this.options.timer.clearTimeout(state.safetyTimer);
    state.safetyDueAt = dueAt;
    state.safetyTimer = this.options.timer.setTimeout(() => {
      if (this.active !== state || state.advanced) return;
      this.diagnostic("safety-timeout", state);
      this.advance(state);
    }, Math.max(0, dueAt - this.options.timer.now()));
  }

  private tryAdvance(state: ActiveState): void {
    if (!state.minimumElapsed || state.advanced) return;
    const allViableCompleted = [...state.zones.values()].every(
      (value) => value === "completed" || value === "failed" || value === "unregistered",
    );
    if (allViableCompleted) this.advance(state);
  }

  private advance(state: ActiveState): void {
    if (state.advanced || this.active !== state) return;
    state.advanced = true;
    if (state.minimumTimer !== undefined) this.options.timer.clearTimeout(state.minimumTimer);
    if (state.safetyTimer !== undefined) this.options.timer.clearTimeout(state.safetyTimer);
    this.diagnostic("advanced", state);
    this.options.onAdvance(state.activation);
  }

  private diagnostic(type: AgendaCompletionDiagnostic["type"], state: ActiveState, id?: ZoneId): void {
    this.options.onDiagnostic?.({ type, sceneId: state.activation.sceneId, activationId: state.activation.activationId, ...(id ? { zoneId: id } : {}) });
  }
}

export function createAgendaSceneCompletionCoordinator(
  options: AgendaSceneCompletionCoordinatorOptions,
): AgendaSceneCompletionCoordinator {
  return new AgendaSceneCompletionCoordinator(options);
}