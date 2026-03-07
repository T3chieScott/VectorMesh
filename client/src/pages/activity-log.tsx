import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Key,
  Shield,
  Filter,
  X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: any;
  timestamp: string;
  user: { firstName: string | null; lastName: string | null; email: string | null } | null;
}

interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
}

const ACTION_CONFIG: Record<string, { label: string; colour: string; icon: typeof Plus }> = {
  create: { label: "Created", colour: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800", icon: Plus },
  update: { label: "Updated", colour: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800", icon: Pencil },
  delete: { label: "Deleted", colour: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800", icon: Trash2 },
  login: { label: "Logged In", colour: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800", icon: LogIn },
  logout: { label: "Logged Out", colour: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800", icon: LogOut },
  change_password: { label: "Changed Password", colour: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800", icon: Key },
  reset_password: { label: "Reset Password", colour: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800", icon: Key },
  admin_reset_password: { label: "Admin Reset Password", colour: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800", icon: Key },
  force_change_password: { label: "Forced Password Change", colour: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800", icon: Shield },
  publish: { label: "Published", colour: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800", icon: Plus },
  regenerate_pairing: { label: "Regenerated Pairing", colour: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800", icon: Key },
  unpair: { label: "Unpaired", colour: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800", icon: X },
  assign_site: { label: "Assigned Site", colour: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800", icon: Plus },
  remove_site: { label: "Removed Site", colour: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800", icon: Trash2 },
};

const ENTITY_LABELS: Record<string, string> = {
  auth: "Authentication",
  client: "Client",
  event: "Event",
  screen: "Screen",
  screen_group: "Screen Group",
  display_profile: "Display Profile",
  media: "Media",
  layout: "Layout",
  programme: "Programme",
  playlist: "Playlist",
  live_override: "Live Override",
  user: "User",
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { label: action.replace(/_/g, " "), colour: "bg-muted text-muted-foreground border-border", icon: FileText };
}

function getUserName(entry: AuditLogEntry): string {
  if (!entry.user) return "Unknown user";
  const name = [entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ").trim();
  return name || entry.user.email || "Unknown user";
}

function getEntityName(entry: AuditLogEntry): string {
  if (entry.payload?.name) return entry.payload.name;
  if (entry.payload?.email) return entry.payload.email;
  return "";
}

function getDescription(entry: AuditLogEntry): string {
  const userName = getUserName(entry);
  const config = getActionConfig(entry.action);
  const entityLabel = ENTITY_LABELS[entry.entityType] || entry.entityType;
  const entityName = getEntityName(entry);

  if (entry.action === "login") return `${userName} logged in`;
  if (entry.action === "logout") return `${userName} logged out`;
  if (entry.action === "change_password") return `${userName} changed their password`;
  if (entry.action === "reset_password") return `${userName} reset their password`;
  if (entry.action === "admin_reset_password") return `${userName} reset password for ${entityName || "a user"}`;
  if (entry.action === "force_change_password") return `${userName} forced password change for ${entityName || "a user"}`;
  if (entry.action === "assign_site") return `${userName} assigned ${entry.payload?.clientName || "a site"} to a user`;
  if (entry.action === "remove_site") return `${userName} removed a site assignment from a user`;

  const nameStr = entityName ? ` '${entityName}'` : "";
  return `${userName} ${config.label.toLowerCase()} ${entityLabel.toLowerCase()}${nameStr}`;
}

function formatTimestamp(ts: string): { relative: string; absolute: string } {
  const date = new Date(ts);
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    absolute: format(date, "d MMM yyyy, HH:mm:ss"),
  };
}

const PAGE_SIZE = 25;

export default function ActivityLogPage() {
  const [page, setPage] = useState(0);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(PAGE_SIZE));
  queryParams.set("offset", String(page * PAGE_SIZE));
  if (entityTypeFilter && entityTypeFilter !== "all") queryParams.set("entityType", entityTypeFilter);
  if (actionFilter && actionFilter !== "all") queryParams.set("action", actionFilter);

  const { data, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: [`/api/admin/audit-logs?${queryParams.toString()}`],
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const hasFilters = entityTypeFilter !== "all" || actionFilter !== "all";

  const clearFilters = () => {
    setEntityTypeFilter("all");
    setActionFilter("all");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-activity-log-title">Activity Log</h1>
          <p className="text-muted-foreground">
            Review all system activity and changes{data ? ` — ${data.total.toLocaleString()} total entries` : ""}
          </p>
        </div>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasFilters && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              !
            </Badge>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card data-testid="card-filters">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(0); }}>
                  <SelectTrigger data-testid="select-filter-entity-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                  <SelectTrigger data-testid="select-filter-action">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    <X className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : data?.logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{hasFilters ? "No entries match your filters" : "No activity recorded yet"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {data?.logs.map((entry) => {
                const config = getActionConfig(entry.action);
                const Icon = config.icon;
                const ts = formatTimestamp(entry.timestamp);

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors"
                    data-testid={`row-audit-${entry.id}`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${config.colour.split(" ")[0]}`}>
                      <Icon className={`h-4 w-4 ${config.colour.split(" ")[1]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" data-testid={`text-audit-description-${entry.id}`}>
                        {getDescription(entry)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground" title={ts.absolute}>
                          {ts.relative}
                        </span>
                        <span className="text-xs text-muted-foreground/50">·</span>
                        <span className="text-xs text-muted-foreground">
                          {ENTITY_LABELS[entry.entityType] || entry.entityType}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${config.colour}`}>
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between" data-testid="pagination-controls">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
