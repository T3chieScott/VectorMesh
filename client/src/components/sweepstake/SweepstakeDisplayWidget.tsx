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

const SLIDE_TITLES: Record<SlideType, string> = {
  countdown: "Kick-off countdown",
  fixtures: "Fixtures",
  results: "Recent results",
  standings: "Group tables",
  sweepstake: "The sweepstake",
  eliminations: "Knocked out",
  spotlight: "Teams in the hat",
  winner: "We have a winner!",
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
        padding: "1.5vmin 2.5vmin",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "5.5vmin", fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "1.8vmin", color: tokens.subtle, marginTop: "0.6vmin", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "4vmin" }}>
      <div style={{ fontSize: "3.5vmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.18em" }}>Kick-off in</div>
      <div style={{ display: "flex", gap: "3vmin" }} data-testid="slide-countdown">
        {cells.map((c) => (
          <div key={c.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "16vmin",
                fontWeight: 900,
                lineHeight: 1,
                color: accent,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(c.value).padStart(2, "0")}
            </div>
            <div style={{ fontSize: "2.4vmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>{c.label}</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "2vmin", height: "100%", justifyContent: "center" }} data-testid="slide-fixtures">
      {fixtures.map((m) => (
        <div
          key={m.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "3vmin",
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: 18,
            padding: "2vmin 3vmin",
          }}
        >
          <div style={{ textAlign: "right", fontSize: "3.4vmin", fontWeight: 700 }}>{m.homeTeamName ?? "TBC"}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2vmin", color: accent, fontWeight: 800 }}>
              {m.status === "in_play" ? "LIVE" : kickoffTime(m.kickoffAt)}
            </div>
            <div style={{ fontSize: "1.5vmin", color: tokens.subtle }}>{m.stage || m.groupName || ""}</div>
          </div>
          <div style={{ textAlign: "left", fontSize: "3.4vmin", fontWeight: 700 }}>{m.awayTeamName ?? "TBC"}</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "2vmin", height: "100%", justifyContent: "center" }} data-testid="slide-results">
      {results.map((m) => (
        <div
          key={m.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "3vmin",
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: 18,
            padding: "2vmin 3vmin",
          }}
        >
          <div style={{ textAlign: "right", fontSize: "3.2vmin", fontWeight: 700 }}>{m.homeTeamName ?? "TBC"}</div>
          <div style={{ textAlign: "center", fontSize: "4vmin", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
            {m.homeScore ?? 0} – {m.awayScore ?? 0}
          </div>
          <div style={{ textAlign: "left", fontSize: "3.2vmin", fontWeight: 700 }}>{m.awayTeamName ?? "TBC"}</div>
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
        gap: "3vmin",
        height: "100%",
        alignContent: "center",
      }}
      data-testid="slide-standings"
    >
      {groups.map(([name, rows]) => (
        <div key={name} style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2vmin 2.5vmin" }}>
          <div style={{ fontSize: "2.6vmin", fontWeight: 800, color: accent, marginBottom: "1.2vmin" }}>{name}</div>
          {rows.slice(0, 4).map((r, i) => (
            <div
              key={r.teamName}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: "2vmin",
                alignItems: "center",
                padding: "1vmin 0",
                borderTop: i === 0 ? "none" : `1px solid ${tokens.border}`,
                fontSize: "2.4vmin",
              }}
            >
              <span style={{ color: tokens.subtle, width: "3vmin" }}>{r.position ?? i + 1}</span>
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

function SweepstakeSlide({ data, tokens, accent }: SlideProps) {
  const assigned = data.participants.filter((p) => p.teamName);
  if (assigned.length === 0) return <CenterMessage tokens={tokens} title="Draw not made yet" subtitle="Names will appear once teams are drawn" />;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(22vmin, 1fr))",
        gap: "1.6vmin",
        height: "100%",
        alignContent: "center",
        overflow: "hidden",
      }}
      data-testid="slide-sweepstake"
    >
      {assigned.slice(0, 48).map((p) => (
        <div
          key={p.id}
          style={{
            background: tokens.panel,
            border: `1px solid ${p.status === "winner" ? accent : tokens.border}`,
            borderRadius: 16,
            padding: "1.6vmin 2vmin",
            opacity: p.status === "eliminated" ? 0.45 : 1,
            textDecoration: p.status === "eliminated" ? "line-through" : "none",
          }}
          data-testid={`card-participant-${p.id}`}
        >
          <div style={{ fontSize: "2.6vmin", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
          </div>
          <div style={{ fontSize: "2vmin", color: accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.teamName}
          </div>
        </div>
      ))}
    </div>
  );
}

function EliminationsSlide({ data, tokens }: SlideProps) {
  const out = data.participants.filter((p) => p.status === "eliminated");
  const still = data.participants.filter((p) => p.status !== "eliminated" && p.teamName);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3vmin", height: "100%", alignContent: "center" }} data-testid="slide-eliminations">
      <div style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2.5vmin" }}>
        <div style={{ fontSize: "3vmin", fontWeight: 900, color: "#ef4444", marginBottom: "1.5vmin" }}>Knocked out ({out.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2vmin" }}>
          {out.slice(0, 30).map((p) => (
            <span key={p.id} style={{ fontSize: "2.4vmin", textDecoration: "line-through", opacity: 0.7 }}>
              {p.name}
            </span>
          ))}
          {out.length === 0 && <span style={{ color: tokens.subtle, fontSize: "2.4vmin" }}>Nobody yet — everyone's still in!</span>}
        </div>
      </div>
      <div style={{ background: tokens.panel, border: `1px solid ${tokens.border}`, borderRadius: 18, padding: "2.5vmin" }}>
        <div style={{ fontSize: "3vmin", fontWeight: 900, color: "#22c55e", marginBottom: "1.5vmin" }}>Still standing ({still.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2vmin" }}>
          {still.slice(0, 30).map((p) => (
            <span key={p.id} style={{ fontSize: "2.4vmin", fontWeight: 700 }}>
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
        gridTemplateColumns: "repeat(auto-fill, minmax(20vmin, 1fr))",
        gap: "2vmin",
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
            padding: "2vmin",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.2vmin",
          }}
        >
          <TeamBadge team={t} size={64} />
          <div style={{ fontSize: "2.4vmin", fontWeight: 800, textAlign: "center" }}>{t.name}</div>
          {t.groupName && <div style={{ fontSize: "1.8vmin", color: accent }}>{t.groupName}</div>}
        </div>
      ))}
    </div>
  );
}

function WinnerSlide({ data, tokens, accent }: SlideProps) {
  if (!data.winner) return <CenterMessage tokens={tokens} title="No winner yet" />;
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "3vmin", textAlign: "center" }}
      data-testid="slide-winner"
    >
      <div style={{ fontSize: "5vmin" }}>🏆</div>
      <div style={{ fontSize: "3vmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.2em" }}>Champions</div>
      <div style={{ fontSize: "10vmin", fontWeight: 900, color: accent, lineHeight: 1 }}>{data.winner.teamName}</div>
      {data.winner.participants.length > 0 && (
        <>
          <div style={{ fontSize: "2.6vmin", color: tokens.subtle }}>Congratulations to</div>
          <div style={{ fontSize: "4vmin", fontWeight: 800, maxWidth: "80%" }}>{data.winner.participants.join(" · ")}</div>
        </>
      )}
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "2vmin", textAlign: "center" }}>
      <div style={{ fontSize: "5vmin", fontWeight: 900, color: accent ?? tokens.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: "2.6vmin", color: tokens.subtle }}>{subtitle}</div>}
    </div>
  );
}

function renderSlide(slide: SlideType, props: SlideProps) {
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
    default:
      return null;
  }
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
  const slides = data.slides.length > 0 ? data.slides : (["sweepstake"] as SlideType[]);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  // Rotate through slides on the configured interval. The timer is reset
  // whenever the slide list or rotation interval changes so a re-sync never
  // leaves us pointing at a slide that no longer exists.
  useEffect(() => {
    if (forcedSlide) return;
    if (slides.length <= 1) {
      setIndex(0);
      return;
    }
    const ms = Math.max(3, data.rotationIntervalSeconds) * 1000;
    const id = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % slides.length;
      setIndex(indexRef.current);
    }, ms);
    return () => window.clearInterval(id);
  }, [forcedSlide, slides.length, data.rotationIntervalSeconds, data.slides.join(",")]);

  const activeSlide: SlideType = forcedSlide ?? slides[Math.min(index, slides.length - 1)] ?? "sweepstake";
  const slideProps: SlideProps = { data, tokens, accent };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: tokens.bg,
        color: tokens.text,
        display: "flex",
        flexDirection: "column",
        padding: "4vmin",
        boxSizing: "border-box",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        overflow: "hidden",
      }}
      data-testid="sweepstake-display"
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "3vmin" }}>
        <div style={{ fontSize: "4vmin", fontWeight: 900, color: accent }} data-testid="text-tournament-name">
          {data.tournamentName}
        </div>
        <div style={{ fontSize: "2.4vmin", color: tokens.subtle, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {SLIDE_TITLES[activeSlide]}
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>{renderSlide(activeSlide, slideProps)}</main>
      {!forcedSlide && slides.length > 1 && (
        <footer style={{ display: "flex", justifyContent: "center", gap: "1.2vmin", marginTop: "2.5vmin" }}>
          {slides.map((s, i) => (
            <span
              key={s}
              style={{
                width: i === Math.min(index, slides.length - 1) ? "4vmin" : "1.4vmin",
                height: "1.4vmin",
                borderRadius: 999,
                background: i === Math.min(index, slides.length - 1) ? accent : tokens.border,
                transition: "width 0.3s ease",
              }}
            />
          ))}
        </footer>
      )}
    </div>
  );
}
