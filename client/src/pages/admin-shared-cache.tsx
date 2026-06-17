import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatabaseZap, RefreshCw, Trash2, Eye, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface CacheEntrySummary {
  id: string;
  namespace: string;
  cacheKey: string;
  status: string;
  source: string | null;
  expiresAt: string | null;
  lastUpdatedAt: string | null;
  updatedAt: string | null;
  metadata: unknown;
  errorMessage: string | null;
  sizeBytes: number;
  expired: boolean;
}

interface CacheListResponse {
  namespaces: string[];
  entries: CacheEntrySummary[];
}

const STATUS_COLOUR: Record<string, string> = {
  fresh: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800",
  stale: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800",
  error: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relative(ts: string | null): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return "—";
  }
}

export default function SharedCachePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isFullAccess = user?.role === "admin";
  const [namespaceFilter, setNamespaceFilter] = useState<string>("all");
  const [detail, setDetail] = useState<{ namespace: string; cacheKey: string } | null>(null);

  const listKey =
    namespaceFilter === "all"
      ? ["/api/admin/shared-cache"]
      : ["/api/admin/shared-cache", { namespace: namespaceFilter }];

  const { data, isLoading } = useQuery<CacheListResponse>({
    queryKey: listKey,
    queryFn: async () => {
      const url =
        namespaceFilter === "all"
          ? "/api/admin/shared-cache"
          : `/api/admin/shared-cache?namespace=${encodeURIComponent(namespaceFilter)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cache");
      return res.json();
    },
  });

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-cache"] });

  const deleteMutation = useMutation({
    mutationFn: async (entry: CacheEntrySummary) => {
      await apiRequest(
        "DELETE",
        `/api/admin/shared-cache/${encodeURIComponent(entry.namespace)}/${encodeURIComponent(entry.cacheKey)}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Cache entry deleted" });
      invalidateList();
    },
    onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: async (namespace: string) => {
      await apiRequest("POST", "/api/admin/shared-cache/clear-namespace", { namespace });
    },
    onSuccess: (_d, namespace) => {
      toast({ title: `Cleared "${namespace}" cache` });
      invalidateList();
    },
    onError: () => toast({ title: "Failed to clear namespace", variant: "destructive" }),
  });

  const refreshMutation = useMutation({
    mutationFn: async (entry: CacheEntrySummary) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/shared-cache/${encodeURIComponent(entry.namespace)}/${encodeURIComponent(entry.cacheKey)}/refresh`,
      );
      return res.json() as Promise<{ refreshed: boolean; purged: boolean; error?: string }>;
    },
    onSuccess: (outcome) => {
      if (!outcome.refreshed && outcome.error) {
        toast({ title: "Refresh failed", description: outcome.error, variant: "destructive" });
      } else {
        toast({ title: outcome.purged ? "Cache entry purged" : "Cache entry refreshed" });
      }
      invalidateList();
    },
    onError: () => toast({ title: "Failed to refresh entry", variant: "destructive" }),
  });

  const { data: detailEntry, isLoading: detailLoading } = useQuery<CacheEntrySummary & { valueJson: unknown; valueText: string | null }>({
    queryKey: ["/api/admin/shared-cache", detail?.namespace, detail?.cacheKey],
    enabled: !!detail,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/shared-cache/${encodeURIComponent(detail!.namespace)}/${encodeURIComponent(detail!.cacheKey)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load entry");
      return res.json();
    },
  });

  const entries = data?.entries ?? [];
  const namespaces = data?.namespaces ?? [];

  return (
    <div className="p-6 space-y-6" data-testid="page-shared-cache">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <DatabaseZap className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Shared Cache</h1>
            <p className="text-sm text-muted-foreground">
              Postgres-backed cache that lets displays keep serving the last good data when an upstream is slow or down.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-namespace">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All namespaces</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => invalidateList()} data-testid="button-refresh" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {isFullAccess && namespaceFilter !== "all" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-clear-namespace">
                  <Trash2 className="h-4 w-4 mr-2" /> Clear namespace
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear "{namespaceFilter}" cache?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes every cached entry in this namespace across all sites. Displays will recompute fresh data on their next refresh.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearMutation.mutate(namespaceFilter)}>
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-empty">
              No cache entries yet. They appear as displays request data.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Namespace</th>
                    <th className="py-2 pr-4 font-medium">Key</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Updated</th>
                    <th className="py-2 pr-4 font-medium">Expires</th>
                    <th className="py-2 pr-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0" data-testid={`row-cache-${e.id}`}>
                      <td className="py-2 pr-4 whitespace-nowrap">{e.namespace}</td>
                      <td className="py-2 pr-4 font-mono text-xs max-w-[220px] truncate" title={e.cacheKey}>{e.cacheKey}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className={STATUS_COLOUR[e.status] ?? ""} data-testid={`status-${e.id}`}>
                          {e.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatBytes(e.sizeBytes)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{relative(e.lastUpdatedAt)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {e.expired ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <Clock className="h-3 w-3" /> expired
                          </span>
                        ) : (
                          relative(e.expiresAt)
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetail({ namespace: e.namespace, cacheKey: e.cacheKey })}
                            data-testid={`button-view-${e.id}`}
                            title="View value"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => refreshMutation.mutate(e)}
                            disabled={refreshMutation.isPending}
                            data-testid={`button-refresh-${e.id}`}
                            title="Refresh (recompute now)"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-delete-${e.id}`} title="Delete">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete cache entry?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The display will recompute fresh data on its next refresh.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(e)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm break-all">
              {detail?.namespace} / {detail?.cacheKey}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : detailEntry ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span><span className="text-muted-foreground">Status:</span> {detailEntry.status}</span>
                <span><span className="text-muted-foreground">Source:</span> {detailEntry.source ?? "—"}</span>
                <span><span className="text-muted-foreground">Updated:</span> {relative(detailEntry.lastUpdatedAt)}</span>
              </div>
              {detailEntry.errorMessage && (
                <p className="text-sm text-destructive">Last error: {detailEntry.errorMessage}</p>
              )}
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs" data-testid="text-value">
                {detailEntry.valueText != null
                  ? detailEntry.valueText
                  : JSON.stringify(detailEntry.valueJson, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Entry not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
