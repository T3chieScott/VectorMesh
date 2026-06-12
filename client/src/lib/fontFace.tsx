import {
  customFontFamily,
  fontFaceFormat,
  normalizeFontStyle,
  DEFAULT_FONT_WEIGHT,
  type CustomFontRef,
} from "@shared/fonts";

// Build the @font-face CSS block for a list of custom font files. Every
// file of one family shares the same family name (customFontFamily(familyId)),
// so a stored `custom:<familyId>` reference resolves to the family and the
// browser auto-picks the file matching the rendered weight/style. The src
// still points at the individual file row (/api/fonts/<fileId>/file).
// font-display:swap keeps text visible while the file loads (and falls
// back gracefully if it never does).
export function buildFontFaceCss(fonts: CustomFontRef[]): string {
  return fonts
    .map((f) => {
      const fmt = fontFaceFormat(f.format);
      const src = `url("/api/fonts/${f.id}/file")${fmt ? ` format("${fmt}")` : ""}`;
      const family = customFontFamily(f.familyId || f.id);
      const weight = f.weight ?? DEFAULT_FONT_WEIGHT;
      const style = normalizeFontStyle(f.style);
      return `@font-face{font-family:"${family}";src:${src};font-weight:${weight};font-style:${style};font-display:swap;}`;
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
