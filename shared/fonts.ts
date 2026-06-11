// Shared font registry used by BOTH the agenda display widget and
// layout text zones. A stored `fontFamily` value is either:
//   - a built-in key (see BUILTIN_FONTS below), or
//   - a custom-font reference of the form `custom:<fontId>`, or
//   - null/empty (falls back to the caller's default).
//
// We only ever store the KEY (never the resolved CSS stack) so the
// underlying stack can be tuned later without rewriting rows.

export interface BuiltInFont {
  key: string;
  label: string;
  stack: string;
  group: "Sans-serif" | "Serif" | "Monospace" | "Handwriting";
}

// Every built-in below maps to a font already loaded in client/index.html
// (system stacks need no loading), so picking one renders immediately on
// the admin previews and on a player without any extra network request.
export const BUILTIN_FONTS: BuiltInFont[] = [
  // Generic / web-safe (these six keys + stacks match the original agenda
  // font list exactly, so existing agenda configs render identically).
  { key: "system", label: "System default", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', group: "Sans-serif" },
  { key: "inter", label: "Inter", stack: 'Inter, system-ui, sans-serif', group: "Sans-serif" },
  { key: "sans", label: "Helvetica / Arial", stack: 'Helvetica, Arial, sans-serif', group: "Sans-serif" },
  { key: "serif", label: "Georgia", stack: 'Georgia, "Times New Roman", serif', group: "Serif" },
  { key: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif', group: "Serif" },
  { key: "mono", label: "Monospace", stack: '"SF Mono", Menlo, Consolas, "Courier New", monospace', group: "Monospace" },
  // Expanded sans-serif library.
  { key: "roboto", label: "Roboto", stack: '"Roboto", system-ui, sans-serif', group: "Sans-serif" },
  { key: "open-sans", label: "Open Sans", stack: '"Open Sans", system-ui, sans-serif', group: "Sans-serif" },
  { key: "montserrat", label: "Montserrat", stack: '"Montserrat", system-ui, sans-serif', group: "Sans-serif" },
  { key: "poppins", label: "Poppins", stack: '"Poppins", system-ui, sans-serif', group: "Sans-serif" },
  { key: "outfit", label: "Outfit", stack: '"Outfit", system-ui, sans-serif', group: "Sans-serif" },
  { key: "dm-sans", label: "DM Sans", stack: '"DM Sans", system-ui, sans-serif', group: "Sans-serif" },
  { key: "plus-jakarta-sans", label: "Plus Jakarta Sans", stack: '"Plus Jakarta Sans", system-ui, sans-serif', group: "Sans-serif" },
  { key: "space-grotesk", label: "Space Grotesk", stack: '"Space Grotesk", system-ui, sans-serif', group: "Sans-serif" },
  { key: "geist", label: "Geist", stack: '"Geist", system-ui, sans-serif', group: "Sans-serif" },
  { key: "ibm-plex-sans", label: "IBM Plex Sans", stack: '"IBM Plex Sans", system-ui, sans-serif', group: "Sans-serif" },
  { key: "oxanium", label: "Oxanium", stack: '"Oxanium", system-ui, sans-serif', group: "Sans-serif" },
  // Expanded serif library.
  { key: "playfair-display", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif', group: "Serif" },
  { key: "merriweather", label: "Merriweather", stack: '"Merriweather", Georgia, serif', group: "Serif" },
  { key: "lora", label: "Lora", stack: '"Lora", Georgia, serif', group: "Serif" },
  { key: "libre-baskerville", label: "Libre Baskerville", stack: '"Libre Baskerville", Georgia, serif', group: "Serif" },
  { key: "source-serif-4", label: "Source Serif 4", stack: '"Source Serif 4", Georgia, serif', group: "Serif" },
  // Expanded monospace library.
  { key: "jetbrains-mono", label: "JetBrains Mono", stack: '"JetBrains Mono", monospace', group: "Monospace" },
  { key: "fira-code", label: "Fira Code", stack: '"Fira Code", monospace', group: "Monospace" },
  { key: "ibm-plex-mono", label: "IBM Plex Mono", stack: '"IBM Plex Mono", monospace', group: "Monospace" },
  { key: "roboto-mono", label: "Roboto Mono", stack: '"Roboto Mono", monospace', group: "Monospace" },
  { key: "source-code-pro", label: "Source Code Pro", stack: '"Source Code Pro", monospace', group: "Monospace" },
  { key: "space-mono", label: "Space Mono", stack: '"Space Mono", monospace', group: "Monospace" },
  { key: "geist-mono", label: "Geist Mono", stack: '"Geist Mono", monospace', group: "Monospace" },
  // Handwriting / display.
  { key: "architects-daughter", label: "Architects Daughter", stack: '"Architects Daughter", cursive', group: "Handwriting" },
];

export const BUILTIN_FONT_MAP: Record<string, BuiltInFont> = Object.fromEntries(
  BUILTIN_FONTS.map((f) => [f.key, f]),
);

// Default stack when no fontFamily is selected (matches the original
// hardcoded agenda look — Inter).
export const DEFAULT_FONT_STACK = BUILTIN_FONT_MAP.inter.stack;

export const CUSTOM_FONT_PREFIX = "custom:";

export const ALLOWED_FONT_EXTENSIONS = ["woff2", "woff", "ttf", "otf"] as const;
export type AllowedFontExtension = (typeof ALLOWED_FONT_EXTENSIONS)[number];

export function isCustomFontKey(key?: string | null): boolean {
  return typeof key === "string" && key.startsWith(CUSTOM_FONT_PREFIX);
}

export function customFontIdFromKey(key?: string | null): string | null {
  if (!isCustomFontKey(key)) return null;
  return (key as string).slice(CUSTOM_FONT_PREFIX.length);
}

export function customFontKey(id: string): string {
  return `${CUSTOM_FONT_PREFIX}${id}`;
}

// CSS family name exposed for a custom font id. Must match the name used
// in the injected @font-face rule (see buildFontFaceCss on the client).
export function customFontFamily(id: string): string {
  return `vmfont-${id}`;
}

// Resolve a stored fontFamily key to a CSS font stack. Unknown / empty
// keys fall back to the default (Inter) stack. Custom references resolve
// to the per-font @font-face family with a sane sans-serif fallback, so
// even if the font file fails to load the text still renders.
export function resolveFontStack(key: string | null | undefined): string {
  if (!key) return DEFAULT_FONT_STACK;
  if (isCustomFontKey(key)) {
    const id = customFontIdFromKey(key);
    return id ? `"${customFontFamily(id)}", ${DEFAULT_FONT_STACK}` : DEFAULT_FONT_STACK;
  }
  const builtin = BUILTIN_FONT_MAP[key];
  return builtin ? builtin.stack : DEFAULT_FONT_STACK;
}

// CSS @font-face `format(...)` token for a stored file format/extension.
export function fontFaceFormat(format?: string | null): string | null {
  switch ((format || "").toLowerCase().replace(/^\./, "")) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    default:
      return null;
  }
}

// Minimal shape needed to build an @font-face rule on the client. The
// server ships these in the player content + agenda display payloads.
export interface CustomFontRef {
  id: string;
  name: string;
  format?: string | null;
}
