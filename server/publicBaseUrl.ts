/**
 * Resolves the public base URL used for outward-facing absolute links,
 * specifically monitor-session bootstrap URLs returned to Multiview clients.
 *
 * Priority:
 *   1. PUBLIC_BASE_URL env var (explicit — required in production)
 *   2. REPLIT_DEV_DOMAIN env var (injected by the Replit runner in dev)
 *   3. http://localhost:5000 (last resort, development-only)
 *
 * In production (NODE_ENV=production) the function throws if PUBLIC_BASE_URL
 * is absent, preventing silent emission of localhost URLs that would cause
 * every Multiview bootstrap link to 403.
 */
export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (env.REPLIT_DEV_DOMAIN) return `https://${env.REPLIT_DEV_DOMAIN}`;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PUBLIC_BASE_URL is not set. " +
      "Set PUBLIC_BASE_URL=https://vectormesh.4wallcloud.com (or your deployed hostname) " +
      "in the server environment so monitor-session URLs are reachable by Multiview clients.",
    );
  }
  // Development only: localhost is acceptable for local testing.
  return "http://localhost:5000";
}
