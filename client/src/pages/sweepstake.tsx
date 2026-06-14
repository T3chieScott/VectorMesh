import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSiteContext, useSiteFilteredQuery } from "@/hooks/use-site-context";
import {
  SweepstakeDisplayWidget,
  type SweepstakeDisplayData,
  type SlideType,
} from "@/components/sweepstake/SweepstakeDisplayWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
  Shuffle,
  RefreshCw,
  Trophy,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  SWEEPSTAKE_PROVIDERS,
  SWEEPSTAKE_PROVIDER_LABELS,
  SWEEPSTAKE_PROVIDER_ENV_VARS,
  SWEEPSTAKE_LAYOUT_MODES,
  SWEEPSTAKE_THEMES,
  SWEEPSTAKE_SLIDE_TYPES,
  SWEEPSTAKE_SLIDE_LABELS,
  type SweepstakeWidgetConfig,
  type TournamentTeam,
  type SweepstakeParticipant,
  type SweepstakeProvider,
} from "@shared/schema";

const LAYOUT_MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  landscape: "Landscape",
  portrait: "Portrait",
  totem: "Totem (tall kiosk)",
  ultrawide: "Ultrawide",
  room_door: "Room door panel",
};

const THEME_LABELS: Record<string, string> = {
  bright: "Bright",
  dark: "Dark",
  stadium: "Stadium green",
};

const configFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tournamentName: z.string().min(1, "Tournament name is required"),
  provider: z.enum(SWEEPSTAKE_PROVIDERS),
  competitionCode: z.string().optional(),
  season: z.string().optional(),
  kickoffAt: z.string().optional(),
  layoutMode: z.enum(SWEEPSTAKE_LAYOUT_MODES),
  theme: z.enum(SWEEPSTAKE_THEMES),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex like #16a34a"),
  refreshIntervalSeconds: z.coerce.number().int().min(5).max(3600),
  rotationIntervalSeconds: z.coerce.number().int().min(3).max(3600),
  slideTypes: z.array(z.enum(SWEEPSTAKE_SLIDE_TYPES)).default([]),
});
type ConfigFormValues = z.infer<typeof configFormSchema>;

function defaultConfigForm(c?: SweepstakeWidgetConfig): ConfigFormValues {
  return {
    name: c?.name ?? "",
    tournamentName: c?.tournamentName ?? "World Football Sweepstake",
    provider: (c?.provider as SweepstakeProvider) ?? "manual",
    competitionCode: c?.competitionCode ?? "",
    season: c?.season ?? "",
    kickoffAt: c?.kickoffAt ? toLocalInput(c.kickoffAt) : "",
    layoutMode: (c?.layoutMode as any) ?? "auto",
    theme: (c?.theme as any) ?? "bright",
    accentColor: c?.accentColor ?? "#16a34a",
    refreshIntervalSeconds: c?.refreshIntervalSeconds ?? 30,
    rotationIntervalSeconds: c?.rotationIntervalSeconds ?? 12,
    slideTypes: (c?.slideTypes as any) ?? [],
  };
}

function toLocalInput(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}

function toApiPayload(values: ConfigFormValues, clientId: string) {
  return {
    clientId,
    name: values.name,
    tournamentName: values.tournamentName,
    provider: values.provider,
    competitionCode: values.competitionCode?.trim() ? values.competitionCode.trim() : null,
    season: values.season?.trim() ? values.season.trim() : null,
    kickoffAt: values.kickoffAt ? new Date(values.kickoffAt).toISOString() : null,
    layoutMode: values.layoutMode,
    theme: values.theme,
    accentColor: values.accentColor,
    refreshIntervalSeconds: values.refreshIntervalSeconds,
    rotationIntervalSeconds: values.rotationIntervalSeconds,
    slideTypes: values.slideTypes,
  };
}

