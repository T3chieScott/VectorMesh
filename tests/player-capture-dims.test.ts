import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Regression test for Task #80 (Fix cropped player snapshots).
//
// The fix in client/src/pages/player.tsx depends on two coupled invariants
// that html2canvas relies on at capture time:
//   (a) The capture target element [data-testid="player-capture-target"]
//       has explicit inline style.width / style.height set from the player's
//       captureW / captureH (or tpCaptureW / tpCaptureH for the test pattern
//       path). The captureScreenshot callback reads these via offsetWidth /
//       offsetHeight (un-transformed by `transform: scale(...)`) and feeds
//       them to html2canvas as its capture box.
//   (b) captureW / captureH are bound to the formula
//         canvasEnabled ? canvasW : trueWidth
//       (and equivalent for height). Drift in this formula re-introduces
//       the cropping bug for either canvas-enabled or non-canvas screens.
//
// We assert these invariants by static analysis of the JSX source. A
// browser-level (Playwright) test that exercises html2canvas itself is
// tracked as a follow-up — this test catches the most common regression
// vector (someone editing the inline style or the formula) without needing
// a JSDOM/React render harness.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const playerSource = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "player.tsx"),
  "utf8",
);

function captureTargetBlocks(src: string): string[] {
  // Extract each <div ...data-testid="player-capture-target"...> opening
  // tag including its style prop block. The capture target appears twice
  // as a JSX attribute (test pattern path + layout path); we want both.
  // The same data-testid string also appears inside captureScreenshot's
  // onclone querySelector — filter those out via negative lookbehind on
  // the `[` of the CSS attribute selector and on the surrounding quote.
  const blocks: string[] = [];
  const testIdRe = /(?<![\['"])\s+data-testid="player-capture-target"/g;
  let m: RegExpExecArray | null;
  while ((m = testIdRe.exec(src)) !== null) {
    // Walk backwards to find the enclosing `<div` opening this element.
    const before = src.slice(0, m.index);
    const divStart = before.lastIndexOf("<div");
    assert.ok(
      divStart >= 0,
      "expected <div opening before player-capture-target",
    );
    // Walk forward to find the matching `>` that closes the opening tag,
    // tolerating nested braces inside style={{ ... }}.
    let i = m.index;
    let depth = 0;
    let end = -1;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        end = i;
        break;
      }
      i++;
    }
    assert.ok(end > divStart, "expected closing > for opening tag");
    blocks.push(src.slice(divStart, end + 1));
  }
  return blocks;
}

const blocks = captureTargetBlocks(playerSource);

test("player.tsx contains exactly three [data-testid=player-capture-target] elements", () => {
  // One for the test pattern path, one for the layout (live content) path,
  // and one for the canvas-composite path (Task #173: a single Pi paired
  // against a multi-tile canvas renders every tile in one viewport). If
  // this changes, the captureScreenshot onclone selector that resets
  // `transform: none` on the cloned target may need to be revisited.
  assert.equal(blocks.length, 3);
});

test("each capture target has inline style.width / style.height bound to a captureW/H variable", () => {
  for (const block of blocks) {
    const widthMatch = block.match(/width:\s*`\$\{(\w+)\}px`/);
    const heightMatch = block.match(/height:\s*`\$\{(\w+)\}px`/);
    assert.ok(
      widthMatch,
      `capture target missing inline style.width: ${block}`,
    );
    assert.ok(
      heightMatch,
      `capture target missing inline style.height: ${block}`,
    );
    // The width/height variable must be one of the recognized capture-dim
    // names — captureW/captureH (layout path), tpCaptureW/tpCaptureH (test
    // pattern path), or cwW/cwH (canvas-composite path; bound to the
    // server-provided canvas.width / canvas.height — see Task #173). This
    // catches accidental swaps to slot/scaled dimensions, which were the
    // symptom of the cropping bug.
    const wVar = widthMatch[1];
    const hVar = heightMatch[1];
    assert.ok(
      ["captureW", "tpCaptureW", "cwW"].includes(wVar),
      `unexpected width variable ${wVar} on capture target`,
    );
    assert.ok(
      ["captureH", "tpCaptureH", "cwH"].includes(hVar),
      `unexpected height variable ${hVar} on capture target`,
    );
    // Width and height must come from the same path's pair.
    if (wVar === "captureW") assert.equal(hVar, "captureH");
    if (wVar === "tpCaptureW") assert.equal(hVar, "tpCaptureH");
    if (wVar === "cwW") assert.equal(hVar, "cwH");
  }
});

test("each capture target has transform: scale() applied (so the onclone reset is required)", () => {
  // Confirms the precondition the html2canvas fix depends on: the capture
  // target IS being scaled, so without the onclone transform reset the
  // captured region would be mis-sized.
  for (const block of blocks) {
    assert.match(
      block,
      /transform:\s*`scale\(\$\{(scale|tpScale)\}\)`/,
      `capture target missing transform: scale(): ${block}`,
    );
  }
});

test("captureW/captureH formula = canvasEnabled ? canvasW : trueWidth (and same for H)", () => {
  // Layout path: assert the exact formula text. This locks in the binding
  // the html2canvas capture box depends on for non-canvas screens
  // (1280x720 from REFERENCE_HEIGHT) vs canvas-enabled screens.
  assert.match(
    playerSource,
    /const\s+captureW\s*=\s*canvasEnabled\s*\?\s*canvasW\s*:\s*trueWidth\s*;/,
  );
  assert.match(
    playerSource,
    /const\s+captureH\s*=\s*canvasEnabled\s*\?\s*canvasH\s*:\s*trueHeight\s*;/,
  );
});

test("captureScreenshot passes explicit width/height/windowWidth/windowHeight to html2canvas", () => {
  // The fix for the clipping bug: html2canvas must be told the exact
  // capture box dimensions (un-transformed offsetWidth/offsetHeight). If
  // any of these options is dropped, the bug re-surfaces.
  for (const opt of ["width", "height", "windowWidth", "windowHeight"]) {
    const re = new RegExp(`${opt}:\\s*captureWidth|${opt}:\\s*captureHeight`);
    assert.match(
      playerSource,
      re,
      `html2canvas options missing ${opt} bound to captureWidth/captureHeight`,
    );
  }
});

test("captureScreenshot onclone resets transform on the cloned capture target", () => {
  // Without this reset, html2canvas renders the cloned DOM with the same
  // CSS scale as the live element, which shifts children outside its
  // capture box and silently clips them.
  const onclonePattern =
    /querySelector\(\s*['"]\[data-testid="player-capture-target"\]['"]\s*\)[\s\S]*?\.style\.transform\s*=\s*"none"/;
  assert.match(playerSource, onclonePattern);
});
