import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addMinutes, addHours } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Plus,
  Clock,
  Monitor,
  Trash2,
  StopCircle,
  Play,
  AlertCircle,
  Timer,
  RotateCw,
  Image,
  Video,
} from "lucide-react";
import type { LiveOverride, Screen, ScreenGroup, LayoutTemplate, MediaAsset, Playlist } from "@shared/schema";

const DURATION_PRESETS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
];

const overrideFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetType: z.enum(["screen", "group", "all"]),
  targetId: z.string().optional(),
  layoutTemplateId: z.string().optional(),
  duration: z.number().min(1).max(480),
  priority: z.number().min(1).max(1000),
});

type OverrideFormValues = z.infer<typeof overrideFormSchema>;

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function OverrideCard({ override }: { override: LiveOverride }) {
  const { toast } = useToast();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const startTime = new Date(override.startTime);
  const endTime = new Date(override.endTime);
  const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;
  
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const end = new Date(override.endTime);
      const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      setSecondsRemaining(remaining);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [override.startTime, override.endTime]);

  const isExpired = secondsRemaining <= 0;
  const progressPercent = totalDuration > 0 
    ? Math.max(0, Math.min(100, ((totalDuration - secondsRemaining) / totalDuration) * 100))
    : 100;

  const extendMutation = useMutation({
    mutationFn: (minutes: number) => {
      const newEndTime = addMinutes(new Date(override.endTime), minutes);
      return apiRequest("PATCH", `/api/live-overrides/${override.id}`, { 
        endTime: newEndTime.toISOString() 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      toast({ title: "Override extended" });
    },
    onError: () => {
      toast({ title: "Failed to extend override", variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/live-overrides/${override.id}`, { isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      toast({ title: "Override deactivated" });
    },
    onError: () => {
      toast({ title: "Failed to deactivate override", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/live-overrides/${override.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      toast({ title: "Override deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete override", variant: "destructive" });
    },
  });

  return (
    <Card
      className={`transition-all ${
        override.isActive && !isExpired ? "border-amber-500/50" : ""
      }`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              override.isActive && !isExpired
                ? "bg-amber-500/10"
                : "bg-muted"
            }`}
          >
            <Zap
              className={`h-5 w-5 ${
                override.isActive && !isExpired
                  ? "text-amber-500"
                  : "text-muted-foreground"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-override-name-${override.id}`}>
                {override.name}
              </CardTitle>
              {override.isActive && !isExpired ? (
                <Badge className="bg-amber-500/10 text-amber-600 gap-1">
                  <Play className="h-3 w-3" />
                  Active
                </Badge>
              ) : isExpired ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Expired
                </Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Priority: {override.priority}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {override.isActive && !isExpired && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              data-testid={`button-stop-override-${override.id}`}
            >
              <StopCircle className="mr-1.5 h-3.5 w-3.5" />
              Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-override-${override.id}`}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {override.isActive && !isExpired && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-amber-600 font-medium">
                <Timer className="h-4 w-4" />
                <span data-testid={`text-countdown-${override.id}`}>
                  {formatCountdown(secondsRemaining)}
                </span>
              </div>
              <span className="text-muted-foreground text-xs">
                Ends {format(endTime, "HH:mm")}
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {!override.isActive || isExpired ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{format(endTime, "MMM d, HH:mm")}</span>
            </div>
          ) : null}
          {override.targets && (
            <div className="flex items-center gap-1.5">
              <Monitor className="h-4 w-4" />
              <span>
                {(override.targets as any[]).length} target(s)
              </span>
            </div>
          )}
        </div>
        
        {override.isActive && !isExpired && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Extend:</span>
            {[5, 15, 30].map((mins) => (
              <Button
                key={mins}
                variant="ghost"
                size="sm"
                onClick={() => extendMutation.mutate(mins)}
                disabled={extendMutation.isPending}
                data-testid={`button-extend-${override.id}-${mins}`}
              >
                <RotateCw className="h-3 w-3 mr-1" />
                +{mins}m
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateOverrideDialog({
  screens,
  groups,
  layouts,
}: {
  screens: Screen[];
  groups: ScreenGroup[];
  layouts: LayoutTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideFormSchema),
    defaultValues: {
      name: "",
      targetType: "all",
      targetId: "",
      layoutTemplateId: "",
      duration: 30,
      priority: 100,
    },
  });

  const targetType = form.watch("targetType");

  const createMutation = useMutation({
    mutationFn: (data: OverrideFormValues) => {
      const now = new Date();
      const endTime = addHours(now, data.duration / 60);
      
      let targets: any[] = [];
      if (data.targetType === "all") {
        targets = screens.map((s) => ({ type: "screen", id: s.id }));
      } else if (data.targetType === "screen" && data.targetId) {
        targets = [{ type: "screen", id: data.targetId }];
      } else if (data.targetType === "group" && data.targetId) {
        targets = [{ type: "group", id: data.targetId }];
      }

      return apiRequest("POST", "/api/live-overrides", {
        name: data.name,
        priority: data.priority,
        targets,
        layoutTemplateId: data.layoutTemplateId || null,
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-overrides"] });
      setOpen(false);
      form.reset();
      toast({ title: "Live override created" });
    },
    onError: () => {
      toast({ title: "Failed to create override", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-override">
          <Plus className="mr-2 h-4 w-4" />
          Create Override
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Live Override</DialogTitle>
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
                      placeholder="e.g., Emergency Announcement"
                      {...field}
                      data-testid="input-override-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-override-target-type">
                        <SelectValue placeholder="Select target type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">All Screens</SelectItem>
                      <SelectItem value="screen">Specific Screen</SelectItem>
                      <SelectItem value="group">Screen Group</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {targetType === "screen" && (
              <FormField
                control={form.control}
                name="targetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Screen</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-override-screen">
                          <SelectValue placeholder="Select a screen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {screens.map((screen) => (
                          <SelectItem key={screen.id} value={screen.id}>
                            {screen.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {targetType === "group" && (
              <FormField
                control={form.control}
                name="targetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Screen Group</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-override-group">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="layoutTemplateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Layout Template (optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-override-layout">
                        <SelectValue placeholder="Use default layout" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {layouts.map((layout) => (
                        <SelectItem key={layout.id} value={layout.id}>
                          {layout.name}
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
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        variant={field.value === preset.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => field.onChange(preset.value)}
                        data-testid={`button-duration-${preset.value}`}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground">Custom:</span>
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                      className="w-20"
                      data-testid="input-override-duration"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority (higher = takes precedence)</FormLabel>
                  <div className="flex items-center gap-4">
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        className="w-24"
                        data-testid="input-override-priority"
                      />
                    </FormControl>
                    <span className="text-sm text-muted-foreground">
                      Default scheduled content uses priority 0-100
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                data-testid="button-submit-override"
              >
                {createMutation.isPending ? "Creating..." : "Create Override"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function LiveOverridePage() {
  const { data: overrides = [], isLoading: overridesLoading } = useQuery<LiveOverride[]>({
    queryKey: ["/api/live-overrides"],
    refetchInterval: 10000,
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: groups = [] } = useQuery<ScreenGroup[]>({
    queryKey: ["/api/screen-groups"],
  });

  const { data: layouts = [] } = useQuery<LayoutTemplate[]>({
    queryKey: ["/api/layouts"],
  });

  const activeOverrides = overrides.filter(
    (o) => o.isActive && new Date(o.endTime) > new Date()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-override-title">Live Override</h1>
          <p className="text-muted-foreground">
            Temporarily take control of screens with priority content
          </p>
        </div>
        <CreateOverrideDialog screens={screens} groups={groups} layouts={layouts} />
      </div>

      {/* Active Overrides Banner */}
      {activeOverrides.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium text-amber-600">
              {activeOverrides.length} active override(s)
            </p>
            <p className="text-sm text-muted-foreground">
              These overrides are currently controlling screen content
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {overridesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : overrides.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No live overrides</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create an override to temporarily take control of screens with
              high-priority content.
            </p>
            <CreateOverrideDialog screens={screens} groups={groups} layouts={layouts} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overrides.map((override) => (
            <OverrideCard key={override.id} override={override} />
          ))}
        </div>
      )}
    </div>
  );
}