function ConfigDialog({
  open,
  onOpenChange,
  config,
  clientId,
  providerStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config?: SweepstakeWidgetConfig;
  clientId: string;
  providerStatus: Record<string, boolean> | undefined;
}) {
  const { toast } = useToast();
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: defaultConfigForm(config),
  });
  const provider = form.watch("provider");
  const envVar = SWEEPSTAKE_PROVIDER_ENV_VARS[provider as SweepstakeProvider];
  const keyConfigured = envVar ? providerStatus?.[provider] : true;

  const mutation = useMutation({
    mutationFn: async (values: ConfigFormValues) => {
      const payload = toApiPayload(values, clientId);
      if (config) {
        return apiRequest("PATCH", `/api/sweepstake/configs/${config.id}`, payload);
      }
      return apiRequest("POST", "/api/sweepstake/configs", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sweepstake/configs"] });
      toast({ title: config ? "Sweepstake updated" : "Sweepstake created" });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config ? "Edit sweepstake" : "New sweepstake"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Office World Cup" data-testid="input-config-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tournamentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>On-screen title</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-tournament-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data source</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-provider">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SWEEPSTAKE_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {SWEEPSTAKE_PROVIDER_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {envVar && (
                    <FormDescription>
                      {keyConfigured ? (
                        <span className="text-green-600">API key {envVar} is set.</span>
                      ) : (
                        <span className="text-amber-600">
                          Set the {envVar} secret on the server to sync this source.
                        </span>
                      )}
                    </FormDescription>
                  )}
                  {provider === "manual" && (
                    <FormDescription>Type teams and results in by hand — no API needed.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {provider !== "manual" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="competitionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competition code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. WC" data-testid="input-competition-code" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="season"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Season</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. 2026" data-testid="input-season" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="kickoffAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kick-off (for countdown)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-kickoff" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accent colour</FormLabel>
                    <div className="flex gap-2 items-center">
                      <Input type="color" className="w-14 p-1 h-10" value={field.value} onChange={field.onChange} data-testid="input-accent-color" />
                      <Input value={field.value} onChange={field.onChange} className="font-mono" />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="layoutMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Layout</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-layout-mode">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SWEEPSTAKE_LAYOUT_MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {LAYOUT_MODE_LABELS[m] ?? m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Theme</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-theme">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SWEEPSTAKE_THEMES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {THEME_LABELS[t] ?? t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rotationIntervalSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slide rotation (seconds)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-rotation-interval" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="refreshIntervalSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data refresh (seconds)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} data-testid="input-refresh-interval" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="slideTypes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slides to show</FormLabel>
                  <FormDescription>Leave all unchecked to rotate through every slide that has content.</FormDescription>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {SWEEPSTAKE_SLIDE_TYPES.map((s) => {
                      const checked = field.value?.includes(s);
                      return (
                        <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const set = new Set(field.value ?? []);
                              if (v) set.add(s);
                              else set.delete(s);
                              field.onChange(Array.from(set));
                            }}
                            data-testid={`checkbox-slide-${s}`}
                          />
                          {SWEEPSTAKE_SLIDE_LABELS[s]}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-config">
                {mutation.isPending ? "Saving…" : config ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ManageDialog({
  config,
  open,
  onOpenChange,
  providerStatus,
}: {
  config: SweepstakeWidgetConfig;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerStatus: Record<string, boolean> | undefined;
}) {
  const { toast } = useToast();
  const teamsQuery = useQuery<TournamentTeam[]>({
    queryKey: ["/api/sweepstake/configs", config.id, "teams"],
    queryFn: async () => {
      const res = await fetch(`/api/sweepstake/configs/${config.id}/teams`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load teams");
      return res.json();
    },
    enabled: open,
  });
  const participantsQuery = useQuery<SweepstakeParticipant[]>({
    queryKey: ["/api/sweepstake/configs", config.id, "participants"],
    queryFn: async () => {
      const res = await fetch(`/api/sweepstake/configs/${config.id}/participants`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load participants");
      return res.json();
    },
    enabled: open,
  });

  const teams = teamsQuery.data ?? [];
  const participants = participantsQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sweepstake/configs", config.id, "teams"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sweepstake/configs", config.id, "participants"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sweepstake/configs"] });
  };

  const [newTeam, setNewTeam] = useState("");
  const [newParticipant, setNewParticipant] = useState("");

  const addTeam = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", `/api/sweepstake/configs/${config.id}/teams`, { name }),
    onSuccess: () => {
      setNewTeam("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not add team", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const toggleTeamEliminated = useMutation({
    mutationFn: async (t: TournamentTeam) =>
      apiRequest("PATCH", `/api/sweepstake/teams/${t.id}`, { eliminated: !t.eliminated }),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const setWinner = useMutation({
    mutationFn: async (t: TournamentTeam) =>
      apiRequest("PATCH", `/api/sweepstake/teams/${t.id}`, { isWinner: !t.isWinner, eliminated: false }),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const addParticipant = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", `/api/sweepstake/configs/${config.id}/participants`, { name }),
    onSuccess: () => {
      setNewParticipant("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not add", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const deleteParticipant = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/sweepstake/participants/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const sync = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/sweepstake/configs/${config.id}/sync`, {}),
    onSuccess: async (res: any) => {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Synced", description: `${body.teams ?? 0} teams, ${body.matches ?? 0} matches.` });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Sync failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const draw = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/sweepstake/configs/${config.id}/assign`, {}),
    onSuccess: async (res: any) => {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Draw complete", description: `${body.assigned ?? 0} people assigned to teams.` });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Draw failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const teamNameById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const envVar = SWEEPSTAKE_PROVIDER_ENV_VARS[config.provider as SweepstakeProvider];
  const keyConfigured = envVar ? providerStatus?.[config.provider] : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage — {config.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {config.provider !== "manual" && (
            <Button
              variant="outline"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || !keyConfigured}
              data-testid="button-sync"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {sync.isPending ? "Syncing…" : "Sync from provider"}
            </Button>
          )}
          <Button onClick={() => draw.mutate()} disabled={draw.isPending || teams.length === 0 || participants.length === 0} data-testid="button-draw">
            <Shuffle className="w-4 h-4 mr-2" />
            {draw.isPending ? "Drawing…" : "Draw teams"}
          </Button>
        </div>
        {config.provider !== "manual" && !keyConfigured && envVar && (
          <p className="text-sm text-amber-600">Set the {envVar} secret on the server before syncing.</p>
        )}
        {config.lastSyncError && <p className="text-sm text-red-600">Last sync error: {config.lastSyncError}</p>}

        <div className="grid md:grid-cols-2 gap-6 pt-2">
          {/* Teams */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Teams ({teams.length})
            </h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value)}
                placeholder="Add a team"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTeam.trim()) addTeam.mutate(newTeam.trim());
                }}
                data-testid="input-new-team"
              />
              <Button size="sm" onClick={() => newTeam.trim() && addTeam.mutate(newTeam.trim())} disabled={addTeam.isPending} data-testid="button-add-team">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {teamsQuery.isLoading && <Skeleton className="h-8 w-full" />}
              {teams.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1" data-testid={`row-team-${t.id}`}>
                  <span className={t.eliminated ? "line-through opacity-60" : ""}>
                    {t.name}
                    {t.groupName ? <span className="text-muted-foreground ml-1">({t.groupName})</span> : null}
                    {t.isWinner && <Trophy className="w-3 h-3 inline ml-1 text-amber-500" />}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={t.isWinner ? "Unset winner" : "Mark as winner"}
                      onClick={() => setWinner.mutate(t)}
                      data-testid={`button-winner-${t.id}`}
                    >
                      <Trophy className={`w-4 h-4 ${t.isWinner ? "text-amber-500" : ""}`} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={t.eliminated ? "Bring back" : "Knock out"}
                      onClick={() => toggleTeamEliminated.mutate(t)}
                      data-testid={`button-eliminate-${t.id}`}
                    >
                      {t.eliminated ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </Button>
                  </span>
                </div>
              ))}
              {!teamsQuery.isLoading && teams.length === 0 && (
                <p className="text-sm text-muted-foreground">No teams yet. Add by hand or sync from a provider.</p>
              )}
            </div>
          </div>

          {/* Participants */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Staff ({participants.length})
            </h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                placeholder="Add a person"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newParticipant.trim()) addParticipant.mutate(newParticipant.trim());
                }}
                data-testid="input-new-participant"
              />
              <Button
                size="sm"
                onClick={() => newParticipant.trim() && addParticipant.mutate(newParticipant.trim())}
                disabled={addParticipant.isPending}
                data-testid="button-add-participant"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {participantsQuery.isLoading && <Skeleton className="h-8 w-full" />}
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-2 py-1" data-testid={`row-participant-${p.id}`}>
                  <span className={p.status === "eliminated" ? "line-through opacity-60" : ""}>
                    {p.name}
                    {p.teamId ? (
                      <span className="text-muted-foreground ml-1">— {teamNameById.get(p.teamId) ?? "?"}</span>
                    ) : (
                      <span className="text-muted-foreground ml-1">— not drawn</span>
                    )}
                    {p.status === "winner" && <Trophy className="w-3 h-3 inline ml-1 text-amber-500" />}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteParticipant.mutate(p.id)}
                    data-testid={`button-delete-participant-${p.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {!participantsQuery.isLoading && participants.length === 0 && (
                <p className="text-sm text-muted-foreground">No staff added yet.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ config, open, onOpenChange }: { config: SweepstakeWidgetConfig; open: boolean; onOpenChange: (v: boolean) => void }) {
  const previewQuery = useQuery<SweepstakeDisplayData>({
    queryKey: ["/api/sweepstake/display", config.id],
    queryFn: async () => {
      const res = await fetch(`/api/sweepstake/display/${config.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: open,
  });
  const [forced, setForced] = useState<SlideType | "auto">("auto");
  const data = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview — {config.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Label className="text-sm">Slide:</Label>
          <Select value={forced} onValueChange={(v) => setForced(v as any)}>
            <SelectTrigger className="w-56" data-testid="select-preview-slide">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto rotate</SelectItem>
              {(data?.slides ?? SWEEPSTAKE_SLIDE_TYPES).map((s) => (
                <SelectItem key={s} value={s}>
                  {SWEEPSTAKE_SLIDE_LABELS[s as keyof typeof SWEEPSTAKE_SLIDE_LABELS] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full aspect-video rounded-lg overflow-hidden border">
          {data ? (
            <SweepstakeDisplayWidget data={data} forcedSlide={forced === "auto" ? null : forced} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">Loading preview…</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SweepstakePage() {
  const { toast } = useToast();
  const { selectedClientId } = useSiteContext();
  const configsQueryOptions = useSiteFilteredQuery<SweepstakeWidgetConfig[]>("/api/sweepstake/configs");
  const configsQuery = useQuery(configsQueryOptions);
  const providerStatusQuery = useQuery<Record<string, boolean>>({
    queryKey: ["/api/sweepstake/provider-status"],
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SweepstakeWidgetConfig | null>(null);
  const [managing, setManaging] = useState<SweepstakeWidgetConfig | null>(null);
  const [previewing, setPreviewing] = useState<SweepstakeWidgetConfig | null>(null);
  const [deleting, setDeleting] = useState<SweepstakeWidgetConfig | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/sweepstake/configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sweepstake/configs"] });
      toast({ title: "Sweepstake deleted" });
      setDeleting(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const configs = configsQuery.data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6" /> Sweepstake Wall
          </h1>
          <p className="text-muted-foreground text-sm">
            Assign staff to tournament teams and show a rotating sweepstake on your screens.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!selectedClientId} data-testid="button-new-sweepstake">
          <Plus className="w-4 h-4 mr-2" /> New sweepstake
        </Button>
      </div>

      {!selectedClientId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Select a site to manage sweepstakes.</CardContent>
        </Card>
      )}

      {selectedClientId && configsQuery.isLoading && <Skeleton className="h-32 w-full" />}

      {selectedClientId && !configsQuery.isLoading && configs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No sweepstakes yet</p>
            <p className="text-muted-foreground text-sm mb-4">Create one to get started.</p>
            <Button onClick={() => setCreating(true)} data-testid="button-new-sweepstake-empty">
              <Plus className="w-4 h-4 mr-2" /> New sweepstake
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.map((c) => {
          const displayUrl = `${window.location.origin}/display/sweepstake/${c.id}`;
          return (
            <Card key={c.id} data-testid={`card-sweepstake-${c.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <Badge variant="secondary">{SWEEPSTAKE_PROVIDER_LABELS[c.provider as SweepstakeProvider]}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground truncate">{c.tournamentName}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: c.accentColor }} />
                  {THEME_LABELS[c.theme] ?? c.theme} · {LAYOUT_MODE_LABELS[c.layoutMode] ?? c.layoutMode}
                  {c.lastSyncError && <span className="text-red-600">· sync error</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setManaging(c)} data-testid={`button-manage-${c.id}`}>
                    Manage
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreviewing(c)} data-testid={`button-preview-${c.id}`}>
                    Preview
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)} data-testid={`button-edit-${c.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleting(c)} data-testid={`button-delete-${c.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                  data-testid={`link-display-${c.id}`}
                >
                  <ExternalLink className="w-3 h-3" /> Open display URL
                </a>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {creating && selectedClientId && (
        <ConfigDialog open={creating} onOpenChange={setCreating} clientId={selectedClientId} providerStatus={providerStatusQuery.data} />
      )}
      {editing && (
        <ConfigDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          config={editing}
          clientId={editing.clientId}
          providerStatus={providerStatusQuery.data}
        />
      )}
      {managing && (
        <ManageDialog config={managing} open={!!managing} onOpenChange={(v) => !v && setManaging(null)} providerStatus={providerStatusQuery.data} />
      )}
      {previewing && <PreviewDialog config={previewing} open={!!previewing} onOpenChange={(v) => !v && setPreviewing(null)} />}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sweepstake?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sweepstake, its teams and all staff entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
