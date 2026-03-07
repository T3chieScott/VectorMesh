import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Settings,
  User,
  Monitor,
  Bell,
  Shield,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  X,
  Send,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DisplayProfile } from "@shared/schema";

const profileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  width: z.number().min(320).max(7680),
  height: z.number().min(240).max(4320),
  orientation: z.enum(["landscape", "portrait"]),
  screenType: z.enum(["standard", "led_wall"]),
  safePadding: z.number().min(0).max(100),
  refreshRate: z.number().min(24).max(240),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function DisplayProfileCard({ profile }: { profile: DisplayProfile }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

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
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Monitor className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium" data-testid={`text-profile-name-${profile.id}`}>{profile.name}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {profile.width}x{profile.height}
            </span>
            <Badge variant="secondary" className="text-xs">
              {profile.orientation}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {profile.screenType}
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
                            defaultValue={field.value}
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
                            defaultValue={field.value}
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
    </div>
  );
}

function CreateProfileDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

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
      apiRequest("POST", "/api/display-profiles", data),
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
        <Button variant="outline" size="sm" data-testid="button-create-profile">
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
                      defaultValue={field.value}
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
                      defaultValue={field.value}
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

interface AlertSettingData {
  id: string;
  alertType: string;
  clientId: string | null;
  enabled: boolean;
  recipients: string[];
  cooldownMinutes: number;
}

interface ClientData {
  id: string;
  name: string;
}

function AlertSettingsCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [newEmail, setNewEmail] = useState("");

  const { data: clients = [] } = useQuery<ClientData[]>({
    queryKey: ["/api/clients"],
  });

  const { data: settings = [], isLoading } = useQuery<AlertSettingData[]>({
    queryKey: ["/api/alert-settings"],
  });

  const effectiveClientId = selectedClientId || (clients.length > 0 ? clients[0].id : "");

  const screenOfflineSetting = settings.find(
    s => s.alertType === "screen_offline" && s.clientId === effectiveClientId
  ) || {
    alertType: "screen_offline",
    clientId: effectiveClientId,
    enabled: false,
    recipients: [] as string[],
    cooldownMinutes: 15,
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { clientId: string; enabled: boolean; recipients: string[]; cooldownMinutes: number }) => {
      const res = await apiRequest("PUT", "/api/alert-settings/screen_offline", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-settings"] });
    },
    onError: () => {
      toast({ title: "Failed to update alert settings", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (recipients: string[]) => {
      const res = await apiRequest("POST", "/api/alert-settings/test", { recipients });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test alert sent", description: "Check the recipient inboxes (or server console in dev mode)." });
    },
    onError: () => {
      toast({ title: "Failed to send test alert", variant: "destructive" });
    },
  });

  const handleToggle = (enabled: boolean) => {
    updateMutation.mutate({
      clientId: effectiveClientId,
      enabled,
      recipients: screenOfflineSetting.recipients,
      cooldownMinutes: screenOfflineSetting.cooldownMinutes,
    });
  };

  const handleAddEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (screenOfflineSetting.recipients.includes(email)) {
      toast({ title: "Email already added", variant: "destructive" });
      return;
    }
    const newRecipients = [...screenOfflineSetting.recipients, email];
    updateMutation.mutate({
      clientId: effectiveClientId,
      enabled: screenOfflineSetting.enabled,
      recipients: newRecipients,
      cooldownMinutes: screenOfflineSetting.cooldownMinutes,
    });
    setNewEmail("");
  };

  const handleRemoveEmail = (email: string) => {
    const newRecipients = screenOfflineSetting.recipients.filter(r => r !== email);
    updateMutation.mutate({
      clientId: effectiveClientId,
      enabled: screenOfflineSetting.enabled,
      recipients: newRecipients,
      cooldownMinutes: screenOfflineSetting.cooldownMinutes,
    });
  };

  const handleCooldownChange = (minutes: string) => {
    const mins = parseInt(minutes) || 15;
    updateMutation.mutate({
      clientId: effectiveClientId,
      enabled: screenOfflineSetting.enabled,
      recipients: screenOfflineSetting.recipients,
      cooldownMinutes: mins,
    });
  };

  if (clients.length === 0) return null;

  const selectedClientName = clients.find(c => c.id === effectiveClientId)?.name || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Alert Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {clients.length > 1 && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Site</Label>
                  <Select value={effectiveClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger data-testid="select-alert-site">
                      <SelectValue placeholder="Select a site" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} data-testid={`select-alert-site-${c.id}`}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
              </>
            )}

            {clients.length === 1 && (
              <p className="text-xs text-muted-foreground">Configuring alerts for <span className="font-medium text-foreground">{selectedClientName}</span></p>
            )}

            <div className="flex items-center justify-between" data-testid="toggle-screen-offline-alert">
              <div>
                <Label className="text-sm font-medium">Screen Offline Alerts</Label>
                <p className="text-xs text-muted-foreground">Email when a screen goes offline</p>
              </div>
              <Switch
                checked={screenOfflineSetting.enabled}
                onCheckedChange={handleToggle}
                disabled={updateMutation.isPending}
                data-testid="switch-screen-offline-enabled"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm">Recipients</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddEmail(); } }}
                  className="flex-1"
                  data-testid="input-alert-email"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddEmail}
                  disabled={updateMutation.isPending}
                  data-testid="button-add-alert-email"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {screenOfflineSetting.recipients.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No recipients added</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {screenOfflineSetting.recipients.map((email) => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1 pr-1" data-testid={`badge-alert-email-${email}`}>
                      {email}
                      <button
                        onClick={() => handleRemoveEmail(email)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                        data-testid={`button-remove-alert-email-${email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm">Cooldown (minutes)</Label>
              <p className="text-xs text-muted-foreground">Minimum time between repeat alerts for the same screen</p>
              <Input
                type="number"
                min={1}
                max={1440}
                value={screenOfflineSetting.cooldownMinutes}
                onChange={(e) => handleCooldownChange(e.target.value)}
                className="w-24"
                data-testid="input-alert-cooldown"
              />
            </div>

            {screenOfflineSetting.recipients.length > 0 && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => testMutation.mutate(screenOfflineSetting.recipients)}
                  disabled={testMutation.isPending}
                  data-testid="button-send-test-alert"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Test Alert
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: profiles = [] } = useQuery<DisplayProfile[]>({
    queryKey: ["/api/display-profiles"],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and system settings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Account
              </CardTitle>
              <CardDescription>
                Your account information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">
                    {user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Not set"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{user?.email || "Not set"}</p>
                </div>
              </div>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => window.location.href = "/change-password"} data-testid="button-change-password">Change Password</Button>
                <Button variant="outline" onClick={() => logout()} data-testid="button-logout">Sign Out</Button>
              </div>
            </CardContent>
          </Card>

          {/* Display Profiles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Display Profiles
                </CardTitle>
                <CardDescription>
                  Configure screen resolutions and types
                </CardDescription>
              </div>
              <CreateProfileDialog />
            </CardHeader>
            <CardContent className="space-y-3">
              {profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No display profiles configured</p>
                </div>
              ) : (
                profiles.map((profile) => (
                  <DisplayProfileCard key={profile.id} profile={profile} />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Authentication</span>
                <Badge className="bg-green-500/10 text-green-600">
                  Enabled
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Role</span>
                <Badge variant="secondary">Admin</Badge>
              </div>
            </CardContent>
          </Card>

          <AlertSettingsCard />
        </div>
      </div>
    </div>
  );
}
