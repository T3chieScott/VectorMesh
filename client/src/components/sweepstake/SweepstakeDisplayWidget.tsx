import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import worldCupTrophyUrl from "@assets/World_cup_1781690948989.png";

// Task #286/#287 — World Football Sweepstake display widget.
//
// Self-contained, full-screen signage widget driven entirely by the scrubbed
// payload from GET /api/sweepstake/display/:configId (no emails, no provider /
// competition internals). It rotates through the configured slides on a timer
// and re-renders whenever fresh data arrives.
//
// Design: a bright, broadcast-style "tournament package" look — energetic
// gradient backdrop with a subtle football-pitch motif, large signage-safe
// typography, flag-led premium cards, dynamic colour accents and a constant
// staff <-> team link. All branding is neutral (no licensed tournament marks);
// names come from operator / provider data, flags from provider crest images.

export type SlideType =
  | "countdown"
  | "fixtures"
  | "results"
  | "standings"
  | "sweepstake"
  | "rivalries"
  | "survivors"
  | "eliminations"
  | "spotlight"
  | "winner";

export interface DisplayTeam {
  id: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  groupName: string | null;
  crestUrl: string | null;
  eliminated: boolean;
  isWinner: boolean;
}

export interface DisplayParticipant {
  id: string;
  name: string;
  department: string | null;
  teamId: string | null;
  teamName: string | null;
  status: "active" | "eliminated" | "winner";
}

export interface DisplayMatch {
  id: string;
  stage: string | null;
  groupName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: "scheduled" | "in_play" | "finished";
  kickoffAt: string | null;
}

export interface DisplayStanding {
  teamName: string;
  groupName: string | null;
  position: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
  points: number;
}

// ----- Live World Cup panels (Task #287). Mirror server SweepstakeLiveData. -----

export type LivePanel = "now_next" | "live_score" | "live_standings";

export interface LiveTeamView {
  teamId: string | null;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  countryCode: string | null;
  participants: string[];
  eliminated: boolean;
  isWinner: boolean;
}

export interface LiveEventView {
  minute: number | null;
  kind: string;
  side: "home" | "away" | null;
  teamName: string | null;
  playerName: string | null;
  detail: string | null;
  participants: string[];
}

export interface LiveMatchView {
  id: string;
  stateLabel: string;
  isLive: boolean;
  finished: boolean;
  minute: number | null;
  groupName: string | null;
  stage: string | null;
  startingAt: string | null;
  home: LiveTeamView | null;
  away: LiveTeamView | null;
  homeScore: number | null;
  awayScore: number | null;
  events: LiveEventView[];
}

export interface LiveStandingView {
  team: LiveTeamView;
  groupName: string | null;
  position: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface SweepstakeLiveData {
  enabled: boolean;
  available: boolean;
  stale: boolean;
  updatedAt: string | null;
  refreshSeconds: number;
  panels: LivePanel[];
  liveMatches: LiveMatchView[];
  nextMatch: LiveMatchView | null;
  standings: LiveStandingView[];
}

// A resolved slide in the server's ordered wall loop: either a built-in slide
// or a custom media slide (image / video from the media library).
export interface DisplayBuiltinSlide {
  kind: "builtin";
  type: SlideType;
}
export interface DisplayMediaSlide {
  kind: "media";
  id: string;
  url: string;
  mediaType: "image" | "video" | "gif";
  durationSeconds: number;
  mute: boolean;
  displayMode: string;
  fullScreen?: boolean;
}
export type SweepstakeLoopSlide = DisplayBuiltinSlide | DisplayMediaSlide;

export interface SweepstakeDisplayData {
  tournamentName: string;
  theme: string;
  accentColor: string;
  layoutMode: string;
  rotationIntervalSeconds: number;
  refreshIntervalSeconds: number;
  slides: SlideType[];
  /** Ordered wall loop (built-in + custom media). Preferred over `slides`. */
  loop?: SweepstakeLoopSlide[];
  kickoffAt: string | null;
  lastSyncedAt: string | null;
  teams: DisplayTeam[];
  participants: DisplayParticipant[];
  matches: DisplayMatch[];
  standings: DisplayStanding[];
  winner: { teamName: string; participants: string[] } | null;
  live?: SweepstakeLiveData | null;
}

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

interface ThemeTokens {
  bg: string;
  bgGradient: string;
  panel: string;
  panelStrong: string;
  text: string;
  subtle: string;
  border: string;
  chip: string;
  shadow: string;
  pitch: string;
  isDark: boolean;
}

function themeTokens(theme: string): ThemeTokens {
  switch (theme) {
    case "dark":
      return {
        bg: "#070b16",
        bgGradient:
          "radial-gradient(1100px 600px at 8% -12%, rgba(16,185,129,0.22), transparent 60%), radial-gradient(1000px 700px at 112% 0%, rgba(56,189,248,0.18), transparent 55%), radial-gradient(900px 760px at 50% 125%, rgba(168,85,247,0.16), transparent 60%), linear-gradient(180deg,#0b1220,#070b16)",
        panel: "rgba(255,255,255,0.06)",
        panelStrong: "rgba(255,255,255,0.1)",
        text: "#f8fafc",
        subtle: "rgba(248,250,252,0.6)",
        border: "rgba(255,255,255,0.12)",
        chip: "rgba(255,255,255,0.09)",
        shadow: "0 1.6cqmin 4cqmin rgba(0,0,0,0.4)",
        pitch: "rgba(255,255,255,0.05)",
        isDark: true,
      };
    case "stadium":
      return {
        bg: "#03251a",
        bgGradient:
          "radial-gradient(820px 460px at 18% -14%, rgba(255,255,255,0.14), transparent 55%), radial-gradient(820px 460px at 82% -14%, rgba(255,255,255,0.12), transparent 55%), radial-gradient(1200px 820px at 50% 125%, rgba(16,185,129,0.28), transparent 62%), linear-gradient(180deg,#065f46,#03251a)",
        panel: "rgba(255,255,255,0.08)",
        panelStrong: "rgba(255,255,255,0.13)",
        text: "#f0fdf4",
        subtle: "rgba(240,253,244,0.66)",
        border: "rgba(255,255,255,0.16)",
        chip: "rgba(255,255,255,0.12)",
        shadow: "0 1.6cqmin 4cqmin rgba(0,0,0,0.32)",
        pitch: "rgba(255,255,255,0.09)",
        isDark: true,
      };
    case "bright":
    default:
      return {
        bg: "#e7edf5",
        bgGradient:
          "radial-gradient(1100px 620px at 12% -12%, rgba(16,185,129,0.20), transparent 60%), radial-gradient(1000px 720px at 112% 4%, rgba(59,130,246,0.18), transparent 56%), radial-gradient(960px 680px at 50% 124%, rgba(245,158,11,0.18), transparent 60%), linear-gradient(180deg,#f1f5f9,#dbe3ee)",
        panel: "#ffffff",
        panelStrong: "#ffffff",
        text: "#0f172a",
        subtle: "rgba(15,23,42,0.55)",
        border: "rgba(15,23,42,0.08)",
        chip: "rgba(15,23,42,0.05)",
        shadow: "0 1.6cqmin 4cqmin rgba(15,23,42,0.14)",
        pitch: "rgba(15,23,42,0.06)",
        isDark: false,
      };
  }
}

const LIVE_RED = "#ef4444";

// A rotation slot is either a configured sweepstake slide or a live panel
// (plus a synthetic "unavailable" slot shown when live mode is on but the
// upstream data can't be reached).
type RotationSlide = SlideType | LivePanel | "live_unavailable";

const SLIDE_TITLES: Record<RotationSlide, string> = {
  countdown: "Kick-off countdown",
  fixtures: "Today's fixtures",
  results: "Recent results",
  standings: "Group tables",
  sweepstake: "The sweepstake",
  rivalries: "Office rivalries",
  survivors: "Survivor board",
  eliminations: "Knocked out",
  spotlight: "All teams",
  winner: "We have a winner!",
  now_next: "Now & next",
  live_score: "Live scores",
  live_standings: "Live group tables",
  live_unavailable: "Live updates",
};

// ---------------------------------------------------------------------------
// Small hooks & helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function useCountdown(targetIso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, done: diff === 0 };
}

function usePrefersMotion(): boolean {
  const [motion, setMotion] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return motion;
}

// Measure a box so slides can compute how many cards fit and paginate the rest
// (never clipping content off the bottom).
function useBoxSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Pagination is coordinated by the deck (see SweepstakeDisplayWidget): a single
// timer advances one page per tick, and the deck only rotates to the next slide
// once the active slide's last page has been shown — so a multi-page slide is
// never cut off mid-way. Each paginated slide reports its page count up through
// this context and reads the current page back down.
interface PagerControl {
  page: number;
  setPageCount: (n: number) => void;
}
const PagerContext = createContext<PagerControl>({ page: 0, setPageCount: () => {} });

function usePagedSlide(total: number, perPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const { page, setPageCount } = useContext(PagerContext);
  useEffect(() => {
    setPageCount(pageCount);
  }, [pageCount, setPageCount]);
  const safePage = Math.min(page, pageCount - 1);
  return { page: safePage, pageCount };
}

