import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSiteFilteredQuery } from "@/hooks/use-site-context";
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
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Calendar, Building2, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Client, Event } from "@shared/schema";

const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  maxUploadSizeMb: z.coerce.number().min(1).max(2048).optional(),
});

type ClientFormValues = z.infer<typeof clientFormSchema>;

function ClientCard({ client, events }: { client: Client; events: Event[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isUserAdmin = user?.role === "admin";

  const clientEvents = events.filter((e) => e.clientId === client.id);
  const activeEvents = clientEvents.filter((e) => e.isActive);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client.name,
      description: client.description || "",
      maxUploadSizeMb: client.maxUploadSizeMb ?? 100,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ClientFormValues) =>
      apiRequest("PATCH", `/api/clients/${client.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditOpen(false);
      toast({ title: "Client updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update client", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/clients/${client.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete client", variant: "destructive" });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) =>
      apiRequest("POST", `/api/clients/${client.id}/lock`, { locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: client.locked ? "Site unlocked" : "Site locked" });
    },
    onError: () => {
      toast({ title: "Failed to toggle lock", variant: "destructive" });
    },
  });

  return (
    <Card className={`hover-elevate transition-all ${client.locked ? "ring-1 ring-amber-500/30" : ""}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base" data-testid={`text-client-name-${client.id}`}>{client.name}</CardTitle>
              {client.locked && (
                <Lock className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>
            {client.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {client.description}
              </p>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-client-menu-${client.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={!!client.locked}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Client</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-client-name" />
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
                            <Textarea {...field} data-testid="input-edit-client-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxUploadSizeMb"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Upload Size (MB)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={2048} {...field} data-testid="input-edit-client-max-upload" />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Maximum file size allowed for uploads (1–2048 MB)</p>
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
                      <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-client">
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            {isUserAdmin && (
              <DropdownMenuItem onSelect={() => lockMutation.mutate(!client.locked)}>
                {client.locked ? (
                  <><Unlock className="mr-2 h-4 w-4" />Unlock</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" />Lock</>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => deleteMutation.mutate()}
              disabled={client.locked}
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
            <Calendar className="h-4 w-4" />
            <span>{clientEvents.length} events</span>
          </div>
          {activeEvents.length > 0 && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
              {activeEvents.length} active
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {client.maxUploadSizeMb ?? 100}MB max upload
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: "",
      description: "",
      maxUploadSizeMb: 100,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ClientFormValues) => apiRequest("POST", "/api/clients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setOpen(false);
      form.reset();
      toast({ title: "Client created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create client", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-client">
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Client</DialogTitle>
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
                    <Input placeholder="Enter client name" {...field} data-testid="input-client-name" />
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
                      placeholder="Brief description of the client"
                      {...field}
                      data-testid="input-client-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxUploadSizeMb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Upload Size (MB)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={2048} {...field} data-testid="input-client-max-upload" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Maximum file size allowed for uploads (1–2048 MB)</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-client">
                {createMutation.isPending ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const eventsQ = useSiteFilteredQuery<Event[]>("/api/events");
  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>(eventsQ);

  const isLoading = clientsLoading || eventsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-clients-title">Clients</h1>
          <p className="text-muted-foreground">
            Manage the sites and venues where you deploy displays
          </p>
        </div>
        <CreateClientDialog />
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
      ) : clients.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Get started by adding your first client. Clients represent
              the sites and venues where you manage displays and events.
            </p>
            <CreateClientDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} events={events} />
          ))}
        </div>
      )}
    </div>
  );
}
