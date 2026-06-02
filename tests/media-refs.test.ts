// Unit coverage for the {{media:ID}} reference resolver used by the HTML
// widget. The author writes `{{media:ID}}` (via the editor's image picker) and
// resolveMediaRefs turns it into the same token-aware URL the media zones use,
// so an authored image loads in the editor preview, the simulator, and on a
// paired device.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveMediaRefs, buildMediaImgSnippet } from "../shared/media-refs";

const local = { id: "abc-123", originalPath: "abc-123/uploads/x.png" };
const remote = { id: "rmt-9", originalPath: "https://cdn.example.com/y.jpg" };

test("local asset resolves to the admin URL when no token is given", () => {
  const out = resolveMediaRefs(`<img src="{{media:abc-123}}">`, { media: [local] });
  assert.equal(out, `<img src="/api/media/abc-123/file">`);
});

test("local asset appends the device token and uses the player base URL", () => {
  const out = resolveMediaRefs(`<img src="{{media:abc-123}}">`, {
    media: [local],
    mediaBaseUrl: "/api/player/media",
    deviceToken: "tok_42",
  });
  assert.equal(out, `<img src="/api/player/media/abc-123/file?token=tok_42">`);
});

test("absolute http originalPath passes straight through (token ignored)", () => {
  const out = resolveMediaRefs(`<img src="{{media:rmt-9}}">`, {
    media: [remote],
    deviceToken: "tok_42",
  });
  assert.equal(out, `<img src="https://cdn.example.com/y.jpg">`);
});

test("unknown asset id leaves the token untouched", () => {
  const html = `<img src="{{media:missing}}">`;
  assert.equal(resolveMediaRefs(html, { media: [local] }), html);
});

test("whitespace inside the token is tolerated", () => {
  const out = resolveMediaRefs(`<img src="{{ media: abc-123 }}">`, { media: [local] });
  assert.equal(out, `<img src="/api/media/abc-123/file">`);
});

test("multiple references in one document all resolve", () => {
  const out = resolveMediaRefs(`{{media:abc-123}}|{{media:rmt-9}}`, {
    media: [local, remote],
  });
  assert.equal(out, `/api/media/abc-123/file|https://cdn.example.com/y.jpg`);
});

test("empty input is handled", () => {
  assert.equal(resolveMediaRefs("", { media: [local] }), "");
});

test("buildMediaImgSnippet emits a {{media:ID}} src and escapes the alt", () => {
  const snippet = buildMediaImgSnippet({ id: "abc-123", name: `Logo "v2" <x>` });
  assert.ok(snippet.includes(`src="{{media:abc-123}}"`));
  assert.ok(snippet.includes(`alt="Logo &quot;v2&quot; &lt;x>"`));
});

test("snippet round-trips through resolveMediaRefs", () => {
  const snippet = buildMediaImgSnippet({ id: "abc-123", name: "Logo" });
  const out = resolveMediaRefs(snippet, { media: [local] });
  assert.ok(out.includes(`src="/api/media/abc-123/file"`));
});
