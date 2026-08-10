import { Switch, Route, useRoute, Redirect, Link } from "wouter";
import { HelpCircle } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { SiteProvider } from "@/hooks/use-site-context";
import { CustomFontFaces } from "@/lib/fontFace";
import type { CustomFont } from "@shared/schema";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ChangePasswordPage from "@/pages/change-password";
import Setup2FAPage from "@/pages/setup-2fa";
import SetupPage from "@/pages/setup";
import Dashboard from "@/pages/dashboard";
import ClientsPage from "@/pages/clients";
import EventsPage from "@/pages/events";
import ScreensPage from "@/pages/screens";
import MediaPage from "@/pages/media";
import LayoutsPage from "@/pages/layouts";
import PlaylistsPage from "@/pages/playlists";
import ScreenGroupsPage from "@/pages/screen-groups";
import ProgrammesPage from "@/pages/programmes";
import LiveOverridePage from "@/pages/live-override";
import DiagnosticsPage from "@/pages/diagnostics";
import SimulatorPage from "@/pages/simulator";
import SchedulePage from "@/pages/schedule";
import SettingsPage from "@/pages/settings";
import AdminUsersPage from "@/pages/admin-users";
import AdminDisplayProfilesPage from "@/pages/admin-display-profiles";
import ActivityLogPage from "@/pages/activity-log";
import StreamingServerPage from "@/pages/streaming-server";
import ControlPanelPage from "@/pages/control-panel";
import PlayerPage from "@/pages/player";
import { MonitorPage } from "@/pages/monitor";
import HelpPage from "@/pages/help";
import AgendaItemsPage from "@/pages/agenda-items";
import AgendaConfigsPage from "@/pages/agenda-configs";
import DisplayAgendaPage from "@/pages/display-agenda";
import SweepstakePage from "@/pages/sweepstake";
import DisplaySweepstakePage from "@/pages/display-sweepstake";
import FontsPage from "@/pages/fonts";
import SharedCachePage from "@/pages/admin-shared-cache";

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "admin" && user?.role !== "account_manager") {
    return <Redirect to="/" />;
  }
  return <Component />;
}

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/screens" component={ScreensPage} />
      <Route path="/media" component={MediaPage} />
      <Route path="/layouts" component={LayoutsPage} />
      <Route path="/playlists" component={PlaylistsPage} />
      <Route path="/screen-groups" component={ScreenGroupsPage} />
      <Route path="/programmes" component={ProgrammesPage} />
      <Route path="/live-override" component={LiveOverridePage} />
      <Route path="/diagnostics" component={DiagnosticsPage} />
      <Route path="/simulator" component={SimulatorPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route path="/admin/users">{() => <AdminRoute component={AdminUsersPage} />}</Route>
      <Route path="/admin/display-profiles">{() => <AdminRoute component={AdminDisplayProfilesPage} />}</Route>
      <Route path="/admin/activity">{() => <AdminRoute component={ActivityLogPage} />}</Route>
      <Route path="/admin/shared-cache">{() => <AdminRoute component={SharedCachePage} />}</Route>
      <Route path="/control-panel" component={ControlPanelPage} />
      <Route path="/agenda" component={AgendaItemsPage} />
      <Route path="/agenda/displays" component={AgendaConfigsPage} />
      <Route path="/sweepstake" component={SweepstakePage} />
      <Route path="/fonts" component={FontsPage} />
      <Route path="/admin/streaming">{() => <AdminRoute component={StreamingServerPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// Task #281: inject @font-face for every custom font the operator can
// access so uploaded fonts render in the admin previews (layout editor,
// agenda preview, the font picker's own option list).
function CustomFontLoader() {
  const { data: fonts } = useQuery<CustomFont[]>({
    queryKey: ["/api/fonts", undefined],
    queryFn: async () => {
      const res = await fetch("/api/fonts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  return <CustomFontFaces fonts={fonts} />;
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SiteProvider>
      <CustomFontLoader />
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-lg px-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  title="Help & Manual"
                  data-testid="button-help"
                >
                  <Link href="/help" aria-label="Help & Manual">
                    <HelpCircle className="h-5 w-5" />
                  </Link>
                </Button>
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto p-6">
              <AuthenticatedRouter />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </SiteProvider>
  );
}

function MonitorRoute() {
  const [match, params] = useRoute("/monitor/:screenId");
  if (!match) return null;
  return <MonitorPage />;
}

function PlayerRoute() {
  const [matchWithId, params] = useRoute("/player/:screenId");
  const [matchBase] = useRoute("/player");
  if (matchWithId && params?.screenId) {
    return <PlayerPage screenId={params.screenId} />;
  }
  if (matchBase) {
    return <PlayerPage screenId="" />;
  }
  return null;
}

function AppContent() {
  const [isPlayerRouteWithId] = useRoute("/player/:screenId");
  const [isPlayerRouteBase] = useRoute("/player");
  const isPlayerRoute = isPlayerRouteWithId || isPlayerRouteBase;

  // Task #330 — chromeless monitor display (Operations API / Multiview).
  const [isMonitorRoute] = useRoute("/monitor/:screenId");
  if (isMonitorRoute) {
    return <MonitorRoute />;
  }

  // Task #208 — chromeless public agenda display, no auth/sidebar.
  const [isAgendaDisplayRoute] = useRoute("/display/agenda/:configId");
  if (isAgendaDisplayRoute) {
    return <DisplayAgendaPage />;
  }

  // Task #286 — chromeless public sweepstake display, no auth/sidebar.
  const [isSweepstakeDisplayRoute] = useRoute("/display/sweepstake/:configId");
  if (isSweepstakeDisplayRoute) {
    return <DisplaySweepstakePage />;
  }

  const [isLoginRoute] = useRoute("/login");
  const [isForgotRoute] = useRoute("/forgot-password");
  const [isResetRoute] = useRoute("/reset-password/:token");
  const [isSetupRoute] = useRoute("/setup");
  const isPublicAuthRoute = isLoginRoute || isForgotRoute || isResetRoute || isSetupRoute;

  const { user, isLoading } = useAuth();

  const { data: setupStatus } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/auth/setup-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/setup-status");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isPlayerRoute) {
    return <PlayerRoute />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (setupStatus?.needsSetup && !user) {
    if (isSetupRoute) return <SetupPage />;
    return <Redirect to="/setup" />;
  }

  if (isPublicAuthRoute && !user) {
    if (isLoginRoute) return <LoginPage />;
    if (isForgotRoute) return <ForgotPasswordPage />;
    if (isResetRoute) return <ResetPasswordPage />;
    if (isSetupRoute) return <SetupPage />;
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/setup" component={SetupPage} />
        <Route>{() => <LoginPage />}</Route>
      </Switch>
    );
  }

  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  if (!user.twoFactorEnabled) {
    return <Setup2FAPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
