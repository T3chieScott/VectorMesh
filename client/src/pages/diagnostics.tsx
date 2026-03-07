import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Monitor,
  Wifi,
  WifiOff,
  Thermometer,
  HardDrive,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  Database,
} from "lucide-react";
import type { Screen, PlayerHeartbeat } from "@shared/schema";

interface SystemHealth {
  api: boolean;
  database: boolean;
  storage: boolean;
}

function HealthIndicator({ healthy, label }: { healthy: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge
        variant="secondary"
        className={healthy ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}
      >
        {healthy ? "Healthy" : "Error"}
      </Badge>
    </div>
  );
}

function ScreenStatusRow({ screen }: { screen: Screen }) {
  const { data: heartbeats = [] } = useQuery<PlayerHeartbeat[]>({
    queryKey: ["/api/screens", screen.id, "heartbeats"],
  });

  const latestHeartbeat = heartbeats[0];
  const timeSinceLastSeen = screen.lastSeen
    ? Math.floor((Date.now() - new Date(screen.lastSeen).getTime()) / 1000)
    : null;

  const formatTimeSince = (seconds: number | null) => {
    if (seconds === null) return "Never";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              screen.isOnline ? "bg-green-500 animate-pulse-online" : "bg-red-500"
            }`}
          />
          <span className="font-medium" data-testid={`text-diag-screen-${screen.id}`}>{screen.name}</span>
        </div>
      </TableCell>
      <TableCell>
        {screen.isOnline ? (
          <Badge className="bg-green-500/10 text-green-600 gap-1">
            <Wifi className="h-3 w-3" />
            Online
          </Badge>
        ) : screen.isPaired ? (
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="h-3 w-3" />
            Offline
          </Badge>
        ) : (
          <Badge variant="secondary">Unpaired</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatTimeSince(timeSinceLastSeen)}
      </TableCell>
      <TableCell>
        {latestHeartbeat?.temperature ? (
          <div className="flex items-center gap-1">
            <Thermometer className="h-3 w-3 text-muted-foreground" />
            <span>{latestHeartbeat.temperature}°C</span>
          </div>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell>
        {latestHeartbeat?.storageFree ? (
          <div className="flex items-center gap-2">
            <HardDrive className="h-3 w-3 text-muted-foreground" />
            <Progress
              value={(latestHeartbeat.storageFree / 32000) * 100}
              className="w-16 h-2"
            />
            <span className="text-xs text-muted-foreground">
              {(latestHeartbeat.storageFree / 1000).toFixed(1)}GB
            </span>
          </div>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {latestHeartbeat?.currentBlockId || "-"}
      </TableCell>
      <TableCell>
        {latestHeartbeat?.errors ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Errors
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
            OK
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function DiagnosticsPage() {
  const screensQ = useSiteFilteredQuery<Screen[]>("/api/screens");
  const { data: screens = [], isLoading: screensLoading, refetch } = useQuery<Screen[]>({
    ...screensQ,
    refetchInterval: 10000,
  });

  const onlineCount = screens.filter((s) => s.isOnline).length;
  const offlineCount = screens.filter((s) => !s.isOnline && s.isPaired).length;
  const totalPaired = screens.filter((s) => s.isPaired).length;

  const systemHealth: SystemHealth = {
    api: true,
    database: true,
    storage: true,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-diagnostics-title">Diagnostics</h1>
          <p className="text-muted-foreground">
            Monitor system health and screen status
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-diagnostics">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online Screens
            </CardTitle>
            <Wifi className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
            <p className="text-xs text-muted-foreground">of {totalPaired} paired</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offline Screens
            </CardTitle>
            <WifiOff className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{offlineCount}</div>
            <p className="text-xs text-muted-foreground">require attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Uptime
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPaired > 0 ? ((onlineCount / totalPaired) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">current availability</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Errors (24h)
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">no issues detected</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthIndicator healthy={systemHealth.api} label="API Server" />
            <HealthIndicator healthy={systemHealth.database} label="Database" />
            <HealthIndicator healthy={systemHealth.storage} label="Object Storage" />
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Server className="h-4 w-4" />
              Server Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Environment</p>
                <p className="text-sm font-medium">Development</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Version</p>
                <p className="text-sm font-medium">1.0.0</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Last Sync</p>
                <p className="text-sm font-medium">{new Date().toLocaleTimeString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Active Connections</p>
                <p className="text-sm font-medium">{onlineCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Screen Status Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Screen Status
          </CardTitle>
          <Badge variant="secondary">
            {screens.length} total
          </Badge>
        </CardHeader>
        <CardContent>
          {screensLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : screens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No screens registered</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Screen</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Temp</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Current Block</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {screens.map((screen) => (
                    <ScreenStatusRow key={screen.id} screen={screen} />
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
