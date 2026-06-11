import { customFontFamily, fontFaceFormat, type CustomFontRef } from "@shared/fonts";

// Build the @font-face CSS block for a list of custom fonts. The exposed
// family name matches customFontFamily(id) so a stored `custom:<id>` font
// reference resolves to this face. font-display:swap keeps text visible
// while the file loads (and falls back gracefully if it never does).
export function buildFontFaceCss(fonts: CustomFontRef[]): string {
  return fonts
    .map((f) => {
      const fmt = fontFaceFormat(f.format);
      const src = `url("/api/fonts/${f.id}/file")${fmt ? ` format("${fmt}")` : ""}`;
      return `@font-face{font-family:"${customFontFamily(f.id)}";src:${src};font-display:swap;}`;
    })
    .join("\n");
}

// Injects @font-face declarations for the given custom fonts. Safe to
// mount more than once with overlapping fonts — duplicate identical
// declarations are harmless. Used on the admin app, the player, and the
// public agenda display page.
export function CustomFontFaces({ fonts }: { fonts?: CustomFontRef[] | null }) {
  if (!fonts || fonts.length === 0) return null;
  return <style dangerouslySetInnerHTML={{ __html: buildFontFaceCss(fonts) }} />;
}
