import type { AgendaItem } from "./schema";
import { AGENDA_FILTER_VALUE_MAX_LENGTH } from "./agenda-filter-values";

/**
 * Keep free-type searches bounded like the other agenda filter values. The
 * bound is enforced by the input as well as here so callers cannot bypass it.
 */
export const AGENDA_SEARCH_MAX_LENGTH = AGENDA_FILTER_VALUE_MAX_LENGTH;

/**
 * Search normalization is deliberately small and literal: whitespace is
 * folded, case is ignored, and terms are matched with String.includes rather
 * than a regular expression. Consequently punctuation has no special meaning.
 */
export function normalizeAgendaSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function agendaItemSearchText(item: AgendaItem): string {
  // Keep this allow-list explicit. In particular, do not stringify the row:
  // that could make non-display or non-editable fields searchable.
  const values: unknown[] = [
    item.title,
    item.description,
    item.room,
    item.track,
    item.presenter,
    item.presenterCompany,
    item.company,
    item.status,
    item.statusMessage,
    new Date(item.startsAt).toLocaleString(),
    new Date(item.endsAt).toLocaleString(),
    // These are only present for rows imported from an external source.
    item.externalSyncConfigId,
    item.externalId,
  ];

  return normalizeAgendaSearchText(values.filter((value) => value != null).join(" "));
}

/**
 * Return matching rows in their input order. Every non-empty term must occur
 * in the authorized, user-facing/searchable representation of the row.
 */
export function filterAgendaItemsBySearch(
  items: readonly AgendaItem[],
  query: string,
): AgendaItem[] {
  const normalizedQuery = normalizeAgendaSearchText(query).slice(0, AGENDA_SEARCH_MAX_LENGTH);
  if (!normalizedQuery) return [...items];

  const terms = normalizedQuery.split(" ").filter(Boolean);
  return items.filter((item) => {
    const searchable = agendaItemSearchText(item);
    return terms.every((term) => searchable.includes(term));
  });
}