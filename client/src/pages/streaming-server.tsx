import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Copy, Check, Server, Wifi, WifiOff, Radio, Eye, EyeOff, Settings2 } from "lucide-react";

interface OmeConfig {
  apiUrl: string;
  accessToken: string;
}

interface OmeStatus {
  connected: boolean;
  version?: string;
  uptime?: string;
  error?: string;
}

interface OmeStream {
  vhost: string;
  app: string;
  stream: string;
  inputType?: string;
  inputUrl?: string;
  tracks?: Array<{ type: string; codec?: string; bitrate?: number; width?: number; height?: number; framerate?: number; samplerate?: number; channel?: number }>;
  outputs?: Array<{ name?: string; protocol?: string; url?: string; tracks?: Array<{ type: string; codec?: string }> }>;
  viewers?: number;
}

function CopyButton({ text, label, buttonLabel }: { text: string; label?: string; buttonLabel?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1 text-xs"
      data-testid={`button-copy-${label || "url"}`}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : (buttonLabel || "Copy")}
    </Button>
  );
}

export default function StreamingServerPage() {
  const { toast } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  const configQuery = useQuery<OmeConfig>({
    queryKey: ["/api/ome/config"],
  });

  useEffect(() => {
    if (configQuery.data) {
      setApiUrl(configQuery.data.apiUrl || "");
      setAccessToken(configQuery.data.accessToken || "");
      setConfigDirty(false);
    }
  }, [configQuery.data]);

  const statusQuery = useQuery<OmeStatus>({
    queryKey: ["/api/ome/status"],
    refetchInterval: 10000,
    enabled: !!configQuery.data?.apiUrl,
  });

  const streamsQuery = useQuery<OmeStream[]>({
    queryKey: ["/api/ome/streams"],
    refetchInterval: 10000,
    enabled: !!configQuery.data?.apiUrl && statusQuery.data?.connected === true,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: { apiUrl: string; accessToken: string }) => {
      const res = await apiRequest("PUT", "/api/ome/config", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved", description: "OME connection settings updated." });
      setConfigDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/ome/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ome/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ome/streams"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveConfigMutation.mutate({ apiUrl: apiUrl.trim(), accessToken: accessToken.trim() });
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ome/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ome/streams"] });
  };

  const buildWebrtcUrl = (stream: OmeStream) => {
    if (!configQuery.data?.apiUrl) return "";
    try {
      const apiUrlObj = new URL(configQuery.data.apiUrl);
      const wsProtocol = apiUrlObj.protocol === "https:" ? "wss:" : "ws:";
      const host = apiUrlObj.hostname;
      const wsPort = apiUrlObj.protocol === "https:" ? "3334" : "3333";
      return `${wsProtocol}//${host}:${wsPort}/${stream.app}/${stream.stream}`;
    } catch {
      return "";
    }
  };

  const isConnected = statusQuery.data?.connected === true;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Streaming Server</h1>
          <p className="text-muted-foreground mt-1">Manage your OvenMediaEngine instance and monitor active streams</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={!configQuery.data?.apiUrl}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Connection Settings
            </CardTitle>
            <CardDescription>Configure the OvenMediaEngine API endpoint and authentication</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ome-api-url">API Base URL</Label>
              <Input
                id="ome-api-url"
                placeholder="https://ome-server:8081"
                value={apiUrl}
                onChange={(e) => { setApiUrl(e.target.value); setConfigDirty(true); }}
                data-testid="input-ome-api-url"
              />
              <p className="text-xs text-muted-foreground">The base URL for OME's REST API (port 8081 by default)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ome-access-token">Access Token</Label>
              <div className="relative">
                <Input
                  id="ome-access-token"
                  type={showToken ? "text" : "password"}
                  placeholder="OME API access token"
                  value={accessToken}
                  onChange={(e) => { setAccessToken(e.target.value); setConfigDirty(true); }}
                  className="pr-10"
                  data-testid="input-ome-access-token"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowToken(!showToken)}
                  data-testid="button-toggle-token-visibility"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Token configured in OME's Server.xml under &lt;AccessToken&gt;</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saveConfigMutation.isPending || !configDirty}
              className="w-full"
              data-testid="button-save-config"
            >
              {saveConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server Status
            </CardTitle>
            <CardDescription>OvenMediaEngine server connection and health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configQuery.data?.apiUrl ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <WifiOff className="h-10 w-10 mb-3" />
                <p className="text-sm font-medium">Not Configured</p>
                <p className="text-xs mt-1">Enter the OME API URL and save to connect</p>
              </div>
            ) : statusQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-green-500" />
                  <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400" data-testid="badge-connection-status">
                    Connected
                  </Badge>
                </div>
                {statusQuery.data?.version && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-medium" data-testid="text-ome-version">{statusQuery.data.version}</span>
                  </div>
                )}
                {statusQuery.data?.uptime && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-medium" data-testid="text-ome-uptime">{statusQuery.data.uptime}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active Streams</span>
                  <span className="font-medium" data-testid="text-stream-count">{streamsQuery.data?.length ?? "..."}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-destructive">
                <WifiOff className="h-10 w-10 mb-3" />
                <p className="text-sm font-medium">Connection Failed</p>
                <p className="text-xs mt-1 text-muted-foreground max-w-[250px] text-center">
                  {statusQuery.data?.error || "Unable to reach the OME API. Check the URL and token."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Active Streams
          </CardTitle>
          <CardDescription>Live streams currently available on the OvenMediaEngine server</CardDescription>
        </CardHeader>
        <CardContent>
          {!configQuery.data?.apiUrl ? (
            <p className="text-sm text-muted-foreground text-center py-8">Configure the OME connection above to view streams</p>
          ) : !isConnected ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cannot load streams — OME is not connected</p>
          ) : streamsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !streamsQuery.data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-streams">No active streams</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stream</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Tracks</TableHead>
                    <TableHead>Outputs</TableHead>
                    <TableHead className="text-center">Viewers</TableHead>
                    <TableHead className="text-right">Copy URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streamsQuery.data.map((stream, idx) => {
                    const webrtcUrl = buildWebrtcUrl(stream);
                    const videoTrack = stream.tracks?.find(t => t.type === "Video" || t.type === "video");
                    const audioTrack = stream.tracks?.find(t => t.type === "Audio" || t.type === "audio");

                    return (
                      <TableRow key={`${stream.vhost}-${stream.app}-${stream.stream}`} data-testid={`row-stream-${idx}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-medium" data-testid={`text-stream-name-${idx}`}>{stream.stream}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{stream.vhost}/{stream.app}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{stream.inputType || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {videoTrack && (
                              <Badge variant="secondary" className="text-xs">
                                {videoTrack.codec || "Video"}{videoTrack.width ? ` ${videoTrack.width}x${videoTrack.height}` : ""}
                              </Badge>
                            )}
                            {audioTrack && (
                              <Badge variant="secondary" className="text-xs">
                                {audioTrack.codec || "Audio"}
                              </Badge>
                            )}
                            {!videoTrack && !audioTrack && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {stream.outputs && stream.outputs.length > 0 ? (
                              stream.outputs.map((o, oi) => (
                                <Badge key={oi} variant="outline" className="text-xs">
                                  {o.protocol || o.name || "output"}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium tabular-nums" data-testid={`text-viewers-${idx}`}>{stream.viewers ?? 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {webrtcUrl && <CopyButton text={webrtcUrl} label={`webrtc-${idx}`} buttonLabel="WebRTC" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
