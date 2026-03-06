import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Building2, Plus, X, UserCog, Trash2, UserPlus, Pencil, KeyRound, ShieldAlert, CircleCheck, CircleX } from "lucide-react";
import type { Client } from "@shared/schema";
import type { User, UserSite } from "@shared/models/auth";

type UserWithSites = Omit<User, "passwordHash"> & { sites: UserSite[] };

function UserCard({
  user,
  allClients,
  currentUserId,
  selected,
  onSelectToggle,
  onRoleChange,
  onAssignSite,
  onRemoveSite,
  onDelete,
  onEdit,
  onResetPassword,
  onForceChangePassword,
  isRoleUpdating,
  isDeleting,
}: {
  user: UserWithSites;
  allClients: Client[];
  currentUserId: string;
  selected: boolean;
  onSelectToggle: (userId: string) => void;
  onRoleChange: (userId: string, role: string) => void;
  onAssignSite: (userId: string) => void;
  onRemoveSite: (userId: string, clientId: string) => void;
  onDelete: (userId: string) => void;
  onEdit: (user: UserWithSites) => void;
  onResetPassword: (userId: string) => void;
  onForceChangePassword: (userId: string) => void;
  isRoleUpdating: boolean;
  isDeleting: boolean;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <Card data-testid={`card-user-${user.id}`} className={selected ? "ring-2 ring-destructive/50" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isSelf && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onSelectToggle(user.id)}
                data-testid={`checkbox-select-user-${user.id}`}
                className="shrink-0"
              />
            )}
            {isSelf && <div className="w-4" />}
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
              <div className="flex items-center gap-2">
                <p className="font-medium" data-testid={`text-username-${user.id}`}>
                  {user.firstName} {user.lastName}
                  {isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
                </p>
                {!user.isActive && (
                  <Badge variant="destructive" className="text-xs" data-testid={`badge-inactive-${user.id}`}>
                    <CircleX className="h-3 w-3 mr-1" />
                    Inactive
                  </Badge>
                )}
                {user.isActive && (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-200 dark:border-green-800" data-testid={`badge-active-${user.id}`}>
                    <CircleCheck className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
                {user.mustChangePassword && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 dark:border-amber-800" data-testid={`badge-must-change-${user.id}`}>
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Must Change Password
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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

            <Button variant="ghost" size="icon" onClick={() => onEdit(user)} data-testid={`button-edit-user-${user.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>

            {!isSelf && (
              <>
                <Button variant="ghost" size="icon" onClick={() => onResetPassword(user.id)} title="Reset Password" data-testid={`button-reset-password-${user.id}`}>
                  <KeyRound className="h-4 w-4" />
                </Button>

                <Button variant="ghost" size="icon" onClick={() => onForceChangePassword(user.id)} title="Force Password Change" data-testid={`button-force-change-${user.id}`}>
                  <ShieldAlert className="h-4 w-4" />
                </Button>

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
              </>
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

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("site_user");
  const [password, setPassword] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      onOpenChange(false);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("site_user");
      setPassword("");
    },
    onError: (err: any) => {
      toast({ title: err?.message?.includes("409") ? "Email already exists" : "Failed to create user", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>Add a new user account. They will receive a welcome email with their temporary password and must change it on first login.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({ email, firstName, lastName, role, password });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="create-firstName">First Name</Label>
              <Input id="create-firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-create-first-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-lastName">Last Name</Label>
              <Input id="create-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-create-last-name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-create-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">Temporary Password</Label>
            <Input id="create-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters" data-testid="input-create-password" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-create-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="site_user">Site User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-confirm-create-user">
            {createMutation.isPending ? "Creating..." : "Create User"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, open, onOpenChange }: { user: UserWithSites | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(user?.email || "");
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [role, setRole] = useState(user?.role || "site_user");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  const updateMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${user?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: err?.message?.includes("409") ? "Email already in use" : "Failed to update user", variant: "destructive" });
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user details for {user.firstName} {user.lastName}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate({ email, firstName, lastName, role, isActive });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First Name</Label>
              <Input id="edit-firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-edit-first-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last Name</Label>
              <Input id="edit-lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-edit-last-name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-edit-email" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="site_user">Site User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-active">Account Active</Label>
              <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
            </div>
            <Switch id="edit-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-edit-active" />
          </div>
          <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-confirm-edit-user">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [assignDialogUserId, setAssignDialogUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithSites | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery<UserWithSites[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectableUsers = usersData?.filter(u => u.id !== currentUser?.id) || [];

  const selectAll = () => {
    setSelectedUserIds(new Set(selectableUsers.map(u => u.id)));
  };

  const deselectAll = () => {
    setSelectedUserIds(new Set());
  };

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

  const batchDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const results = await Promise.allSettled(
        userIds.map(id => apiRequest("DELETE", `/api/admin/users/${id}`))
      );
      const failed = results.filter(r => r.status === "rejected").length;
      return { total: userIds.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserIds(new Set());
      setShowBatchDeleteConfirm(false);
      if (failed === 0) {
        toast({ title: `${total} user${total > 1 ? "s" : ""} deleted` });
      } else {
        toast({ title: `${total - failed} deleted, ${failed} failed`, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to delete users", variant: "destructive" });
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

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Password reset",
        description: `Temporary password: ${data.temporaryPassword}. The user will be emailed and must change it on next login.`,
      });
    },
    onError: () => {
      toast({ title: "Failed to reset password", variant: "destructive" });
    },
  });

  const forceChangeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/force-change-password`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User will be required to change their password on next login" });
    },
    onError: () => {
      toast({ title: "Failed to flag password change", variant: "destructive" });
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

  const selectedCount = selectedUserIds.size;
  const allSelected = selectableUsers.length > 0 && selectedCount === selectableUsers.length;

  const selectedNames = usersData
    ?.filter(u => selectedUserIds.has(u.id))
    .map(u => `${u.firstName} ${u.lastName}`.trim() || u.email)
    || [];

  const renderUserCard = (user: UserWithSites) => (
    <UserCard
      key={user.id}
      user={user}
      allClients={allClients || []}
      currentUserId={currentUser?.id || ""}
      selected={selectedUserIds.has(user.id)}
      onSelectToggle={toggleUserSelection}
      onRoleChange={(userId, role) => updateRoleMutation.mutate({ userId, role })}
      onAssignSite={(userId) => setAssignDialogUserId(userId)}
      onRemoveSite={(userId, clientId) => removeSiteMutation.mutate({ userId, clientId })}
      onDelete={(userId) => deleteUserMutation.mutate(userId)}
      onEdit={(u) => setEditingUser(u)}
      onResetPassword={(userId) => resetPasswordMutation.mutate(userId)}
      onForceChangePassword={(userId) => forceChangeMutation.mutate(userId)}
      isRoleUpdating={updateRoleMutation.isPending}
      isDeleting={deleteUserMutation.isPending}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-users-title">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts, roles and site access</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20" data-testid="batch-action-bar">
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => allSelected ? deselectAll() : selectAll()}
            data-testid="checkbox-select-all"
          />
          <span className="text-sm font-medium">{selectedCount} user{selectedCount > 1 ? "s" : ""} selected</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowBatchDeleteConfirm(true)}
            disabled={batchDeleteMutation.isPending}
            data-testid="button-batch-delete"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {batchDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedCount}`}
          </Button>
        </div>
      )}

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

      <CreateUserDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />

      <EditUserDialog
        user={editingUser}
        open={!!editingUser}
        onOpenChange={(open) => { if (!open) setEditingUser(null); }}
      />

      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>Delete {selectedCount} User{selectedCount > 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>Are you sure you want to delete the following user{selectedCount > 1 ? "s" : ""}? This will remove their accounts and all site assignments. This action cannot be undone.</p>
                <ul className="mt-2 space-y-1 list-disc list-inside text-foreground max-h-[40vh] overflow-y-auto border rounded-md p-3">
                  {selectedNames.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel data-testid="button-cancel-batch-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchDeleteMutation.mutate(Array.from(selectedUserIds))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleteMutation.isPending}
              data-testid="button-confirm-batch-delete"
            >
              {batchDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
