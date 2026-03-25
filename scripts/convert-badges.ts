import sharp from "sharp";
import path from "path";
import fs from "fs";

const BADGES_DIR = path.resolve(process.cwd(), "assets", "football", "badges");
const PNG_SIZE = 64;

export async function convertBadges(): Promise<{ converted: number; skipped: number; errors: string[] }> {
  const result = { converted: 0, skipped: 0, errors: [] as string[] };

  if (!fs.existsSync(BADGES_DIR)) {
    console.log(`[convert-badges] Directory not found: ${BADGES_DIR} — skipping`);
    return result;
  }

  const svgFiles = fs.readdirSync(BADGES_DIR).filter((f) => f.endsWith(".svg"));

  if (svgFiles.length === 0) {
    console.log("[convert-badges] No SVG files found — skipping");
    return result;
  }

  console.log(`[convert-badges] Found ${svgFiles.length} SVG files in ${BADGES_DIR}`);

  for (const svgFile of svgFiles) {
    const svgPath = path.join(BADGES_DIR, svgFile);
    const pngFile = svgFile.replace(/\.svg$/, ".png");
    const pngPath = path.join(BADGES_DIR, pngFile);

    try {
      const svgStat = fs.statSync(svgPath);

      if (fs.existsSync(pngPath)) {
        const pngStat = fs.statSync(pngPath);
        if (pngStat.mtimeMs >= svgStat.mtimeMs) {
          result.skipped++;
          continue;
        }
      }

      const svgBuffer = fs.readFileSync(svgPath);
      await sharp(svgBuffer, { density: 150 })
        .resize(PNG_SIZE, PNG_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(pngPath);

      result.converted++;
      console.log(`[convert-badges] Converted: ${svgFile} → ${pngFile}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${svgFile}: ${msg}`);
      console.error(`[convert-badges] Error converting ${svgFile}: ${msg}`);
    }
  }

  console.log(
    `[convert-badges] Done: ${result.converted} converted, ${result.skipped} skipped (up-to-date)` +
      (result.errors.length > 0 ? `, ${result.errors.length} errors` : "")
  );

  return result;
}

if (process.argv[1]?.endsWith("convert-badges.ts") || process.argv[1]?.endsWith("convert-badges.js")) {
  convertBadges()
    .then((r) => {
      if (r.errors.length > 0) process.exit(1);
    })
    .catch((err) => {
      console.error("[convert-badges] Fatal error:", err);
      process.exit(1);
    });
}
