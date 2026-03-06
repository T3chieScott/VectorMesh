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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

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
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
          <img src="/vectormesh-app-icon.png" alt="VectorMesh" className="h-9 w-9 rounded-md" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">
              VectorMesh
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Display Management
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <NavGroup label="Overview" items={mainNavItems} />
        <NavGroup label="Content" items={contentNavItems} />
        <NavGroup label="Display" items={displayNavItems} />
        <NavGroup label="System" items={systemNavItems} />
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
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
