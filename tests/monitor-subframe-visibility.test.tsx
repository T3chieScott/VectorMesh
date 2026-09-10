import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { HtmlWidgetSubframe } from "../client/src/components/html-widget-subframe";

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLIFrameElement: dom.window.HTMLIFrameElement,
    MutationObserver: dom.window.MutationObserver,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
});

afterEach(() => {
  cleanup();
  dom.window.close();
});

function iframe(container: HTMLElement) {
  return container.querySelector('[data-testid="iframe-html-widget"]') as HTMLIFrameElement;
}

function iframeWith(container: HTMLElement, content: string) {
  return [...container.querySelectorAll<HTMLIFrameElement>('[data-testid="iframe-html-widget"]')]
    .find((frame) => frame.srcdoc.includes(content))!;
}

function Subframe({
  content,
  preparing = false,
}: {
  content: string;
  preparing?: boolean;
}) {
  return (
    <HtmlWidgetSubframe
      srcDoc={`<!doctype html><html><body>${content}</body></html>`}
      width={1920}
      height={1080}
      preparing={preparing}
    />
  );
}

function assertSuppressed(frame: HTMLIFrameElement) {
  assert.equal(frame.dataset.subframeState, "suppressed");
  assert.equal(frame.style.visibility, "hidden");
  assert.equal(frame.style.opacity, "0");
  assert.equal(frame.style.pointerEvents, "none");
  assert.equal(frame.getAttribute("aria-hidden"), "true");
}

function assertVisible(frame: HTMLIFrameElement) {
  assert.equal(frame.dataset.subframeState, "visible");
  assert.equal(frame.style.visibility, "visible");
  assert.equal(frame.style.opacity, "1");
  assert.equal(frame.style.pointerEvents, "auto");
  assert.equal(frame.getAttribute("aria-hidden"), "false");
}

describe("Monitor HTML subframe visibility", () => {
  test("a committed iframe is suppressed from its default about:blank state until its exact srcDoc loads", () => {
    const view = render(<Subframe content="<p>scene A</p>" />);
    const frame = iframe(view.container);
    assert.ok(frame.srcdoc.includes("scene A"));
    assert.equal(frame.getAttribute("src"), null);
    assertSuppressed(frame);

    fireEvent.load(frame);
    assertVisible(frame);
  });

  test("an incoming prepared iframe stays suppressed after load and is revealed atomically on commit", () => {
    const view = render(<Subframe content="<p>scene B</p>" preparing />);
    const frame = iframe(view.container);
    assertSuppressed(frame);

    fireEvent.load(frame);
    assertSuppressed(frame);

    view.rerender(<Subframe content="<p>scene B</p>" preparing={false} />);
    assert.strictEqual(iframe(view.container), frame);
    assertVisible(frame);
  });

  test("the outgoing committed iframe remains visible while a separate incoming iframe prepares", () => {
    const outgoing = render(<Subframe content="<p>outgoing</p>" />);
    const outgoingFrame = iframe(outgoing.container);
    fireEvent.load(outgoingFrame);
    assertVisible(outgoingFrame);

    const incoming = render(<Subframe content="<p>incoming</p>" preparing />);
    const incomingFrame = iframe(incoming.container);
    fireEvent.load(incomingFrame);
    assertVisible(outgoingFrame);
    assertSuppressed(incomingFrame);
  });

  test("changing srcDoc keeps the outgoing document visible until the suppressed replacement loads", () => {
    const view = render(<Subframe content="<p>scene A</p>" />);
    const frame = iframe(view.container);
    fireEvent.load(frame);
    assertVisible(frame);

    view.rerender(<Subframe content="<p>scene B</p>" />);
    const replacement = iframeWith(view.container, "scene B");
    assert.equal(view.container.querySelectorAll("iframe").length, 2);
    assert.strictEqual(iframeWith(view.container, "scene A"), frame);
    assertVisible(frame);
    assertSuppressed(replacement);

    fireEvent.load(replacement);
    assert.equal(view.container.querySelectorAll("iframe").length, 1);
    assert.strictEqual(iframe(view.container), replacement);
    assertVisible(replacement);
  });

  test("retiring content cannot return visible and unchanged content retains its iframe", () => {
    const view = render(<Subframe content="<p>stable</p>" />);
    const frame = iframe(view.container);
    fireEvent.load(frame);
    assertVisible(frame);

    view.rerender(<Subframe content="<p>stable</p>" preparing />);
    assert.strictEqual(iframe(view.container), frame);
    assertSuppressed(frame);
    fireEvent.load(frame);
    assertSuppressed(frame);

    view.rerender(<Subframe content="<p>stable</p>" preparing />);
    assert.strictEqual(iframe(view.container), frame);
    assertSuppressed(frame);
  });
});