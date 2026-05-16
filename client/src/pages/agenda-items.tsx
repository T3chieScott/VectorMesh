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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Upload, Download, Calendar, FileText } from "lucide-react";
import { AGENDA_STATUSES, type AgendaItem } from "@shared/schema";
import { serializeAgendaCsv, AGENDA_CSV_HEADER } from "@shared/agenda-csv";

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
