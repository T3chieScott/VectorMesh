// Task #244 — HTML/CSS widget sanitisation.
//
// The HTML widget lets operators paste a raw HTML + CSS snippet that is
// rendered inside a sandboxed iframe (sandbox="allow-same-origin" only —
// NO allow-scripts). The iframe sandbox is the real security boundary:
// without allow-scripts the browser will not execute any <script>, inline
// event handler, or javascript: URL regardless of what we send.
//
// These helpers are defence-in-depth on top of that boundary, and are run
// SERVER-SIDE before the snippet is returned in any player/admin content
// payload so a stored snippet can never ship executable markup to a device.
// They are intentionally conservative string transforms (not a full HTML
// parser) — good enough as a second layer behind the sandbox, and shared so
// the editor's live preview shows operators exactly what will render.

import type { LayoutZone } from "./schema";

/**
 * Strip script execution vectors from an HTML body:
 *  - <script>…</script> blocks (and orphan/unclosed script tags)
 *  - inline event-handler attributes (onclick, onload, on…=)
 *  - javascript: URLs in href/src attributes
 * Benign markup (divs, spans, images, styling attributes) is preserved.
 */
export function sanitizeWidgetHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html);
  // Whole <script>…</script> blocks, including across newlines.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  // Any leftover orphan opening/closing script tags (unclosed snippet).
  out = out.replace(/<\/?script\b[^>]*>/gi, "");
  // Inline event-handler attributes: on...="...", on...='...', on...=bare.
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z0-9_-]+\s*=\s*[^\s"'>]+/gi, "");
  // Neutralise javascript: URLs in href/src (quoted, single-quoted, bare).
  out = out.replace(
    /\b(href|src)\s*=\s*"\s*javascript:[^"]*"/gi,
    '$1="#"',
  );
  out = out.replace(
    /\b(href|src)\s*=\s*'\s*javascript:[^']*'/gi,
    "$1='#'",
  );
  out = out.replace(
    /\b(href|src)\s*=\s*javascript:[^\s"'>]+/gi,
    '$1="#"',
  );
  return out;
}

/**
 * Harden a CSS body before it is injected into the widget iframe's <style>
 * block. CSS cannot execute scripts in modern browsers, but a snippet could
 * try to break out of the <style> element (e.g. "</style><img onerror=…>").
 * We neutralise any closing-style sequence and run the same script-strip so
 * nothing escapes the style context.
 */
export function sanitizeWidgetCss(css: string | null | undefined): string {
  if (!css) return "";
  let out = String(css);
  // Prevent breaking out of the surrounding <style> element.
  out = out.replace(/<\s*\/\s*style/gi, "");
  out = out.replace(/<\s*style/gi, "");
  // Defence-in-depth: strip any embedded script/handler/js-url just in case.
  out = sanitizeWidgetHtml(out);
  return out;
}

/**
 * Return a copy of a zone array with every HTML-widget zone's body
 * (`textContent`) and styles (`htmlCss`) sanitised. Non-HTML zones and the
 * original array are left untouched (a new array/objects are returned so the
 * stored row is never mutated).
 */
export function sanitizeHtmlZones(
  zones: LayoutZone[] | null | undefined,
): LayoutZone[] {
  if (!Array.isArray(zones)) return [];
  return zones.map((zone) => {
    if (zone?.type !== "html") return zone;
    return {
      ...zone,
      textContent: sanitizeWidgetHtml(zone.textContent),
      htmlCss: sanitizeWidgetCss(zone.htmlCss),
    };
  });
}