function flagEmoji(countryCode: string | null): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const base = 0x1f1e6;
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}

function eventIcon(kind: string): string {
  switch (kind) {
    case "goal":
    case "penalty":
      return "⚽";
    case "own_goal":
      return "🥅";
    case "missed_penalty":
      return "❌";
    case "yellowcard":
      return "🟨";
    case "redcard":
    case "yellowred":
      return "🟥";
    case "substitution":
      return "🔁";
    default:
      return "•";
  }
}

function kickoffTime(iso: string | null): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBC";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function isSameLocalDay(iso: string | null, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function joinNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

// Distinct, evenly-spaced hue per group letter (A->0deg, B->45deg, ...) so cards
// carry a splash of colour that also encodes which group each team is in.
function groupHue(groupName: string | null | undefined): number | null {
  if (!groupName) return null;
  const letter = groupName.trim().slice(-1).toUpperCase();
  const idx = letter.charCodeAt(0) - 65;
  if (idx < 0 || idx > 25) return null;
  return (idx * 45) % 360;
}

// ---------------------------------------------------------------------------
// Derived context — joins teams, matches, standings and staff once per render
// so every slide can show the staff <-> team link cheaply.
// ---------------------------------------------------------------------------

interface SweepstakeCtx {
  teamByName: Map<string, DisplayTeam>;
  teamById: Map<string, DisplayTeam>;
  groupByTeam: Map<string, string>; // lower(teamName) -> group label
  staffByTeam: Map<string, string[]>; // lower(teamName) -> staff names
  finished: DisplayMatch[]; // newest first
  upcoming: DisplayMatch[]; // soonest first
  today: DisplayMatch[]; // soonest first, today only
  playingToday: Set<string>; // lower(teamName)
  rivalries: { match: DisplayMatch; home: string[]; away: string[] }[];
  survivor: {
    entered: number;
    active: number;
    eliminated: number;
    teamsTotal: number;
    teamsActive: number;
    winner: string | null;
  };
  liveByTeamId: Map<string, TeamLiveStatus>;
  motion: boolean;
}

interface TeamLiveStatus {
  scoreLabel: string;
  minuteLabel: string;
  isLive: boolean;
  goalsFor: number;
  goalsAgainst: number;
}

function liveStatusByTeamId(live?: SweepstakeLiveData | null): Map<string, TeamLiveStatus> {
  const map = new Map<string, TeamLiveStatus>();
  if (!live) return map;
  for (const m of live.liveMatches) {
    const sides: { team: LiveTeamView | null; gf: number | null; ga: number | null }[] = [
      { team: m.home, gf: m.homeScore, ga: m.awayScore },
      { team: m.away, gf: m.awayScore, ga: m.homeScore },
    ];
    for (const s of sides) {
      if (!s.team?.teamId) continue;
      map.set(s.team.teamId, {
        scoreLabel: `${s.gf ?? 0}–${s.ga ?? 0}`,
        minuteLabel: m.isLive ? (m.minute != null ? `${m.minute}'` : m.stateLabel) : m.stateLabel,
        isLive: m.isLive,
        goalsFor: s.gf ?? 0,
        goalsAgainst: s.ga ?? 0,
      });
    }
  }
  return map;
}

function buildContext(data: SweepstakeDisplayData, motion: boolean): SweepstakeCtx {
  const teamByName = new Map<string, DisplayTeam>();
  const teamById = new Map<string, DisplayTeam>();
  for (const t of data.teams) {
    teamById.set(t.id, t);
    teamByName.set(t.name.toLowerCase(), t);
  }

  // Groups: teams often have null groupName, but matches and live standings
  // carry it — fold both sources into a name->group map.
  const groupByTeam = new Map<string, string>();
  for (const t of data.teams) {
    if (t.groupName) groupByTeam.set(t.name.toLowerCase(), t.groupName);
  }
  for (const m of data.matches) {
    if (!m.groupName) continue;
    if (m.homeTeamName && !groupByTeam.has(m.homeTeamName.toLowerCase()))
      groupByTeam.set(m.homeTeamName.toLowerCase(), m.groupName);
    if (m.awayTeamName && !groupByTeam.has(m.awayTeamName.toLowerCase()))
      groupByTeam.set(m.awayTeamName.toLowerCase(), m.groupName);
  }
  for (const s of data.live?.standings ?? []) {
    if (s.groupName && !groupByTeam.has(s.team.name.toLowerCase()))
      groupByTeam.set(s.team.name.toLowerCase(), s.groupName);
  }

  const staffByTeam = new Map<string, string[]>();
  for (const p of data.participants) {
    if (!p.teamName) continue;
    const key = p.teamName.toLowerCase();
    const list = staffByTeam.get(key) ?? [];
    list.push(p.name);
    staffByTeam.set(key, list);
  }

  const finished = data.matches
    .filter((m) => m.status === "finished")
    .sort((a, b) => (b.kickoffAt ?? "").localeCompare(a.kickoffAt ?? ""));
  const upcoming = data.matches
    .filter((m) => m.status !== "finished")
    .sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""));

  const refDay = new Date();
  // "today" for the fixtures slide includes games already played today (with
  // their results), live games, and games still to come — soonest first.
  const today = data.matches
    .filter((m) => isSameLocalDay(m.kickoffAt, refDay))
    .sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""));
  // playingToday still means "has a match STILL to come today" for the
  // participant badges, so derive it from upcoming-only.
  const playingToday = new Set<string>();
  for (const m of upcoming) {
    if (!isSameLocalDay(m.kickoffAt, refDay)) continue;
    if (m.homeTeamName) playingToday.add(m.homeTeamName.toLowerCase());
    if (m.awayTeamName) playingToday.add(m.awayTeamName.toLowerCase());
  }

  // Office rivalries: upcoming matches where BOTH sides have assigned staff.
  // To keep the slide from fanning out into dozens of pages, only show derbies
  // kicking off within the next week. If none fall in that window, fall back to
  // the soonest few so the slide isn't wrongly empty when rivalries do exist.
  const RIVALRY_WINDOW_DAYS = 7;
  const rivalryWindowEnd = new Date(refDay.getTime() + RIVALRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const allRivalries = upcoming
    .map((m) => {
      const home = m.homeTeamName ? staffByTeam.get(m.homeTeamName.toLowerCase()) ?? [] : [];
      const away = m.awayTeamName ? staffByTeam.get(m.awayTeamName.toLowerCase()) ?? [] : [];
      return { match: m, home, away };
    })
    .filter((r) => r.home.length > 0 && r.away.length > 0);
  const rivalriesInWindow = allRivalries.filter(
    (r) => r.match.kickoffAt != null && new Date(r.match.kickoffAt) <= rivalryWindowEnd,
  );
  const rivalries = rivalriesInWindow.length > 0 ? rivalriesInWindow : allRivalries.slice(0, 6);

  const assigned = data.participants.filter((p) => p.teamName);
  const survivor = {
    entered: assigned.length,
    active: data.participants.filter((p) => p.status !== "eliminated" && p.teamName).length,
    eliminated: data.participants.filter((p) => p.status === "eliminated").length,
    teamsTotal: data.teams.length,
    teamsActive: data.teams.filter((t) => !t.eliminated).length,
    winner: data.winner?.teamName ?? data.teams.find((t) => t.isWinner)?.name ?? null,
  };

  return {
    teamByName,
    teamById,
    groupByTeam,
    staffByTeam,
    finished,
    upcoming,
    today,
    playingToday,
    rivalries,
    survivor,
    liveByTeamId: liveStatusByTeamId(data.live),
    motion,
  };
}

function teamFromName(ctx: SweepstakeCtx, name: string | null | undefined): DisplayTeam | undefined {
  if (!name) return undefined;
  return ctx.teamByName.get(name.toLowerCase());
}

function groupFor(ctx: SweepstakeCtx, name: string | null | undefined): string | null {
  if (!name) return null;
  return ctx.groupByTeam.get(name.toLowerCase()) ?? null;
}

function staffFor(ctx: SweepstakeCtx, name: string | null | undefined): string[] {
  if (!name) return [];
  return ctx.staffByTeam.get(name.toLowerCase()) ?? [];
}

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

interface SlideProps {
  data: SweepstakeDisplayData;
  tokens: ThemeTokens;
  accent: string;
  ctx: SweepstakeCtx;
}

