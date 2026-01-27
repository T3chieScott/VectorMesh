import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlayCircle,
  Calendar,
  CheckCircle2,
  FileEdit,
  Upload,
  History,
} from "lucide-react";
import type { Programme, Event, ProgrammeVersion } from "@shared/schema";

const programmeFormSchema = z.object({
  eventId: z.string().min(1, "Event is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type ProgrammeFormValues = z.infer<typeof programmeFormSchema>;

function ProgrammeCard({
  programme,
  event,
  versions,
}: {
  programme: Programme;
  event?: Event;
  versions: ProgrammeVersion[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const programmeVersions = versions.filter((v) => v.programmeId === programme.id);
  const publishedVersion = programmeVersions.find((v) => v.status === "published");
  const draftVersion = programmeVersions.find((v) => v.status === "draft");

  const form = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeFormSchema),
    defaultValues: {
      eventId: programme.eventId,
      name: programme.name,
      description: programme.description || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProgrammeFormValues) =>
      apiRequest("PATCH", `/api/programmes/${programme.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      setEditOpen(false);
      toast({ title: "Programme updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update programme", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/programmes/${programme.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete programme", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/programmes/${programme.id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/programme-versions"] });
      toast({ title: "Programme published successfully" });
    },
    onError: () => {
      toast({ title: "Failed to publish programme", variant: "destructive" });
    },
  });

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PlayCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-programme-name-${programme.id}`}>
                {programme.name}
              </CardTitle>
              {publishedVersion ? (
                <Badge className="bg-green-500/10 text-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Published
                </Badge>
              ) : draftVersion ? (
                <Badge variant="secondary" className="gap-1">
                  <FileEdit className="h-3 w-3" />
                  Draft
                </Badge>
              ) : (
                <Badge variant="outline">No versions</Badge>
              )}
            </div>
            {event && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{event.name}</span>
              </div>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-programme-menu-${programme.id}`}>
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
                  <DialogTitle>Edit Programme</DialogTitle>
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
                      name="eventId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-programme-event">
                                <SelectValue placeholder="Select an event" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {events.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.name}
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
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-programme-name" />
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
                            <Textarea {...field} data-testid="input-edit-programme-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                        data-testid="button-save-programme"
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            {draftVersion && (
              <DropdownMenuItem onSelect={() => publishMutation.mutate()}>
                <Upload className="mr-2 h-4 w-4" />
                Publish
              </DropdownMenuItem>
            )}
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
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            <span>{programmeVersions.length} version(s)</span>
          </div>
          {publishedVersion?.publishedAt && (
            <span>
              Published {format(new Date(publishedVersion.publishedAt), "MMM d, HH:mm")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProgrammeDialog({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeFormSchema),
    defaultValues: {
      eventId: "",
      name: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ProgrammeFormValues) =>
      apiRequest("POST", "/api/programmes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      setOpen(false);
      form.reset();
      toast({ title: "Programme created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create programme", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={events.length === 0} data-testid="button-create-programme">
          <Plus className="mr-2 h-4 w-4" />
          Add Programme
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Programme</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="eventId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-programme-event">
                        <SelectValue placeholder="Select an event" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Main Stage Schedule"
                      {...field}
                      data-testid="input-programme-name"
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
                      placeholder="Brief description of the programme"
                      {...field}
                      data-testid="input-programme-description"
                    />
                  </FormControl>
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
                data-testid="button-submit-programme"
              >
                {createMutation.isPending ? "Creating..." : "Create Programme"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProgrammesPage() {
  const { data: programmes = [], isLoading: programmesLoading } = useQuery<Programme[]>({
    queryKey: ["/api/programmes"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: versions = [] } = useQuery<ProgrammeVersion[]>({
    queryKey: ["/api/programme-versions"],
  });

  const isLoading = programmesLoading || eventsLoading;

  const eventMap = new Map(events.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-programmes-title">Programmes</h1>
          <p className="text-muted-foreground">
            Build and publish content schedules for events
          </p>
        </div>
        <CreateProgrammeDialog events={events} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : programmes.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <PlayCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No programmes yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {events.length === 0
                ? "Create an event first, then build programmes for it."
                : "Create a programme to schedule content for your events."}
            </p>
            <CreateProgrammeDialog events={events} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programmes.map((programme) => (
            <ProgrammeCard
              key={programme.id}
              programme={programme}
              event={eventMap.get(programme.eventId)}
              versions={versions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
