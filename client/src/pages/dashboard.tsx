import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
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

export default function Dashboard() {
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
            Overview of your digital signage system
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