// Flag/crest with graceful fallback: crest image -> emoji -> initials chip.
function Flag({ team, size, tokens }: { team?: DisplayTeam; size: number; tokens: ThemeTokens }) {
  const dim = `${size}cqmin`;
  if (team?.crestUrl) {
    return (
      <img
        src={team.crestUrl}
        alt=""
        style={{ width: dim, height: dim, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0.4cqmin 0.6cqmin rgba(0,0,0,0.25))" }}
        data-testid={team.id ? `img-crest-${team.id}` : undefined}
      />
    );
  }
  const flag = flagEmoji(team?.countryCode ?? null);
  if (flag) {
    return (
      <span style={{ fontSize: `${size * 0.92}cqmin`, lineHeight: 1, flexShrink: 0 }} aria-hidden>
        {flag}
      </span>
    );
  }
  return (
    <span
      style={{
        width: dim,
        height: dim,
        flexShrink: 0,
        borderRadius: "20%",
        background: tokens.chip,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `${size * 0.34}cqmin`,
        fontWeight: 900,
      }}
      aria-hidden
    >
      {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
    </span>
  );
}

function GroupPill({ group, tokens, accent }: { group: string | null; tokens: ThemeTokens; accent: string }) {
  if (!group) return null;
  const hue = groupHue(group);
  const color = hue !== null ? `hsl(${hue} 72% ${tokens.isDark ? 62 : 42}%)` : accent;
  return (
    <span
      style={{
        fontSize: "1.5cqmin",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color,
        background: hue !== null ? `hsl(${hue} 72% 50% / 0.15)` : tokens.chip,
        borderRadius: 999,
        padding: "0.2cqmin 1.1cqmin",
        whiteSpace: "nowrap",
      }}
    >
      {group}
    </span>
  );
}

function StaffChips({ names, accent, tokens, max = 3 }: { names: string[]; accent: string; tokens: ThemeTokens; max?: number }) {
  if (names.length === 0)
    return <span style={{ fontSize: "1.6cqmin", color: tokens.subtle, fontStyle: "italic" }}>No staff drawn</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6cqmin", alignItems: "center", justifyContent: "center" }}>
      {names.slice(0, max).map((n, i) => (
        <span
          key={`${n}-${i}`}
          style={{
            fontSize: "1.6cqmin",
            fontWeight: 700,
            color: accent,
            background: `${accent}1f`,
            borderRadius: 999,
            padding: "0.2cqmin 1.1cqmin",
            whiteSpace: "nowrap",
          }}
        >
          {n}
        </span>
      ))}
      {names.length > max && (
        <span style={{ fontSize: "1.5cqmin", fontWeight: 700, color: tokens.subtle }}>+{names.length - max}</span>
      )}
    </div>
  );
}

function PageDots({ page, pageCount, accent, tokens, testId }: { page: number; pageCount: number; accent: string; tokens: ThemeTokens; testId?: string }) {
  if (pageCount <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1cqmin", marginTop: "0.6cqmin" }} data-testid={testId}>
      {Array.from({ length: pageCount }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === page ? "3cqmin" : "1cqmin",
            height: "1cqmin",
            borderRadius: 999,
            background: i === page ? accent : tokens.border,
            transition: "width 0.3s ease",
          }}
        />
      ))}
      <span style={{ fontSize: "1.6cqmin", color: tokens.subtle, marginLeft: "1.2cqmin", fontWeight: 800 }}>
        {page + 1} / {pageCount}
      </span>
    </div>
  );
}

function SlideHeading({ title, subtitle, accent, tokens, right }: { title: string; subtitle?: string; accent: string; tokens: ThemeTokens; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "2cqmin", marginBottom: "1.8cqmin" }}>
      <div>
        <div style={{ fontSize: "4.6cqmin", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.01em" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: "2cqmin", color: tokens.subtle, marginTop: "0.6cqmin", fontWeight: 600 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

function CenterMessage({ tokens, title, subtitle, accent, icon }: { tokens: ThemeTokens; title: string; subtitle?: string; accent?: string; icon?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "2cqmin", textAlign: "center" }}>
      {icon && <div style={{ fontSize: "9cqmin", lineHeight: 1 }} aria-hidden>{icon}</div>}
      <div style={{ fontSize: "5cqmin", fontWeight: 900, color: accent ?? tokens.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: "2.6cqmin", color: tokens.subtle }}>{subtitle}</div>}
    </div>
  );
}

