// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { type ElementType, type ReactNode } from "react";
import { Copy, Grid3X3, RefreshCw, Unlink } from "lucide-react";
import type { Screen } from "@shared/schema";
import type { CanvasPairingGating } from "@shared/canvas-groups";

interface PanelProps {
  screen: Screen;
  gating: CanvasPairingGating<Screen>;
  siblingCount: number;
  onCopy: () => void;
}

export function CanvasPairingPanel({
  screen,
  gating,
  siblingCount,
  onCopy,
}: PanelProps) {
  if (!gating.showsPairingCodePanel) return null;
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          Pairing Code
          {siblingCount > 0 && (
            <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
              · pairs entire {screen.canvasWidth}×{screen.canvasHeight} canvas (
              {siblingCount + 1} tiles)
            </span>
          )}
        </p>
        <p
          className="text-lg font-mono font-bold tracking-wider"
          data-testid={`text-pairing-code-${screen.id}`}
        >
          {screen.pairingCode}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent hover:text-accent-foreground"
        data-testid={`button-copy-pairing-${screen.id}`}
        aria-label="Copy pairing code"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

interface InheritsProps {
  screen: Screen;
  gating: CanvasPairingGating<Screen>;
}

export function CanvasPairingInheritsMessage({ screen, gating }: InheritsProps) {
  if (!gating.showsInheritsMessage) return null;
  return (
    <div
      className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground flex items-center gap-2"
      data-testid={`text-inherits-pairing-${screen.id}`}
    >
      <Grid3X3 className="h-3 w-3 shrink-0" />
      <span>
        Inherits pairing from{" "}
        <span className="font-medium text-foreground">{gating.owner.name}</span>.
        Pair / regenerate / unpair on that tile to act on the entire canvas.
      </span>
    </div>
  );
}

type MenuItemProps = {
  onSelect?: (event?: Event) => void;
  "data-testid"?: string;
  children?: ReactNode;
};

interface MenuItemsProps {
  screen: Screen;
  gating: CanvasPairingGating<Screen>;
  onRegenerate: () => void;
  onUnpair: () => void;
  ItemComponent: ElementType;
}

export function CanvasPairingMenuItems({
  screen,
  gating,
  onRegenerate,
  onUnpair,
  ItemComponent,
}: MenuItemsProps) {
  return (
    <>
      {gating.showsRegenerateCodeMenuItem && (
        <ItemComponent
          onSelect={onRegenerate}
          data-testid={`button-regenerate-pairing-${screen.id}`}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate Code
        </ItemComponent>
      )}
      {gating.showsUnpairDeviceMenuItem && (
        <ItemComponent
          onSelect={onUnpair}
          data-testid={`button-unpair-${screen.id}`}
        >
          <Unlink className="mr-2 h-4 w-4" />
          Unpair Device
        </ItemComponent>
      )}
    </>
  );
}
