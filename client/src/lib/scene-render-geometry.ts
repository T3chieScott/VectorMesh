export const SCENE_AUTHORING_REFERENCE_HEIGHT = 720;

export function getSceneTextScale(logicalHeight: number): number {
  return Number.isFinite(logicalHeight) && logicalHeight > 0
    ? logicalHeight / SCENE_AUTHORING_REFERENCE_HEIGHT
    : 1;
}

export function scaleSceneFontSize<T extends number | string | null | undefined>(
  value: T,
  scale: number,
): T {
  return (typeof value === "number" ? value * scale : value) as T;
}

export function resolveSceneFontSize(
  value: number | string | null | undefined,
  legacySizes: Readonly<Record<string, number>>,
  fallback: number,
): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return legacySizes[value] ?? fallback;
  return fallback;
}

export interface AuthoredSceneAspect {
  width: number;
  height: number;
  label: string;
}

export function getAuthoredSceneAspect(
  aspectRatio: string | null | undefined,
  customWidth?: number | null,
  customHeight?: number | null,
): AuthoredSceneAspect | null {
  if (
    aspectRatio === "custom" &&
    customWidth &&
    customHeight &&
    customWidth > 0 &&
    customHeight > 0
  ) {
    return {
      width: customWidth,
      height: customHeight,
      label: `${customWidth}×${customHeight}`,
    };
  }

  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(
    aspectRatio || "16:9",
  );
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return { width, height, label: `${width}:${height}` };
}

export function hasMaterialAspectRatioMismatch(
  authored: Pick<AuthoredSceneAspect, "width" | "height">,
  targetWidth: number,
  targetHeight: number,
  tolerance = 0.001,
): boolean {
  if (
    authored.width <= 0 ||
    authored.height <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return false;
  }

  const authoredRatio = authored.width / authored.height;
  const targetRatio = targetWidth / targetHeight;
  return Math.abs(authoredRatio - targetRatio) / authoredRatio > tolerance;
}