function cardBase(tokens: ThemeTokens): React.CSSProperties {
  return {
    background: tokens.panel,
    border: `1px solid ${tokens.border}`,
    borderRadius: "2.2cqmin",
    boxShadow: tokens.shadow,
    boxSizing: "border-box",
  };
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function CountdownSlide({ data, tokens, accent }: SlideProps) {
  const cd = useCountdown(data.kickoffAt);
  if (!cd) return <CenterMessage tokens={tokens} title="Kick-off time coming soon" icon="⚽" />;
  if (cd.done) return <CenterMessage tokens={tokens} title="It's underway!" subtitle="The tournament has kicked off" accent={accent} icon="🎉" />;
  const cells = [
    { label: "Days", value: cd.days },
    { label: "Hours", value: cd.hours },
    { label: "Minutes", value: cd.minutes },
    { label: "Seconds", value: cd.seconds },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "4cqmin" }}>
      <div style={{ fontSize: "3.4cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 800 }}>Kick-off in</div>
      <div style={{ display: "flex", gap: "3cqmin" }} data-testid="slide-countdown">
        {cells.map((c) => (
          <div key={c.label} style={{ ...cardBase(tokens), padding: "2.5cqmin 3.5cqmin", textAlign: "center", minWidth: "20cqmin" }}>
            <div style={{ fontSize: "13cqmin", fontWeight: 900, lineHeight: 1, color: accent, fontVariantNumeric: "tabular-nums" }}>
              {String(c.value).padStart(2, "0")}
            </div>
            <div style={{ fontSize: "2.2cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.14em", marginTop: "1cqmin", fontWeight: 700 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match, tokens, accent, ctx, mode, showStaff = true }: { match: DisplayMatch; tokens: ThemeTokens; accent: string; ctx: SweepstakeCtx; mode: "fixture" | "result"; showStaff?: boolean }) {
  const home = teamFromName(ctx, match.homeTeamName);
  const away = teamFromName(ctx, match.awayTeamName);
  const homeStaff = staffFor(ctx, match.homeTeamName);
  const awayStaff = staffFor(ctx, match.awayTeamName);
  const group = match.groupName || groupFor(ctx, match.homeTeamName) || match.stage;
  const live = match.status === "in_play";

  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  const homeWin = mode === "result" && hs > as;
  const awayWin = mode === "result" && as > hs;

  const TeamSide = ({ team, name, staff, win, align }: { team?: DisplayTeam; name: string | null; staff: string[]; win: boolean; align: "left" | "right" }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8cqmin", alignItems: align === "right" ? "flex-end" : "flex-start", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1.4cqmin", flexDirection: align === "right" ? "row-reverse" : "row", minWidth: 0, width: "100%", justifyContent: "flex-start" }}>
        <Flag team={team} size={6} tokens={tokens} />
        <span style={{ fontSize: "2.6cqmin", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, opacity: win || mode === "fixture" ? 1 : 0.65 }}>
          {name ?? "TBC"}
        </span>
        {win && <span style={{ fontSize: "2.4cqmin", flexShrink: 0 }} aria-hidden>✓</span>}
      </div>
      {showStaff && (
        <div style={{ width: "100%", display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
          <StaffChips names={staff} accent={accent} tokens={tokens} max={2} />
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        ...cardBase(tokens),
        border: `1px solid ${live ? LIVE_RED : tokens.border}`,
        padding: "1.8cqmin 2.4cqmin",
        display: "flex",
        flexDirection: "column",
        gap: "1.2cqmin",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1cqmin" }}>
        <GroupPill group={group} tokens={tokens} accent={accent} />
        <span style={{ fontSize: "1.6cqmin", color: tokens.subtle, fontWeight: 700, whiteSpace: "nowrap" }}>
          {mode === "result" ? shortDate(match.kickoffAt) : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "2cqmin" }}>
        <TeamSide team={home} name={match.homeTeamName} staff={homeStaff} win={homeWin} align="left" />
        <div style={{ textAlign: "center", minWidth: "12cqmin" }}>
          {mode === "result" || live ? (
            <div style={{ fontSize: "5.2cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {hs}<span style={{ color: tokens.subtle }}>–</span>{as}
            </div>
          ) : (
            <div style={{ fontSize: "3.6cqmin", fontWeight: 900, color: accent, lineHeight: 1 }}>{kickoffTime(match.kickoffAt)}</div>
          )}
          <div style={{ fontSize: "1.6cqmin", marginTop: "0.6cqmin", fontWeight: 800, color: live ? LIVE_RED : tokens.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {live ? "● LIVE" : mode === "result" ? "FT" : "KO"}
          </div>
        </div>
        <TeamSide team={away} name={match.awayTeamName} staff={awayStaff} win={awayWin} align="right" />
      </div>
    </div>
  );
}

// A small calendar graphic that shows today's real month + day. Replaces the
// 📅 emoji, whose Apple glyph is permanently fixed to "JUL 17".
function CalendarIcon({ accent }: { accent: string }) {
  const d = new Date();
  const month = d.toLocaleDateString([], { month: "short" }).toUpperCase();
  const day = d.getDate();
  return (
    <div
      aria-hidden
      style={{
        width: "8cqmin",
        borderRadius: "1.2cqmin",
        overflow: "hidden",
        background: "#ffffff",
        boxShadow: "0 0.4cqmin 1.2cqmin rgba(0,0,0,0.25)",
        lineHeight: 1,
        flex: "0 0 auto",
      }}
      data-testid="calendar-today"
    >
      <div
        style={{
          background: accent,
          color: "#ffffff",
          fontSize: "2.1cqmin",
          fontWeight: 900,
          letterSpacing: "0.1cqmin",
          textAlign: "center",
          padding: "0.7cqmin 0",
        }}
      >
        {month}
      </div>
      <div
        style={{
          color: "#0f172a",
          fontSize: "4.6cqmin",
          fontWeight: 900,
          textAlign: "center",
          padding: "0.6cqmin 0 1cqmin",
        }}
      >
        {day}
      </div>
    </div>
  );
}

function FixturesSlide({ data, tokens, accent, ctx }: SlideProps) {
  const usingToday = ctx.today.length > 0;
  const list = usingToday ? ctx.today : ctx.upcoming;
  // 3 matches per page, stacked full-width.
  const cols = 1;
  const perPage = 3;
  const { page, pageCount } = usePagedSlide(list.length, perPage);
  const items = chunk(list, perPage)[page] ?? [];

  if (list.length === 0) return <CenterMessage tokens={tokens} title="No upcoming fixtures" subtitle="Check back soon" icon="📅" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-fixtures">
      <SlideHeading
        title={usingToday ? "Playing today" : "Coming up"}
        subtitle={usingToday ? `${ctx.today.length} match${ctx.today.length === 1 ? "" : "es"} on today` : "Next fixtures in the tournament"}
        accent={accent}
        tokens={tokens}
        right={<CalendarIcon accent={accent} />}
      />
      <div
        style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${perPage}, 1fr)`, gridAutoRows: "1fr", alignContent: "start", gap: "1.4cqmin", overflow: "hidden" }}
      >
        {items.map((m) => (
          <MatchCard key={m.id} match={m} tokens={tokens} accent={accent} ctx={ctx} mode={m.status === "finished" ? "result" : "fixture"} />
        ))}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="fixtures-pagination" />
    </div>
  );
}

function ResultsSlide({ data, tokens, accent, ctx }: SlideProps) {
  const list = ctx.finished;
  // 3 results per page, stacked full-width — plenty of horizontal room for names.
  const cols = 1;
  const perPage = 3;
  const { page, pageCount } = usePagedSlide(list.length, perPage);
  const items = chunk(list, perPage)[page] ?? [];

  if (list.length === 0) return <CenterMessage tokens={tokens} title="No results yet" subtitle="Scores will appear after the first matches" icon="⚽" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-results">
      <SlideHeading
        title="Recent results"
        subtitle="Full-time scores and who they helped or knocked out"
        accent={accent}
        tokens={tokens}
        right={<span style={{ fontSize: "6cqmin" }} aria-hidden>📊</span>}
      />
      <div
        style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${perPage}, 1fr)`, gridAutoRows: "1fr", alignContent: "start", gap: "1.4cqmin", overflow: "hidden" }}
      >
        {items.map((m) => {
          const homeStaff = staffFor(ctx, m.homeTeamName);
          const awayStaff = staffFor(ctx, m.awayTeamName);
          const homeTeam = teamFromName(ctx, m.homeTeamName);
          const awayTeam = teamFromName(ctx, m.awayTeamName);
          const hs = m.homeScore ?? 0;
          const as = m.awayScore ?? 0;
          const outStaff = [
            ...(homeTeam?.eliminated ? homeStaff : []),
            ...(awayTeam?.eliminated ? awayStaff : []),
          ];
          const winStaff = hs > as ? homeStaff : as > hs ? awayStaff : [];
          let impact: { text: string; color: string } | null = null;
          if (homeStaff.length === 0 && awayStaff.length === 0) impact = { text: "No staff assigned", color: tokens.subtle };
          else if (outStaff.length > 0) impact = { text: `${joinNames(outStaff, Infinity)} knocked out`, color: LIVE_RED };
          else if (winStaff.length > 0) impact = { text: `${joinNames(winStaff, Infinity)} celebrating`, color: "#22c55e" };
          else impact = { text: `${joinNames([...homeStaff, ...awayStaff], Infinity)} watching on`, color: accent };
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
              <MatchCard match={m} tokens={tokens} accent={accent} ctx={ctx} mode="result" showStaff={false} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8cqmin", padding: "0.6cqmin 2.4cqmin 0", fontSize: "1.7cqmin", fontWeight: 800, color: impact.color, minHeight: 0 }}>
                <span aria-hidden style={{ flexShrink: 0 }}>•</span>
                <span style={{ minWidth: 0, lineHeight: 1.25 }}>{impact.text}</span>
              </div>
            </div>
          );
        })}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="results-pagination" />
    </div>
  );
}

function StandingsSlide({ data, tokens, accent, ctx }: SlideProps) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, DisplayStanding[]>();
    for (const s of data.standings) {
      const key = s.groupName || "Table";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(s);
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || b.points - a.points);
    }
    return Array.from(byGroup.entries());
  }, [data.standings]);

  const boxRef = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(boxRef);
  const cols = w > 0 ? clamp(Math.round(w / 520), 1, 4) : 2;
  const rows = h > 0 ? clamp(Math.floor(h / 230), 1, 3) : 2;
  const perPage = Math.max(1, cols * rows);
  const { page, pageCount } = usePagedSlide(groups.length, perPage);
  const shown = chunk(groups, perPage)[page] ?? [];

  if (groups.length === 0) return <CenterMessage tokens={tokens} title="No tables yet" subtitle="Group standings appear once matches are played" icon="📋" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-standings">
      <SlideHeading title="Group tables" accent={accent} tokens={tokens} right={<span style={{ fontSize: "6cqmin" }} aria-hidden>📋</span>} />
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "1fr", gap: "1.6cqmin", overflow: "hidden" }}>
        {shown.map(([name, rows]) => (
          <div key={name} style={{ ...cardBase(tokens), padding: "1.6cqmin 2cqmin", minHeight: 0, overflow: "hidden" }}>
            <div style={{ marginBottom: "1cqmin" }}><GroupPill group={name} tokens={tokens} accent={accent} /></div>
            {rows.slice(0, 4).map((r, i) => {
              const team = teamFromName(ctx, r.teamName);
              const staff = staffFor(ctx, r.teamName);
              return (
                <div key={r.teamName} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: "1.2cqmin", alignItems: "center", padding: "0.8cqmin 0", borderTop: i === 0 ? "none" : `1px solid ${tokens.border}`, fontSize: "2.1cqmin" }}>
                  <span style={{ color: tokens.subtle, width: "2.4cqmin", fontWeight: 800 }}>{r.position ?? i + 1}</span>
                  <Flag team={team} size={3} tokens={tokens} />
                  <span style={{ minWidth: 0, overflow: "hidden" }}>
                    <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{r.teamName}</span>
                    {staff.length > 0 && <span style={{ color: accent, fontSize: "1.5cqmin", marginLeft: "1cqmin", fontWeight: 700 }}>{joinNames(staff, 1)}</span>}
                  </span>
                  <span style={{ color: tokens.subtle, fontVariantNumeric: "tabular-nums" }}>{r.won}-{r.draw}-{r.lost}</span>
                  <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{r.points}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="standings-pagination" />
    </div>
  );
}

function SweepstakeSlide({ data, tokens, accent, ctx }: SlideProps) {
  const assigned = data.participants.filter((p) => p.teamName);
  const gridRef = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(gridRef);
  // Fixed 5 columns so each card is wider and shows more of the participant name.
  const cols = 5;
  const rows = h > 0 ? clamp(Math.floor(h / 86), 2, 12) : 8;
  const perPage = Math.max(1, cols * rows);
  const { page, pageCount } = usePagedSlide(assigned.length, perPage);
  const items = chunk(assigned, perPage)[page] ?? [];

  if (assigned.length === 0)
    return <CenterMessage tokens={tokens} title="Draw not made yet" subtitle="Names will appear once teams are drawn" icon="🎟️" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }}>
      <SlideHeading
        title="The Sweepstake"
        subtitle={`${ctx.survivor.active} still in · ${ctx.survivor.eliminated} out · ${ctx.survivor.entered} drew a team`}
        accent={accent}
        tokens={tokens}
        right={<span style={{ fontSize: "6cqmin" }} aria-hidden>🎟️</span>}
      />
      <div
        ref={gridRef}
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`, gap: "1.4cqmin", flex: 1, minHeight: 0, overflow: "hidden" }}
        data-testid="slide-sweepstake"
      >
        {items.map((p) => {
          const team = p.teamId ? ctx.teamById.get(p.teamId) : teamFromName(ctx, p.teamName);
          const status = p.teamId ? ctx.liveByTeamId.get(p.teamId) : undefined;
          const group = groupFor(ctx, p.teamName);
          const hue = groupHue(group);
          const out = p.status === "eliminated";
          const winner = p.status === "winner" || team?.isWinner;
          const playingToday = p.teamName ? ctx.playingToday.has(p.teamName.toLowerCase()) : false;
          const stripe = winner ? "#f59e0b" : status?.isLive ? LIVE_RED : out ? tokens.border : hue !== null ? `hsl(${hue} 72% 55%)` : accent;
          return (
            <div
              key={p.id}
              style={{
                ...cardBase(tokens),
                borderLeft: `0.9cqmin solid ${stripe}`,
                border: `1px solid ${winner ? "#f59e0b" : status?.isLive ? LIVE_RED : tokens.border}`,
                borderLeftWidth: "0.9cqmin",
                borderLeftColor: stripe,
                padding: "0.9cqmin 1.4cqmin",
                display: "flex",
                alignItems: "center",
                gap: "1.2cqmin",
                minWidth: 0,
                overflow: "hidden",
                opacity: out ? 0.5 : 1,
                position: "relative",
              }}
              data-testid={`card-participant-${p.id}`}
            >
              <Flag team={team} size={4.4} tokens={tokens} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "2.3cqmin", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: out ? "line-through" : "none" }}>
                  {p.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8cqmin", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "1.8cqmin", color: tokens.subtle, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.teamName}</span>
                  {group && <span style={{ fontSize: "1.4cqmin", fontWeight: 800, color: hue !== null ? `hsl(${hue} 72% ${tokens.isDark ? 64 : 44}%)` : accent, whiteSpace: "nowrap" }}>{group}</span>}
                </div>
              </div>
              {winner ? (
                <span style={{ fontSize: "1.5cqmin", fontWeight: 900, color: "#fff", background: "#f59e0b", borderRadius: 999, padding: "0.2cqmin 1cqmin" }}>🏆</span>
              ) : out ? (
                <span style={{ fontSize: "1.4cqmin", fontWeight: 900, color: "#fff", background: LIVE_RED, borderRadius: 6, padding: "0.2cqmin 0.9cqmin", transform: "rotate(6deg)" }}>OUT</span>
              ) : status?.isLive ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5cqmin", fontSize: "1.7cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: status.goalsFor > status.goalsAgainst ? "#22c55e" : tokens.text }} data-testid={`live-status-${p.id}`}>
                  <span style={{ width: "1cqmin", height: "1cqmin", borderRadius: 999, background: LIVE_RED, display: "inline-block" }} aria-hidden />
                  {status.scoreLabel}
                </span>
              ) : playingToday ? (
                <span style={{ fontSize: "1.3cqmin", fontWeight: 800, color: accent, background: `${accent}1f`, borderRadius: 999, padding: "0.2cqmin 0.9cqmin", whiteSpace: "nowrap" }}>TODAY</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="wall-pagination" />
    </div>
  );
}

function AllTeamsSlide({ data, tokens, accent, ctx }: SlideProps) {
  const teams = useMemo(
    () => [...data.teams].sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.name.localeCompare(b.name)),
    [data.teams],
  );
  // Fixed 6 x 2 grid: wide AND tall enough that the flag, full team name, group
  // pill and up to two staff chips all fit without the name collapsing out.
  const cols = 6;
  const rows = 2;
  const perPage = Math.max(1, cols * rows);
  const { page, pageCount } = usePagedSlide(teams.length, perPage);
  const items = chunk(teams, perPage)[page] ?? [];

  if (teams.length === 0) return <CenterMessage tokens={tokens} title="No teams yet" icon="🌍" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }}>
      <SlideHeading
        title="All teams"
        subtitle={`${ctx.survivor.teamsActive} of ${ctx.survivor.teamsTotal} still in the hunt`}
        accent={accent}
        tokens={tokens}
        right={<span style={{ fontSize: "6cqmin" }} aria-hidden>🌍</span>}
      />
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`, gap: "1.4cqmin", overflow: "hidden" }} data-testid="slide-spotlight">
        {items.map((t) => {
          const staff = staffFor(ctx, t.name);
          const group = groupFor(ctx, t.name);
          const out = t.eliminated;
          return (
            <div
              key={t.id}
              style={{
                ...cardBase(tokens),
                padding: "1.4cqmin",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.8cqmin",
                textAlign: "center",
                minHeight: 0,
                overflow: "hidden",
                opacity: out ? 0.5 : 1,
                border: t.isWinner ? `1px solid #f59e0b` : `1px solid ${tokens.border}`,
                boxShadow: t.isWinner ? "0 0 4cqmin rgba(245,158,11,0.5)" : tokens.shadow,
              }}
              data-testid={`card-team-${t.id}`}
            >
              <div style={{ flexShrink: 0 }}><Flag team={t} size={6.5} tokens={tokens} /></div>
              <div style={{ fontSize: "2.2cqmin", fontWeight: 900, lineHeight: 1.15, maxWidth: "100%", flexShrink: 0, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8cqmin", flexShrink: 0 }}>
                <GroupPill group={group} tokens={tokens} accent={accent} />
                {t.isWinner ? (
                  <span style={{ fontSize: "1.4cqmin", fontWeight: 900, color: "#fff", background: "#f59e0b", borderRadius: 999, padding: "0.1cqmin 1cqmin" }}>🏆 WINNER</span>
                ) : out ? (
                  <span style={{ fontSize: "1.4cqmin", fontWeight: 900, color: LIVE_RED, background: `${LIVE_RED}22`, borderRadius: 999, padding: "0.1cqmin 1cqmin" }}>OUT</span>
                ) : (
                  <span style={{ fontSize: "1.4cqmin", fontWeight: 800, color: "#22c55e", background: "#22c55e22", borderRadius: 999, padding: "0.1cqmin 1cqmin" }}>IN</span>
                )}
              </div>
              <StaffChips names={staff} accent={accent} tokens={tokens} max={2} />
            </div>
          );
        })}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="teams-pagination" />
    </div>
  );
}

function RivalriesSlide({ data, tokens, accent, ctx }: SlideProps) {
  const list = ctx.rivalries;
  const boxRef = useRef<HTMLDivElement>(null);
  const { w, h } = useBoxSize(boxRef);
  // 6 rivalry cards per page (2x3 on wide zones, 1x6 on narrow ones) so the
  // slide doesn't fan out into dozens of pages.
  const cols = w > 760 ? 2 : 1;
  const rows = Math.ceil(6 / cols);
  const perPage = cols * rows;
  const { page, pageCount } = usePagedSlide(list.length, perPage);
  const items = chunk(list, perPage)[page] ?? [];

  if (list.length === 0)
    return <CenterMessage tokens={tokens} title="No office derbies coming up" subtitle="When two colleagues' teams meet, the bragging rights land here" icon="🤝" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-rivalries">
      <SlideHeading title="Office rivalries" subtitle="Colleagues whose teams are about to clash" accent={accent} tokens={tokens} />
      <div ref={boxRef} style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, 1fr)`, gridAutoRows: "1fr", alignContent: "start", gap: "1.4cqmin", overflow: "hidden" }}>
        {items.map(({ match, home, away }) => {
          const homeTeam = teamFromName(ctx, match.homeTeamName);
          const awayTeam = teamFromName(ctx, match.awayTeamName);
          return (
            <div key={match.id} style={{ ...cardBase(tokens), padding: "1.4cqmin 2cqmin", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "1.6cqmin", minHeight: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.2cqmin", minWidth: 0 }}>
                <Flag team={homeTeam} size={5} tokens={tokens} />
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15cqmin" }}>
                  {home.map((n, i) => (
                    <div key={i} style={{ fontSize: "1.8cqmin", fontWeight: 900, lineHeight: 1.15, overflowWrap: "anywhere" }}>{n}</div>
                  ))}
                  <div style={{ fontSize: "1.4cqmin", color: tokens.subtle, fontWeight: 700, marginTop: "0.2cqmin" }}>{match.homeTeamName}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3cqmin" }}>
                <span style={{ fontSize: "2.2cqmin", fontWeight: 900, color: tokens.subtle }}>VS</span>
                <span style={{ fontSize: "1.4cqmin", fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>{shortDate(match.kickoffAt)} · {kickoffTime(match.kickoffAt)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.2cqmin", minWidth: 0, justifyContent: "flex-end" }}>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15cqmin", alignItems: "flex-end", textAlign: "right" }}>
                  {away.map((n, i) => (
                    <div key={i} style={{ fontSize: "1.8cqmin", fontWeight: 900, lineHeight: 1.15, overflowWrap: "anywhere" }}>{n}</div>
                  ))}
                  <div style={{ fontSize: "1.4cqmin", color: tokens.subtle, fontWeight: 700, marginTop: "0.2cqmin" }}>{match.awayTeamName}</div>
                </div>
                <Flag team={awayTeam} size={5} tokens={tokens} />
              </div>
            </div>
          );
        })}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="rivalries-pagination" />
    </div>
  );
}

function SurvivorsSlide({ data, tokens, accent, ctx }: SlideProps) {
  const s = ctx.survivor;
  const stats = [
    { label: "Entered", value: s.entered, color: accent, icon: "👥" },
    { label: "Still in", value: s.active, color: "#22c55e", icon: "✅" },
    { label: "Knocked out", value: s.eliminated, color: LIVE_RED, icon: "❌" },
    { label: "Teams active", value: `${s.teamsActive}/${s.teamsTotal}`, color: "#3b82f6", icon: "🌍" },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-survivors">
      <SlideHeading title="Survivor board" subtitle="Who's still standing in the office sweepstake" accent={accent} tokens={tokens} right={<span style={{ fontSize: "6cqmin" }} aria-hidden>🏁</span>} />
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: "2cqmin" }}>
        {stats.map((st) => (
          <div key={st.label} style={{ ...cardBase(tokens), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1cqmin", padding: "2cqmin" }}>
            <div style={{ fontSize: "5cqmin", lineHeight: 1 }} aria-hidden>{st.icon}</div>
            <div style={{ fontSize: "11cqmin", fontWeight: 900, lineHeight: 1, color: st.color, fontVariantNumeric: "tabular-nums" }}>{st.value}</div>
            <div style={{ fontSize: "2.4cqmin", fontWeight: 800, color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>{st.label}</div>
          </div>
        ))}
      </div>
      {s.winner && (
        <div style={{ textAlign: "center", fontSize: "2.6cqmin", fontWeight: 900, color: "#f59e0b", padding: "0.6cqmin" }}>🏆 Champions: {s.winner}</div>
      )}
    </div>
  );
}

function EliminationsSlide({ data, tokens, accent }: SlideProps) {
  const out = data.participants.filter((p) => p.status === "eliminated");
  const still = data.participants.filter((p) => p.status !== "eliminated" && p.teamName);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2cqmin", height: "100%" }} data-testid="slide-eliminations">
      <div style={{ ...cardBase(tokens), padding: "2.4cqmin", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: "3cqmin", fontWeight: 900, color: LIVE_RED, marginBottom: "1.5cqmin" }}>❌ Knocked out ({out.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1cqmin", alignContent: "flex-start", overflow: "hidden", flex: 1 }}>
          {out.slice(0, 40).map((p) => (
            <span key={p.id} style={{ fontSize: "2.2cqmin", textDecoration: "line-through", opacity: 0.7, fontWeight: 700 }}>{p.name}</span>
          ))}
          {out.length === 0 && <span style={{ color: tokens.subtle, fontSize: "2.4cqmin" }}>Nobody yet — everyone's still in!</span>}
        </div>
      </div>
      <div style={{ ...cardBase(tokens), padding: "2.4cqmin", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: "3cqmin", fontWeight: 900, color: "#22c55e", marginBottom: "1.5cqmin" }}>✅ Still standing ({still.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1cqmin", alignContent: "flex-start", overflow: "hidden", flex: 1 }}>
          {still.slice(0, 40).map((p) => (
            <span key={p.id} style={{ fontSize: "2.2cqmin", fontWeight: 800 }}>{p.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function WinnerSlide({ data, tokens, accent, ctx }: SlideProps) {
  if (!data.winner) return <CenterMessage tokens={tokens} title="No winner yet" subtitle="The champions will be crowned here" icon="🏆" />;
  const team = teamFromName(ctx, data.winner.teamName);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "2.4cqmin", textAlign: "center", position: "relative" }} data-testid="slide-winner">
      {ctx.motion && <Confetti />}
      <div style={{ fontSize: "3cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.24em", fontWeight: 900 }}>Sweepstake Champion</div>
      <Flag team={team} size={20} tokens={tokens} />
      <div style={{ fontSize: "11cqmin", fontWeight: 900, color: "#f59e0b", lineHeight: 1, textShadow: "0 0.6cqmin 2cqmin rgba(245,158,11,0.4)" }}>{data.winner.teamName}</div>
      {data.winner.participants.length > 0 && (
        <>
          <div style={{ fontSize: "2.6cqmin", color: tokens.subtle }}>Congratulations to</div>
          <div style={{ fontSize: "4.4cqmin", fontWeight: 900, maxWidth: "85%", color: accent }}>{data.winner.participants.join(" · ")}</div>
        </>
      )}
    </div>
  );
}

// ----- Live panel slides (Task #287) -----

function LiveTeamColumn({ team, tokens, accent }: { team: LiveTeamView | null; tokens: ThemeTokens; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2cqmin", textAlign: "center", minWidth: 0 }}>
      {team?.crestUrl ? (
        <img src={team.crestUrl} alt="" style={{ width: "10cqmin", height: "10cqmin", objectFit: "contain" }} />
      ) : (
        <span style={{ fontSize: "9cqmin", lineHeight: 1 }} aria-hidden>{flagEmoji(team?.countryCode ?? null) ?? "🏳️"}</span>
      )}
      <div style={{ fontSize: "3.2cqmin", fontWeight: 900, whiteSpace: "nowrap" }}>{team?.name ?? "TBC"}</div>
      {team && team.participants.length > 0 && (
        <div style={{ fontSize: "2cqmin", color: accent, fontWeight: 800, maxWidth: "40cqmin", lineHeight: 1.2, overflowWrap: "anywhere" }}>{team.participants.join(" · ")}</div>
      )}
    </div>
  );
}

function MatchHero({ match, tokens, accent, label }: { match: LiveMatchView; tokens: ThemeTokens; accent: string; label: string }) {
  return (
    <div style={{ ...cardBase(tokens), border: `1px solid ${match.isLive ? LIVE_RED : tokens.border}`, padding: "3cqmin", display: "flex", flexDirection: "column", gap: "2cqmin" }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1.2cqmin" }}>
        {match.isLive && <span style={{ width: "1.4cqmin", height: "1.4cqmin", borderRadius: 999, background: LIVE_RED, display: "inline-block", animation: "vmPulse 1.4s ease-in-out infinite" }} aria-hidden />}
        <span style={{ fontSize: "2.2cqmin", fontWeight: 900, color: match.isLive ? LIVE_RED : tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
        <span style={{ fontSize: "2cqmin", color: tokens.subtle }}>{match.groupName || match.stage || ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "2cqmin" }}>
        <LiveTeamColumn team={match.home} tokens={tokens} accent={accent} />
        <div style={{ textAlign: "center" }}>
          {match.isLive || match.finished ? (
            <div style={{ fontSize: "8cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {match.homeScore ?? 0}<span style={{ color: tokens.subtle }}> – </span>{match.awayScore ?? 0}
            </div>
          ) : (
            <div style={{ fontSize: "4cqmin", fontWeight: 900, color: accent }}>{kickoffTime(match.startingAt)}</div>
          )}
          <div style={{ fontSize: "2.2cqmin", color: tokens.subtle, marginTop: "0.6cqmin" }}>{match.isLive && match.minute != null ? `${match.minute}'` : match.stateLabel}</div>
        </div>
        <LiveTeamColumn team={match.away} tokens={tokens} accent={accent} />
      </div>
    </div>
  );
}

