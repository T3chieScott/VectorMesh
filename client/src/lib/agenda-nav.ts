type AgendaNavPath = "/agenda" | "/agenda/displays";

const AGENDA_NAV_PATHS: readonly AgendaNavPath[] = [
  "/agenda",
  "/agenda/displays",
];

function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isPathWithin(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

/**
 * Agenda pages share the /agenda prefix, so active state must choose the
 * longest matching route rather than treating every prefix match as active.
 */
export function isAgendaNavItemActive(location: string, url: string): boolean {
  const pathname = normalizePath(location);
  const normalizedUrl = normalizePath(url);
  const activePath = AGENDA_NAV_PATHS
    .filter((candidate) => isPathWithin(pathname, candidate))
    .sort((a, b) => b.length - a.length)[0];

  return activePath === normalizedUrl;
}