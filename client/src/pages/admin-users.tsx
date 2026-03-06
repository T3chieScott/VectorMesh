import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Building2, Plus, X, UserCog } from "lucide-react";
import type { Client } from "@shared/schema";
import type { User, UserSite } from "@shared/models/auth";

type UserWithSites = User & { sites: UserSite[] };

export default function AdminUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignDialogUserId, setAssignDialogUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-admin-users-title">User Management</h1>
        <p className="text-muted-foreground">Manage user roles and site access</p>
      </div>

      <div className="space-y-4">
        {usersData?.map((user) => (
          <Card key={user.id} data-testid={`card-user-${user.id}`}>
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
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Select
                    value={user.role}
                    onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}
                    data-testid={`select-role-${user.id}`}
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
                </div>
              </div>

              {user.role !== "admin" && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Assigned Sites</p>
                    <Dialog open={assignDialogUserId === user.id} onOpenChange={(open) => {
                      setAssignDialogUserId(open ? user.id : null);
                      if (!open) setSelectedClientId("");
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" data-testid={`button-assign-site-${user.id}`}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Assign Site
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Site to {assignDialogUser?.firstName} {assignDialogUser?.lastName}</DialogTitle>
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
                              onClick={() => removeSiteMutation.mutate({ userId: user.id, clientId: site.clientId })}
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
        ))}
      </div>
    </div>
  );
}
