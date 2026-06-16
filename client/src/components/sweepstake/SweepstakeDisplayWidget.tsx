import { useEffect, useMemo, useRef, useState } from "react";

// Task #286 — World Football Sweepstake Wall display widget.
//
// Self-contained, full-screen signage widget. It is driven entirely by the
// scrubbed payload from GET /api/sweepstake/display/:configId (no emails, no
// provider/competition internals). It rotates through the configured slides on
// a timer and re-renders whenever fresh data arrives. All branding is neutral
// (no licensed tournament marks) — names come from operator/provider data.

export type SlideType =
  | "countdown"
  | "fixtures"
  | "results"
  | "standings"
  | "sweepstake"
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

export interface SweepstakeDisplayData {
  tournamentName: string;
  theme: string;
  accentColor: string;
  layoutMode: string;
  rotationIntervalSeconds: number;
  refreshIntervalSeconds: number;
  slides: SlideType[];
  kickoffAt: string | null;
  lastSyncedAt: string | null;
  teams: DisplayTeam[];
  participants: DisplayParticipant[];
  matches: DisplayMatch[];
  standings: DisplayStanding[];
  winner: { teamName: string; participants: string[] } | null;
  live?: SweepstakeLiveData | null;
}

interface ThemeTokens {
  bg: string;
  panel: string;
  text: string;
  subtle: string;
  border: string;
}

function themeTokens(theme: string): ThemeTokens {
  switch (theme) {
    case "dark":
      return {
        bg: "#0b1220",
        panel: "rgba(255,255,255,0.06)",
        text: "#f8fafc",
        subtle: "rgba(248,250,252,0.65)",
        border: "rgba(255,255,255,0.12)",
      };
    case "stadium":
      return {
        bg: "#06281b",
        panel: "rgba(255,255,255,0.08)",
        text: "#f0fdf4",
        subtle: "rgba(240,253,244,0.7)",
        border: "rgba(255,255,255,0.16)",
      };
    case "bright":
    default:
      return {
        bg: "#f8fafc",
        panel: "#ffffff",
        text: "#0f172a",
        subtle: "rgba(15,23,42,0.6)",
        border: "rgba(15,23,42,0.1)",
      };
  }
}

// A rotation slot is either a configured sweepstake slide or a live panel
// (plus a synthetic "unavailable" slot shown when live mode is on but the
// upstream data can't be reached).
type RotationSlide = SlideType | LivePanel | "live_unavailable";

const SLIDE_TITLES: Record<RotationSlide, string> = {
  countdown: "Kick-off countdown",
  fixtures: "Fixtures",
  results: "Recent results",
  standings: "Group tables",
  sweepstake: "The sweepstake",
  eliminations: "Knocked out",
  spotlight: "Teams in the hat",
  winner: "We have a winner!",
  now_next: "Now & next",
  live_score: "Live scores",
  live_standings: "Live group tables",
  live_unavailable: "Live updates",
};

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

function flagEmoji(countryCode: string | null): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const base = 0x1f1e6;
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}

function TeamBadge({ team, size = 48 }: { team: DisplayTeam; size?: number }) {
  const flag = flagEmoji(team.countryCode);
  if (team.crestUrl) {
    return (
      <img
        src={team.crestUrl}
        alt=""
        style={{ width: size, height: size, objectFit: "contain" }}
        data-testid={`img-crest-${team.id}`}
      />
    );
  }
  if (flag) {
    return (
      <span style={{ fontSize: size * 0.9, lineHeight: 1 }} aria-hidden>
        {flag}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: size * 0.45,
        fontWeight: 800,
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        background: "rgba(127,127,127,0.18)",
      }}
      aria-hidden
    >
      {(team.shortName || team.name).slice(0, 3).toUpperCase()}
    </span>
  );
}

interface SlideProps {
  data: SweepstakeDisplayData;
  tokens: ThemeTokens;
  accent: string;
}

