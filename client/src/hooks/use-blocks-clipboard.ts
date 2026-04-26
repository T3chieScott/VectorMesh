import { useCallback, useEffect, useState } from "react";
import type { ScheduleBlock, ScheduleTarget, TimeRule, ZoneSource } from "@shared/schema";

const STORAGE_KEY = "vectormesh:blocks-clipboard";
const EVENT_NAME = "vectormesh:blocks-clipboard:changed";

// Server-only fields stripped before storing on the clipboard. Pasting
// always creates fresh rows, so identity / audit columns and the
// source version id / series id are never persisted: pasted blocks
// land in the destination's draft and get a brand new seriesId.
export interface ClipboardBlock {
  name: string;
  priority: number;
  layoutTemplateId: string | null;
  targets: ScheduleTarget[];
  timeRules: TimeRule[];
  zoneSources: ZoneSource[];
}

export interface BlocksClipboard {
  sourceProgrammeId: string;
  sourceProgrammeName: string;
  sourceVersionId: string;
  blocks: ClipboardBlock[];
  copiedAt: string;
}

function read(): BlocksClipboard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BlocksClipboard;
    if (!parsed?.blocks || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(value: BlocksClipboard | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
    // Notify other components in the same tab. sessionStorage doesn't
    // fire `storage` events for the writing tab, so we use a custom
    // one — the bookings clipboard does the same and the two
    // namespaces coexist without stepping on each other.
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota exceeded or storage disabled — fail silently; clipboard is
    // a convenience feature, not critical state.
  }
}

function sanitise(block: ScheduleBlock): ClipboardBlock {
  return {
    name: block.name,
    priority: block.priority ?? 0,
    layoutTemplateId: block.layoutTemplateId ?? null,
    targets: ((block.targets as ScheduleTarget[] | null) ?? []).map((t) => ({
      type: t.type,
      id: t.id,
    })),
    timeRules: ((block.timeRules as TimeRule[] | null) ?? []).map((r) => ({ ...r })),
    zoneSources: ((block.zoneSources as ZoneSource[] | null) ?? []).map((zs) => ({
      ...zs,
    })),
  };
}

export function useBlocksClipboard() {
  const [clipboard, setClipboard] = useState<BlocksClipboard | null>(() => read());

  useEffect(() => {
    const refresh = () => setClipboard(read());
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const copyFrom = useCallback(
    (
      source: { programmeId: string; programmeName: string; versionId: string },
      blocks: ScheduleBlock[],
    ) => {
      const payload: BlocksClipboard = {
        sourceProgrammeId: source.programmeId,
        sourceProgrammeName: source.programmeName,
        sourceVersionId: source.versionId,
        copiedAt: new Date().toISOString(),
        blocks: blocks.map(sanitise),
      };
      write(payload);
    },
    [],
  );

  const clear = useCallback(() => write(null), []);

  return { clipboard, copyFrom, clear };
}