function NowNextSlide({ data, tokens, accent }: SlideProps) {
  const live = data.live;
  const now = live?.liveMatches[0] ?? null;
  const next = live?.nextMatch ?? null;
  if (!now && !next) return <CenterMessage tokens={tokens} title="No matches to show" subtitle="Check back at kick-off time" icon="⚽" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3cqmin", height: "100%", justifyContent: "center" }} data-testid="slide-now-next">
      {now && <MatchHero match={now} tokens={tokens} accent={accent} label="Now playing" />}
      {next && <MatchHero match={next} tokens={tokens} accent={accent} label="Up next" />}
    </div>
  );
}

function LiveScoreSlide({ data, tokens, accent }: SlideProps) {
  const matches = data.live?.liveMatches ?? [];
  if (matches.length === 0) return <CenterMessage tokens={tokens} title="No live matches right now" subtitle="Scores will appear when a game kicks off" icon="📡" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2cqmin", height: "100%", justifyContent: "center", overflow: "hidden" }} data-testid="slide-live-score">
      {matches.slice(0, 3).map((m) => (
        <div key={m.id} style={{ ...cardBase(tokens), border: `1px solid ${m.isLive ? LIVE_RED : tokens.border}`, padding: "2cqmin 3cqmin" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "2cqmin" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "3cqmin", fontWeight: 900 }}>{m.home?.name ?? "TBC"}</div>
              {m.home && m.home.participants.length > 0 && <div style={{ fontSize: "1.7cqmin", color: accent, fontWeight: 700 }}>{m.home.participants.join(" · ")}</div>}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "4.4cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{m.homeScore ?? 0} – {m.awayScore ?? 0}</div>
              <div style={{ fontSize: "1.8cqmin", color: m.isLive ? LIVE_RED : tokens.subtle, fontWeight: 900 }}>{m.isLive && m.minute != null ? `${m.minute}'` : m.stateLabel}</div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "3cqmin", fontWeight: 900 }}>{m.away?.name ?? "TBC"}</div>
              {m.away && m.away.participants.length > 0 && <div style={{ fontSize: "1.7cqmin", color: accent, fontWeight: 700 }}>{m.away.participants.join(" · ")}</div>}
            </div>
          </div>
          {m.events.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2cqmin", marginTop: "1.4cqmin", justifyContent: "center" }}>
              {m.events.slice(-6).map((e, i) => (
                <span key={i} style={{ fontSize: "1.7cqmin", color: tokens.subtle, background: tokens.chip, borderRadius: 999, padding: "0.4cqmin 1.2cqmin", whiteSpace: "nowrap" }}>
                  {eventIcon(e.kind)} {e.minute != null ? `${e.minute}' ` : ""}{e.playerName || e.teamName || ""}
                  {e.participants.length > 0 ? ` — ${e.participants.join(", ")}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LiveStandingsSlide({ data, tokens, accent }: SlideProps) {
  const live = data.live;
  const groups = useMemo(() => {
    const byGroup = new Map<string, LiveStandingView[]>();
    for (const s of live?.standings ?? []) {
      const key = s.groupName || "Table";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(s);
    }
    return Array.from(byGroup.entries());
  }, [live?.standings]);

  const cols = 2;
  const perPage = 4;
  const { page, pageCount } = usePagedSlide(groups.length, perPage);
  const shown = chunk(groups, perPage)[page] ?? [];

  if (groups.length === 0) return <CenterMessage tokens={tokens} title="No live tables yet" icon="📋" />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1cqmin" }} data-testid="slide-live-standings">
      <SlideHeading title="Live group tables" accent={accent} tokens={tokens} right={<span style={{ fontSize: "6cqmin" }} aria-hidden>📋</span>} />
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "1fr", gap: "1.6cqmin", overflow: "hidden" }}>
        {shown.map(([name, rows]) => (
          <div key={name} style={{ ...cardBase(tokens), padding: "1.6cqmin 2.2cqmin", minHeight: 0, overflow: "hidden" }}>
            <div style={{ marginBottom: "1cqmin" }}><GroupPill group={name} tokens={tokens} accent={accent} /></div>
            {rows.slice(0, 4).map((r, i) => (
              <div key={r.team.teamId ?? r.team.name} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: "1.4cqmin", alignItems: "center", padding: "0.9cqmin 0", borderTop: i === 0 ? "none" : `1px solid ${tokens.border}`, fontSize: "2.1cqmin" }}>
                <span style={{ color: tokens.subtle, width: "2.4cqmin", fontWeight: 800 }}>{r.position ?? i + 1}</span>
                {r.team.crestUrl ? <img src={r.team.crestUrl} alt="" style={{ width: "3cqmin", height: "3cqmin", objectFit: "contain" }} /> : <span style={{ width: "3cqmin" }} />}
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{r.team.name}</span>
                  {r.team.participants.length > 0 && <span style={{ color: accent, fontSize: "1.5cqmin", marginLeft: "1cqmin", fontWeight: 700 }}>{r.team.participants.join(" · ")}</span>}
                </span>
                <span style={{ color: tokens.subtle, fontVariantNumeric: "tabular-nums" }}>{r.won}-{r.draw}-{r.lost}</span>
                <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{r.points}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <PageDots page={page} pageCount={pageCount} accent={accent} tokens={tokens} testId="live-standings-pagination" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backdrop & decorative chrome
// ---------------------------------------------------------------------------

const KEYFRAMES = `
@keyframes vmDrift { 0% { transform: translate(0,0); } 50% { transform: translate(2cqmin,-3cqmin); } 100% { transform: translate(0,0); } }
@keyframes vmFall { 0% { transform: translateY(-12cqh) rotate(0deg); opacity: 1; } 100% { transform: translateY(120cqh) rotate(540deg); opacity: 0.9; } }
@keyframes vmFadeUp { 0% { opacity: 0; transform: translateY(2cqmin); } 100% { opacity: 1; transform: none; } }
@keyframes vmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

function PitchLines({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 1 }} aria-hidden>
      <g fill="none" stroke={color} strokeWidth={0.4}>
        <line x1="80" y1="0" x2="80" y2="90" />
        <circle cx="80" cy="45" r="13" />
        <circle cx="80" cy="45" r="0.8" fill={color} />
        <rect x="0" y="24" width="22" height="42" />
        <rect x="138" y="24" width="22" height="42" />
        <rect x="0" y="36" width="8" height="18" />
        <rect x="152" y="36" width="8" height="18" />
      </g>
    </svg>
  );
}

function Backdrop({ tokens, motion }: { tokens: ThemeTokens; motion: boolean }) {
  const balls = ["⚽", "🏆", "⚽", "🥅", "⚽", "🎉"];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden>
      <div style={{ position: "absolute", inset: 0, background: tokens.bgGradient }} />
      <PitchLines color={tokens.pitch} />
      {balls.map((b, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: `${8 + ((i * 37) % 78)}%`,
            left: `${(i * 53) % 92}%`,
            fontSize: `${7 + (i % 3) * 3}cqmin`,
            opacity: tokens.isDark ? 0.1 : 0.08,
            animation: motion ? `vmDrift ${8 + i * 1.5}s ease-in-out ${i * 0.6}s infinite` : undefined,
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

function Confetti() {
  const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden>
      {Array.from({ length: 44 }).map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${(i * 2.27 + (i % 5) * 3) % 100}%`,
            width: "1.1cqmin",
            height: "1.8cqmin",
            borderRadius: 2,
            background: colors[i % colors.length],
            animation: `vmFall ${3 + (i % 5) * 0.6}s linear ${(i % 7) * 0.4}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotation & root
// ---------------------------------------------------------------------------

function renderSlide(slide: RotationSlide, props: SlideProps) {
  switch (slide) {
    case "countdown":
      return <CountdownSlide {...props} />;
    case "fixtures":
      return <FixturesSlide {...props} />;
    case "results":
      return <ResultsSlide {...props} />;
    case "standings":
      return <StandingsSlide {...props} />;
    case "sweepstake":
      return <SweepstakeSlide {...props} />;
    case "rivalries":
      return <RivalriesSlide {...props} />;
    case "survivors":
      return <SurvivorsSlide {...props} />;
    case "eliminations":
      return <EliminationsSlide {...props} />;
    case "spotlight":
      return <AllTeamsSlide {...props} />;
    case "winner":
      return <WinnerSlide {...props} />;
    case "now_next":
      return <NowNextSlide {...props} />;
    case "live_score":
      return <LiveScoreSlide {...props} />;
    case "live_standings":
      return <LiveStandingsSlide {...props} />;
    case "live_unavailable":
      return <CenterMessage tokens={props.tokens} title="Live data temporarily unavailable" subtitle="We'll reconnect automatically" icon="📡" />;
    default:
      return null;
  }
}

// A normalized rotation entry. Built-in entries wrap a RotationSlide; media
// entries carry the resolved media url + per-slide playback settings. Every
// entry has a stable string `key` because the deck and footer need a join-able
// identity that survives the object shape (the old `slides.join(",")` broke on
// objects).
type RotationItem =
  | { kind: "builtin"; slide: RotationSlide; key: string }
  | {
      kind: "media";
      key: string;
      url: string;
      mediaType: "image" | "video" | "gif";
      durationSeconds: number;
      mute: boolean;
      displayMode: string;
      fullScreen: boolean;
    };

// Build the effective rotation. The server's ordered `loop` (built-in slides
// already content-filtered + custom media) is the source of truth; we fall
// back to the legacy `slides` list when `loop` is absent (older payloads).
// Live panels that currently have something to show are appended after.
function buildRotation(data: SweepstakeDisplayData): RotationItem[] {
  const items: RotationItem[] = [];
  if (data.loop && data.loop.length > 0) {
    data.loop.forEach((it, i) => {
      if (it.kind === "builtin") {
        items.push({ kind: "builtin", slide: it.type, key: `b:${it.type}:${i}` });
      } else {
        items.push({
          kind: "media",
          key: `m:${it.id}`,
          url: it.url,
          mediaType: it.mediaType,
          durationSeconds: it.durationSeconds,
          mute: it.mute,
          displayMode: it.displayMode,
          fullScreen: it.fullScreen === true,
        });
      }
    });
  } else {
    const base = data.slides.length > 0 ? data.slides : (["sweepstake"] as SlideType[]);
    base.forEach((s, i) => items.push({ kind: "builtin", slide: s, key: `b:${s}:${i}` }));
  }

  const live = data.live;
  if (live && live.enabled) {
    if (!live.available) {
      items.push({ kind: "builtin", slide: "live_unavailable", key: "b:live_unavailable" });
    } else {
      for (const panel of live.panels) {
        if (panel === "now_next" && (live.liveMatches.length > 0 || live.nextMatch))
          items.push({ kind: "builtin", slide: "now_next", key: "b:now_next" });
        else if (panel === "live_score" && live.liveMatches.length > 0)
          items.push({ kind: "builtin", slide: "live_score", key: "b:live_score" });
        else if (panel === "live_standings" && live.standings.length > 0)
          items.push({ kind: "builtin", slide: "live_standings", key: "b:live_standings" });
      }
    }
  }

  if (items.length === 0) items.push({ kind: "builtin", slide: "sweepstake", key: "b:sweepstake:0" });
  return items;
}

// Full-bleed custom media slide. Images are timed by the deck (durationSeconds);
// videos play to their natural end and call `onDone` on `ended`/`error`, with a
// metadata-derived safety timeout so a stalled video can never freeze the loop.
// Videos are muted by default (operators opt in per slide) to match the
// platform-wide audio policy and to avoid audio-focus auto-pause stutter.
function MediaSlide({
  item,
  onDone,
  fullBleed = false,
}: {
  item: Extract<RotationItem, { kind: "media" }>;
  onDone: () => void;
  fullBleed?: boolean;
}) {
  const isVideo = item.mediaType === "video";
  const objectFit = item.displayMode === "contain" ? "contain" : "cover";
  const doneRef = useRef(false);
  const safetyRef = useRef<number | null>(null);

  useEffect(() => {
    doneRef.current = false;
    return () => {
      if (safetyRef.current != null) window.clearTimeout(safetyRef.current);
    };
  }, [item.key]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (safetyRef.current != null) window.clearTimeout(safetyRef.current);
    onDone();
  }, [onDone]);

  const wrap: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    borderRadius: fullBleed ? 0 : "2cqmin",
    overflow: "hidden",
  };
  const mediaStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit };

  if (isVideo) {
    return (
      <div style={wrap} data-testid={`media-slide-${item.key}`}>
        <video
          src={item.url}
          autoPlay
          muted={item.mute !== false}
          playsInline
          style={mediaStyle}
          onEnded={finish}
          onError={finish}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            const ms = (Number.isFinite(d) && d > 0 ? d : 60) * 1000 + 2000;
            if (safetyRef.current != null) window.clearTimeout(safetyRef.current);
            safetyRef.current = window.setTimeout(finish, ms);
          }}
          data-testid={`video-${item.key}`}
        />
      </div>
    );
  }

  return (
    <div style={wrap} data-testid={`media-slide-${item.key}`}>
      <img src={item.url} alt="" style={mediaStyle} data-testid={`img-${item.key}`} />
    </div>
  );
}

interface WidgetProps {
  data: SweepstakeDisplayData;
  /** Force a specific slide (used by the admin preview). */
  forcedSlide?: SlideType | null;
}

export function SweepstakeDisplayWidget({ data, forcedSlide }: WidgetProps) {
  const tokens = themeTokens(data.theme);
  const accent = data.accentColor || "#16a34a";
  const motion = usePrefersMotion();
  const ctx = useMemo(() => buildContext(data, motion), [data, motion]);
  const slides = useMemo(() => buildRotation(data), [data]);
  const slidesKey = slides.map((it) => it.key).join(",");
  // The deck advances one page per tick and only moves to the next slide once
  // the active slide's last page has been shown, so multi-page slides are never
  // cut off early. `pageCountRef` holds the page count reported by the active
  // slide (1 for slides that don't paginate). See PagerContext / usePagedSlide.
  const [pos, setPos] = useState({ index: 0, page: 0 });
  const pageCountRef = useRef(1);
  const setPageCount = useCallback((n: number) => {
    pageCountRef.current = Math.max(1, n);
  }, []);

  const slidesLenRef = useRef(slides.length);
  slidesLenRef.current = slides.length;
  const activeIndex = Math.min(pos.index, slides.length - 1);
  const activeItem: RotationItem = slides[activeIndex] ?? { kind: "builtin", slide: "sweepstake", key: "b:sweepstake:0" };
  // The admin preview forces a single built-in slide and disables auto-advance.
  const activeSlide: RotationSlide =
    forcedSlide ?? (activeItem.kind === "builtin" ? activeItem.slide : "sweepstake");
  const isMediaActive = !forcedSlide && activeItem.kind === "media";
  // Full-screen media renders edge-to-edge with no tournament header/footer
  // chrome — the slide simply fills the whole display.
  const isFullScreenMedia = isMediaActive && activeItem.kind === "media" && activeItem.fullScreen;

  // Reset the reported page count whenever the active slide changes. This is a
  // ref write done in the render phase on purpose: it must run before the new
  // slide's effect re-reports its real count. Slides that don't paginate never
  // report, so they correctly stay at a single page.
  const slotRef = useRef<string | null>(null);
  const slot = `${forcedSlide ?? ""}#${pos.index}#${activeItem.key}`;
  if (slotRef.current !== slot) {
    slotRef.current = slot;
    pageCountRef.current = 1;
  }

  // Advance one page, then to the next slide once the active slide's last page
  // has shown. Functional update so it's safe to call from a timer or a video
  // `ended` callback without stale closures.
  const advance = useCallback(() => {
    setPos(({ index, page }) => {
      const pc = Math.max(1, pageCountRef.current);
      if (page + 1 < pc) return { index, page: page + 1 };
      const len = Math.max(1, slidesLenRef.current);
      return { index: (index + 1) % len, page: 0 };
    });
  }, []);

  // Jump back to the first page when the preview's forced slide changes (deck
  // rotation already resets the page when it advances the slide itself).
  useEffect(() => {
    setPos((p) => (p.page === 0 ? p : { ...p, page: 0 }));
  }, [forcedSlide]);

  // Keep the index in range as the rotation length changes (data refreshes).
  useEffect(() => {
    setPos((p) => (p.index < slides.length ? p : { index: 0, page: 0 }));
  }, [slidesKey, slides.length]);

  // Auto-advance timer. Built-in slides use the configured rotation interval
  // (per page); custom images use their own durationSeconds. Videos are NOT
  // timed here — they advance from MediaSlide's `ended`/`error`/safety path so
  // they always play to their natural end. The preview (forcedSlide) never
  // auto-advances.
  useEffect(() => {
    if (forcedSlide || slides.length <= 1) return;
    if (activeItem.kind === "media" && activeItem.mediaType === "video") return;
    const seconds =
      activeItem.kind === "media"
        ? Math.max(1, activeItem.durationSeconds)
        : Math.max(3, data.rotationIntervalSeconds);
    const id = window.setTimeout(advance, seconds * 1000);
    return () => window.clearTimeout(id);
  }, [forcedSlide, slides.length, data.rotationIntervalSeconds, slidesKey, pos.index, pos.page, advance, activeItem]);

  const slideProps: SlideProps = { data, tokens, accent, ctx };
  const s = ctx.survivor;

  return (
    <div style={{ width: "100%", height: "100%", containerType: "size", background: tokens.bg, position: "relative", overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <Backdrop tokens={tokens} motion={motion} />
      {isFullScreenMedia && activeItem.kind === "media" ? (
        <div
          key={activeItem.key}
          style={{ position: "absolute", inset: 0, animation: motion ? "vmFadeUp 0.45s ease" : undefined }}
          data-testid="sweepstake-display"
        >
          <MediaSlide item={activeItem} onDone={advance} fullBleed />
        </div>
      ) : (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          color: tokens.text,
          display: "flex",
          flexDirection: "column",
          padding: "4cqmin",
          boxSizing: "border-box",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          overflow: "hidden",
        }}
        data-testid="sweepstake-display"
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2cqmin", marginBottom: "2.4cqmin" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.6cqmin", minWidth: 0 }}>
            <img src={worldCupTrophyUrl} alt="" aria-hidden style={{ height: "7cqmin", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0.4cqmin 1cqmin rgba(0,0,0,0.35))" }} data-testid="img-trophy" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "4.4cqmin", fontWeight: 900, color: accent, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} data-testid="text-tournament-name">
                {data.tournamentName}
              </div>
              <div style={{ fontSize: "1.8cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 800, marginTop: "0.4cqmin" }}>
                {isMediaActive ? "Featured" : SLIDE_TITLES[activeSlide]}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.4cqmin",
              background: tokens.panel,
              border: `1px solid ${tokens.border}`,
              borderRadius: 999,
              padding: "0.9cqmin 2cqmin",
              boxShadow: tokens.shadow,
              whiteSpace: "nowrap",
            }}
            data-testid="survivor-strip"
          >
            <span style={{ fontSize: "2.2cqmin", fontWeight: 900, color: "#22c55e" }}>{s.active} <span style={{ fontSize: "1.5cqmin", color: tokens.subtle, fontWeight: 700 }}>in</span></span>
            <span style={{ width: 1, height: "2.4cqmin", background: tokens.border }} />
            <span style={{ fontSize: "2.2cqmin", fontWeight: 900, color: LIVE_RED }}>{s.eliminated} <span style={{ fontSize: "1.5cqmin", color: tokens.subtle, fontWeight: 700 }}>out</span></span>
            <span style={{ width: 1, height: "2.4cqmin", background: tokens.border }} />
            <span style={{ fontSize: "2.2cqmin", fontWeight: 900, color: accent }}>{s.teamsActive} <span style={{ fontSize: "1.5cqmin", color: tokens.subtle, fontWeight: 700 }}>teams</span></span>
          </div>
        </header>
        <main key={isMediaActive ? activeItem.key : activeSlide} style={{ position: "relative", flex: 1, minHeight: 0, animation: motion ? "vmFadeUp 0.45s ease" : undefined }}>
          {isMediaActive && activeItem.kind === "media" ? (
            <MediaSlide item={activeItem} onDone={advance} />
          ) : (
            <PagerContext.Provider value={{ page: pos.page, setPageCount }}>
              {renderSlide(activeSlide, slideProps)}
            </PagerContext.Provider>
          )}
        </main>
        {!forcedSlide && slides.length > 1 && (
          <footer style={{ display: "flex", justifyContent: "center", gap: "1.2cqmin", marginTop: "2cqmin" }}>
            {slides.map((sl, i) => (
              <span
                key={sl.key}
                style={{
                  width: i === activeIndex ? "4cqmin" : "1.4cqmin",
                  height: "1.4cqmin",
                  borderRadius: 999,
                  background: i === activeIndex ? accent : tokens.border,
                  transition: "width 0.3s ease",
                }}
              />
            ))}
          </footer>
        )}
      </div>
      )}
    </div>
  );
}
