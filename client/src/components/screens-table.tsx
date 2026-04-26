import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Copy,
  HelpCircle,
  MoreHorizontal,
  Settings2,
  GripVertical,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Screen, LayoutTemplate, LiveOverride, Event } from "@shared/schema";
import { ScreenBookingStatus } from "@/components/screen-booking-status";
import { ScreenBookingsContextMenu } from "@/components/screen-bookings-context-menu";

type ColumnId =
  | "name"
  | "pairing"
  | "pairingCode"
  | "testPattern"
  | "nowDisplaying"
  | "playback"
  | "location"
  | "lastSeen";

interface ColumnDef {
  id: ColumnId;
  label: string;
  sortable: boolean;
}

const COLUMNS: Record<ColumnId, ColumnDef> = {
  name: { id: "name", label: "Name", sortable: true },
  pairing: { id: "pairing", label: "Pairing", sortable: true },
  pairingCode: { id: "pairingCode", label: "Pairing code", sortable: true },
  testPattern: { id: "testPattern", label: "Test pattern", sortable: true },
  nowDisplaying: { id: "nowDisplaying", label: "Now displaying", sortable: true },
  // Booking-derived "what's on the screen right now" — distinct from
  // nowDisplaying which reflects the resolved layout/playlist on the
  // device. Not sortable because the answer comes from a per-row async
  // query and we don't materialise it into the row sort key.
  playback: { id: "playback", label: "Playback", sortable: false },
  location: { id: "location", label: "Location", sortable: true },
  lastSeen: { id: "lastSeen", label: "Last seen", sortable: true },
};

const DEFAULT_ORDER: ColumnId[] = [
  "name",
  "pairing",
  "pairingCode",
  "testPattern",
  "nowDisplaying",
  "playback",
  "location",
  "lastSeen",
];

const DEFAULT_VISIBILITY: Record<ColumnId, boolean> = {
  name: true,
  pairing: true,
  pairingCode: true,
  testPattern: true,
  nowDisplaying: true,
  playback: true,
  location: true,
  lastSeen: true,
};

const LEGACY_STORAGE_KEY = "vectormesh:screens-table:columns";

function storageKey(userId: string | null | undefined): string {
  return userId ? `vectormesh:${userId}:screens-table:columns` : LEGACY_STORAGE_KEY;
}

interface PersistedConfig {
  order: ColumnId[];
  visibility: Record<ColumnId, boolean>;
}

function loadConfig(userId: string | null | undefined): PersistedConfig {
  try {
    const key = storageKey(userId);
    let raw = localStorage.getItem(key);
    if (!raw && userId) {
      // One-time migration from the legacy unscoped key
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(key, legacy);
      }
    }
    if (!raw) return { order: DEFAULT_ORDER, visibility: DEFAULT_VISIBILITY };
    const parsed = JSON.parse(raw) as Partial<PersistedConfig>;
    const order: ColumnId[] = [];
    if (Array.isArray(parsed.order)) {
      for (const id of parsed.order) {
        if (id in COLUMNS && !order.includes(id as ColumnId)) order.push(id as ColumnId);
      }
    }
    for (const id of DEFAULT_ORDER) {
      if (!order.includes(id)) order.push(id);
    }
    const visibility: Record<ColumnId, boolean> = { ...DEFAULT_VISIBILITY };
    if (parsed.visibility && typeof parsed.visibility === "object") {
      for (const id of DEFAULT_ORDER) {
        const v = (parsed.visibility as Record<string, unknown>)[id];
        if (typeof v === "boolean") visibility[id] = v;
      }
    }
    return { order, visibility };
  } catch {
    return { order: DEFAULT_ORDER, visibility: DEFAULT_VISIBILITY };
  }
}

function saveConfig(userId: string | null | undefined, config: PersistedConfig) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(config));
  } catch {
    // ignore
  }
}

interface NowDisplayingInfo {
  label: string;
  kind: "override" | "fallback" | "none";
}

function getNowDisplaying(
  screen: Screen,
  layouts: LayoutTemplate[],
  activeOverride: LiveOverride | null,
): NowDisplayingInfo {
  const overrideLayout = activeOverride?.layoutTemplateId
    ? layouts.find((l) => l.id === activeOverride.layoutTemplateId)
    : null;
  if (overrideLayout) return { label: overrideLayout.name, kind: "override" };
  const fallbackLayout = screen.fallbackLayoutId
    ? layouts.find((l) => l.id === screen.fallbackLayoutId)
    : null;
  if (fallbackLayout) return { label: fallbackLayout.name, kind: "fallback" };
  return { label: "—", kind: "none" };
}

interface ScreensTableProps {
  screens: Screen[];
  layouts: LayoutTemplate[];
  // Used by the right-click "paste bookings" preview to show event names
  // and to filter out events the current user can't access. Defaults to
  // an empty list so existing callers that don't pass it still render.
  events?: Event[];
  getActiveOverrideForScreen: (screenId: string) => LiveOverride | null;
  onOpenScreen: (screen: Screen) => void;
  onDuplicateScreen?: (screen: Screen) => void;
  // Optional "Why is this blank?" diagnostic. When provided, a row action
  // surfaces the same admin-only content-trace dialog that the card view
  // exposes. Parent is responsible for role-gating (only pass this in for
  // admin / account-manager users).
  onDiagnoseScreen?: (screen: Screen) => void;
  userId?: string | null;
}

