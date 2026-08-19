// Shared jsdom bootstrap for component-level tests run under
// `tsx --test`. Import this BEFORE any module that touches the DOM
// (including React's renderer, Radix UI primitives, or @testing-
// library helpers) — every globalThis.window / globalThis.document
// binding must be live by the time those modules evaluate.
//
// We keep this in one file so test authors don't have to re-derive
// which jsdom polyfills Radix UI needs (pointer capture,
// scrollIntoView, etc.).

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

function copyProps(src: any, target: any) {
  for (const key of Object.getOwnPropertyNames(src)) {
    if (key in target) continue;
    try {
      Object.defineProperty(
        target,
        key,
        Object.getOwnPropertyDescriptor(src, key)!,
      );
    } catch {
      // some props (e.g. Symbol-keyed, non-configurable) refuse —
      // safe to skip, React doesn't need them.
    }
  }
}

(globalThis as any).window = window;
(globalThis as any).document = window.document;
// Node 24 made `navigator` a built-in getter-only property on globalThis.
// Direct assignment throws "Cannot set property … which has only a getter".
// Use defineProperty so we can substitute jsdom's navigator on any Node version.
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  writable: true,
  configurable: true,
});
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).HTMLDivElement = window.HTMLDivElement;
(globalThis as any).HTMLButtonElement = window.HTMLButtonElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
// Node 20 ships its own global `Event` / `CustomEvent` / `EventTarget`
// that are NOT instances of jsdom's classes. Radix's dismissable-layer
// does `new CustomEvent(...)` and dispatches it on the jsdom document,
// which then rejects it as "parameter 1 is not of type 'Event'".
// Force-overwrite the event family so constructed events satisfy
// jsdom's brand checks.
for (const k of [
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "InputEvent",
  "UIEvent",
  "EventTarget",
]) {
  (globalThis as any)[k] = (window as any)[k];
}
(globalThis as any).PointerEvent = (window as any).PointerEvent || window.MouseEvent;
(globalThis as any).getComputedStyle = window.getComputedStyle.bind(window);
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
copyProps(window, globalThis);

// Radix UI calls these on its trigger/content elements; jsdom does
// not implement them, so the dropdown click handler throws unless
// we no-op them at the prototype level.
if (!window.HTMLElement.prototype.hasPointerCapture) {
  (window.HTMLElement.prototype as any).hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  (window.HTMLElement.prototype as any).setPointerCapture = () => {};
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  (window.HTMLElement.prototype as any).releasePointerCapture = () => {};
}
if (!window.Element.prototype.scrollIntoView) {
  (window.Element.prototype as any).scrollIntoView = () => {};
}

// Radix Select / Popover use ResizeObserver via @radix-ui/react-use-size
// to track trigger dimensions for the floating panel. jsdom doesn't
// ship one, so stub a no-op observer.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = NoopResizeObserver;
(window as any).ResizeObserver = NoopResizeObserver;

// DOMRect.fromRect / getBoundingClientRect are used by Radix to
// position floating content. jsdom returns zeroed rects which is
// fine — but a few internals call .fromRect on Element, so provide
// a safe stub when missing.
if (!(globalThis as any).DOMRect) {
  (globalThis as any).DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    static fromRect(other: any = {}) {
      return new (this as any)(
        other.x || 0,
        other.y || 0,
        other.width || 0,
        other.height || 0,
      );
    }
    get top() {
      return this.y;
    }
    get left() {
      return this.x;
    }
    get right() {
      return this.x + this.width;
    }
    get bottom() {
      return this.y + this.height;
    }
    toJSON() {
      return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
  };
}

// React 18 reads this to decide between sync/concurrent error paths.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
