import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Building2, Plus, X, UserCog, Trash2 } from "lucide-react";
import type { Client } from "@shared/schema";
import type { User, UserSite } from "@shared/models/auth";

type UserWithSites = User & { sites: UserSite[] };

function UserCard({
  user,
  allClients,
  currentUserId,
  onRoleChange,
  onAssignSite,
  onRemoveSite,
  onDelete,
  isRoleUpdating,
  isDeleting,
}: {
  user: UserWithSites;
  allClients: Client[];
  currentUserId: string;
  onRoleChange: (userId: string, role: string) => void;
  onAssignSite: (userId: string) => void;
  onRemoveSite: (userId: string, clientId: string) => void;
  onDelete: (userId: string) => void;
  isRoleUpdating: boolean;
  isDeleting: boolean;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <Card data-testid={`card-user-${user.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.firstName || "User"}
                className="h-10 w-10 rounded-full"
                data-testid={`img-avatar-${user.id}`}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <p className="font-medium" data-testid={`text-username-${user.id}`}>
                {user.firstName} {user.lastName}
                {isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
              </p>
              <p className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={user.role}
              onValueChange={(role) => onRoleChange(user.id, role)}
              disabled={isSelf}
            >
              <SelectTrigger className="w-[140px]" data-testid={`select-role-trigger-${user.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    Admin
                  </div>
                </SelectItem>
                <SelectItem value="site_user">
                  <div className="flex items-center gap-2">
                    <UserCog className="h-3.5 w-3.5" />
                    Site User
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {!isSelf && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid={`button-delete-user-${user.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {user.firstName} {user.lastName} ({user.email})? This will remove their account and all site assignments. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(user.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {user.role !== "admin" && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Assigned Sites</p>
              <Button variant="outline" size="sm" onClick={() => onAssignSite(user.id)} data-testid={`button-assign-site-${user.id}`}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Assign Site
              </Button>
            </div>

            {user.sites.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No sites assigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.sites.map((site) => {
                  const client = allClients?.find(c => c.id === site.clientId);
                  return (
                    <Badge
                      key={site.id}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                      data-testid={`badge-site-${site.clientId}`}
                    >
                      <Building2 className="h-3 w-3" />
                      {client?.name || site.clientId}
                      <button
                        onClick={() => onRemoveSite(user.id, site.clientId)}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                        data-testid={`button-remove-site-${site.clientId}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {user.role === "admin" && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground italic">Admins have access to all sites</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [assignDialogUserId, setAssignDialogUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: usersData, isLoading: usersLoading } = useQuery<UserWithSites[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete user", variant: "destructive" });
    },
  });

  const assignSiteMutation = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/sites`, { clientId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setAssignDialogUserId(null);
      setSelectedClientId("");
      toast({ title: "Site assigned" });
    },
    onError: () => {
      toast({ title: "Failed to assign site", variant: "destructive" });
    },
  });

  const removeSiteMutation = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}/sites/${clientId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Site access removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove site access", variant: "destructive" });
    },
  });

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const assignDialogUser = usersData?.find(u => u.id === assignDialogUserId);
  const assignedClientIds = assignDialogUser?.sites.map(s => s.clientId) || [];
  const availableClients = allClients?.filter(c => !assignedClientIds.includes(c.id)) || [];

  const admins = usersData?.filter(u => u.role === "admin") || [];
  const unassigned = usersData?.filter(u => u.role !== "admin" && u.sites.length === 0) || [];

  const siteGroups: { client: Client; users: UserWithSites[] }[] = [];
  if (allClients) {
    for (const client of allClients) {
      const siteUsers = usersData?.filter(
        u => u.role !== "admin" && u.sites.some(s => s.clientId === client.id)
      ) || [];
      if (siteUsers.length > 0) {
        siteGroups.push({ client, users: siteUsers });
      }
    }
  }

  const renderUserCard = (user: UserWithSites) => (
    <UserCard
      key={user.id}
      user={user}
      allClients={allClients || []}
      currentUserId={currentUser?.id || ""}
      onRoleChange={(userId, role) => updateRoleMutation.mutate({ userId, role })}
      onAssignSite={(userId) => setAssignDialogUserId(userId)}
      onRemoveSite={(userId, clientId) => removeSiteMutation.mutate({ userId, clientId })}
      onDelete={(userId) => deleteUserMutation.mutate(userId)}
      isRoleUpdating={updateRoleMutation.isPending}
      isDeleting={deleteUserMutation.isPending}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-admin-users-title">User Management</h1>
        <p className="text-muted-foreground">Manage user roles and site access</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-user-view">
          <TabsTrigger value="all" data-testid="tab-all-users">
            All Users ({usersData?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="by-site" data-testid="tab-by-site">
            By Site
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {usersData?.map(renderUserCard)}
        </TabsContent>

        <TabsContent value="by-site" className="space-y-6 mt-4">
          {admins.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold" data-testid="text-group-admins">Administrators</h2>
                <Badge variant="secondary" className="ml-1">{admins.length}</Badge>
              </div>
              <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                {admins.map(renderUserCard)}
              </div>
            </div>
          )}

          {siteGroups.map(({ client, users: siteUsers }) => (
            <div key={client.id}>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold" data-testid={`text-group-site-${client.id}`}>{client.name}</h2>
                <Badge variant="secondary" className="ml-1">{siteUsers.length}</Badge>
              </div>
              <div className="space-y-3 pl-6 border-l-2 border-muted-foreground/20">
                {siteUsers.map(renderUserCard)}
              </div>
            </div>
          ))}

          {unassigned.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold" data-testid="text-group-unassigned">Unassigned Users</h2>
                <Badge variant="secondary" className="ml-1">{unassigned.length}</Badge>
              </div>
              <div className="space-y-3 pl-6 border-l-2 border-muted-foreground/20">
                {unassigned.map(renderUserCard)}
              </div>
            </div>
          )}

          {siteGroups.length === 0 && unassigned.length === 0 && admins.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No users found</p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!assignDialogUserId} onOpenChange={(open) => {
        if (!open) {
          setAssignDialogUserId(null);
          setSelectedClientId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Site to {assignDialogUser?.firstName} {assignDialogUser?.lastName}</DialogTitle>
            <DialogDescription>Select a site to give this user access to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {availableClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No more sites available to assign.</p>
            ) : (
              <>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-assign-client">
                    <SelectValue placeholder="Select a site..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (selectedClientId && assignDialogUserId) {
                      assignSiteMutation.mutate({ userId: assignDialogUserId, clientId: selectedClientId });
                    }
                  }}
                  disabled={!selectedClientId || assignSiteMutation.isPending}
                  className="w-full"
                  data-testid="button-confirm-assign"
                >
                  {assignSiteMutation.isPending ? "Assigning..." : "Assign Site"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