function Stat({ label, value, tokens }: { label: string; value: string | number; tokens: ThemeTokens }) {
  return (
    <div
      style={{
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: 20,
        padding: "1.5cqmin 2.5cqmin",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "5.5cqmin", fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "1.8cqmin", color: tokens.subtle, marginTop: "0.6cqmin", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}

function CountdownSlide({ data, tokens, accent }: SlideProps) {
  const cd = useCountdown(data.kickoffAt);
  if (!cd) {
    return <CenterMessage tokens={tokens} title="Kick-off time coming soon" />;
  }
  if (cd.done) {
    return <CenterMessage tokens={tokens} title="It's underway!" subtitle="The tournament has kicked off" accent={accent} />;
  }
  const cells: { label: string; value: number }[] = [
    { label: "Days", value: cd.days },
    { label: "Hours", value: cd.hours },
    { label: "Minutes", value: cd.minutes },
    { label: "Seconds", value: cd.seconds },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "4cqmin" }}>
      <div style={{ fontSize: "3.5cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.18em" }}>Kick-off in</div>
      <div style={{ display: "flex", gap: "3cqmin" }} data-testid="slide-countdown">
        {cells.map((c) => (
          <div key={c.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "16cqmin",
                fontWeight: 900,
                lineHeight: 1,
                color: accent,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(c.value).padStart(2, "0")}
            </div>
            <div style={{ fontSize: "2.4cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FixturesSlide({ data, tokens, accent }: SlideProps) {
  const fixtures = data.matches
    .filter((m) => m.status !== "finished")
    .sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""))
    .slice(0, 8);
  if (fixtures.length === 0) return <CenterMessage tokens={tokens} title="No upcoming fixtures" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2cqmin", height: "100%", justifyContent: "center" }} data-testid="slide-fixtures">
      {fixtures.map((m) => (
        <div
          key={m.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "3cqmin",
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: 18,
            padding: "2cqmin 3cqmin",
          }}
        >
          <div style={{ textAlign: "right", fontSize: "3.4cqmin", fontWeight: 700 }}>{m.homeTeamName ?? "TBC"}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2cqmin", color: accent, fontWeight: 800 }}>
              {m.status === "in_play" ? "LIVE" : kickoffTime(m.kickoffAt)}
            </div>
            <div style={{ fontSize: "1.5cqmin", color: tokens.subtle }}>{m.stage || m.groupName || ""}</div>
          </div>
          <div style={{ textAlign: "left", fontSize: "3.4cqmin", fontWeight: 700 }}>{m.awayTeamName ?? "TBC"}</div>
        </div>
      ))}
    </div>
  );
}

function ResultsSlide({ data, tokens }: SlideProps) {
  const results = data.matches
    .filter((m) => m.status === "finished")
    .sort((a, b) => (b.kickoffAt ?? "").localeCompare(a.kickoffAt ?? ""))
    .slice(0, 8);
  if (results.length === 0) return <CenterMessage tokens={tokens} title="No results yet" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2cqmin", height: "100%", justifyContent: "center" }} data-testid="slide-results">
      {results.map((m) => (
        <div
          key={m.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "3cqmin",
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: 18,
            padding: "2cqmin 3cqmin",
          }}
        >
          <div style={{ textAlign: "right", fontSize: "3.2cqmin", fontWeight: 700 }}>{m.homeTeamName ?? "TBC"}</div>
          <div style={{ textAlign: "center", fontSize: "4cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
            {m.homeScore ?? 0} – {m.awayScore ?? 0}
          </div>
          <div style={{ textAlign: "left", fontSize: "3.2cqmin", fontWeight: 700 }}>{m.awayTeamName ?? "TBC"}</div>
        </div>
      ))}
    </div>
  );
}

function StandingsSlide({ data, tokens, accent }: SlideProps) {
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
    return Array.from(byGroup.entries()).slice(0, 4);
  }, [data.standings]);
  if (groups.length === 0) return <CenterMessage tokens={tokens} title="No tables yet" />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: groups.length > 1 ? "1fr 1fr" : "1fr",
        gap: "3cqmin",
        height: "100%",
        alignContent: "center",
      }}
      data-testid="slide-standings"
    >
      {groups.map(([name, rows]) => (
        <div key={name} style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2cqmin 2.5cqmin" }}>
          <div style={{ fontSize: "2.6cqmin", fontWeight: 800, color: accent, marginBottom: "1.2cqmin" }}>{name}</div>
          {rows.slice(0, 4).map((r, i) => (
            <div
              key={r.teamName}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: "2cqmin",
                alignItems: "center",
                padding: "1cqmin 0",
                borderTop: i === 0 ? "none" : `1px solid ${tokens.border}`,
                fontSize: "2.4cqmin",
              }}
            >
              <span style={{ color: tokens.subtle, width: "3cqmin" }}>{r.position ?? i + 1}</span>
              <span style={{ fontWeight: 700 }}>{r.teamName}</span>
              <span style={{ color: tokens.subtle, fontVariantNumeric: "tabular-nums" }}>
                {r.won}-{r.draw}-{r.lost}
              </span>
              <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{r.points}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Per-team live status, keyed by persisted teamId, derived from the live
// matches in the payload. Lets the sweepstake grid show each colleague's team
// score live, right next to their name.
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

// Persist the wall's current page across slide rotations so, over time, every
// staff member is shown even when the deck rotates away and back. Keyed by the
// tournament name (stable per config in practice).
const wallPageMemory = new Map<string, number>();

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Distinct, evenly-spaced hue per group letter (A→0°, B→45°, …) so cards carry
// a splash of colour that also encodes which group each team is in.
function groupHue(groupName: string | null | undefined): number | null {
  if (!groupName) return null;
  const letter = groupName.trim().slice(-1).toUpperCase();
  const idx = letter.charCodeAt(0) - 65;
  if (idx < 0 || idx > 25) return null;
  return (idx * 45) % 360;
}

function ParticipantFlag({ team }: { team?: DisplayTeam }) {
  if (team?.crestUrl) {
    return <img src={team.crestUrl} alt="" style={{ width: "4.6cqmin", height: "4.6cqmin", objectFit: "contain", flexShrink: 0 }} />;
  }
  const flag = flagEmoji(team?.countryCode ?? null);
  if (flag) {
    return (
      <span style={{ fontSize: "4cqmin", lineHeight: 1, flexShrink: 0 }} aria-hidden>
        {flag}
      </span>
    );
  }
  return (
    <span
      style={{
        width: "4.6cqmin",
        height: "4.6cqmin",
        flexShrink: 0,
        borderRadius: 8,
        background: "rgba(127,127,127,0.18)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.7cqmin",
        fontWeight: 800,
      }}
      aria-hidden
    >
      {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
    </span>
  );
}

function SweepstakeSlide({ data, tokens, accent }: SlideProps) {
  const assigned = data.participants.filter((p) => p.teamName);
  const liveByTeam = useMemo(() => liveStatusByTeamId(data.live), [data.live]);
  const teamById = useMemo(() => {
    const m = new Map<string, DisplayTeam>();
    for (const t of data.teams) m.set(t.id, t);
    return m;
  }, [data.teams]);

  // Measure the grid box and derive a column/row count that fills it, so we can
  // paginate every staff member across pages instead of truncating at a cap.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cap, setCap] = useState({ cols: 4, rows: 8 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const cols = Math.min(7, Math.max(2, Math.round(w / 240)));
      const rows = Math.min(12, Math.max(2, Math.floor(h / 88)));
      setCap((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageSize = Math.max(1, cap.cols * cap.rows);
  const pages = useMemo(() => chunk(assigned, pageSize), [assigned, pageSize]);
  const pageCount = pages.length;

  const memKey = data.tournamentName || "default";
  const [page, setPage] = useState(() => wallPageMemory.get(memKey) ?? 0);

  // Auto-advance through pages so the whole roster is shown over time.
  useEffect(() => {
    if (pageCount <= 1) return;
    const ms = Math.max(5, data.rotationIntervalSeconds) * 1000;
    const id = window.setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, ms);
    return () => window.clearInterval(id);
  }, [pageCount, data.rotationIntervalSeconds]);

  // Keep the page in range and remember it across remounts.
  const safePage = pageCount > 0 ? Math.min(page, pageCount - 1) : 0;
  useEffect(() => {
    wallPageMemory.set(memKey, safePage);
  }, [memKey, safePage]);

  if (assigned.length === 0) return <CenterMessage tokens={tokens} title="Draw not made yet" subtitle="Names will appear once teams are drawn" />;

  const items = pages[safePage] ?? [];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "1.2cqmin" }}>
      <div
        ref={gridRef}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cap.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${cap.rows}, minmax(0, 1fr))`,
          gap: "1.4cqmin",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
        data-testid="slide-sweepstake"
      >
        {items.map((p) => {
          const team = p.teamId ? teamById.get(p.teamId) : undefined;
          const status = p.teamId ? liveByTeam.get(p.teamId) : undefined;
          const winning = status ? status.goalsFor > status.goalsAgainst : false;
          const hue = groupHue(team?.groupName);
          const stripe =
            p.status === "winner"
              ? accent
              : status?.isLive
                ? "#ef4444"
                : hue !== null
                  ? `hsl(${hue} 70% 55%)`
                  : accent;
          return (
            <div
              key={p.id}
              style={{
                background: tokens.panel,
                border: `1px solid ${p.status === "winner" ? accent : status?.isLive ? "#ef4444" : tokens.border}`,
                borderLeft: `0.9cqmin solid ${stripe}`,
                borderRadius: 14,
                padding: "1cqmin 1.6cqmin",
                display: "flex",
                alignItems: "center",
                gap: "1.4cqmin",
                minWidth: 0,
                overflow: "hidden",
                opacity: p.status === "eliminated" ? 0.45 : 1,
              }}
              data-testid={`card-participant-${p.id}`}
            >
              <ParticipantFlag team={team} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "2.4cqmin",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: p.status === "eliminated" ? "line-through" : "none",
                  }}
                >
                  {p.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8cqmin", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "1.9cqmin", color: accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.teamName}
                  </span>
                  {status && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.6cqmin",
                        fontSize: "1.8cqmin",
                        fontWeight: 900,
                        fontVariantNumeric: "tabular-nums",
                        color: status.isLive ? (winning ? "#22c55e" : tokens.text) : tokens.subtle,
                        whiteSpace: "nowrap",
                      }}
                      data-testid={`live-status-${p.id}`}
                    >
                      {status.isLive && (
                        <span style={{ width: "1.1cqmin", height: "1.1cqmin", borderRadius: 999, background: "#ef4444", display: "inline-block" }} aria-hidden />
                      )}
                      {status.scoreLabel}
                      <span style={{ color: tokens.subtle, fontWeight: 700 }}>{status.minuteLabel}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {pageCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1cqmin" }} data-testid="wall-pagination">
          {pages.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === safePage ? "3cqmin" : "1cqmin",
                height: "1cqmin",
                borderRadius: 999,
                background: i === safePage ? accent : tokens.border,
                transition: "width 0.3s ease",
              }}
            />
          ))}
          <span style={{ fontSize: "1.6cqmin", color: tokens.subtle, marginLeft: "1.5cqmin", fontWeight: 700 }}>
            {safePage + 1} / {pageCount}
          </span>
        </div>
      )}
    </div>
  );
}

function EliminationsSlide({ data, tokens }: SlideProps) {
  const out = data.participants.filter((p) => p.status === "eliminated");
  const still = data.participants.filter((p) => p.status !== "eliminated" && p.teamName);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3cqmin", height: "100%", alignContent: "center" }} data-testid="slide-eliminations">
      <div style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2.5cqmin" }}>
        <div style={{ fontSize: "3cqmin", fontWeight: 900, color: "#ef4444", marginBottom: "1.5cqmin" }}>Knocked out ({out.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2cqmin" }}>
          {out.slice(0, 30).map((p) => (
            <span key={p.id} style={{ fontSize: "2.4cqmin", textDecoration: "line-through", opacity: 0.7 }}>
              {p.name}
            </span>
          ))}
          {out.length === 0 && <span style={{ color: tokens.subtle, fontSize: "2.4cqmin" }}>Nobody yet — everyone's still in!</span>}
        </div>
      </div>
      <div style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2.5cqmin" }}>
        <div style={{ fontSize: "3cqmin", fontWeight: 900, color: "#22c55e", marginBottom: "1.5cqmin" }}>Still standing ({still.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2cqmin" }}>
          {still.slice(0, 30).map((p) => (
            <span key={p.id} style={{ fontSize: "2.4cqmin", fontWeight: 700 }}>
              {p.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpotlightSlide({ data, tokens, accent }: SlideProps) {
  const teams = data.teams.filter((t) => !t.eliminated);
  if (teams.length === 0) return <CenterMessage tokens={tokens} title="No teams yet" />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(20cqmin, 1fr))",
        gap: "2cqmin",
        height: "100%",
        alignContent: "center",
      }}
      data-testid="slide-spotlight"
    >
      {teams.slice(0, 32).map((t) => (
        <div
          key={t.id}
          style={{
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: 16,
            padding: "2cqmin",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2cqmin",
          }}
        >
          <TeamBadge team={t} size={64} />
          <div style={{ fontSize: "2.4cqmin", fontWeight: 800, textAlign: "center" }}>{t.name}</div>
          {t.groupName && <div style={{ fontSize: "1.8cqmin", color: accent }}>{t.groupName}</div>}
        </div>
      ))}
    </div>
  );
}

function WinnerSlide({ data, tokens, accent }: SlideProps) {
  if (!data.winner) return <CenterMessage tokens={tokens} title="No winner yet" />;
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "3cqmin", textAlign: "center" }}
      data-testid="slide-winner"
    >
      <div style={{ fontSize: "5cqmin" }}>🏆</div>
      <div style={{ fontSize: "3cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.2em" }}>Champions</div>
      <div style={{ fontSize: "10cqmin", fontWeight: 900, color: accent, lineHeight: 1 }}>{data.winner.teamName}</div>
      {data.winner.participants.length > 0 && (
        <>
          <div style={{ fontSize: "2.6cqmin", color: tokens.subtle }}>Congratulations to</div>
          <div style={{ fontSize: "4cqmin", fontWeight: 800, maxWidth: "80%" }}>{data.winner.participants.join(" · ")}</div>
        </>
      )}
    </div>
  );
}

// ----- Live panel slides (Task #287) -----

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

function LiveTeamColumn({ team, tokens, accent, align }: { team: LiveTeamView | null; tokens: ThemeTokens; accent: string; align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.2cqmin", textAlign: "center" }}>
      {team?.crestUrl ? (
        <img src={team.crestUrl} alt="" style={{ width: "10cqmin", height: "10cqmin", objectFit: "contain" }} />
      ) : (
        <span style={{ fontSize: "9cqmin", lineHeight: 1 }} aria-hidden>
          {flagEmoji(team?.countryCode ?? null) ?? "🏳️"}
        </span>
      )}
      <div style={{ fontSize: "3.2cqmin", fontWeight: 900 }}>{team?.name ?? "TBC"}</div>
      {team && team.participants.length > 0 && (
        <div style={{ fontSize: "2cqmin", color: accent, fontWeight: 700, maxWidth: "30cqmin" }}>{team.participants.join(" · ")}</div>
      )}
    </div>
  );
}

function MatchHero({ match, tokens, accent, label }: { match: LiveMatchView; tokens: ThemeTokens; accent: string; label: string }) {
  return (
    <div style={{ background: tokens.panel, border: `1px solid ${match.isLive ? "#ef4444" : tokens.border}`, borderRadius: 22, padding: "3cqmin", display: "flex", flexDirection: "column", gap: "2cqmin" }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1.2cqmin" }}>
        {match.isLive && <span style={{ width: "1.4cqmin", height: "1.4cqmin", borderRadius: 999, background: "#ef4444", display: "inline-block" }} aria-hidden />}
        <span style={{ fontSize: "2.2cqmin", fontWeight: 800, color: match.isLive ? "#ef4444" : tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {label}
        </span>
        <span style={{ fontSize: "2cqmin", color: tokens.subtle }}>{match.groupName || match.stage || ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "2cqmin" }}>
        <LiveTeamColumn team={match.home} tokens={tokens} accent={accent} align="right" />
        <div style={{ textAlign: "center" }}>
          {match.isLive || match.finished ? (
            <div style={{ fontSize: "8cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {match.homeScore ?? 0}<span style={{ color: tokens.subtle }}> – </span>{match.awayScore ?? 0}
            </div>
          ) : (
            <div style={{ fontSize: "4cqmin", fontWeight: 900, color: accent }}>{kickoffTime(match.startingAt)}</div>
          )}
          <div style={{ fontSize: "2.2cqmin", color: tokens.subtle, marginTop: "0.6cqmin" }}>
            {match.isLive && match.minute != null ? `${match.minute}'` : match.stateLabel}
          </div>
        </div>
        <LiveTeamColumn team={match.away} tokens={tokens} accent={accent} align="left" />
      </div>
    </div>
  );
}

function NowNextSlide({ data, tokens, accent }: SlideProps) {
  const live = data.live;
  const now = live?.liveMatches[0] ?? null;
  const next = live?.nextMatch ?? null;
  if (!now && !next) return <CenterMessage tokens={tokens} title="No matches to show" subtitle="Check back at kick-off time" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3cqmin", height: "100%", justifyContent: "center" }} data-testid="slide-now-next">
      {now && <MatchHero match={now} tokens={tokens} accent={accent} label="Now playing" />}
      {next && <MatchHero match={next} tokens={tokens} accent={accent} label="Up next" />}
    </div>
  );
}

function LiveScoreSlide({ data, tokens, accent }: SlideProps) {
  const live = data.live;
  const matches = live?.liveMatches ?? [];
  if (matches.length === 0) return <CenterMessage tokens={tokens} title="No live matches right now" subtitle="Scores will appear when a game kicks off" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2cqmin", height: "100%", justifyContent: "center", overflow: "hidden" }} data-testid="slide-live-score">
      {matches.slice(0, 3).map((m) => (
        <div key={m.id} style={{ background: tokens.panel, border: `1px solid ${m.isLive ? "#ef4444" : tokens.border}`, borderRadius: 18, padding: "2cqmin 3cqmin" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "2cqmin" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "3cqmin", fontWeight: 800 }}>{m.home?.name ?? "TBC"}</div>
              {m.home && m.home.participants.length > 0 && <div style={{ fontSize: "1.7cqmin", color: accent }}>{m.home.participants.join(" · ")}</div>}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "4.4cqmin", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {m.homeScore ?? 0} – {m.awayScore ?? 0}
              </div>
              <div style={{ fontSize: "1.8cqmin", color: m.isLive ? "#ef4444" : tokens.subtle, fontWeight: 800 }}>
                {m.isLive && m.minute != null ? `${m.minute}'` : m.stateLabel}
              </div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "3cqmin", fontWeight: 800 }}>{m.away?.name ?? "TBC"}</div>
              {m.away && m.away.participants.length > 0 && <div style={{ fontSize: "1.7cqmin", color: accent }}>{m.away.participants.join(" · ")}</div>}
            </div>
          </div>
          {m.events.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2cqmin", marginTop: "1.4cqmin", justifyContent: "center" }}>
              {m.events.slice(-6).map((e, i) => (
                <span key={i} style={{ fontSize: "1.7cqmin", color: tokens.subtle, background: "rgba(127,127,127,0.12)", borderRadius: 999, padding: "0.4cqmin 1.2cqmin", whiteSpace: "nowrap" }}>
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
    return Array.from(byGroup.entries()).slice(0, 4);
  }, [live?.standings]);
  if (groups.length === 0) return <CenterMessage tokens={tokens} title="No live tables yet" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: groups.length > 1 ? "1fr 1fr" : "1fr", gap: "3cqmin", height: "100%", alignContent: "center" }} data-testid="slide-live-standings">
      {groups.map(([name, rows]) => (
        <div key={name} style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2cqmin 2.5cqmin" }}>
          <div style={{ fontSize: "2.6cqmin", fontWeight: 800, color: accent, marginBottom: "1.2cqmin" }}>{name}</div>
          {rows.slice(0, 4).map((r, i) => (
            <div
              key={r.team.teamId ?? r.team.name}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: "1.6cqmin",
                alignItems: "center",
                padding: "1cqmin 0",
                borderTop: i === 0 ? "none" : `1px solid ${tokens.border}`,
                fontSize: "2.2cqmin",
              }}
            >
              <span style={{ color: tokens.subtle, width: "3cqmin" }}>{r.position ?? i + 1}</span>
              <span style={{ overflow: "hidden" }}>
                <span style={{ fontWeight: 700 }}>{r.team.name}</span>
                {r.team.participants.length > 0 && (
                  <span style={{ color: accent, fontSize: "1.6cqmin", marginLeft: "1cqmin" }}>{r.team.participants.join(" · ")}</span>
                )}
              </span>
              <span style={{ color: tokens.subtle, fontVariantNumeric: "tabular-nums" }}>{r.won}-{r.draw}-{r.lost}</span>
              <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{r.points}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CenterMessage({
  tokens,
  title,
  subtitle,
  accent,
}: {
  tokens: ThemeTokens;
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "2cqmin", textAlign: "center" }}>
      <div style={{ fontSize: "5cqmin", fontWeight: 900, color: accent ?? tokens.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: "2.6cqmin", color: tokens.subtle }}>{subtitle}</div>}
    </div>
  );
}

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
    case "eliminations":
      return <EliminationsSlide {...props} />;
    case "spotlight":
      return <SpotlightSlide {...props} />;
    case "winner":
      return <WinnerSlide {...props} />;
    case "now_next":
      return <NowNextSlide {...props} />;
    case "live_score":
      return <LiveScoreSlide {...props} />;
    case "live_standings":
      return <LiveStandingsSlide {...props} />;
    case "live_unavailable":
      return (
        <CenterMessage
          tokens={props.tokens}
          title="Live data temporarily unavailable"
          subtitle="We'll reconnect automatically"
        />
      );
    default:
      return null;
  }
}

// Build the effective rotation: the configured sweepstake slides, plus any
// live panels that currently have something to show. If live mode is on but
// the upstream feed is unreachable, a single "unavailable" slot is appended
// so operators can see the feed is down (rather than silently dropping it).
function buildRotation(data: SweepstakeDisplayData): RotationSlide[] {
  const base: RotationSlide[] = data.slides.length > 0 ? [...data.slides] : ["sweepstake"];
  const live = data.live;
  if (!live || !live.enabled) return base;
  if (!live.available) return [...base, "live_unavailable"];
  const livePanels: RotationSlide[] = [];
  for (const panel of live.panels) {
    if (panel === "now_next" && (live.liveMatches.length > 0 || live.nextMatch)) livePanels.push("now_next");
    else if (panel === "live_score" && live.liveMatches.length > 0) livePanels.push("live_score");
    else if (panel === "live_standings" && live.standings.length > 0) livePanels.push("live_standings");
  }
  return [...base, ...livePanels];
}

function kickoffTime(iso: string | null): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBC";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface WidgetProps {
  data: SweepstakeDisplayData;
  /** Force a specific slide (used by the admin preview). */
  forcedSlide?: SlideType | null;
}

export function SweepstakeDisplayWidget({ data, forcedSlide }: WidgetProps) {
  const tokens = themeTokens(data.theme);
  const accent = data.accentColor || "#16a34a";
  const slides = useMemo(() => buildRotation(data), [data]);
  const slidesKey = slides.join(",");
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  // Rotate through slides on the configured interval. The timer is reset
  // whenever the slide list or rotation interval changes so a re-sync never
  // leaves us pointing at a slide that no longer exists.
  useEffect(() => {
    if (forcedSlide) return;
    if (slides.length <= 1) {
      setIndex(0);
      indexRef.current = 0;
      return;
    }
    const ms = Math.max(3, data.rotationIntervalSeconds) * 1000;
    const id = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % slides.length;
      setIndex(indexRef.current);
    }, ms);
    return () => window.clearInterval(id);
  }, [forcedSlide, slides.length, data.rotationIntervalSeconds, slidesKey]);

  const activeSlide: RotationSlide = forcedSlide ?? slides[Math.min(index, slides.length - 1)] ?? "sweepstake";
  const slideProps: SlideProps = { data, tokens, accent };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        containerType: "size",
        background: tokens.bg,
      }}
    >
    <div
      style={{
        width: "100%",
        height: "100%",
        background: tokens.bg,
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
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "3cqmin" }}>
        <div style={{ fontSize: "4cqmin", fontWeight: 900, color: accent }} data-testid="text-tournament-name">
          {data.tournamentName}
        </div>
        <div style={{ fontSize: "2.4cqmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {SLIDE_TITLES[activeSlide]}
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>{renderSlide(activeSlide, slideProps)}</main>
      {!forcedSlide && slides.length > 1 && (
        <footer style={{ display: "flex", justifyContent: "center", gap: "1.2cqmin", marginTop: "2.5cqmin" }}>
          {slides.map((s, i) => (
            <span
              key={s}
              style={{
                width: i === Math.min(index, slides.length - 1) ? "4cqmin" : "1.4cqmin",
                height: "1.4cqmin",
                borderRadius: 999,
                background: i === Math.min(index, slides.length - 1) ? accent : tokens.border,
                transition: "width 0.3s ease",
              }}
            />
          ))}
        </footer>
      )}
    </div>
    </div>
  );
}
