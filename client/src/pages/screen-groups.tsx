import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PresetManager } from "@/components/preset-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery, useExplicitClientFilteredQuery } from "@/hooks/use-site-context";
import { Plus, MoreHorizontal, Pencil, Trash2, Tv2, Monitor, Users, X, UserPlus } from "lucide-react";
import type { ScreenGroup, Screen, Client, LayoutTemplate, Playlist } from "@shared/schema";

const groupFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

type ScreenGroupWithCount = ScreenGroup & { memberCount?: number };

function ManageMembersDialog({
  group,
  clients,
  open,
  onOpenChange,
}: {
  group: ScreenGroup;
  clients: Client[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const client = clients.find((c) => c.id === group.clientId);

  const { data: members = [], isLoading: membersLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screen-groups", group.id, "members"],
    enabled: open,
  });

  const siteScreensQuery = useExplicitClientFilteredQuery<Screen[]>(
    "/api/screens",
    group.clientId,
    { enabled: !!group.clientId }
  );
  const { data: siteScreens = [] } = useQuery<Screen[]>({
    ...siteScreensQuery,
    enabled: open && !!group.clientId,
  });

  const memberIds = new Set(members.map((m) => m.id));
  const availableScreens = siteScreens.filter((s) => !memberIds.has(s.id));

  const addMutation = useMutation({
    mutationFn: (screenId: string) =>
      apiRequest("POST", `/api/screen-groups/${group.id}/members`, { screenId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups", group.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups"] });
      toast({ title: "Screen added to group" });
    },
    onError: () => {
      toast({ title: "Failed to add screen", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (screenId: string) =>
      apiRequest("DELETE", `/api/screen-groups/${group.id}/members/${screenId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups", group.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups"] });
      toast({ title: "Screen removed from group" });
    },
    onError: () => {
      toast({ title: "Failed to remove screen", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Screens — {group.name}</DialogTitle>
        </DialogHeader>
        {!group.clientId ? (
          <p className="text-sm text-muted-foreground py-4">
            This group has no site assigned. Groups need a site before screens can be added.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Site: <span className="font-medium text-foreground">{client?.name}</span>
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Current Members ({members.length})</h4>
              {membersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No screens in this group yet.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {members.map((screen) => (
                    <div
                      key={screen.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                      data-testid={`member-screen-${screen.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{screen.name}</span>
                        {screen.location && (
                          <span className="text-xs text-muted-foreground">({screen.location})</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeMutation.mutate(screen.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-screen-${screen.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {availableScreens.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Available Screens ({availableScreens.length})</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableScreens.map((screen) => (
                    <div
                      key={screen.id}
                      className="flex items-center justify-between rounded-md border border-dashed px-3 py-2"
                      data-testid={`available-screen-${screen.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{screen.name}</span>
                        {screen.location && (
                          <span className="text-xs text-muted-foreground">({screen.location})</span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => addMutation.mutate(screen.id)}
                        disabled={addMutation.isPending}
                        data-testid={`button-add-screen-${screen.id}`}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {group.clientId && availableScreens.length === 0 && members.length > 0 && (
              <p className="text-xs text-muted-foreground">All screens from this site are already in this group.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupCard({ group, clients, layouts, playlists }: { group: ScreenGroupWithCount; clients: Client[]; layouts: LayoutTemplate[]; playlists: Playlist[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const { toast } = useToast();

  const client = clients.find((c) => c.id === group.clientId);

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: group.name,
      description: group.description || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: GroupFormValues) =>
      apiRequest("PATCH", `/api/screen-groups/${group.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups"] });
      setEditOpen(false);
      toast({ title: "Group updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/screen-groups/${group.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups"] });
      toast({ title: "Group deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete group", variant: "destructive" });
    },
  });

  const memberCount = group.memberCount ?? 0;

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tv2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base" data-testid={`text-group-name-${group.id}`}>
              {group.name}
            </CardTitle>
            {(group.description || client) && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {client && <span>{client.name}</span>}
                {client && group.description && <span> · </span>}
                {group.description && <span>{group.description}</span>}
              </p>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-group-menu-${group.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setMembersOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Manage Screens
            </DropdownMenuItem>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Screen Group</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) =>
                      updateMutation.mutate(data)
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-group-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-edit-group-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {client && (
                      <div>
                        <p className="text-sm font-medium mb-1">Site</p>
                        <p className="text-sm text-muted-foreground">{client.name}</p>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateMutation.isPending}
                        data-testid="button-save-group"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => deleteMutation.mutate()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Monitor className="h-4 w-4" />
          <span data-testid={`text-group-member-count-${group.id}`}>
            {memberCount} {memberCount === 1 ? "screen" : "screens"}
          </span>
        </div>
        <PresetManager
          targetType="group"
          targetId={group.id}
          layouts={layouts}
          playlists={playlists}
        />
      </CardContent>
      <ManageMembersDialog
        group={group}
        clients={clients}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </Card>
  );
}

function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { selectedClientId, selectedClient } = useSiteContext();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: GroupFormValues) =>
      apiRequest("POST", "/api/screen-groups", {
        ...data,
        clientId: selectedClientId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-groups"] });
      setOpen(false);
      form.reset();
      toast({ title: "Screen group created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create group", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-group">
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Screen Group</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Lobby Screens"
                      {...field}
                      data-testid="input-group-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this group"
                      {...field}
                      data-testid="input-group-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedClient && (
              <div>
                <p className="text-sm font-medium mb-1">Site</p>
                <p className="text-sm text-muted-foreground">{selectedClient.name}</p>
              </div>
            )}
            {!selectedClientId && (
              <p className="text-sm text-amber-600">
                No site selected. Select a site from the sidebar to assign this group.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-group"
              >
                {createMutation.isPending ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ScreenGroupsPage() {
  const groupsQueryConfig = useSiteFilteredQuery<ScreenGroupWithCount[]>("/api/screen-groups");
  const { data: groups = [], isLoading } = useQuery(groupsQueryConfig);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const layoutsQueryConfig = useSiteFilteredQuery<LayoutTemplate[]>("/api/layouts");
  const { data: layouts = [] } = useQuery<LayoutTemplate[]>(layoutsQueryConfig);

  const playlistsQueryConfig = useSiteFilteredQuery<Playlist[]>("/api/playlists");
  const { data: playlists = [] } = useQuery<Playlist[]>(playlistsQueryConfig);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-groups-title">Screen Groups</h1>
          <p className="text-muted-foreground">
            Organise screens for bulk content targeting
          </p>
        </div>
        <CreateGroupDialog />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Tv2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No screen groups yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create groups to organise screens by location, function, or
              content type for easier targeting.
            </p>
            <CreateGroupDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} clients={clients} layouts={layouts} playlists={playlists} />
          ))}
        </div>
      )}
    </div>
  );
}
