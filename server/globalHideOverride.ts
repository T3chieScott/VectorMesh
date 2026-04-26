export const GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY = "global_hide_no_content_message";

export function parseGlobalHideValue(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

export function applyGlobalHideOverride<T extends { hideNoContentMessage?: boolean | null }>(
  screen: T,
  globalHide: boolean,
): T {
  if (!globalHide) return screen;
  if (screen.hideNoContentMessage === true) return screen;
  return { ...screen, hideNoContentMessage: true };
}
