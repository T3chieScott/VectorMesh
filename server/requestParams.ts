import type { Request, Response } from "express";

/**
 * Coerce a path param (`req.params.X`) to a single string.
 *
 * `@types/express` types path params via `ParamsDictionary` which widens
 * `req.params[key]` to `string | string[]`. At runtime Express never
 * populates path params with arrays — they're always single strings — so
 * this helper narrows the type cleanly for callers and asserts on the
 * impossible array case so we don't silently propagate bad data.
 */
export function getPathParam(req: Request, key: string): string {
  const v = (req.params as Record<string, string | string[] | undefined>)[key];
  if (typeof v !== "string") {
    throw new Error(
      `Path param "${key}" was missing or unexpectedly multi-valued`,
    );
  }
  return v;
}

/**
 * Coerce a query param (`req.query.X`) to a single trimmed string.
 *
 * Query strings can legitimately be repeated by clients (`?id=a&id=b`),
 * which Express + qs parses as `string[]`. This helper:
 *   - returns `undefined` if the param is missing or empty after trim,
 *   - returns the trimmed string if it's a single value,
 *   - sends a 400 response and returns `null` if it's an array (or some
 *     other non-string parsed shape, e.g. nested object).
 *
 * Callers should bail when the result is `null` (the response has already
 * been sent). Pattern:
 *
 *   const id = getQueryString(req, "clientId", res);
 *   if (id === null) return;
 *   if (id === undefined) { ... missing ... }
 *   ... use id (string) ...
 */
export function getQueryString(
  req: Request,
  key: string,
  res: Response,
): string | undefined | null {
  const v = req.query[key];
  if (v === undefined) return undefined;
  if (Array.isArray(v)) {
    res
      .status(400)
      .json({ error: `Query param "${key}" must not be repeated` });
    return null;
  }
  if (typeof v !== "string") {
    res
      .status(400)
      .json({ error: `Query param "${key}" must be a string` });
    return null;
  }
  const trimmed = v.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
