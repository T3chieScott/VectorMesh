import { useLocation, Link } from "wouter";
import {
  Monitor,
  Users,
  Calendar,
  CalendarClock,
  Image,
  Layout,
  PlayCircle,
  Zap,
  Activity,
  Settings,
  LayoutDashboard,
  Tv2,
  FolderOpen,
  Shield,
  FileText,
  Building2,
  ChevronsUpDown,
  Check,
  Globe,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useSiteContext } from "@/hooks/use-site-context";

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
  },
  {
    title: "Events",
    url: "/events",
    icon: Calendar,
  },
];

const contentNavItems = [
  {
    title: "Media Library",
    url: "/media",
    icon: Image,
  },
  {
    title: "Layouts",
    url: "/layouts",
    icon: Layout,
  },
  {
    title: "Playlists",
    url: "/playlists",
    icon: FolderOpen,
  },
];

const displayNavItems = [
  {
    title: "Screens",
    url: "/screens",
    icon: Monitor,
  },
  {
    title: "Screen Groups",
    url: "/screen-groups",
    icon: Tv2,
  },
  {
    title: "Programmes",
    url: "/programmes",
    icon: PlayCircle,
  },
  {
    title: "Live Override",
    url: "/live-override",
    icon: Zap,
  },
];

const systemNavItems = [
  {
    title: "Schedule Timeline",
    url: "/schedule",
    icon: CalendarClock,
  },
  {
    title: "Diagnostics",
    url: "/diagnostics",
    icon: Activity,
  },
  {
    title: "Player Simulator",
    url: "/simulator",
    icon: Tv2,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const adminNavItems = [
  {
    title: "User Management",
    url: "/admin/users",
    icon: Shield,
  },
  {
    title: "Activity Log",
    url: "/admin/activity",
    icon: FileText,
  },
];

function SiteSelector() {
  const { selectedClientId, setSelectedClientId, clients, selectedClient, hasSingleSite, isLoading } = useSiteContext();
  const { user } = useAuth();

  if (isLoading || clients.length === 0) return null;

  if (hasSingleSite) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5" data-testid="site-selector-single">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium truncate">{clients[0].name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-sidebar-accent transition-colors"
          data-testid="site-selector-trigger"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
            {selectedClient ? (
              <Building2 className="h-4 w-4 text-primary" />
            ) : (
              <Globe className="h-4 w-4 text-primary" />
            )}
          </div>
          <span className="text-sm font-medium truncate flex-1">
            {selectedClient ? selectedClient.name : "All Sites"}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
        {user?.role === "admin" && (
          <>
            <DropdownMenuItem
              onClick={() => setSelectedClientId(null)}
              data-testid="site-selector-all"
            >
              <Globe className="h-4 w-4 mr-2" />
              <span className="flex-1">All Sites</span>
              {!selectedClientId && <Check className="h-4 w-4 ml-2" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {clients.map((client) => (
          <DropdownMenuItem
            key={client.id}
            onClick={() => setSelectedClientId(client.id)}
            data-testid={`site-selector-item-${client.id}`}
          >
            <Building2 className="h-4 w-4 mr-2" />
            <span className="flex-1 truncate">{client.name}</span>
            {selectedClientId === client.id && <Check className="h-4 w-4 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  const NavGroup = ({
    label,
    items,
  }: {
    label: string;
    items: typeof mainNavItems;
  }) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider font-medium">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.url)}
                className="gap-3"
              >
                <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border p-4 space-y-3">
        <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
          <img src="/vectormesh-app-icon.png" alt="VectorMesh" className="h-8 w-8 rounded-md" />
          <span className="text-base font-semibold leading-none">
            <span className="text-[#1a3a5c] dark:text-[#7eb8e0]">Vector</span><span className="text-[#0ea5e9]">Mesh</span>
          </span>
        </Link>
        <SiteSelector />
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <NavGroup label="Overview" items={mainNavItems} />
        <NavGroup label="Content" items={contentNavItems} />
        <NavGroup label="Display" items={displayNavItems} />
        <NavGroup label="System" items={systemNavItems} />
        {(user?.role === "admin" || user?.role === "account_manager") && (
          <NavGroup label="Admin" items={adminNavItems} />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                {user.firstName?.[0] || user.email?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate">
                {user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "User"}
              </span>
              <span className="text-xs text-sidebar-foreground/60 truncate">
                {user.email || "No email"}
              </span>
            </div>
            {(user.role === "admin" || user.role === "account_manager") && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-primary/30 text-primary shrink-0">
                {user.role === "admin" ? "Admin" : "Account Manager"}
              </Badge>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