export function ScreensTable({
  screens,
  layouts,
  events = [],
  getActiveOverrideForScreen,
  onOpenScreen,
  onDuplicateScreen,
  onDiagnoseScreen,
  userId = null,
}: ScreensTableProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<PersistedConfig>(() => loadConfig(userId));
  const [sort, setSort] = useState<{ column: ColumnId | null; dir: "asc" | "desc" }>({
    column: null,
    dir: "asc",
  });
  const dragColumn = useRef<ColumnId | null>(null);

  // Re-load when the user identity becomes available (handles async auth).
  useEffect(() => {
    setConfig(loadConfig(userId));
  }, [userId]);

  useEffect(() => {
    saveConfig(userId, config);
  }, [config, userId]);

  const visibleColumns = useMemo(
    () => config.order.filter((id) => config.visibility[id]),
    [config],
  );

  const toggleSort = (column: ColumnId) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { column, dir: "asc" };
    });
  };

  const toggleVisibility = (column: ColumnId) => {
    setConfig((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [column]: !prev.visibility[column] },
    }));
  };

  const onDragStart = (column: ColumnId) => (e: React.DragEvent) => {
    dragColumn.current = column;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", column);
    } catch {
      // ignore
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (target: ColumnId) => (e: React.DragEvent) => {
    e.preventDefault();
    const source = dragColumn.current;
    dragColumn.current = null;
    if (!source || source === target) return;
    setConfig((prev) => {
      const order = [...prev.order];
      const from = order.indexOf(source);
      const to = order.indexOf(target);
      if (from === -1 || to === -1) return prev;
      order.splice(from, 1);
      order.splice(to, 0, source);
      return { ...prev, order };
    });
  };

  const sortedScreens = useMemo(() => {
    if (sort.column == null) {
      // Default: preserve incoming order (server-side display_order, then created_at).
      return screens;
    }
    const column = sort.column;
    const arr = [...screens];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortValue(a, column, layouts, getActiveOverrideForScreen);
      const bv = sortValue(b, column, layouts, getActiveOverrideForScreen);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return arr;
  }, [screens, sort, layouts, getActiveOverrideForScreen]);

  const copyPairingCode = (code: string | null | undefined) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast({ title: "Pairing code copied to clipboard" });
  };

  return (
    <div className="rounded-md border bg-card">
      <Table data-testid="table-screens">
        <TableHeader>
          <TableRow>
            {visibleColumns.map((id) => {
              const col = COLUMNS[id];
              const isSorted = sort.column === id;
              return (
                <TableHead
                  key={id}
                  draggable
                  onDragStart={onDragStart(id)}
                  onDragOver={onDragOver}
                  onDrop={onDrop(id)}
                  className="select-none"
                  data-testid={`column-header-${id}`}
                >
                  <button
                    type="button"
                    onClick={() => col.sortable && toggleSort(id)}
                    className={cn(
                      "flex items-center gap-1.5 text-left font-medium text-muted-foreground hover:text-foreground transition-colors",
                      col.sortable && "cursor-pointer",
                    )}
                    data-testid={`button-sort-${id}`}
                  >
                    <GripVertical className="h-3 w-3 opacity-40" />
                    <span>{col.label}</span>
                    {col.sortable &&
                      (isSorted ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      ))}
                  </button>
                </TableHead>
              );
            })}
            <TableHead className="w-10 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    data-testid="button-column-settings"
                    aria-label="Column settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {DEFAULT_ORDER.map((id) => (
                    <DropdownMenuCheckboxItem
                      key={id}
                      checked={config.visibility[id]}
                      onCheckedChange={() => toggleVisibility(id)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`toggle-column-${id}`}
                    >
                      {COLUMNS[id].label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedScreens.map((screen) => {
            const activeOverride = getActiveOverrideForScreen(screen.id);
            const nowDisplaying = getNowDisplaying(screen, layouts, activeOverride);
            return (
              <ScreenBookingsContextMenu
                key={screen.id}
                screen={screen}
                events={events}
              >
              <TableRow data-testid={`row-screen-${screen.id}`}>
                {visibleColumns.map((id) => (
                  <TableCell key={id}>
                    {renderCell(id, {
                      screen,
                      activeOverride,
                      nowDisplaying,
                      onOpenScreen,
                      copyPairingCode,
                    })}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {(onDuplicateScreen || onDiagnoseScreen) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Row actions"
                          data-testid={`button-row-actions-${screen.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onDiagnoseScreen && (
                          <DropdownMenuItem
                            onSelect={() => onDiagnoseScreen(screen)}
                            data-testid={`menu-why-blank-row-${screen.id}`}
                          >
                            <HelpCircle className="mr-2 h-4 w-4" />
                            Why is this blank?
                          </DropdownMenuItem>
                        )}
                        {onDuplicateScreen && (
                          <DropdownMenuItem
                            onSelect={() => onDuplicateScreen(screen)}
                            disabled={!!screen.locked}
                            data-testid={`menu-duplicate-row-${screen.id}`}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
              </ScreenBookingsContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function sortValue(
  screen: Screen,
  column: ColumnId,
  layouts: LayoutTemplate[],
  getActiveOverrideForScreen: (id: string) => LiveOverride | null,
): string | number | null {
  switch (column) {
    case "name":
      return screen.name?.toLowerCase() ?? "";
    case "pairing":
      return screen.isPaired ? 0 : 1;
    case "pairingCode":
      return screen.isPaired ? "" : screen.pairingCode ?? "";
    case "testPattern":
      return screen.testPatternEnabled ? 0 : 1;
    case "nowDisplaying": {
      const info = getNowDisplaying(screen, layouts, getActiveOverrideForScreen(screen.id));
      return info.label === "—" ? "" : info.label.toLowerCase();
    }
    case "location":
      return (screen.location ?? "").toLowerCase();
    case "lastSeen":
      return screen.lastSeen ? new Date(screen.lastSeen).getTime() : null;
    default:
      return "";
  }
}

interface CellContext {
  screen: Screen;
  activeOverride: LiveOverride | null;
  nowDisplaying: NowDisplayingInfo;
  onOpenScreen: (screen: Screen) => void;
  copyPairingCode: (code: string | null | undefined) => void;
}

function renderCell(id: ColumnId, ctx: CellContext) {
  const { screen, activeOverride, nowDisplaying, onOpenScreen, copyPairingCode } = ctx;
  switch (id) {
    case "name": {
      const dotClass = screen.isOnline
        ? "bg-green-500"
        : screen.isPaired
        ? "bg-red-500"
        : "bg-amber-500";
      const title = screen.isOnline ? "Online" : screen.isPaired ? "Offline" : "Unpaired";
      return (
        <button
          type="button"
          onClick={() => onOpenScreen(screen)}
          className="flex items-center gap-2 text-left font-medium hover:underline"
          data-testid={`link-screen-name-${screen.id}`}
        >
          <span
            className={cn("inline-block h-2 w-2 rounded-full", dotClass)}
            title={title}
            aria-label={title}
          />
          <span data-testid={`text-screen-name-row-${screen.id}`}>{screen.name}</span>
        </button>
      );
    }
    case "pairing":
      return screen.isPaired ? (
        <Badge variant="secondary" className="bg-green-500/10 text-green-600">Paired</Badge>
      ) : (
        <Badge variant="secondary">Unpaired</Badge>
      );
    case "pairingCode":
      if (screen.isPaired || !screen.pairingCode) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <button
          type="button"
          onClick={() => copyPairingCode(screen.pairingCode)}
          className="inline-flex items-center gap-1.5 font-mono text-sm hover:text-primary"
          data-testid={`button-copy-pairing-${screen.id}`}
          title="Click to copy"
        >
          <span>{screen.pairingCode}</span>
          <Copy className="h-3 w-3 opacity-60" />
        </button>
      );
    case "testPattern":
      return <TestPatternToggle screen={screen} />;
    case "nowDisplaying":
      if (nowDisplaying.kind === "none") {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex items-center gap-1.5">
          <span data-testid={`text-now-displaying-${screen.id}`}>{nowDisplaying.label}</span>
          {nowDisplaying.kind === "override" ? (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-600/30 gap-0.5">
              <Zap className="h-2.5 w-2.5" />
              Override
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              Fallback
            </Badge>
          )}
        </div>
      );
    case "playback":
      return <ScreenBookingStatus screenId={screen.id} variant="table" />;
    case "location":
      return screen.location ? (
        <span data-testid={`text-location-${screen.id}`}>{screen.location}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case "lastSeen":
      return screen.lastSeen ? (
        <span
          className="text-sm text-muted-foreground"
          data-testid={`text-last-seen-${screen.id}`}
          title={new Date(screen.lastSeen).toLocaleString()}
        >
          {formatDistanceToNow(new Date(screen.lastSeen), { addSuffix: true })}
        </span>
      ) : (
        <span className="text-muted-foreground">Never</span>
      );
    default:
      return null;
  }
}

function TestPatternToggle({ screen }: { screen: Screen }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", `/api/screens/${screen.id}`, { testPatternEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: screen.testPatternEnabled ? "Test pattern disabled" : "Test pattern enabled" });
    },
    onError: () => {
      toast({ title: "Failed to toggle test pattern", variant: "destructive" });
    },
  });
  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={!!screen.testPatternEnabled}
        onCheckedChange={(checked) => mutation.mutate(checked)}
        disabled={mutation.isPending || !!screen.locked}
        data-testid={`switch-test-pattern-row-${screen.id}`}
      />
    </div>
  );
}
