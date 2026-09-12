import { z } from "zod";
import {
  AGENDA_DAY_FILTERS,
  AGENDA_DESCRIPTION_TEXT_ALIGNS,
  AGENDA_DISPLAY_MODES,
  AGENDA_DENSITIES,
  AGENDA_FONT_SCALES,
  AGENDA_LAYOUT_MODES,
  AGENDA_SPEAKER_MARKER_STYLES,
  AGENDA_STATUSES,
  AGENDA_THEMES,
  AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS,
} from "./schema";
import {
  agendaFilterValuesSchema,
  createAgendaStatusFilterSchema,
} from "./agenda-filter-values";

export const AGENDA_SETTINGS_CLIPBOARD_TYPE =
  "vectormesh-agenda-display-settings";
export const AGENDA_SETTINGS_CLIPBOARD_VERSION = 1;

// This is deliberately an explicit contract. Do not replace it with object
// spreading: Agenda configs also contain identity, ownership, data-source,
// and database fields that must never cross the clipboard boundary.
export const AGENDA_SETTINGS_CLIPBOARD_KEYS = [
  "displayMode",
  "layoutMode",
  "fontScale",
  "density",
  "theme",
  "fontFamily",
  "titleColor",
  "bodyColor",
  "displayBackgroundColor",
  "cardBackgroundColor",
  "sessionTitleColor",
  "descriptionColor",
  "presenterColor",
  "companyColor",
  "roomColor",
  "trackColor",
  "timeColor",
  "statusColor",
  "timeScale",
  "dateScale",
  "titleScale",
  "bodyScale",
  "headerDateScale",
  "headerClockScale",
  "eventName",
  "backgroundUrl",
  "roomFilter",
  "trackFilter",
  "statusFilter",
  "dayFilter",
  "dayFilterDate",
  "timeWindowMinutes",
  "refreshIntervalSeconds",
  "rotationIntervalSeconds",
  "maxItemsPerPage",
  "showDescription",
  "descriptionLines",
  "descriptionAutoScroll",
  "showDescriptionDivider",
  "descriptionTextAlign",
  "showPresenter",
  "presenterVisibleLines",
  "speakerMarkerStyle",
  "speakerCustomMarker",
  "showRoom",
  "showTrack",
  "showStatus",
  "showSessionDuration",
  "showSessionCount",
  "showSessionEndTime",
  "sessionDurationPrefix",
  "showCurrentTime",
  "showEventName",
  "showDayName",
  "showDate",
  "showAgendaDayHeading",
  "showNowNextLabel",
  "singleGlobalNowNext",
  "overrideNowNextColor",
  "nowNextColor",
] as const;

export type AgendaSettingsClipboardKey =
  (typeof AGENDA_SETTINGS_CLIPBOARD_KEYS)[number];
export type AgendaSettingsClipboardSettings = Partial<
  Record<AgendaSettingsClipboardKey, unknown>
>;

const optionalString = z.string().optional();
const optionalColor = z
  .string()
  .regex(/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/, "must be a hex colour")
  .or(z.literal(""))
  .optional();

// Task #404 was added while clipboard payloads remained version 1. Some
// callers construct a complete version-1 settings object with `""` for every
// unknown/new field. Treat an empty legacy placeholder as absent (so paste
// retains the destination value), while rejecting every non-empty malformed
// value just like the established clipboard contract does.
const optionalTask404Boolean = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.boolean().optional(),
);
const optionalTask404Color = z.preprocess(
  (value) => value === "" ? undefined : value,
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a six-digit hex colour")
    .nullable()
    .optional(),
);

// Version 1 initially copied room/track filters as comma-separated text.
// Accept that shape on paste while emitting the current bounded array shape.
const agendaClipboardFacetFilterSchema = z.preprocess(
  (value) => typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : value,
  agendaFilterValuesSchema,
);

