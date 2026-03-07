import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSiteContext } from "@/hooks/use-site-context";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  MoreHorizontal,
  Trash2,
  Image as ImageIcon,
  Video,
  FileImage,
  Search,
  Grid3X3,
  List,
  Eye,
  Download,
  Clock,
  Maximize,
  Minimize2,
  Share2,
  Building2,
} from "lucide-react";
import type { MediaAsset, MediaShare, Client } from "@shared/schema";

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getMediaUrl(asset: MediaAsset): string {
  return `/api/media/${asset.id}/file`;
}

function ShareDialog({
  asset,
  clients,
  open,
  onOpenChange,
}: {
  asset: MediaAsset;
  clients: Client[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: shares = [] } = useQuery<MediaShare[]>({
    queryKey: ["/api/media", asset.id, "shares"],
    queryFn: async () => {
      const res = await fetch(`/api/media/${asset.id}/shares`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shares");
      return res.json();
    },
    enabled: open,
  });

  const sharedClientIds = new Set(shares.map(s => s.clientId));
  const otherClients = clients.filter(c => c.id !== asset.clientId);

  const shareMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("POST", `/api/media/${asset.id}/share`, { clientId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media", asset.id, "shares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "Media shared successfully" });
    },
    onError: () => {
      toast({ title: "Failed to share media", variant: "destructive" });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: (clientId: string) =>
      apiRequest("DELETE", `/api/media/${asset.id}/share/${clientId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media", asset.id, "shares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "Share removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove share", variant: "destructive" });
    },
  });

  const handleToggle = (clientId: string, isShared: boolean) => {
    if (isShared) {
      unshareMutation.mutate(clientId);
    } else {
      shareMutation.mutate(clientId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share to Sites</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select which sites should have access to "{asset.name}"
        </p>
        {otherClients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No other sites available to share with.</p>
        ) : (
          <div className="space-y-3 py-2">
            {otherClients.map(client => {
              const isShared = sharedClientIds.has(client.id);
              return (
                <label
                  key={client.id}
                  className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  data-testid={`share-toggle-${client.id}`}
                >
                  <Checkbox
                    checked={isShared}
                    onCheckedChange={() => handleToggle(client.id, isShared)}
                  />
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{client.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-share">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SitePickerDialog({
  clients,
  open,
  onOpenChange,
  onSelect,
}: {
  clients: Client[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (clientId: string) => void;
}) {
  const [selected, setSelected] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Site for Upload</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose which site this media should belong to.
        </p>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger data-testid="select-upload-site">
            <SelectValue placeholder="Select a site..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!selected}
            onClick={() => {
              onSelect(selected);
              onOpenChange(false);
            }}
            data-testid="button-confirm-upload-site"
          >
            Continue Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaCard({
  asset,
  viewMode,
  clients,
  isAdmin,
  selectedClientId,
}: {
  asset: MediaAsset;
  viewMode: "grid" | "list";
  clients: Client[];
  isAdmin: boolean;
  selectedClientId: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { toast } = useToast();

  const ownerClient = clients.find(c => c.id === asset.clientId);
  const isSharedAsset = selectedClientId && asset.clientId !== selectedClientId;

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/media/${asset.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "Media deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete media", variant: "destructive" });
    },
  });

  const toggleDisplayModeMutation = useMutation({
    mutationFn: () => {
      const newMode = asset.displayMode === "cover" ? "contain" : "cover";
      return apiRequest("PATCH", `/api/media/${asset.id}`, { displayMode: newMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: `Display mode changed to ${asset.displayMode === "cover" ? "Fit" : "Fill"}` });
    },
    onError: () => {
      toast({ title: "Failed to update display mode", variant: "destructive" });
    },
  });

  const getMediaIcon = () => {
    switch (asset.mediaType) {
      case "video":
        return <Video className="h-5 w-5" />;
      case "gif":
        return <FileImage className="h-5 w-5" />;
      default:
        return <ImageIcon className="h-5 w-5" />;
    }
  };

  const getMediaTypeColor = () => {
    switch (asset.mediaType) {
      case "video":
        return "bg-purple-500/10 text-purple-600";
      case "gif":
        return "bg-amber-500/10 text-amber-600";
      default:
        return "bg-blue-500/10 text-blue-600";
    }
  };

  const dropdownItems = (
    <>
      <DropdownMenuItem asChild>
        <a href={getMediaUrl(asset)} download={asset.name}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </a>
      </DropdownMenuItem>
      {!isSharedAsset && (
        <DropdownMenuItem
          onSelect={() => toggleDisplayModeMutation.mutate()}
          data-testid={`button-toggle-display-${asset.id}`}
        >
          {asset.displayMode === "cover" ? (
            <>
              <Minimize2 className="mr-2 h-4 w-4" />
              Switch to Fit
            </>
          ) : (
            <>
              <Maximize className="mr-2 h-4 w-4" />
              Switch to Fill
            </>
          )}
        </DropdownMenuItem>
      )}
      {isAdmin && !isSharedAsset && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShareOpen(true)} data-testid={`button-share-media-${asset.id}`}>
            <Share2 className="mr-2 h-4 w-4" />
            Share to Sites
          </DropdownMenuItem>
        </>
      )}
      {!isSharedAsset && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => deleteMutation.mutate()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  const previewDialog = (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{asset.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center bg-muted/50 rounded-lg p-4">
          {asset.mediaType === "video" ? (
            <video
              src={getMediaUrl(asset)}
              controls
              className="max-h-[60vh] rounded-lg"
            />
          ) : (
            <img
              src={getMediaUrl(asset)}
              alt={asset.name}
              className="max-h-[60vh] rounded-lg object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (viewMode === "list") {
    return (
      <>
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover-elevate transition-all">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-lg ${getMediaTypeColor()}`}
            >
              {asset.thumbnailPath || asset.mediaType === "image" ? (
                <img
                  src={getMediaUrl(asset)}
                  alt={asset.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                getMediaIcon()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium" data-testid={`text-media-name-${asset.id}`}>{asset.name}</p>
                {isSharedAsset && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-200">
                    <Share2 className="h-3 w-3 mr-1" />
                    Shared
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{formatFileSize(asset.fileSize)}</span>
                {ownerClient && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {ownerClient.name}
                  </span>
                )}
                {asset.width && asset.height && (
                  <span>
                    {asset.width}x{asset.height}
                  </span>
                )}
                {asset.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(asset.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={getMediaTypeColor()}>
              {asset.mediaType}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {asset.displayMode === "contain" ? "Fit" : "Fill"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreviewOpen(true)}
              data-testid={`button-preview-media-${asset.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-media-menu-${asset.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {dropdownItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {previewDialog}
        {isAdmin && <ShareDialog asset={asset} clients={clients} open={shareOpen} onOpenChange={setShareOpen} />}
      </>
    );
  }

  return (
    <>
      <Card className="group overflow-hidden hover-elevate transition-all">
        <div className="relative aspect-video bg-muted">
          {asset.thumbnailPath || asset.mediaType === "image" ? (
            <img
              src={getMediaUrl(asset)}
              alt={asset.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              {getMediaIcon()}
            </div>
          )}
          {asset.duration && (
            <Badge
              variant="secondary"
              className="absolute bottom-2 right-2 bg-black/70 text-white"
            >
              {formatDuration(asset.duration)}
            </Badge>
          )}
          {isSharedAsset && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 bg-amber-500/90 text-white text-xs"
            >
              <Share2 className="h-3 w-3 mr-1" />
              Shared
            </Badge>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
              data-testid={`button-preview-media-${asset.id}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate" data-testid={`text-media-name-${asset.id}`}>
                {asset.name}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{formatFileSize(asset.fileSize)}</span>
                {ownerClient && !selectedClientId && (
                  <>
                    <span className="mx-1">·</span>
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{ownerClient.name}</span>
                  </>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-media-menu-${asset.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {dropdownItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Badge variant="outline" className="text-xs mt-1">
            {asset.displayMode === "contain" ? "Fit" : "Fill"}
          </Badge>
        </CardContent>
      </Card>
      {previewDialog}
      {isAdmin && <ShareDialog asset={asset} clients={clients} open={shareOpen} onOpenChange={setShareOpen} />}
    </>
  );
}

export default function MediaPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [pendingUploadResult, setPendingUploadResult] = useState<any>(null);
  const { toast } = useToast();
  const { selectedClientId, buildQueryString } = useSiteContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: media = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["/api/media", selectedClientId],
    queryFn: async () => {
      const url = "/api/media" + (selectedClientId ? "?clientId=" + selectedClientId : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch media");
      return res.json();
    },
  });

  const filteredMedia = media.filter((asset) => {
    const matchesSearch = asset.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesType =
      filterType === "all" || asset.mediaType === filterType;
    return matchesSearch && matchesType;
  });

  const resolveUploadClientId = (): string | null => {
    if (selectedClientId) return selectedClientId;
    if (clients.length === 1) return clients[0].id;
    return null;
  };

  const saveMediaRecords = async (result: any, clientId: string) => {
    if (result.successful?.length > 0) {
      for (const file of result.successful) {
        const uploadURL = file.response?.body?.uploadURL || file.uploadURL;
        if (uploadURL) {
          try {
            await apiRequest("POST", "/api/media", {
              name: file.name,
              originalPath: uploadURL.split("?")[0],
              mediaType: file.type?.startsWith("video/")
                ? "video"
                : file.type === "image/gif"
                ? "gif"
                : "image",
              mimeType: file.type,
              fileSize: file.size,
              clientId,
            });
          } catch (e) {
            console.error("Failed to save media record:", e);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
      toast({ title: "Media uploaded successfully" });
    }
  };

  const handleUploadComplete = async (result: any) => {
    const clientId = resolveUploadClientId();
    if (clientId) {
      await saveMediaRecords(result, clientId);
    } else {
      setPendingUploadResult(result);
      setSitePickerOpen(true);
    }
  };

  const handleSiteSelected = async (clientId: string) => {
    if (pendingUploadResult) {
      await saveMediaRecords(pendingUploadResult, clientId);
      setPendingUploadResult(null);
    }
  };

  const handleGetUploadParameters = async (file: any) => {
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    });
    const { uploadURL } = await res.json();
    return {
      method: "PUT" as const,
      url: uploadURL,
      headers: { "Content-Type": file.type },
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-media-title">Media Library</h1>
          <p className="text-muted-foreground">
            Upload and manage images, videos, and GIFs
          </p>
        </div>
        <ObjectUploader
          maxNumberOfFiles={10}
          maxFileSize={104857600}
          onGetUploadParameters={handleGetUploadParameters}
          onComplete={handleUploadComplete}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Media
        </ObjectUploader>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-media"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filterType === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterType("all")}
            data-testid="button-filter-all"
          >
            All
          </Button>
          <Button
            variant={filterType === "image" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterType("image")}
            data-testid="button-filter-images"
          >
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            Images
          </Button>
          <Button
            variant={filterType === "video" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterType("video")}
            data-testid="button-filter-videos"
          >
            <Video className="mr-1.5 h-3.5 w-3.5" />
            Videos
          </Button>
          <Button
            variant={filterType === "gif" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterType("gif")}
            data-testid="button-filter-gifs"
          >
            <FileImage className="mr-1.5 h-3.5 w-3.5" />
            GIFs
          </Button>
          <div className="border-l pl-2 ml-2">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div
          className={
            viewMode === "grid"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              : "space-y-2"
          }
        >
          {[...Array(8)].map((_, i) =>
            viewMode === "grid" ? (
              <Card key={i}>
                <Skeleton className="aspect-video" />
                <CardContent className="p-3">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ) : (
              <Skeleton key={i} className="h-20 rounded-lg" />
            )
          )}
        </div>
      ) : filteredMedia.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {media.length === 0 ? "No media yet" : "No results found"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {media.length === 0
                ? "Upload images, videos, or GIFs to use in your display content."
                : "Try adjusting your search or filters."}
            </p>
            {media.length === 0 && (
              <ObjectUploader
                maxNumberOfFiles={10}
                maxFileSize={104857600}
                onGetUploadParameters={handleGetUploadParameters}
                onComplete={handleUploadComplete}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Media
              </ObjectUploader>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              : "space-y-2"
          }
        >
          {filteredMedia.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              viewMode={viewMode}
              clients={clients}
              isAdmin={isAdmin}
              selectedClientId={selectedClientId}
            />
          ))}
        </div>
      )}

      <SitePickerDialog
        clients={clients}
        open={sitePickerOpen}
        onOpenChange={setSitePickerOpen}
        onSelect={handleSiteSelected}
      />
    </div>
  );
}
