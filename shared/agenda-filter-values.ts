import { z } from "zod";

/** Maximum length for an agenda status or filter value. */
export const AGENDA_FILTER_VALUE_MAX_LENGTH = 100;
/** Maximum selected values allowed for a single agenda filter. */
export const AGENDA_FILTER_MAX_VALUES = 100;

/**
 * Trims user/upstream input and excludes blank values. This intentionally
 * preserves the readable spelling (apart from surrounding whitespace).
 */
export function normalizeAgendaFilterValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

/** Case-insensitive identity used for agenda statuses, rooms and tracks. */
export function agendaFilterValueKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export const agendaFilterValueSchema = z
  .string()
  .trim()
  .min(1, "Value cannot be blank")
  .max(
    AGENDA_FILTER_VALUE_MAX_LENGTH,
    `Value must be ${AGENDA_FILTER_VALUE_MAX_LENGTH} characters or fewer`,
  );

/** A text filter as entered in the settings form; blank means no filter. */
export const agendaOptionalFilterValueSchema = z
  .string()
  .trim()
  .max(
    AGENDA_FILTER_VALUE_MAX_LENGTH,
    `Value must be ${AGENDA_FILTER_VALUE_MAX_LENGTH} characters or fewer`,
  );

/** A custom status is deliberately not restricted to the built-in registry. */
export const agendaCustomStatusSchema = agendaFilterValueSchema;

export const agendaFilterValuesSchema = z
  .array(agendaFilterValueSchema)
  .max(
    AGENDA_FILTER_MAX_VALUES,
    `At most ${AGENDA_FILTER_MAX_VALUES} filter values are allowed`,
  );

/**
 * Canonicalizes a built-in status case-insensitively while retaining custom
 * statuses verbatim (after trimming). The supplied registry keeps this module
 * independent from schema.ts and prevents a circular dependency.
 */
export function normalizeAgendaStatus(
  value: unknown,
  builtInStatuses: readonly string[],
): string | null {
  const normalized = normalizeAgendaFilterValue(value);
  if (!normalized) return null;
  const key = agendaFilterValueKey(normalized);
  return builtInStatuses.find((status) => agendaFilterValueKey(status) === key) ?? normalized;
}

export function createAgendaStatusSchema(builtInStatuses: readonly string[]) {
  return agendaCustomStatusSchema.transform((value) =>
    normalizeAgendaStatus(value, builtInStatuses)!,
  );
}

export function createAgendaStatusFilterSchema(builtInStatuses: readonly string[]) {
  return z
    .array(createAgendaStatusSchema(builtInStatuses))
    .max(
      AGENDA_FILTER_MAX_VALUES,
      `At most ${AGENDA_FILTER_MAX_VALUES} filter values are allowed`,
    );
}

/**
 * Produces stable filter options from persisted item values plus currently
 * selected values. It ignores blanks, deduplicates case-insensitively, keeps
 * the first readable spelling, and sorts with a fixed locale.
 */
export function deriveAgendaFilterOptions(
  persistedValues: readonly unknown[],
  selectedValues: readonly unknown[] = [],
): string[] {
  const unique = new Map<string, string>();
  for (const value of [...persistedValues, ...selectedValues]) {
    const normalized = normalizeAgendaFilterValue(value);
    if (normalized && !unique.has(agendaFilterValueKey(normalized))) {
      unique.set(agendaFilterValueKey(normalized), normalized);
    }
  }
  return [...unique.values()].sort(
    new Intl.Collator("en-US", { sensitivity: "base", numeric: true }).compare,
  );
}
