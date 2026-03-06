import { Switch, Route, useRoute, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
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
import PlayerPage from "@/pages/player";

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
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
      <Route path="/admin/users">{() => <AdminRoute component={AdminUsersPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-lg px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
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
  const { user, isLoading } = useAuth();

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

  if (!user) {
    return <LandingPage />;
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