const agendaClipboardSettingsSchema = z
  .object({
    displayMode: z.enum(AGENDA_DISPLAY_MODES).optional(),
    layoutMode: z.enum(AGENDA_LAYOUT_MODES).optional(),
    fontScale: z.enum(AGENDA_FONT_SCALES).optional(),
    density: z.enum(AGENDA_DENSITIES).optional(),
    theme: z.enum(AGENDA_THEMES).optional(),
    fontFamily: optionalString,
    titleColor: optionalColor,
    bodyColor: optionalColor,
    displayBackgroundColor: optionalColor,
    cardBackgroundColor: optionalColor,
    sessionTitleColor: optionalColor,
    descriptionColor: optionalColor,
    presenterColor: optionalColor,
    companyColor: optionalColor,
    roomColor: optionalColor,
    trackColor: optionalColor,
    timeColor: optionalColor,
    statusColor: optionalColor,
    timeScale: z.number().min(0.3).max(4).optional(),
    dateScale: z.number().min(0.3).max(4).optional(),
    titleScale: z.number().min(0.3).max(4).optional(),
    bodyScale: z.number().min(0.3).max(4).optional(),
    headerDateScale: z.number().min(0.3).max(4).optional(),
    headerClockScale: z.number().min(0.3).max(4).optional(),
    eventName: optionalString,
    backgroundUrl: optionalString,
    roomFilter: agendaClipboardFacetFilterSchema.optional(),
    trackFilter: agendaClipboardFacetFilterSchema.optional(),
    statusFilter: createAgendaStatusFilterSchema(AGENDA_STATUSES).optional(),
    dayFilter: z.enum(AGENDA_DAY_FILTERS).optional(),
    dayFilterDate: optionalString,
    timeWindowMinutes: optionalString,
    refreshIntervalSeconds: z.number().int().min(5).max(3600).optional(),
    rotationIntervalSeconds: z.number().int().min(3).max(3600).optional(),
    maxItemsPerPage: z.number().int().min(1).max(50).optional(),
    showDescription: z.boolean().optional(),
    descriptionLines: z.enum(["1", "2", "3", "4", "5", "full"]).optional(),
    descriptionAutoScroll: z.boolean().optional(),
    showDescriptionDivider: z.boolean().optional(),
    descriptionTextAlign: z.enum(AGENDA_DESCRIPTION_TEXT_ALIGNS).optional(),
    showPresenter: z.boolean().optional(),
    // Older clipboard payloads were produced directly from form controls and
    // therefore stored this numeric input as a string.
    presenterVisibleLines: z.coerce.number().int().min(1).max(20).optional(),
    speakerMarkerStyle: z.enum(AGENDA_SPEAKER_MARKER_STYLES).optional(),
    speakerCustomMarker: z
      .string()
      .refine(
        (value) =>
          Array.from(value).length <=
          AGENDA_CUSTOM_SPEAKER_MARKER_MAX_CODEPOINTS,
      )
      .optional(),
    showRoom: z.boolean().optional(),
    showTrack: z.boolean().optional(),
    showStatus: z.boolean().optional(),
    showSessionDuration: z.boolean().optional(),
    showSessionCount: z.boolean().optional(),
    showSessionEndTime: z.boolean().optional(),
    sessionDurationPrefix: z.string().max(24).transform((value) => value.trim()).optional(),
    showCurrentTime: z.boolean().optional(),
    showEventName: z.boolean().optional(),
    showDayName: z.boolean().optional(),
    showDate: z.boolean().optional(),
    showAgendaDayHeading: optionalTask404Boolean,
    showNowNextLabel: z.boolean().optional(),
    singleGlobalNowNext: z.boolean().optional(),
    overrideNowNextColor: optionalTask404Boolean,
    nowNextColor: optionalTask404Color,
  })
  .strict();

export interface AgendaSettingsClipboardPayload {
  type: typeof AGENDA_SETTINGS_CLIPBOARD_TYPE;
  version: typeof AGENDA_SETTINGS_CLIPBOARD_VERSION;
  settings: Record<AgendaSettingsClipboardKey, unknown>;
}

export function buildAgendaSettingsClipboardPayload(
  values: Record<string, unknown>,
): AgendaSettingsClipboardPayload {
  const settings = {} as Record<AgendaSettingsClipboardKey, unknown>;
  for (const key of AGENDA_SETTINGS_CLIPBOARD_KEYS) {
    if (key === "presenterVisibleLines") {
      const parsed = Number(values[key]);
      settings[key] = Number.isInteger(parsed) && parsed >= 1 && parsed <= 20
        ? parsed
        : 4;
    } else {
      settings[key] = values[key];
    }
  }
  return {
    type: AGENDA_SETTINGS_CLIPBOARD_TYPE,
    version: AGENDA_SETTINGS_CLIPBOARD_VERSION,
    settings,
  };
}

export function parseAgendaSettingsClipboardPayload(
  raw: string,
): AgendaSettingsClipboardSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Clipboard does not contain valid Agenda settings JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Clipboard content is not an Agenda settings payload.");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.type !== AGENDA_SETTINGS_CLIPBOARD_TYPE) {
    throw new Error("Clipboard content is not an Agenda settings payload.");
  }
  if (envelope.version !== AGENDA_SETTINGS_CLIPBOARD_VERSION) {
    throw new Error("This Agenda settings version is not supported.");
  }
  const result = agendaClipboardSettingsSchema.safeParse(envelope.settings);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "settings";
    throw new Error(`Invalid Agenda setting ${path}: ${issue?.message ?? "value"}.`);
  }
  // Omit legacy empty Task #404 placeholders after parsing. Keeping an
  // `undefined` own property would make merge treat it as a requested update
  // and erase a destination's setting.
  return Object.fromEntries(
    Object.entries(result.data).filter(([, value]) => value !== undefined),
  ) as AgendaSettingsClipboardSettings;
}

export function mergeAgendaSettingsClipboardValues<
  T extends Record<string, unknown>,
>(
  destination: T,
  settings: AgendaSettingsClipboardSettings,
): T {
  const merged: Record<string, unknown> = { ...destination };
  for (const key of AGENDA_SETTINGS_CLIPBOARD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      merged[key] = settings[key];
    }
  }
  return merged as T;
}