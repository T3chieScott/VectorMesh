// Task #244 — HTML/CSS widget sanitiser unit coverage.
//
// The sandboxed iframe (sandbox="allow-same-origin", no allow-scripts) is the
// primary security boundary, but the server runs these helpers before any
// snippet reaches a device. These tests prove the second layer holds:
//   (a) benign HTML+CSS survives intact,
//   (b) <script> tags / inline handlers / javascript: URLs are stripped,
//   (c) CSS can't break out of its <style> context,
//   (d) zone-array sanitisation only touches HTML zones and never mutates input.

import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeWidgetHtml,
  sanitizeWidgetCss,
  sanitizeHtmlZones,
} from "../shared/html-widget-sanitize";
import type { LayoutZone } from "../shared/schema";

test("benign HTML is preserved", () => {
  const html = `<div class="card"><h1>Hello</h1><img src="/logo.png" alt="x"></div>`;
  assert.equal(sanitizeWidgetHtml(html), html);
});

test("<script> blocks are stripped", () => {
  const out = sanitizeWidgetHtml(
    `<div>safe</div><script>window.x=1;document.cookie</script><p>end</p>`,
  );
  assert.ok(!/<script/i.test(out), "no script tag remains");
  assert.ok(!out.includes("document.cookie"), "script body removed");
  assert.ok(out.includes("<div>safe</div>") && out.includes("<p>end</p>"));
});

test("orphan/unclosed script tags are stripped", () => {
  const out = sanitizeWidgetHtml(`<div>hi</div><script src="evil.js">`);
  assert.ok(!/<script/i.test(out));
  assert.ok(out.includes("<div>hi</div>"));
});

test("inline event-handler attributes are removed", () => {
  const out = sanitizeWidgetHtml(
    `<img src="x" onerror="alert(1)"><div onclick='steal()'>x</div><b ONLOAD=go>y</b>`,
  );
  assert.ok(!/onerror/i.test(out), "onerror removed");
  assert.ok(!/onclick/i.test(out), "onclick removed");
  assert.ok(!/onload/i.test(out), "onload removed");
  assert.ok(out.includes("<div") && out.includes("<b"));
});

test("javascript: URLs in href/src are neutralised", () => {
  const out = sanitizeWidgetHtml(
    `<a href="javascript:alert(1)">x</a><img src='javascript:evil()'>`,
  );
  assert.ok(!/javascript:/i.test(out), "no javascript: scheme remains");
});

test("CSS that tries to break out of <style> is neutralised", () => {
  const out = sanitizeWidgetCss(
    `.x{color:red}</style><script>alert(1)</script>`,
  );
  assert.ok(!/<\/style/i.test(out), "closing style tag removed");
  assert.ok(!/<script/i.test(out), "injected script removed");
  assert.ok(out.includes(".x{color:red}"), "real CSS preserved");
});

test("benign CSS is preserved", () => {
  const css = `.card { background: #1e293b; color: white; display: flex; }`;
  assert.equal(sanitizeWidgetCss(css), css);
});

test("empty / nullish inputs return empty strings", () => {
  assert.equal(sanitizeWidgetHtml(undefined), "");
  assert.equal(sanitizeWidgetHtml(null), "");
  assert.equal(sanitizeWidgetCss(""), "");
});

test("sanitizeHtmlZones only rewrites HTML zones and leaves others untouched", () => {
  const zones: LayoutZone[] = [
    {
      id: "z1",
      name: "HTML",
      type: "html",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      textContent: `<div>ok</div><script>bad()</script>`,
      htmlCss: `.a{}</style><script>x</script>`,
    },
    {
      id: "z2",
      name: "Text",
      type: "text",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      textContent: `<script>not-an-html-zone</script>`,
    },
  ];
  const original = JSON.parse(JSON.stringify(zones));
  const out = sanitizeHtmlZones(zones);

  // HTML zone cleaned
  assert.ok(!/<script/i.test(out[0].textContent || ""));
  assert.ok(!/<script/i.test(out[0].htmlCss || ""));
  assert.ok((out[0].textContent || "").includes("<div>ok</div>"));

  // Non-HTML zone left byte-for-byte identical
  assert.equal(out[1].textContent, `<script>not-an-html-zone</script>`);

  // Input array not mutated
  assert.deepEqual(zones, original);
});

test("sanitizeHtmlZones tolerates null/non-array input", () => {
  assert.deepEqual(sanitizeHtmlZones(null), []);
  assert.deepEqual(sanitizeHtmlZones(undefined), []);
});
