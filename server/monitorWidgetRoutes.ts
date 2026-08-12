/**
 * Monitor widget route registration.
 *
 * Exports `mountMonitorWidgetRoutes` — the single place that registers all 9
 * /api/monitor/widgets/... routes with an auth middleware and a set of
 * request handlers.  Both are injected so the function is independently
 * testable without spinning up the full production server.
 *
 * Routes registered here:
 *   GET /api/monitor/widgets/news
 *   GET /api/monitor/widgets/weather-forecast
 *   GET /api/monitor/widgets/heathrow/arrivals
 *   GET /api/monitor/widgets/heathrow/departures
 *   GET /api/monitor/widgets/earthquakes/recent
 *   GET /api/monitor/widgets/aircraft/overhead
 *   GET /api/monitor/widgets/spacex/next-launch
 *   GET /api/monitor/widgets/football/premier-league/table
 *   GET /api/monitor/widgets/football/premier-league/fixtures
 */

import type { Express, RequestHandler } from "express";

export interface MonitorWidgetHandlers {
  news: RequestHandler;
  weatherForecast: RequestHandler;
  heathrowArrivals: RequestHandler;
  heathrowDepartures: RequestHandler;
  earthquakes: RequestHandler;
  aircraftOverhead: RequestHandler;
  spacexNextLaunch: RequestHandler;
  premierLeagueTable: RequestHandler;
  premierLeagueFixtures: RequestHandler;
}

/**
 * Mounts all 9 monitor widget routes on the given Express app.
 *
 * @param app            - Express application instance
 * @param authMiddleware - The `requireMonitorSession` middleware (or a test
 *                         double) that gates every route
 * @param handlers       - Request handlers for each route (can be stubs in
 *                         tests, real implementations in production)
 */
export function mountMonitorWidgetRoutes(
  app: Express,
  authMiddleware: RequestHandler,
  handlers: MonitorWidgetHandlers,
): void {
  // widgetBaseUrl on Monitor clients is derived from
  // mediaBaseUrl="/api/monitor/media". These routes must stay under the
  // /api/monitor/widgets/ prefix — see monitor-widget-auth memory entry.
  app.get("/api/monitor/widgets/news",
    authMiddleware, handlers.news);
  app.get("/api/monitor/widgets/weather-forecast",
    authMiddleware, handlers.weatherForecast);
  app.get("/api/monitor/widgets/heathrow/arrivals",
    authMiddleware, handlers.heathrowArrivals);
  app.get("/api/monitor/widgets/heathrow/departures",
    authMiddleware, handlers.heathrowDepartures);
  app.get("/api/monitor/widgets/earthquakes/recent",
    authMiddleware, handlers.earthquakes);
  app.get("/api/monitor/widgets/aircraft/overhead",
    authMiddleware, handlers.aircraftOverhead);
  app.get("/api/monitor/widgets/spacex/next-launch",
    authMiddleware, handlers.spacexNextLaunch);
  app.get("/api/monitor/widgets/football/premier-league/table",
    authMiddleware, handlers.premierLeagueTable);
  app.get("/api/monitor/widgets/football/premier-league/fixtures",
    authMiddleware, handlers.premierLeagueFixtures);
}
