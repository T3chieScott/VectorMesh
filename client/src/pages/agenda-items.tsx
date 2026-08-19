import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Upload, Download, Calendar, FileText, RefreshCw, AlertTriangle, CheckCircle2, Link2, Lock, WifiOff, Archive } from "lucide-react";
import {
  AGENDA_STATUSES,
  AGENDA_SYNC_SOURCE_TYPES,
  AGENDA_MAPPED_SOURCE_TYPES,
  AGENDA_XLSX_SOURCE_TYPES,
  AGENDA_MAPPABLE_FIELDS,
  AGENDA_REQUIRED_MAPPABLE_FIELDS,
  AGENDA_SYNC_MODES,
  type AgendaItem,
  type AgendaSyncConfig,
  type AgendaColumnMapping,
  type AgendaMappableField,
} from "@shared/schema";
import { serializeAgendaCsv, AGENDA_CSV_HEADER, buildAgendaCsvSample } from "@shared/agenda-csv";
import { formatReadableAgendaDate } from "@shared/spreadsheet-mapping";

const itemFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  room: z.string().optional(),
  track: z.string().optional(),
  presenter: z.string().optional(),
  startsAt: z.string().min(1, "Start time is required"),
  endsAt: z.string().min(1, "End time is required"),
  status: z.enum(AGENDA_STATUSES),
  statusMessage: z.string().optional(),
});
type ItemFormValues = z.infer<typeof itemFormSchema>;

function toLocalInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ItemDialog({
  open,
  onOpenChange,
  initial,
  clientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: AgendaItem;
  clientId: string;
}) {
  const { toast } = useToast();
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          description: initial.description ?? "",
          room: initial.room ?? "",
          track: initial.track ?? "",
          presenter: initial.presenter ?? "",
          startsAt: toLocalInput(initial.startsAt),
          endsAt: toLocalInput(initial.endsAt),
          status: initial.status as any,
          statusMessage: initial.statusMessage ?? "",
        }
      : {
          title: "",
          description: "",
          room: "",
          track: "",
          presenter: "",
          startsAt: toLocalInput(new Date()),
          endsAt: toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
          status: "scheduled",
          statusMessage: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: ItemFormValues) => {
      const payload = {
        ...values,
        clientId,
        description: values.description || null,
        room: values.room || null,
        track: values.track || null,
        presenter: values.presenter || null,
        statusMessage: values.statusMessage || null,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
      };
      if (initial) {
        return apiRequest("PATCH", `/api/agenda/${initial.id}`, payload);
      }
      return apiRequest("POST", `/api/agenda`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      onOpenChange(false);
      toast({ title: initial ? "Item updated" : "Item created" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Agenda Item" : "Add Agenda Item"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} data-testid="input-agenda-title" /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startsAt" render={({ field }) => (
                <FormItem><FormLabel>Starts</FormLabel><FormControl><Input type="datetime-local" {...field} data-testid="input-agenda-start" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="endsAt" render={({ field }) => (
                <FormItem><FormLabel>Ends</FormLabel><FormControl><Input type="datetime-local" {...field} data-testid="input-agenda-end" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="room" render={({ field }) => (
                <FormItem><FormLabel>Room</FormLabel><FormControl><Input {...field} data-testid="input-agenda-room" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="track" render={({ field }) => (
                <FormItem><FormLabel>Track</FormLabel><FormControl><Input {...field} data-testid="input-agenda-track" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="presenter" render={({ field }) => (
              <FormItem><FormLabel>Presenter</FormLabel><FormControl><Input {...field} data-testid="input-agenda-presenter" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} data-testid="input-agenda-description" /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger data-testid="select-agenda-status"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {AGENDA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="statusMessage" render={({ field }) => (
                <FormItem><FormLabel>Status message</FormLabel><FormControl><Input placeholder="e.g. delayed 30 min" {...field} data-testid="input-agenda-status-msg" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-agenda-save">
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CsvImportDialog({ open, onOpenChange, clientId }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: string }) {
  const { toast } = useToast();
  const [csv, setCsv] = useState("");
  const [replace, setReplace] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    toast({ title: `Loaded ${file.name}`, description: `${text.split(/\r?\n/).filter(Boolean).length} non-empty line(s)` });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agenda/import", { clientId, csv, replace });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.results);
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      toast({ title: `Imported ${data.inserted} item(s)` });
    },
    onError: async (e: any) => {
      try {
        const msg = String(e?.message ?? e);
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        if (parsed?.results) setResults(parsed.results);
      } catch {}
      toast({ title: "Import failed", description: String(e?.message ?? e), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Agenda CSV</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          One row per item. Header line: <code className="text-xs">{AGENDA_CSV_HEADER}</code>
        </p>
        <p className="text-xs text-muted-foreground" data-testid="text-sample-hint">
          New to the format? Download a sample to use as a starting point.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" data-testid="button-csv-file-upload">
            <label className="cursor-pointer">
              <FileText className="h-4 w-4 mr-2" />
              Upload .csv file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                data-testid="input-csv-file"
              />
            </label>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="button-csv-download-sample"
            onClick={() => {
              const sample = buildAgendaCsvSample(new Date());
              const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "agenda-sample.csv";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download sample
          </Button>
          <span className="text-xs text-muted-foreground">or paste below:</span>
        </div>
        <Textarea
          rows={10}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={`${AGENDA_CSV_HEADER}\nKeynote,Welcome,Main Hall,,Jane Doe,2026-06-01T09:00:00Z,2026-06-01T10:00:00Z,scheduled,`}
          data-testid="textarea-csv-import"
          className="font-mono text-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} data-testid="checkbox-replace-agenda" />
          Replace all existing items for this site
        </label>
        {results && (
          <div className="max-h-48 overflow-y-auto border rounded-md p-2 text-xs space-y-1">
            {results.map((r: any, i: number) => (
              <div key={i} className={r.status === "ok" ? "text-emerald-600" : "text-rose-600"}>
                Row {r.index + 1}: {r.status === "ok" ? `OK — ${r.item.title}` : `ERROR — ${r.error}`}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => mutation.mutate()} disabled={!csv || mutation.isPending} data-testid="button-do-import">
            {mutation.isPending ? "Importing…" : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SourceType = typeof AGENDA_SYNC_SOURCE_TYPES[number];

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  ics: "ICS / iCalendar URL",
  google_sheets_csv: "Google Sheets (CSV publish URL, fixed columns)",
  google_sheets: "Google Sheets (mapped columns)",
  csv_url: "CSV file URL (mapped columns)",
  excel_onedrive: "Excel on OneDrive (.xlsx link)",
  sharepoint_excel: "Excel on SharePoint (.xlsx link)",
  uploaded_xlsx: "Upload an Excel file (.xlsx)",
};

const SOURCE_TYPE_HINTS: Record<SourceType, string> = {
  ics: "Paste the .ics feed URL from Sched, Cvent, Google Calendar, etc.",
  google_sheets_csv:
    "In Google Sheets: File → Share → Publish to web → CSV. The columns must match the fixed import format.",
  google_sheets:
    "Paste the normal Google Sheets URL. The sheet must be shared so anyone with the link can view. You'll map the columns below.",
  csv_url: "Paste a direct link to a .csv file. You'll map the columns below.",
  excel_onedrive:
    "Paste a OneDrive share link to the .xlsx file. Use a link that downloads the file directly. You'll map the columns below.",
  sharepoint_excel:
    "Paste a SharePoint link to the .xlsx file. Use a link that downloads the file directly. You'll map the columns below.",
  uploaded_xlsx: "Upload a .xlsx file from your computer. You'll map the columns below.",
};

const FIELD_LABELS: Record<AgendaMappableField, string> = {
  title: "Title",
  description: "Description",
  room: "Room",
  track: "Track",
  presenter: "Presenter / first name",
  presenterLastName: "Presenter last name",
  company: "Company",
  startsAt: "Start time",
  endsAt: "End time",
  status: "Status",
  statusMessage: "Status message",
};

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const REQUIRED_FIELDS = AGENDA_REQUIRED_MAPPABLE_FIELDS as readonly AgendaMappableField[];
const MAPPED_TYPES = AGENDA_MAPPED_SOURCE_TYPES as readonly string[];
const XLSX_TYPES = AGENDA_XLSX_SOURCE_TYPES as readonly string[];
const NO_COLUMN = "__none__";

interface PreviewResult {
  sheetNames: string[];
  headers: string[];
  sampleRows: string[][];
  totalDataRows: number;
  totalDataRowsTruncated?: boolean;
  suggestedMapping: AgendaColumnMapping;
  missingRequired: string[];
  mapped?: {
    okCount: number;
    errorCount: number;
    skippedCount: number;
    rows: Array<{
      rowNumber: number;
      status: "ok" | "error" | "skipped";
      error?: string;
      title?: string;
      startsAt?: string;
      endsAt?: string;
      status_?: string;
    }>;
  };
}

// Auto-generated placeholder label for a header cell that was empty in the
// source (see buildHeaderLabels). A column is treated as "blank" only when
// its header is one of these placeholders AND it has no data in the sample.
const PLACEHOLDER_HEADER = /^Column \d+$/;

function isBlankPreviewColumn(
  preview: PreviewResult,
  idx: number,
  label: string,
  inUse: Set<string>,
): boolean {
  // Never hide a column the operator has already selected somewhere.
  if (inUse.has(label)) return false;
  if (!PLACEHOLDER_HEADER.test(label)) return false;
  return preview.sampleRows.every((row) => {
    const v = row[idx];
    return v == null || String(v).trim() === "";
  });
}


function SyncConfigDialog({
  open,
  onOpenChange,
  initial,
  clientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: AgendaSyncConfig;
  clientId: string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const initialSourceType: SourceType =
    initial && (AGENDA_SYNC_SOURCE_TYPES as readonly string[]).includes(initial.sourceType)
      ? (initial.sourceType as SourceType)
      : "ics";
  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType);
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(
    initial?.syncIntervalMinutes ?? 60,
  );
  const [syncMode, setSyncMode] = useState<string>(initial?.syncMode ?? "interval");
  const [removeMissingItems, setRemoveMissingItems] = useState<boolean>(
    initial?.removeMissingItems ?? true,
  );

  // Mapped-source state.
  const [storedFilePath, setStoredFilePath] = useState<string | null>(initial?.storedFilePath ?? null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(initial?.originalFileName ?? null);
  const [sheetName, setSheetName] = useState<string | null>(initial?.sheetName ?? null);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(initial?.headerRowIndex ?? 0);
  const [externalIdColumn, setExternalIdColumn] = useState<string | null>(initial?.externalIdColumn ?? null);
  const [timezone, setTimezone] = useState<string>(initial?.timezone ?? "");
  const [dateFormatHint, setDateFormatHint] = useState<string>(initial?.dateFormatHint ?? "");
  const [columnMapping, setColumnMapping] = useState<AgendaColumnMapping>(
    (initial?.columnMapping as AgendaColumnMapping) ?? {},
  );
  // Split date/time mapping: optional separate time columns + a base
  // month/year used when the date column is only a day ("12th").
  const [startTimeColumn, setStartTimeColumn] = useState<string | null>(initial?.startTimeColumn ?? null);
  const [endTimeColumn, setEndTimeColumn] = useState<string | null>(initial?.endTimeColumn ?? null);
  const [dateBaseYear, setDateBaseYear] = useState<string>(
    initial?.dateBaseYear != null ? String(initial.dateBaseYear) : "",
  );
  const [dateBaseMonth, setDateBaseMonth] = useState<string>(
    initial?.dateBaseMonth != null ? String(initial.dateBaseMonth) : "",
  );

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>(initial?.sheetName ? [initial.sheetName] : []);
  // Hide empty placeholder columns (e.g. an Excel "used range" that stretches
  // to column 1024) from the mapping pickers + preview table by default.
  const [hideBlankColumns, setHideBlankColumns] = useState(true);

  // Task #268 — Microsoft sign-in state. When microsoftAuth is on, the
  // file is addressed by a picked (driveId, itemId) or a resolved share
  // link rather than a public download URL.
  const [microsoftAuth, setMicrosoftAuth] = useState<boolean>(initial?.microsoftAuth ?? false);
  const [msDriveId, setMsDriveId] = useState<string | null>(initial?.msDriveId ?? null);
  const [msItemId, setMsItemId] = useState<string | null>(initial?.msItemId ?? null);
  // Task #362 — persist the workbook display name so the health panel can show it.
  const [msFileName, setMsFileName] = useState<string | null>(initial?.msFileName ?? null);
  const [msSearch, setMsSearch] = useState("");

  const isMapped = MAPPED_TYPES.includes(sourceType);
  const isXlsx = XLSX_TYPES.includes(sourceType);
  const isUpload = sourceType === "uploaded_xlsx";
  const isMicrosoftType = sourceType === "excel_onedrive" || sourceType === "sharepoint_excel";
  const needsUrl = isMapped && !isUpload && !(isMicrosoftType && microsoftAuth);

  function resetMappedState() {
    setStoredFilePath(null);
    setOriginalFileName(null);
    setSheetName(null);
    setHeaderRowIndex(0);
    setExternalIdColumn(null);
    setColumnMapping({});
    setPreview(null);
    setSheetNames([]);
    setMicrosoftAuth(false);
    setMsDriveId(null);
    setMsItemId(null);
    setMsFileName(null);
    setMsSearch("");
  }

  function handleSourceTypeChange(v: string) {
    const next = v as SourceType;
    setSourceType(next);
    // Switching away from mapped types clears mapping; switching between
    // mapped types keeps the URL but clears the resolved schema.
    if (!MAPPED_TYPES.includes(next)) {
      resetMappedState();
    } else {
      setPreview(null);
    }
  }

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      const res = await fetch("/api/agenda/sync-configs/upload-xlsx", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      return res.json() as Promise<{ storedFilePath: string; originalFileName: string; sheetNames: string[] }>;
    },
    onSuccess: (data) => {
      setStoredFilePath(data.storedFilePath);
      setOriginalFileName(data.originalFileName);
      setSheetNames(data.sheetNames);
      setSheetName(data.sheetNames[0] ?? null);
      setPreview(null);
      toast({ title: "File uploaded", description: data.originalFileName });
    },
    onError: (e: any) =>
      toast({ title: "Upload failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  // Task #268 — is a system-level Microsoft account connected? Only
  // queried while a Microsoft source type is selected. Drives the
  // Connect-Microsoft UI and whether the can't-read fallback shows.
  const msStatusQuery = useQuery<{
    connected: boolean;
    connectors: string[];
    provider: "entra" | "replit_dev" | null;
    canConnect: boolean;
  }>({
    queryKey: ["/api/agenda/microsoft/status", clientId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/agenda/microsoft/status?clientId=${encodeURIComponent(clientId)}`,
      );
      return res.json();
    },
    enabled: open && isMicrosoftType,
  });
  const msConnected = msStatusQuery.data?.connected ?? false;
  const msCanConnect = msStatusQuery.data?.canConnect ?? false;

  // Task #369 — Disconnect the connected Microsoft Entra account (admin only).
  const disconnectMsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agenda/microsoft/disconnect");
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to disconnect Microsoft account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/agenda/microsoft/status", clientId],
      });
      toast({ title: "Microsoft account disconnected" });
    },
    onError: (e: unknown) =>
      toast({
        title: "Disconnect failed",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      }),
  });

  // Recent / searched Excel files in the connected account.
  const msFilesQuery = useQuery<
    Array<{ id: string; name: string; driveId?: string; webUrl?: string }>
  >({
    queryKey: ["/api/agenda/microsoft/files", clientId, msSearch],
    queryFn: async () => {
      const qs = msSearch ? `&q=${encodeURIComponent(msSearch)}` : "";
      const res = await apiRequest(
        "GET",
        `/api/agenda/microsoft/files?clientId=${encodeURIComponent(clientId)}${qs}`,
      );
      return res.json();
    },
    enabled: open && isMicrosoftType && microsoftAuth && msConnected,
  });

  function pickMsFile(file: { id: string; name: string; driveId?: string }) {
    setMsDriveId(file.driveId ?? null);
    setMsItemId(file.id);
    setMsFileName(file.name);
    setSourceUrl("");
    setPreview(null);
  }

  // Resolve a pasted share link into a concrete (driveId, itemId).
  const resolveShareMutation = useMutation({
    mutationFn: async (shareUrl: string) => {
      const res = await apiRequest("POST", "/api/agenda/microsoft/resolve-share", {
        clientId,
        shareUrl,
      });
      return res.json() as Promise<{ id: string; name: string; driveId?: string }>;
    },
    onSuccess: (data) => {
      pickMsFile(data);
      toast({ title: "File resolved", description: data.name });
    },
    onError: (e: any) =>
      toast({ title: "Could not resolve link", description: String(e?.message ?? e), variant: "destructive" }),
  });

  function buildPreviewPayload(includeMapping: boolean) {
    return {
      clientId,
      sourceType,
      sourceUrl: needsUrl ? sourceUrl || null : null,
      storedFilePath: isUpload ? storedFilePath : null,
      sheetName: sheetName || null,
      headerRowIndex,
      columnMapping: includeMapping ? columnMapping : null,
      externalIdColumn: externalIdColumn || null,
      timezone: timezone || null,
      dateFormatHint: dateFormatHint || null,
      startTimeColumn: startTimeColumn || null,
      endTimeColumn: endTimeColumn || null,
      dateBaseYear: dateBaseYear ? parseInt(dateBaseYear, 10) : null,
      dateBaseMonth: dateBaseMonth ? parseInt(dateBaseMonth, 10) : null,
      microsoftAuth: isMicrosoftType ? microsoftAuth : false,
      msDriveId: isMicrosoftType && microsoftAuth ? msDriveId : null,
      msItemId: isMicrosoftType && microsoftAuth ? msItemId : null,
    };
  }

  const previewMutation = useMutation({
    mutationFn: async (includeMapping: boolean) => {
      const endpoint = includeMapping
        ? "/api/agenda/sync-configs/preview"
        : "/api/agenda/sync-configs/test";
      const res = await apiRequest("POST", endpoint, buildPreviewPayload(includeMapping));
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data, includeMapping) => {
      setPreview(data);
      if (data.sheetNames?.length) setSheetNames(data.sheetNames);
      // On the first "test", adopt the auto-suggested mapping if the
      // operator hasn't mapped anything yet.
      if (!includeMapping && Object.keys(columnMapping).length === 0 && data.suggestedMapping) {
        setColumnMapping(data.suggestedMapping);
      }
      toast({
        title: "Connected",
        description: data.totalDataRowsTruncated
          ? `Showing the first ${data.totalDataRows} row(s) for a quick preview. All rows are processed when you sync.`
          : `Found ${data.totalDataRows} data row(s).`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Connection failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const missingRequired = useMemo(
    () => REQUIRED_FIELDS.filter((f) => !columnMapping[f]),
    [columnMapping],
  );

  // Header labels currently referenced by any picker — these stay visible
  // even if they look blank in the sample.
  const inUseLabels = useMemo(() => {
    const s = new Set<string>();
    for (const f of Object.keys(columnMapping) as AgendaMappableField[]) {
      const v = columnMapping[f];
      if (v) s.add(v);
    }
    if (startTimeColumn) s.add(startTimeColumn);
    if (endTimeColumn) s.add(endTimeColumn);
    if (externalIdColumn) s.add(externalIdColumn);
    return s;
  }, [columnMapping, startTimeColumn, endTimeColumn, externalIdColumn]);

  const blankColumnCount = useMemo(() => {
    if (!preview) return 0;
    return preview.headers.filter((label, idx) =>
      isBlankPreviewColumn(preview, idx, label, inUseLabels),
    ).length;
  }, [preview, inUseLabels]);

  // Columns to actually offer/show, honouring the hide toggle.
  const visibleHeaders = useMemo(() => {
    if (!preview) return [] as { label: string; idx: number }[];
    return preview.headers
      .map((label, idx) => ({ label, idx }))
      .filter(({ label, idx }) =>
        hideBlankColumns ? !isBlankPreviewColumn(preview, idx, label, inUseLabels) : true,
      );
  }, [preview, hideBlankColumns, inUseLabels]);

  // Column indices whose values should be shown as readable dates/times in
  // the preview (the columns mapped to the date/datetime fields).
  const dateColumnIdxSet = useMemo(() => {
    const s = new Set<number>();
    if (!preview) return s;
    for (const label of [columnMapping.startsAt, columnMapping.endsAt]) {
      if (!label) continue;
      const idx = preview.headers.indexOf(label);
      if (idx >= 0) s.add(idx);
    }
    return s;
  }, [preview, columnMapping.startsAt, columnMapping.endsAt]);

  const mutation = useMutation({
    mutationFn: async () => {
      const base: Record<string, unknown> = {
        clientId,
        name,
        sourceType,
        enabled,
        syncIntervalMinutes,
      };
      if (isMapped) {
        Object.assign(base, {
          sourceUrl: needsUrl ? sourceUrl || null : null,
          storedFilePath: isUpload ? storedFilePath : null,
          originalFileName: isUpload ? originalFileName : null,
          sheetName: isXlsx ? sheetName || null : null,
          headerRowIndex,
          columnMapping,
          externalIdColumn: externalIdColumn || null,
          timezone: timezone || null,
          dateFormatHint: dateFormatHint || null,
          startTimeColumn: startTimeColumn || null,
          endTimeColumn: endTimeColumn || null,
          dateBaseYear: dateBaseYear ? parseInt(dateBaseYear, 10) : null,
          dateBaseMonth: dateBaseMonth ? parseInt(dateBaseMonth, 10) : null,
          syncMode,
          removeMissingItems,
          microsoftAuth: isMicrosoftType ? microsoftAuth : false,
          msDriveId: isMicrosoftType && microsoftAuth ? msDriveId : null,
          msItemId: isMicrosoftType && microsoftAuth ? msItemId : null,
          // Task #362 — persist workbook name for the health details panel.
          msFileName: isMicrosoftType && microsoftAuth ? msFileName : null,
        });
      } else {
        Object.assign(base, { sourceUrl });
      }
      if (initial) {
        return apiRequest("PATCH", `/api/agenda/sync-configs/${initial.id}`, base);
      }
      return apiRequest("POST", `/api/agenda/sync-configs`, base);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/sync-configs"] });
      onOpenChange(false);
      toast({ title: initial ? "Sync source updated" : "Sync source added" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const msReady = isMicrosoftType && microsoftAuth && ((!!msDriveId && !!msItemId) || !!sourceUrl);
  const canTest = isMapped
    ? isMicrosoftType && microsoftAuth
      ? msReady
      : needsUrl
        ? !!sourceUrl
        : !!storedFilePath
    : false;
  const canSave = (() => {
    if (!name) return false;
    if (!isMapped) return !!sourceUrl;
    if (isMicrosoftType && microsoftAuth) {
      if (!msReady) return false;
      return missingRequired.length === 0;
    }
    if (needsUrl && !sourceUrl) return false;
    if (isUpload && !storedFilePath) return false;
    return missingRequired.length === 0;
  })();

  function setFieldMapping(field: AgendaMappableField, header: string) {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (header === NO_COLUMN || !header) {
        delete next[field];
      } else {
        next[field] = header;
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Sync Source" : "Add Sync Source"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main agenda (Sched ICS)"
              data-testid="input-sync-name"
            />
          </div>
          <div>
            <Label>Source type</Label>
            <Select value={sourceType} onValueChange={handleSourceTypeChange}>
              <SelectTrigger data-testid="select-sync-source-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGENDA_SYNC_SOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{SOURCE_TYPE_HINTS[sourceType]}</p>
          </div>

          {/* Microsoft sign-in — OneDrive / SharePoint (Task #268) */}
          {isMicrosoftType && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sign in with Microsoft</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Read a private OneDrive/SharePoint Excel file via a connected Microsoft account.
                  </p>
                </div>
                <Switch
                  checked={microsoftAuth}
                  onCheckedChange={(v) => {
                    setMicrosoftAuth(v);
                    setMsDriveId(null);
                    setMsItemId(null);
                    setMsFileName(null);
                    setPreview(null);
                  }}
                  data-testid="switch-microsoft-auth"
                />
              </div>

              {microsoftAuth && (
                <div className="space-y-3">
                  {msStatusQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Checking Microsoft connection…</p>
                  ) : msConnected ? (
                    <div className="flex items-center gap-3" data-testid="text-ms-connected">
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Microsoft account connected.
                      </p>
                      {msCanConnect && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto py-0.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => disconnectMsMutation.mutate()}
                          disabled={disconnectMsMutation.isPending}
                        >
                          Disconnect
                        </Button>
                      )}
                    </div>
                  ) : msCanConnect ? (
                    <div className="space-y-2" data-testid="text-ms-not-connected">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No Microsoft account is connected yet.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={`/api/agenda/microsoft/connect?returnTo=${encodeURIComponent(
                            typeof window !== "undefined"
                              ? window.location.pathname + window.location.search
                              : "/",
                          )}`}
                        >
                          Connect Microsoft account
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-ms-not-connected">
                      No Microsoft account is connected yet. Ask an administrator to connect a
                      Microsoft account so VectorMesh can read private files.
                    </p>
                  )}

                  {msConnected && (
                    <>
                      <div>
                        <Label>Find an Excel file</Label>
                        <Input
                          value={msSearch}
                          onChange={(e) => setMsSearch(e.target.value)}
                          placeholder="Search by file name (blank = your files)"
                          data-testid="input-ms-search"
                        />
                        <div className="mt-2 max-h-40 overflow-y-auto rounded border divide-y">
                          {msFilesQuery.isLoading && (
                            <p className="text-xs text-muted-foreground p-2">Loading files…</p>
                          )}
                          {!msFilesQuery.isLoading && (msFilesQuery.data?.length ?? 0) === 0 && (
                            <p className="text-xs text-muted-foreground p-2">No Excel files found.</p>
                          )}
                          {msFilesQuery.data?.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => pickMsFile(f)}
                              className={`block w-full text-left text-sm px-2 py-1.5 hover:bg-accent ${
                                msItemId === f.id ? "bg-accent" : ""
                              }`}
                              data-testid={`button-ms-file-${f.id}`}
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>…or paste a share link</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            value={sourceUrl}
                            onChange={(e) => setSourceUrl(e.target.value)}
                            placeholder="https://…sharepoint.com/… or OneDrive share link"
                            data-testid="input-ms-share-url"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!sourceUrl || resolveShareMutation.isPending}
                            onClick={() => resolveShareMutation.mutate(sourceUrl)}
                            data-testid="button-ms-resolve-share"
                          >
                            {resolveShareMutation.isPending ? "Resolving…" : "Resolve"}
                          </Button>
                        </div>
                      </div>

                      {msFileName && (
                        <p className="text-xs text-muted-foreground" data-testid="text-ms-selected-file">
                          Selected file: {msFileName}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* URL input — every type except uploaded_xlsx and MS-backed sources */}
          {!isUpload && !(isMicrosoftType && microsoftAuth) && (
            <div>
              <Label>Source URL</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                data-testid="input-sync-url"
              />
              {isMicrosoftType && (
                <p className="text-xs text-muted-foreground mt-1">
                  If the link opens a Microsoft sign-in or preview page, the file can't be read
                  directly. Turn on "Sign in with Microsoft" above to read private files, or use a
                  direct-download link, export to CSV, or upload the .xlsx file instead.
                </p>
              )}
            </div>
          )}

          {/* Upload — uploaded_xlsx */}
          {isUpload && (
            <div>
              <Label>Excel file (.xlsx)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                  }}
                  data-testid="input-xlsx-file"
                />
                {uploadMutation.isPending && <span className="text-xs text-muted-foreground">Uploading…</span>}
              </div>
              {originalFileName && (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-uploaded-name">
                  Current file: {originalFileName}
                </p>
              )}
            </div>
          )}

          {/* Mapped-source configuration */}
          {isMapped && (
            <>
              {isXlsx && sheetNames.length > 0 && (
                <div>
                  <Label>Sheet</Label>
                  <Select value={sheetName ?? sheetNames[0]} onValueChange={setSheetName}>
                    <SelectTrigger data-testid="select-sheet"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheetNames.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Header row number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={headerRowIndex + 1}
                    onChange={(e) =>
                      setHeaderRowIndex(Math.max(0, (parseInt(e.target.value || "1", 10) || 1) - 1))
                    }
                    data-testid="input-header-row"
                  />
                  <p className="text-xs text-muted-foreground mt-1">The row that holds your column titles.</p>
                </div>
                <div>
                  <Label>Date format</Label>
                  <Select value={dateFormatHint || "auto"} onValueChange={(v) => setDateFormatHint(v === "auto" ? "" : v)}>
                    <SelectTrigger data-testid="select-date-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="uk">UK (day/month/year)</SelectItem>
                      <SelectItem value="us">US (month/day/year)</SelectItem>
                      <SelectItem value="iso">ISO (year-month-day)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Timezone (optional)</Label>
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Leave blank to use the site timezone (e.g. Europe/London)"
                  data-testid="input-timezone"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canTest || previewMutation.isPending}
                  onClick={() => previewMutation.mutate(false)}
                  data-testid="button-test-connection"
                >
                  {previewMutation.isPending ? "Connecting…" : "Test connection"}
                </Button>
                {preview && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={previewMutation.isPending || missingRequired.length > 0}
                    onClick={() => previewMutation.mutate(true)}
                    data-testid="button-preview-mapping"
                  >
                    Preview mapped rows
                  </Button>
                )}
              </div>

              {/* Mapping panel — appears once we have headers */}
              {preview && preview.headers.length > 0 && (
                <div className="border rounded-md p-3 space-y-3" data-testid="panel-mapping">
                  <div className="text-sm font-medium">Map your columns</div>
                  <p className="text-xs text-muted-foreground">
                    Title, Start time and End time are required. We've guessed where we can — adjust
                    anything that's wrong.
                  </p>
                  {blankColumnCount > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                      <span className="text-xs text-muted-foreground" data-testid="text-blank-columns">
                        {hideBlankColumns
                          ? `${blankColumnCount} empty column${blankColumnCount === 1 ? "" : "s"} hidden`
                          : `${blankColumnCount} empty column${blankColumnCount === 1 ? "" : "s"} shown`}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHideBlankColumns((v) => !v)}
                        data-testid="button-toggle-blank-columns"
                      >
                        {hideBlankColumns ? "Show all columns" : "Remove blank columns"}
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-2">
                    {AGENDA_MAPPABLE_FIELDS.map((field) => {
                      const required = REQUIRED_FIELDS.includes(field);
                      const missing = required && !columnMapping[field];
                      return (
                        <div key={field} className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
                          <Label className={missing ? "text-destructive" : ""}>
                            {FIELD_LABELS[field]}{required ? " *" : ""}
                          </Label>
                          <Select
                            value={columnMapping[field] ?? NO_COLUMN}
                            onValueChange={(v) => setFieldMapping(field, v)}
                          >
                            <SelectTrigger data-testid={`select-map-${field}`}>
                              <SelectValue placeholder="— Not mapped —" />
                            </SelectTrigger>
                            <SelectContent className="max-w-[min(90vw,360px)]">
                              <SelectItem value={NO_COLUMN}>— Not mapped —</SelectItem>
                              {visibleHeaders.map(({ label, idx }) => (
                                <SelectItem key={`${label}-${idx}`} value={label} title={label}>
                                  <span className="block truncate max-w-[300px]">{label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>

                  {/* Split date & time — for sheets that keep the date and
                      the clock time in separate columns. */}
                  <div className="border-t pt-3 mt-1 space-y-2" data-testid="panel-split-datetime">
                    <div className="text-sm font-medium">Separate time columns (optional)</div>
                    <p className="text-xs text-muted-foreground">
                      Use this if your sheet keeps the time in its own column (e.g. a "Date" column with
                      <span className="font-medium"> 12th</span> and a separate start/end time). Map the date
                      to <span className="font-medium">Start time</span> / <span className="font-medium">End time</span> above,
                      then pick the matching time columns here.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
                      <Label>Start time column</Label>
                      <Select
                        value={startTimeColumn ?? NO_COLUMN}
                        onValueChange={(v) => setStartTimeColumn(v === NO_COLUMN ? null : v)}
                      >
                        <SelectTrigger data-testid="select-start-time-column"><SelectValue placeholder="— Not used —" /></SelectTrigger>
                        <SelectContent className="max-w-[min(90vw,360px)]">
                          <SelectItem value={NO_COLUMN}>— Not used —</SelectItem>
                          {visibleHeaders.map(({ label, idx }) => (
                            <SelectItem key={`st-${label}-${idx}`} value={label} title={label}>
                              <span className="block truncate max-w-[300px]">{label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
                      <Label>End time column</Label>
                      <Select
                        value={endTimeColumn ?? NO_COLUMN}
                        onValueChange={(v) => setEndTimeColumn(v === NO_COLUMN ? null : v)}
                      >
                        <SelectTrigger data-testid="select-end-time-column"><SelectValue placeholder="— Not used —" /></SelectTrigger>
                        <SelectContent className="max-w-[min(90vw,360px)]">
                          <SelectItem value={NO_COLUMN}>— Not used —</SelectItem>
                          {visibleHeaders.map(({ label, idx }) => (
                            <SelectItem key={`et-${label}-${idx}`} value={label} title={label}>
                              <span className="block truncate max-w-[300px]">{label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
                      <Label>Base month &amp; year</Label>
                      <div className="flex gap-2">
                        <Select
                          value={dateBaseMonth || NO_COLUMN}
                          onValueChange={(v) => setDateBaseMonth(v === NO_COLUMN ? "" : v)}
                        >
                          <SelectTrigger data-testid="select-date-base-month"><SelectValue placeholder="Month" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_COLUMN}>— Month —</SelectItem>
                            {MONTH_OPTIONS.map((m) => (
                              <SelectItem key={`mo-${m.value}`} value={String(m.value)}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1970}
                          max={2200}
                          placeholder="Year"
                          value={dateBaseYear}
                          onChange={(e) => setDateBaseYear(e.target.value)}
                          data-testid="input-date-base-year"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only needed when the date column is just a day (like "12th"). If your date column
                      already has a full date, leave these blank.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
                    <Label>Unique ID column (optional)</Label>
                    <Select
                      value={externalIdColumn ?? NO_COLUMN}
                      onValueChange={(v) => setExternalIdColumn(v === NO_COLUMN ? null : v)}
                    >
                      <SelectTrigger data-testid="select-external-id"><SelectValue placeholder="— Auto —" /></SelectTrigger>
                      <SelectContent className="max-w-[min(90vw,360px)]">
                        <SelectItem value={NO_COLUMN}>— Auto (use row contents) —</SelectItem>
                        {visibleHeaders.map(({ label, idx }) => (
                          <SelectItem key={`id-${label}-${idx}`} value={label} title={label}>
                            <span className="block truncate max-w-[300px]">{label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {missingRequired.length > 0 && (
                    <div className="text-xs text-destructive" data-testid="text-missing-required">
                      Still need: {missingRequired.map((f) => FIELD_LABELS[f as AgendaMappableField]).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* Sample / preview table */}
              {preview && preview.sampleRows.length > 0 && (
                <div className="w-full border rounded-md max-h-64 overflow-auto" data-testid="table-preview">
                  <table
                    className="text-xs table-fixed"
                    style={{ width: `${visibleHeaders.length * 180}px` }}
                  >
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted">
                        {visibleHeaders.map(({ label, idx }) => (
                          <th
                            key={`h-${idx}`}
                            title={label}
                            className="w-[180px] px-2 py-1 text-left font-medium truncate bg-muted"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleRows.map((row, ri) => (
                        <tr key={`r-${ri}`} className="border-t">
                          {visibleHeaders.map(({ idx }) => {
                            const raw = row[idx] ?? "";
                            const display = dateColumnIdxSet.has(idx)
                              ? formatReadableAgendaDate(raw, { timezone, dateFormatHint })
                              : raw;
                            return (
                              <td
                                key={`c-${ri}-${idx}`}
                                title={raw}
                                className="w-[180px] px-2 py-1 truncate"
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview?.totalDataRowsTruncated && (
                <p className="text-xs text-muted-foreground" data-testid="text-preview-truncated">
                  Showing the first {preview.totalDataRows} rows for a quick preview. All rows are processed when you sync.
                </p>
              )}

              {/* Mapped-row outcome */}
              {preview?.mapped && (
                <div className="text-xs space-y-1" data-testid="text-mapped-summary">
                  <div className="flex gap-3">
                    <span className="text-green-600">{preview.mapped.okCount} ok</span>
                    <span className="text-destructive">{preview.mapped.errorCount} error(s)</span>
                    <span className="text-muted-foreground">{preview.mapped.skippedCount} skipped</span>
                  </div>
                  {preview.mapped.rows.filter((r) => r.status === "error").slice(0, 5).map((r) => (
                    <div key={`err-${r.rowNumber}`} className="text-destructive">
                      Row {r.rowNumber}: {r.error}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Scheduling */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sync mode</Label>
              <Select value={syncMode} onValueChange={setSyncMode}>
                <SelectTrigger data-testid="select-sync-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Automatic (on a timer)</SelectItem>
                  <SelectItem value="manual">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Refresh every (minutes)</Label>
              <Input
                type="number"
                min={5}
                max={60 * 24}
                disabled={syncMode === "manual"}
                value={syncIntervalMinutes}
                onChange={(e) => setSyncIntervalMinutes(Math.max(5, Math.min(60 * 24, parseInt(e.target.value || "60", 10))))}
                data-testid="input-sync-interval"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                data-testid="checkbox-sync-enabled"
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={removeMissingItems}
                onChange={(e) => setRemoveMissingItems(e.target.checked)}
                data-testid="checkbox-remove-missing"
              />
              Remove items that disappear from the source
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Items you edit by hand here are kept and never overwritten by the next sync.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!canSave || mutation.isPending}
              onClick={() => mutation.mutate()}
              data-testid="button-save-sync"
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** True for Microsoft-backed read-only sources (SharePoint / OneDrive Excel). */
function isMsReadOnly(cfg: AgendaSyncConfig): boolean {
  return (
    !!cfg.microsoftAuth &&
    (cfg.sourceType === "excel_onedrive" || cfg.sourceType === "sharepoint_excel")
  );
}

/**
 * Task #362 — Inline source-health and display-continuity badges for a
 * Microsoft-backed sync config.  Fetches the /errors endpoint once per
 * config and surfaces:
 *  - Source connected / Source unreachable (SourceConnectionHealth)
 *  - Snapshot active (DisplayContinuity — last-good snapshot is serving players)
 */
// ─── Task #362 — authoritative health-state colour map ─────────────────
type SourceHealthState =
  | "Healthy" | "Checking" | "Workbook unchanged" | "Updating"
  | "Validation warning" | "Authentication required"
  | "Access revoked" | "Source unavailable";

type DisplayContinuityState = "Current" | "Using last-known-good" | "No valid snapshot";

function healthStateVariant(state: SourceHealthState): "secondary" | "destructive" | "outline" {
  if (state === "Healthy" || state === "Workbook unchanged" || state === "Checking" || state === "Updating") return "secondary";
  if (state === "Validation warning") return "outline";
  return "destructive";
}

function healthStateClass(state: SourceHealthState): string {
  if (state === "Healthy") return "text-sky-700 dark:text-sky-400";
  if (state === "Workbook unchanged" || state === "Checking" || state === "Updating") return "text-slate-600 dark:text-slate-400";
  if (state === "Validation warning") return "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700";
  return "";
}

function continuityStateClass(state: DisplayContinuityState): string {
  if (state === "Current") return "text-emerald-700 dark:text-emerald-400";
  if (state === "Using last-known-good") return "text-amber-700 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

interface SyncHealthDetails {
  msAccountConnected: boolean;
  isReadOnly: boolean;
  msFileName: string | null;
  msConfiguredSheetName: string | null;
  lastCheckedAt: string | null;
  lastCTagChangedAt: string | null;
  lastPublishedAt: string | null;
  snapshotVersion: number | null;
  itemCount: number | null;
  syncIntervalMinutes: number;
  consecutiveFailures: number;
  lastActionableWarning: string | null;
}

interface SyncHealthResponse {
  sourceHealthState?: SourceHealthState;
  displayContinuityState?: DisplayContinuityState;
  details?: SyncHealthDetails;
  lastError?: string | null;
  lastErrorAt?: string | null;
  lastSyncOk?: boolean | null;
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SyncHealthBadges({ configId }: { configId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<SyncHealthResponse>({
    queryKey: ["/api/agenda/sync-configs", configId, "errors"],
    queryFn: async () => {
      const r = await fetch(`/api/agenda/sync-configs/${configId}/errors`, {
        credentials: "include",
      });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 30_000,
  });

  const healthState = data?.sourceHealthState;
  const continuityState = data?.displayContinuityState;
  const details = data?.details;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {/* Source health badge (authoritative server-side state) */}
        {healthState ? (
          <Badge
            variant={healthStateVariant(healthState)}
            className={healthStateClass(healthState)}
            data-testid={`badge-source-health-${configId}`}
          >
            {(healthState === "Checking" || healthState === "Updating") && (
              <span className="mr-1 animate-pulse">●</span>
            )}
            {healthState === "Source unavailable" && <WifiOff className="h-3 w-3 mr-1" />}
            {healthState === "Authentication required" && <Lock className="h-3 w-3 mr-1" />}
            {healthState === "Access revoked" && <Lock className="h-3 w-3 mr-1" />}
            {healthState}
          </Badge>
        ) : (
          // Legacy fallback when server hasn't returned new contract yet.
          <Badge variant="secondary" className="text-slate-500 dark:text-slate-400"
            data-testid={`badge-source-health-${configId}`}>
            —
          </Badge>
        )}

        {/* Display continuity badge */}
        {continuityState && (
          <Badge
            variant="secondary"
            className={continuityStateClass(continuityState)}
            data-testid={`badge-continuity-${configId}`}
          >
            {continuityState === "Current" && <Archive className="h-3 w-3 mr-1" />}
            {continuityState}
          </Badge>
        )}

        {/* Expandable toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          data-testid={`health-details-toggle-${configId}`}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>

      {/* ── Expandable details panel (Task #362 health contract) ─────────── */}
      {expanded && (
        <div
          className="mt-1 rounded-md border bg-muted/40 p-3 text-xs grid grid-cols-2 gap-x-4 gap-y-1"
          data-testid={`health-details-panel-${configId}`}
        >
          <span className="text-muted-foreground">Account</span>
          <span>{details?.msAccountConnected ? "Microsoft account" : "—"}</span>

          <span className="text-muted-foreground">Workbook</span>
          <span>{details?.msFileName ?? "—"}</span>

          <span className="text-muted-foreground">Sheet</span>
          <span>{details?.msConfiguredSheetName ?? "Auto (first sheet)"}</span>

          <span className="text-muted-foreground">Source type</span>
          <span>Read-only</span>

          <span className="text-muted-foreground">Last checked</span>
          <span>{fmt(details?.lastCheckedAt)}</span>

          <span className="text-muted-foreground">Source last changed</span>
          <span>{fmt(details?.lastCTagChangedAt)}</span>

          <span className="text-muted-foreground">Last published</span>
          <span>{fmt(details?.lastPublishedAt)}</span>

          <span className="text-muted-foreground">Snapshot version</span>
          <span>{details?.snapshotVersion ?? "—"}</span>

          <span className="text-muted-foreground">Item count</span>
          <span>{details?.itemCount ?? "—"}</span>

          <span className="text-muted-foreground">Sync interval</span>
          <span>{details?.syncIntervalMinutes ?? "—"} min</span>

          <span className="text-muted-foreground">Consecutive failures</span>
          <span>{details?.consecutiveFailures ?? 0}</span>

          {details?.lastActionableWarning && (
            <>
              <span className="text-muted-foreground">Last warning</span>
              <span className="text-amber-700 dark:text-amber-400 break-all">
                {details.lastActionableWarning}
              </span>
            </>
          )}

          {data?.lastError && (
            <>
              <span className="text-muted-foreground">Last error</span>
              <span className="text-destructive break-all">{data.lastError}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SyncSourcesSection({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaSyncConfig | null>(null);
  const { data: configs = [], isLoading } = useQuery<AgendaSyncConfig[]>({
    queryKey: ["/api/agenda/sync-configs", clientId],
    queryFn: async () => {
      const r = await fetch(`/api/agenda/sync-configs?clientId=${clientId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load sync configs");
      return r.json();
    },
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/agenda/sync-configs/${id}/run`, {});
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/sync-configs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      if (data?.ok) {
        const warnings: string[] = Array.isArray(data?.parseWarnings) ? data.parseWarnings : [];
        const counts = `${data.inserted} new, ${data.updated} updated, ${data.skippedManual} kept (manual), ${data.removed} removed`;
        if (warnings.length > 0 && data.totalUpstream === 0) {
          const dateHint = /parse start\/end date|could not parse/i.test(warnings[0] ?? "")
            ? " If your date column is just a day (e.g. \"12th\"), set Base month and Base year in the source settings."
            : "";
          toast({
            title: "Sync ran, but no rows could be read",
            description: `${warnings.length} row(s) skipped. Example: ${warnings[0]}${dateHint}`,
            variant: "destructive",
          });
        } else if (warnings.length > 0) {
          toast({
            title: "Sync complete (with warnings)",
            description: `${counts}. ${warnings.length} row(s) skipped — e.g. ${warnings[0]}`,
          });
        } else {
          toast({ title: "Sync complete", description: counts });
        }
      } else {
        toast({ title: "Sync failed", description: data?.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (e: any) =>
      toast({ title: "Sync failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agenda/sync-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/sync-configs"] });
      toast({ title: "Sync source removed" });
    },
  });

  // Task #362 — Disconnect the Microsoft account from a read-only source.
  // Clears the microsoftAuth flag and the Drive/Item IDs so the config
  // becomes a plain URL-based source (or can be reconfigured via the
  // edit dialog). Operators use this when decommissioning a SharePoint
  // integration without deleting the config entirely.
  const disconnectMsMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/agenda/sync-configs/${id}`, {
        microsoftAuth: false,
        msDriveId: null,
        msItemId: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/sync-configs"] });
      toast({ title: "Microsoft connection removed from source" });
    },
    onError: () => {
      toast({
        title: "Failed to disconnect Microsoft account",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-sync-sources">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Sync sources
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pull session schedules in automatically from Sched, Cvent, Google Calendar, or a
            published Google Sheet. Hand-edited items are preserved.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="button-add-sync">
          <Plus className="h-4 w-4 mr-2" /> Add source
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sync sources yet. Add one to pull agenda items in automatically.
          </p>
        ) : (
          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="border rounded-md p-3 flex flex-col gap-1"
                data-testid={`sync-row-${cfg.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{cfg.name}</span>
                    <Badge variant="outline">
                      {SOURCE_TYPE_LABELS[cfg.sourceType as SourceType] ?? cfg.sourceType}
                    </Badge>
                    {/* Task #362 — Explicit read-only indicator for Microsoft-backed sources */}
                    {isMsReadOnly(cfg) && (
                      <Badge
                        variant="outline"
                        className="text-sky-700 dark:text-sky-400 border-sky-300"
                        data-testid={`badge-readonly-${cfg.id}`}
                      >
                        <Lock className="h-3 w-3 mr-1" /> Read-only source
                      </Badge>
                    )}
                    {cfg.enabled ? (
                      <Badge variant="secondary">Enabled · every {cfg.syncIntervalMinutes}m</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                    {cfg.lastSyncOk === true && (
                      <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Last sync OK
                      </Badge>
                    )}
                    {cfg.lastSyncOk === false && (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Last sync failed
                      </Badge>
                    )}
                    {/* Task #362 — Live source health + display-continuity badges */}
                    {isMsReadOnly(cfg) && <SyncHealthBadges configId={cfg.id} />}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runMutation.mutate(cfg.id)}
                      disabled={runMutation.isPending}
                      data-testid={`button-run-sync-${cfg.id}`}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-spin" : ""}`}
                      />
                      {/* Task #362 — "Refresh now" for read-only sources; "Sync now" otherwise */}
                      {isMsReadOnly(cfg) ? "Refresh now" : "Sync now"}
                    </Button>
                    {/* Task #362 — Reconnect: opens the edit dialog to repair the MS connection */}
                    {isMsReadOnly(cfg) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditing(cfg); setOpen(true); }}
                        data-testid={`button-reconnect-sync-${cfg.id}`}
                        title="Open settings to reconnect the Microsoft account"
                      >
                        Reconnect
                      </Button>
                    )}
                    {/* Task #362 — Disconnect: clears MS auth without deleting the config */}
                    {isMsReadOnly(cfg) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            confirm(
                              "Remove the Microsoft connection from this source? The config will remain but the Microsoft account link will be cleared.",
                            )
                          ) {
                            disconnectMsMutation.mutate(cfg.id);
                          }
                        }}
                        disabled={disconnectMsMutation.isPending}
                        data-testid={`button-disconnect-ms-${cfg.id}`}
                        title="Remove Microsoft account connection from this source"
                      >
                        Disconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(cfg); setOpen(true); }}
                      data-testid={`button-edit-sync-${cfg.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(cfg.id)}
                      data-testid={`button-delete-sync-${cfg.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground break-all">{cfg.sourceUrl}</div>
                {cfg.lastSyncAt && (
                  <div className="text-xs text-muted-foreground">
                    Last run {new Date(cfg.lastSyncAt).toLocaleString()}
                    {typeof cfg.lastItemCount === "number" && ` · ${cfg.lastItemCount} item(s) upstream`}
                  </div>
                )}
                {cfg.lastError && (
                  <div className="text-xs text-rose-600 break-all" data-testid={`sync-error-${cfg.id}`}>
                    Error: {cfg.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {open && (
        <SyncConfigDialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
          initial={editing ?? undefined}
          clientId={clientId}
        />
      )}
    </Card>
  );
}

export default function AgendaItemsPage() {
  const { selectedClientId, selectedClient } = useSiteContext();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>("__all__");
  const [trackFilter, setTrackFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [dateFilter, setDateFilter] = useState<string>("");

  const queryConfig = useSiteFilteredQuery<AgendaItem[]>("/api/agenda");
  const { data: items = [], isLoading } = useQuery(queryConfig);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agenda/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      toast({ title: "Item deleted" });
    },
  });

  // Unique facets for the filter dropdowns.
  const rooms = useMemo(
    () => Array.from(new Set(items.map((i) => i.room).filter(Boolean))) as string[],
    [items],
  );
  const tracks = useMemo(
    () => Array.from(new Set(items.map((i) => i.track).filter(Boolean))) as string[],
    [items],
  );

  // Filtered + sorted view used both for rendering AND for export.
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (roomFilter !== "__all__" && it.room !== roomFilter) return false;
      if (trackFilter !== "__all__" && it.track !== trackFilter) return false;
      if (statusFilter !== "__all__" && it.status !== statusFilter) return false;
      if (dateFilter) {
        const d = new Date(it.startsAt);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (ymd !== dateFilter) return false;
      }
      return true;
    });
  }, [items, roomFilter, trackFilter, statusFilter, dateFilter]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [filtered]);

  const filtersActive =
    roomFilter !== "__all__" || trackFilter !== "__all__" || statusFilter !== "__all__" || !!dateFilter;

  const clearFilters = () => {
    setRoomFilter("__all__");
    setTrackFilter("__all__");
    setStatusFilter("__all__");
    setDateFilter("");
  };

  // Export honours the active filter set — so operators can hand a
  // room-specific or day-specific CSV to a partner without re-editing.
  const downloadCsv = () => {
    const csv = serializeAgendaCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = filtersActive ? "filtered" : "all";
    a.download = `agenda-${selectedClient?.name || "site"}-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!selectedClientId) {
    return (
      <Card className="py-12">
        <CardContent className="flex flex-col items-center text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Select a site</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Pick a site in the sidebar to manage its agenda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-agenda-title">Agenda Items</h1>
          <p className="text-muted-foreground">
            Sessions for {selectedClient?.name}. Drives the Agenda Display Widget.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" /> Export CSV{filtersActive ? " (filtered)" : ""}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-import-csv">
            <Upload className="h-4 w-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-agenda">
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </div>
      </div>

      <SyncSourcesSection clientId={selectedClientId} />

      {/* Filter bar — room / track / status / date. Drives both the
          rendered list and the CSV export. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Room</Label>
            <Select value={roomFilter} onValueChange={setRoomFilter}>
              <SelectTrigger className="w-[160px]" data-testid="filter-room"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All rooms</SelectItem>
                {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Track</Label>
            <Select value={trackFilter} onValueChange={setTrackFilter}>
              <SelectTrigger className="w-[160px]" data-testid="filter-track"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All tracks</SelectItem>
                {tracks.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {AGENDA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-[180px]"
              data-testid="filter-date"
            />
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              Clear filters
            </Button>
          )}
          <p className="text-xs text-muted-foreground ml-auto">
            Showing {sorted.length} of {items.length} item(s)
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No agenda items yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Add sessions manually or paste a CSV from your event planning tool.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <Card key={item.id} className="hover-elevate" data-testid={`agenda-item-row-${item.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant="outline" data-testid={`badge-status-${item.id}`}>{item.status}</Badge>
                    {item.room && <Badge variant="secondary">📍 {item.room}</Badge>}
                    {item.track && <Badge variant="secondary">🏷 {item.track}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(item.startsAt).toLocaleString()} → {new Date(item.endsAt).toLocaleString()}
                    {item.presenter && <> · {item.presenter}</>}
                  </p>
                  {item.statusMessage && (
                    <p className="text-sm italic mt-1">{item.statusMessage}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(item)} data-testid={`button-edit-${item.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${item.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {createOpen && <ItemDialog open={createOpen} onOpenChange={setCreateOpen} clientId={selectedClientId} />}
      {editing && <ItemDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} initial={editing} clientId={selectedClientId} />}
      {importOpen && <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} clientId={selectedClientId} />}
    </div>
  );
}
