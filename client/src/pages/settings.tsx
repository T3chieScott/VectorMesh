import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  User,
  Bell,
  Shield,
  Plus,
  X,
  Send,
  Loader2,
  HardDrive,
  Save,
  FolderOpen,
} from "lucide-react";




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

function StorageSettingsCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const isAdmin = user?.role === "admin";

  const { data: setting, isLoading } = useQuery<{ key: string; value: string } | null>({
    queryKey: ["/api/system-settings", "uploadRootDir"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings/uploadRootDir", { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch setting");
      return res.json();
    },
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("PUT", "/api/system-settings/uploadRootDir", { value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings", "uploadRootDir"] });
      toast({ title: "Upload directory updated" });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Failed to update upload directory", variant: "destructive" });
    },
  });

  const handleEdit = () => {
    setEditValue(setting?.value || "./data/uploads");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editValue.trim()) {
      toast({ title: "Path cannot be empty", variant: "destructive" });
      return;
    }
    updateMutation.mutate(editValue.trim());
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          File Storage
        </CardTitle>
        <CardDescription>
          Configure where uploaded media files are stored on the server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-sm">Upload Root Directory</Label>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="./data/uploads"
                    className="flex-1 font-mono text-sm"
                    data-testid="input-upload-root-dir"
                  />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-upload-dir"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    data-testid="button-cancel-upload-dir"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono" data-testid="text-upload-root-dir">
                    {setting?.value || "./data/uploads"}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEdit}
                    data-testid="button-edit-upload-dir"
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                Folder Structure
              </Label>
              <div className="bg-muted rounded-md p-3 text-xs font-mono text-muted-foreground space-y-0.5">
                <p>{setting?.value || "./data/uploads"}/</p>
                <p className="pl-4">├── site-name-1/</p>
                <p className="pl-8">├── uploads/</p>
                <p className="pl-8">└── thumbnails/</p>
                <p className="pl-4">└── site-name-2/</p>
                <p className="pl-8">├── uploads/</p>
                <p className="pl-8">└── thumbnails/</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Each site's files are stored in separate folders. Changing this path will not move existing files.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and system settings
        </p>
      </div>

      <div className="space-y-6">
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

        {user?.role === "admin" && (
          <StorageSettingsCard />
        )}
      </div>
    </div>
  );
}
