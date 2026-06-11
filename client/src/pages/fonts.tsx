import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSiteContext } from "@/hooks/use-site-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Type, Trash2, Upload } from "lucide-react";
import {
  ALLOWED_FONT_EXTENSIONS,
  customFontKey,
  resolveFontStack,
} from "@shared/fonts";
import type { CustomFont } from "@shared/schema";

const ACCEPT = ALLOWED_FONT_EXTENSIONS.map((e) => `.${e}`).join(",");

export default function FontsPage() {
  const { selectedClientId, clients } = useSiteContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const { data: fonts = [], isLoading } = useQuery<CustomFont[]>({
    queryKey: ["/api/fonts", selectedClientId],
    queryFn: async () => {
      const res = await fetch(
        `/api/fonts?clientId=${encodeURIComponent(selectedClientId!)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const handleUpload = async () => {
    if (!file || !selectedClientId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("clientId", selectedClientId);
      if (name.trim()) form.append("name", name.trim());
      const res = await fetch("/api/fonts/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      toast({ title: "Font uploaded", description: "Your font is ready to use." });
      setName("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/fonts"] });
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e.message || "Could not upload font",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/fonts/${id}`);
      toast({ title: "Font deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/fonts"] });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e.message || "Could not delete font",
        variant: "destructive",
      });
    }
  };

  if (!selectedClientId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold mb-2">Fonts</h1>
        <p className="text-muted-foreground" data-testid="text-no-site">
          Select a site to manage its fonts.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Type className="h-6 w-6" /> Fonts
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload custom fonts for{" "}
          <span className="font-medium">{selectedClient?.name ?? "this site"}</span>.
          They'll appear in the font picker on agenda displays and layout text
          zones, and render on your screens — even offline.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a font</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="font-name">Display name (optional)</Label>
            <Input
              id="font-name"
              placeholder="e.g. Brand Headline"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-font-name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="font-file">Font file ({ALLOWED_FONT_EXTENSIONS.join(", ")})</Label>
            <Input
              id="font-file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-font-file"
            />
          </div>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            data-testid="button-upload-font"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading…" : "Upload font"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your fonts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : fonts.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-fonts">
              No custom fonts yet. Upload one above to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {fonts.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between py-3 gap-4"
                  data-testid={`row-font-${f.id}`}
                >
                  <div className="min-w-0">
                    <div
                      className="text-lg truncate"
                      style={{ fontFamily: resolveFontStack(customFontKey(f.id)) }}
                      data-testid={`text-font-preview-${f.id}`}
                    >
                      {f.name} — The quick brown fox 0123
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.originalName} · {f.format.toUpperCase()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(f.id)}
                    data-testid={`button-delete-font-${f.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
