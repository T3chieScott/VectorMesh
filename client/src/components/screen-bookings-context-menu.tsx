import { useState, type ReactNode } from "react";
import { ClipboardCopy, ClipboardPaste, Loader2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { useBookingsClipboard } from "@/hooks/use-bookings-clipboard";
import { PasteBookingsDialog } from "@/components/paste-bookings-dialog";
import type { ScreenEventBooking, Event } from "@shared/schema";

interface Props {
  screen: { id: string; name: string; clientId?: string | null; locked?: boolean | null };
  events: Event[];
  children: ReactNode;
  // Passing `asChild` through to the underlying ContextMenuTrigger lets
  // the caller render its own root element (Card / TableRow) and have
  // the right-click handler attached directly to it without an extra
  // wrapper div that could break flexbox/grid layout.
  asChild?: boolean;
}

export function ScreenBookingsContextMenu({ screen, events, children, asChild = true }: Props) {
  const { toast } = useToast();
  const { clipboard, copyFrom } = useBookingsClipboard();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const canPaste =
    !!clipboard &&
    clipboard.bookings.length > 0 &&
    !screen.locked &&
    clipboard.sourceScreenId !== screen.id;

  async function handleCopy() {
    setCopying(true);
    try {
      // Fetch fresh on copy — the user might have added/removed
      // bookings since the page loaded, and we don't want to copy a
      // stale list.
      const res = await fetch(`/api/screens/${screen.id}/bookings`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      const bookings = (await res.json()) as ScreenEventBooking[];
      copyFrom({ id: screen.id, name: screen.name }, bookings);
      toast({
        title: bookings.length === 0
          ? "Copied 0 bookings"
          : `Copied ${bookings.length} ${bookings.length === 1 ? "booking" : "bookings"}`,
        description: bookings.length === 0
          ? "This screen has no bookings to copy."
          : `From ${screen.name}. Right-click another screen and choose Paste bookings.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to copy bookings";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild={asChild} data-testid={`context-trigger-screen-${screen.id}`}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[14rem]">
          <ContextMenuLabel className="text-xs text-muted-foreground">{screen.name}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={copying}
            onSelect={(e) => {
              e.preventDefault();
              void handleCopy();
            }}
            data-testid={`context-copy-bookings-${screen.id}`}
          >
            {copying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCopy className="mr-2 h-4 w-4" />
            )}
            Copy bookings
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canPaste}
            onSelect={(e) => {
              e.preventDefault();
              setPasteOpen(true);
            }}
            data-testid={`context-paste-bookings-${screen.id}`}
          >
            <ClipboardPaste className="mr-2 h-4 w-4" />
            {clipboard
              ? `Paste ${clipboard.bookings.length} ${clipboard.bookings.length === 1 ? "booking" : "bookings"}`
              : "Paste bookings"}
            {clipboard && (
              <span className="ml-auto pl-2 text-xs text-muted-foreground truncate max-w-[7rem]">
                from {clipboard.sourceScreenName}
              </span>
            )}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <PasteBookingsDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        clipboard={clipboard}
        targetScreen={{ id: screen.id, name: screen.name }}
        events={events}
      />
    </>
  );
}
