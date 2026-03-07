import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  Monitor,
  Users,
  Calendar,
  Image,
  PlayCircle,
  Zap,
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  FileText,
  LogIn,
  Plus,
  Pencil,
  Trash2,
  Key,
  Shield,
  LogOut,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Client, Event, Screen, MediaAsset, Programme, LiveOverride } from "@shared/schema";

interface HealthData {
  status: "healthy" | "unhealthy";
  timestamp: string;
  database: string;
  screensOnline: number;
  totalScreens: number;
  activeOverrides: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  href,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  href?: string;
  trend?: { value: number; label: string };
}) {
  const content = (
    <Card className={href ? "hover-elevate cursor-pointer transition-all" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 text-xs">
            <span className={trend.value >= 0 ? "text-green-600" : "text-red-600"}>
              {trend.value >= 0 ? "+" : ""}{trend.value}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href} data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>{content}</Link>;
  }
  return content;
}

function ScreenStatusCard({ screens }: { screens: Screen[] }) {
  const onlineScreens = screens.filter((s) => s.isOnline);
  const offlineScreens = screens.filter((s) => !s.isOnline && s.isPaired);
  const unpaired = screens.filter((s) => !s.isPaired);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Screen Status</CardTitle>
        <Link href="/screens">
          <Button variant="ghost" size="sm" data-testid="button-view-screens">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-green-500/10">
            <div className="text-2xl font-bold text-green-600">{onlineScreens.length}</div>
            <div className="text-xs text-muted-foreground">Online</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-500/10">
            <div className="text-2xl font-bold text-red-600">{offlineScreens.length}</div>
            <div className="text-xs text-muted-foreground">Offline</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-500/10">
            <div className="text-2xl font-bold text-amber-600">{unpaired.length}</div>
            <div className="text-xs text-muted-foreground">Unpaired</div>
          </div>
        </div>

        {onlineScreens.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recently Active</p>
            <div className="space-y-1">
              {onlineScreens.slice(0, 3).map((screen) => (
                <div
                  key={screen.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse-online" />
                    <span className="text-sm font-medium">{screen.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{screen.location}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveOverridesCard({ overrides }: { overrides: LiveOverride[] }) {
  const activeOverrides = overrides.filter(
    (o) => o.isActive && new Date(o.endTime) > new Date()
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Live Overrides</CardTitle>
        <Link href="/live-override">
          <Button variant="ghost" size="sm" data-testid="button-view-overrides">
            Manage
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {activeOverrides.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active overrides</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOverrides.map((override) => (
              <div
                key={override.id}
                className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium">{override.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(override.endTime).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
                  Active
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard() {
  const actions = [
    { icon: Monitor, label: "Add Screen", href: "/screens/new" },
    { icon: Image, label: "Upload Media", href: "/media" },
    { icon: PlayCircle, label: "New Programme", href: "/programmes/new" },
    { icon: Zap, label: "Create Override", href: "/live-override/new" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col gap-2 hover-elevate"
                data-testid={`button-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <action.icon className="h-5 w-5" />
                <span className="text-xs">{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SystemHealthCard({ health, isLoading }: { health?: HealthData; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const isHealthy = health?.status === "healthy";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">API Server</span>
          </div>
          <Badge variant="secondary" className={isHealthy ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}>
            {isHealthy ? "Healthy" : "Unhealthy"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {health?.database === "connected" ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">Database</span>
          </div>
          <Badge variant="secondary" className={health?.database === "connected" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}>
            {health?.database === "connected" ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm">Screens Online</span>
          </div>
          <Badge variant="secondary">
            {health?.screensOnline || 0}/{health?.totalScreens || 0}
          </Badge>
        </div>
        <Link href="/diagnostics" className="block pt-2">
          <Button variant="outline" className="w-full" size="sm" data-testid="button-view-diagnostics">
            View Diagnostics
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

interface AdminStats {
  loginsToday: number;
  activeUsersWeek: number;
  changesThisWeek: number;
  totalLogs: number;
  totalUsers: number;
  activeUsers: number;
  totalClients: number;
  totalScreens: number;
  onlineScreens: number;
  totalMedia: number;
  activeOverrides: number;
}

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

const ACTION_ICONS: Record<string, { icon: typeof Plus; colour: string }> = {
  create: { icon: Plus, colour: "text-green-600" },
  update: { icon: Pencil, colour: "text-blue-600" },
  delete: { icon: Trash2, colour: "text-red-600" },
  login: { icon: LogIn, colour: "text-purple-600" },
  logout: { icon: LogOut, colour: "text-purple-600" },
  change_password: { icon: Key, colour: "text-amber-600" },
  reset_password: { icon: Key, colour: "text-amber-600" },
  admin_reset_password: { icon: Key, colour: "text-amber-600" },
  force_change_password: { icon: Shield, colour: "text-amber-600" },
  publish: { icon: Plus, colour: "text-green-600" },
  assign_site: { icon: Plus, colour: "text-blue-600" },
  remove_site: { icon: Trash2, colour: "text-red-600" },
};

const ENTITY_LABELS: Record<string, string> = {
  auth: "authentication",
  client: "client",
  event: "event",
  screen: "screen",
  screen_group: "screen group",
  display_profile: "display profile",
  media: "media",
  layout: "layout",
  programme: "programme",
  playlist: "playlist",
  live_override: "live override",
  user: "user",
};

function getAuditDescription(entry: AuditLogEntry): string {
  const userName = entry.user
    ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ").trim() || entry.user.email || "Unknown"
    : "Unknown";
  const entityName = entry.payload?.name || entry.payload?.email || "";
  const entityLabel = ENTITY_LABELS[entry.entityType] || entry.entityType;

  if (entry.action === "login") return `${userName} logged in`;
  if (entry.action === "logout") return `${userName} logged out`;
  if (entry.action === "change_password") return `${userName} changed password`;

  const actionLabels: Record<string, string> = {
    create: "created", update: "updated", delete: "deleted",
    publish: "published", unpair: "unpaired",
    admin_reset_password: "reset password for",
    force_change_password: "forced password change for",
    assign_site: "assigned site to",
    remove_site: "removed site from",
    regenerate_pairing: "regenerated pairing for",
    reset_password: "reset password",
  };
  const verb = actionLabels[entry.action] || entry.action;
  const nameStr = entityName ? ` '${entityName}'` : "";
  return `${userName} ${verb} ${entityLabel}${nameStr}`;
}

function RecentActivityCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useQuery<{ logs: AuditLogEntry[]; total: number }>({
    queryKey: ["/api/admin/audit-logs?limit=8"],
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
        <Link href="/admin/activity">
          <Button variant="ghost" size="sm" data-testid="button-view-activity">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !data?.logs.length ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {data.logs.map((entry) => {
              const config = ACTION_ICONS[entry.action] || { icon: FileText, colour: "text-muted-foreground" };
              const Icon = config.icon;
              return (
                <div key={entry.id} className="flex items-center gap-3 py-1.5" data-testid={`recent-activity-${entry.id}`}>
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${config.colour}`} />
                  <p className="text-xs flex-1 min-w-0 truncate">{getAuditDescription(entry)}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminStatsCard({ isAdmin }: { isAdmin: boolean }) {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">User & Activity Stats</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : stats ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between" data-testid="stat-total-users">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm">Total Users</span>
              </div>
              <span className="text-sm font-semibold" data-testid="text-total-users-value">{stats.totalUsers}</span>
            </div>
            <div className="flex items-center justify-between" data-testid="stat-active-this-week">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm">Active This Week</span>
              </div>
              <span className="text-sm font-semibold" data-testid="text-active-week-value">{stats.activeUsersWeek}</span>
            </div>
            <div className="flex items-center justify-between" data-testid="stat-logins-today">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-purple-500" />
                <span className="text-sm">Logins Today</span>
              </div>
              <span className="text-sm font-semibold" data-testid="text-logins-today-value">{stats.loginsToday}</span>
            </div>
            <div className="flex items-center justify-between" data-testid="stat-changes-this-week">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Changes This Week</span>
              </div>
              <span className="text-sm font-semibold" data-testid="text-changes-week-value">{stats.changesThisWeek}</span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface ClientStat {
  clientId: string;
  clientName: string;
  screensOnline: number;
  screensTotal: number;
  activeEvents: number;
  mediaCount: number;
  activeOverrides: number;
}

function ClientStatsCard({ isAdmin }: { isAdmin: boolean }) {
  const { data: clientStats, isLoading } = useQuery<ClientStat[]>({
    queryKey: ["/api/admin/stats/by-client"],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Stats by Site</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !clientStats?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No sites configured</p>
        ) : (
          <div className="space-y-3">
            {clientStats.map((stat) => (
              <div
                key={stat.clientId}
                className="p-3 rounded-lg border"
                data-testid={`client-stat-${stat.clientId}`}
              >
                <p className="text-sm font-medium mb-2" data-testid={`text-client-name-${stat.clientId}`}>{stat.clientName}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold" data-testid={`text-client-screens-${stat.clientId}`}>
                      {stat.screensOnline}/{stat.screensTotal}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Screens</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" data-testid={`text-client-events-${stat.clientId}`}>
                      {stat.activeEvents}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Events</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" data-testid={`text-client-media-${stat.clientId}`}>
                      {stat.mediaCount}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Media</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" data-testid={`text-client-overrides-${stat.clientId}`}>
                      {stat.activeOverrides}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Overrides</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: media = [], isLoading: mediaLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media"],
  });

  const { data: programmes = [], isLoading: programmesLoading } = useQuery<Programme[]>({
    queryKey: ["/api/programmes"],
  });

  const { data: overrides = [], isLoading: overridesLoading } = useQuery<LiveOverride[]>({
    queryKey: ["/api/live-overrides"],
  });

  const { data: health, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["/api/health"],
    refetchInterval: 30000,
  });

  const isLoading = clientsLoading || eventsLoading || screensLoading || mediaLoading || programmesLoading || overridesLoading;

  const activeEvents = events.filter((e) => e.isActive);
  const onlineScreens = screens.filter((s) => s.isOnline);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your display management system
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Clients"
              value={clients.length}
              icon={Users}
              description={`${activeEvents.length} active events`}
              href="/clients"
            />
            <StatCard
              title="Screens Online"
              value={`${onlineScreens.length}/${screens.length}`}
              icon={Monitor}
              description={`${screens.filter((s) => s.isPaired).length} paired`}
              href="/screens"
            />
            <StatCard
              title="Media Assets"
              value={media.length}
              icon={Image}
              description="Images, videos, and GIFs"
              href="/media"
            />
            <StatCard
              title="Active Programmes"
              value={programmes.length}
              icon={PlayCircle}
              description={`${overrides.filter((o) => o.isActive).length} live overrides`}
              href="/programmes"
            />
          </>
        )}
      </div>

      {/* Admin Stats Row */}
      {user?.role === "admin" && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentActivityCard isAdmin={true} />
            </div>
            <AdminStatsCard isAdmin={true} />
          </div>
          <ClientStatsCard isAdmin={true} />
        </>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Screen Status - Takes 2 columns */}
        <div className="lg:col-span-2">
          {screensLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScreenStatusCard screens={screens} />
          )}
        </div>

        {/* Quick Actions */}
        <QuickActionsCard />

        {/* Active Overrides - Takes 2 columns */}
        <div className="lg:col-span-2">
          {overridesLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32" />
              </CardContent>
            </Card>
          ) : (
            <ActiveOverridesCard overrides={overrides} />
          )}
        </div>

        {/* System Health */}
        <SystemHealthCard health={health} isLoading={healthLoading} />
      </div>
    </div>
  );
}
