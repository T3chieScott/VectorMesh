import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import { Plus, Monitor, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { DisplayProfile, Client } from "@shared/schema";

const profileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  width: z.number().min(1).max(7680),
  height: z.number().min(1).max(4320),
  orientation: z.enum(["landscape", "portrait"]),
  screenType: z.enum(["standard", "led_wall"]),
  safePadding: z.number().min(0).max(100),
  refreshRate: z.number().min(24).max(240),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function DisplayProfileCard({ profile, clients }: { profile: DisplayProfile; clients: Client[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const client = clients.find((c) => c.id === profile.clientId);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: profile.name,
      width: profile.width,
      height: profile.height,
      orientation: profile.orientation || "landscape",
      screenType: profile.screenType || "standard",
      safePadding: profile.safePadding || 0,
      refreshRate: profile.refreshRate || 60,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      apiRequest("PATCH", `/api/display-profiles/${profile.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-profiles"] });
      setEditOpen(false);
      toast({ title: "Profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/display-profiles/${profile.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-profiles"] });
      toast({ title: "Profile deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete profile", variant: "destructive" });
    },
  });

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base" data-testid={`text-profile-name-${profile.id}`}>
              {profile.name}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {client && <span>{client.name} ·</span>}
              <span>{profile.width}x{profile.height}</span>
              <Badge variant="secondary" className="text-xs">
                {profile.orientation}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {profile.screenType === "led_wall" ? "LED Wall" : "Standard"}
              </Badge>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-profile-menu-${profile.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Display Profile</DialogTitle>
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
                            <Input {...field} data-testid="input-edit-profile-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="width"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Width (px)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value))
                                }
                                data-testid="input-edit-profile-width"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="height"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Height (px)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value))
                                }
                                data-testid="input-edit-profile-height"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="orientation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Orientation</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-profile-orientation">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="landscape">Landscape</SelectItem>
                                <SelectItem value="portrait">Portrait</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="screenType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Screen Type</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-profile-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="led_wall">LED Wall</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
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
                        data-testid="button-save-profile"
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
    </Card>
  );
}

function CreateProfileDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { selectedClientId, selectedClient } = useSiteContext();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      width: 1920,
      height: 1080,
      orientation: "landscape",
      screenType: "standard",
      safePadding: 0,
      refreshRate: 60,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      apiRequest("POST", "/api/display-profiles", {
        ...data,
        clientId: selectedClientId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-profiles"] });
      setOpen(false);
      form.reset();
      toast({ title: "Display profile created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create profile", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-profile">
          <Plus className="mr-2 h-4 w-4" />
          Add Profile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Display Profile</DialogTitle>
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
                      placeholder="e.g., Full HD Landscape"
                      {...field}
                      data-testid="input-profile-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="width"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Width (px)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value))
                        }
                        data-testid="input-profile-width"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="height"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Height (px)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value))
                        }
                        data-testid="input-profile-height"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="orientation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orientation</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-profile-orientation">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="landscape">Landscape</SelectItem>
                        <SelectItem value="portrait">Portrait</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="screenType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Screen Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-profile-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="led_wall">LED Wall</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {selectedClient && (
              <div>
                <p className="text-sm font-medium mb-1">Site</p>
                <p className="text-sm text-muted-foreground">{selectedClient.name}</p>
              </div>
            )}
            {!selectedClientId && (
              <p className="text-sm text-amber-600">
                No site selected. Select a site from the sidebar to assign this profile.
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
                data-testid="button-submit-profile"
              >
                {createMutation.isPending ? "Creating..." : "Create Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDisplayProfilesPage() {
  const profilesQueryConfig = useSiteFilteredQuery<DisplayProfile[]>("/api/display-profiles");
  const { data: profiles = [], isLoading } = useQuery(profilesQueryConfig);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-profiles-title">Display Profiles</h1>
          <p className="text-muted-foreground">
            Manage screen resolutions and display types for each site
          </p>
        </div>
        <CreateProfileDialog />
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
            </Card>
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Monitor className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No display profiles yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create display profiles to define screen resolutions and types
              for your sites.
            </p>
            <CreateProfileDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <DisplayProfileCard key={profile.id} profile={profile} clients={clients} />
          ))}
        </div>
      )}
    </div>
  );
}
