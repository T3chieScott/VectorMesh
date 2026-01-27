import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addHours } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import type { LiveOverride, Screen, ScreenGroup, LayoutTemplate } from "@shared/schema";

const overrideFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetType: z.enum(["screen", "group", "all"]),
  targetId: z.string().optional(),
  layoutTemplateId: z.string().optional(),
  duration: z.number().min(1).max(480),
  priority: z.number().min(1).max(1000),
});

type OverrideFormValues = z.infer<typeof overrideFormSchema>;

function OverrideCard({ override }: { override: LiveOverride }) {
  const { toast } = useToast();

  const now = new Date();
  const endTime = new Date(override.endTime);
  const isExpired = endTime < now;
  const timeRemaining = isExpired
    ? 0
    : Math.floor((endTime.getTime() - now.getTime()) / 1000 / 60);

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
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>
              {override.isActive && !isExpired
                ? `${timeRemaining}m remaining`
                : format(endTime, "MMM d, HH:mm")}
            </span>
          </div>
          {override.targets && (
            <div className="flex items-center gap-1.5">
              <Monitor className="h-4 w-4" />
              <span>
                {(override.targets as any[]).length} target(s)
              </span>
            </div>
          )}
        </div>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={480}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-override-duration"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        data-testid="input-override-priority"
                      />
                    </FormControl>
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
