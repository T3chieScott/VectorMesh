import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSiteContext } from "@/hooks/use-site-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Type, Trash2, Upload, Plus } from "lucide-react";
import {
  ALLOWED_FONT_EXTENSIONS,
  customFontKey,
  resolveFontStack,
  fontWeightLabel,
  FONT_WEIGHT_OPTIONS,
  FONT_STYLE_OPTIONS,
  DEFAULT_FONT_WEIGHT,
} from "@shared/fonts";
import type { CustomFont } from "@shared/schema";

const ACCEPT = ALLOWED_FONT_EXTENSIONS.map((e) => `.${e}`).join(",");

interface FontFamily {
  familyId: string;
  name: string;
  files: CustomFont[];
}

export default function FontsPage() {
  const { selectedClientId, clients } = useSiteContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(String(DEFAULT_FONT_WEIGHT));
  const [style, setStyle] = useState<"normal" | "italic">("normal");
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

  // Group the per-file rows into families (one card per family).
  const families = useMemo<FontFamily[]>(() => {
    const map = new Map<string, FontFamily>();
    for (const f of fonts) {
      const fam = f.familyId || f.id;
      if (!map.has(fam)) map.set(fam, { familyId: fam, name: f.name, files: [] });
      map.get(fam)!.files.push(f);
    }
    for (const fam of map.values()) {
      fam.files.sort((a, b) => (a.weight ?? 400) - (b.weight ?? 400));
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fonts]);

  // Upload a font file. When `familyId` is provided the file is added to
  // that existing family as a new weight/style; otherwise a new family is
  // created using the typed name.
  const uploadFile = async (opts: {
    file: File;
    familyId?: string;
    name?: string;
    weight: number;
    style: "normal" | "italic";
  }) => {
    if (!selectedClientId) return false;
    const form = new FormData();
    form.append("file", opts.file);
    form.append("clientId", selectedClientId);
    form.append("weight", String(opts.weight));
    form.append("style", opts.style);
    if (opts.familyId) form.append("familyId", opts.familyId);
    if (opts.name && opts.name.trim()) form.append("name", opts.name.trim());
    const res = await fetch("/api/fonts/upload", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed (${res.status})`);
    }
    return true;
  };

  const handleCreateFamily = async () => {
    if (!file || !selectedClientId) return;
    setUploading(true);
    try {
      await uploadFile({
        file,
        name: name.trim() || undefined,
        weight: parseInt(weight, 10),
        style,
      });
      toast({ title: "Font uploaded", description: "Your font family is ready to use." });
      setName("");
      setWeight(String(DEFAULT_FONT_WEIGHT));
      setStyle("normal");
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

  const handleDeleteFile = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/fonts/${id}`);
      toast({ title: "Style deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/fonts"] });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e.message || "Could not delete style",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFamily = async (familyId: string) => {
    try {
      await apiRequest("DELETE", `/api/fonts/family/${familyId}`);
      toast({ title: "Font family deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/fonts"] });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e.message || "Could not delete font family",
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
          <CardTitle className="text-base">Add a font family</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload one file to start a family. Add more files (Bold, Italic, etc.)
            to the family below and the right one is used automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="font-name">Family name</Label>
            <Input
              id="font-name"
              placeholder="e.g. Brand Sans"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-font-name"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Weight</Label>
              <Select value={weight} onValueChange={setWeight}>
                <SelectTrigger data-testid="select-font-weight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_WEIGHT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as "normal" | "italic")}>
                <SelectTrigger data-testid="select-font-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            onClick={handleCreateFamily}
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
          ) : families.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-fonts">
              No custom fonts yet. Upload one above to get started.
            </p>
          ) : (
            <div className="space-y-6">
              {families.map((fam) => (
                <FamilyCard
                  key={fam.familyId}
                  family={fam}
                  onDeleteFile={handleDeleteFile}
                  onDeleteFamily={handleDeleteFamily}
                  onAddStyle={async (opts) => {
                    await uploadFile({ ...opts, familyId: fam.familyId, name: fam.name });
                    queryClient.invalidateQueries({ queryKey: ["/api/fonts"] });
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FamilyCard({
  family,
  onDeleteFile,
  onDeleteFamily,
  onAddStyle,
}: {
  family: FontFamily;
  onDeleteFile: (id: string) => void;
  onDeleteFamily: (familyId: string) => void;
  onAddStyle: (opts: { file: File; weight: number; style: "normal" | "italic" }) => Promise<void>;
}) {
  const { toast } = useToast();
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const [weight, setWeight] = useState(String(DEFAULT_FONT_WEIGHT));
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!addFile) return;
    setAdding(true);
    try {
      await onAddStyle({ file: addFile, weight: parseInt(weight, 10), style });
      toast({ title: "Style added" });
      setAddFile(null);
      setWeight(String(DEFAULT_FONT_WEIGHT));
      setStyle("normal");
      if (addInputRef.current) addInputRef.current.value = "";
    } catch (e: any) {
      toast({
        title: "Add failed",
        description: e.message || "Could not add style",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-4" data-testid={`card-font-family-${family.familyId}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{family.name}</div>
          <div
            className="text-2xl truncate"
            style={{ fontFamily: resolveFontStack(customFontKey(family.familyId)) }}
            data-testid={`text-font-preview-${family.familyId}`}
          >
            The quick brown fox jumps over the lazy dog 0123
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDeleteFamily(family.familyId)}
          data-testid={`button-delete-family-${family.familyId}`}
        >
          <Trash2 className="h-4 w-4 mr-2 text-destructive" />
          Delete family
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {family.files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between py-2 px-3 gap-4"
            data-testid={`row-font-${f.id}`}
          >
            <div className="min-w-0">
              <span
                className="text-base"
                style={{
                  fontFamily: resolveFontStack(customFontKey(family.familyId)),
                  fontWeight: f.weight ?? 400,
                  fontStyle: f.style === "italic" ? "italic" : "normal",
                }}
              >
                {fontWeightLabel(f.weight)}{f.style === "italic" ? " Italic" : ""}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {f.originalName} · {f.format.toUpperCase()}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDeleteFile(f.id)}
              data-testid={`button-delete-font-${f.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label className="text-xs">Weight</Label>
          <Select value={weight} onValueChange={setWeight}>
            <SelectTrigger data-testid={`select-add-weight-${family.familyId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Style</Label>
          <Select value={style} onValueChange={(v) => setStyle(v as "normal" | "italic")}>
            <SelectTrigger data-testid={`select-add-style-${family.familyId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_STYLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">File</Label>
          <Input
            ref={addInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
            data-testid={`input-add-file-${family.familyId}`}
          />
        </div>
        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={!addFile || adding}
          data-testid={`button-add-style-${family.familyId}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          {adding ? "Adding…" : "Add style"}
        </Button>
      </div>
    </div>
  );
}
