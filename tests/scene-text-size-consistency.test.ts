import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCENE_AUTHORING_REFERENCE_HEIGHT,
  getAuthoredSceneAspect,
  getSceneTextScale,
  hasMaterialAspectRatioMismatch,
  resolveSceneFontSize,
  scaleSceneFontSize,
} from "../client/src/lib/scene-render-geometry";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("scene text-size consistency", () => {
  it("derives the runtime text ratio from the 720px authoring surface", () => {
    assert.equal(SCENE_AUTHORING_REFERENCE_HEIGHT, 720);
    assert.equal(getSceneTextScale(720), 1);
    assert.equal(getSceneTextScale(1080), 1.5);
    assert.ok(Math.abs(getSceneTextScale(1920) - 8 / 3) < 1e-10);
    assert.equal(getSceneTextScale(0), 1);
  });

  it("resolves legacy tokens before scaling configured typography", () => {
    assert.equal(scaleSceneFontSize(24, 1.5), 36);
    assert.equal(
      scaleSceneFontSize(
        resolveSceneFontSize(
          "large",
          { small: 14, medium: 24, large: 36, xlarge: 48 },
          24,
        ),
        1.5,
      ),
      54,
    );
    assert.equal(scaleSceneFontSize(undefined, 1.5), undefined);
  });

  it("treats 608x1080 as a runtime preview derivation, not authored metadata", () => {
    const authored = getAuthoredSceneAspect("9:16");
    assert.deepEqual(authored, { width: 9, height: 16, label: "9:16" });
    assert.equal(Math.round(1080 * (authored!.width / authored!.height)), 608);
  });

  it("does not warn for equal aspects at different resolutions", () => {
    const portrait = getAuthoredSceneAspect("9:16")!;
    assert.equal(hasMaterialAspectRatioMismatch(portrait, 1080, 1920), false);

    const customPortrait = getAuthoredSceneAspect("custom", 608, 1080)!;
    assert.equal(
      hasMaterialAspectRatioMismatch(customPortrait, 1080, 1920),
      false,
    );
  });

  it("still warns for a genuine aspect-ratio mismatch", () => {
    const landscape = getAuthoredSceneAspect("16:9")!;
    assert.equal(hasMaterialAspectRatioMismatch(landscape, 1080, 1920), true);
  });

  it("keeps text proportion invariant when only the host surface changes", () => {
    const configuredFontSize = 36;
    const physicalPanelHeight = 540;
    const computedPhysicalSize = (logicalHeight: number) => {
      const configuredAtLogicalSurface =
        configuredFontSize * getSceneTextScale(logicalHeight);
      const outerUniformScale = physicalPanelHeight / logicalHeight;
      return configuredAtLogicalSurface * outerUniformScale;
    };

    assert.equal(computedPhysicalSize(720), 27);
    assert.equal(computedPhysicalSize(1080), 27);
    assert.equal(computedPhysicalSize(1920), 27);
  });

  it("wires the same scale through direct/playlist Simulator, Player and Monitor", () => {
    const simulator = read("client/src/pages/simulator.tsx");
    const player = read("client/src/pages/player.tsx");
    const monitor = read("client/src/pages/monitor.tsx");
    const sharedSurface = read("client/src/components/screen-render-surface.tsx");

    assert.equal(
      simulator.match(
        /sceneTextScale=\{getSceneTextScale\(trueHeight\)\}/g,
      )?.length,
      2,
    );
    assert.ok(player.includes(
      "sceneTextScale={getSceneTextScale(useCanvasMode ? canvasH : playerScreenH)}",
    ));
    assert.ok(monitor.includes(
      "sceneTextScale={getSceneTextScale(useCanvasMode ? canvasH : viewportH)}",
    ));
    assert.ok(sharedSurface.includes(
      "sceneTextScale={props.sceneTextScale}",
    ));
    assert.match(
      sharedSurface,
      /followedAgendaPresentationStates, playerContext, sceneTextScale, canvasGeometry/,
    );
  });

  it("scales every configured fixed-size text family but leaves Agenda alone", () => {
    const renderer = read("client/src/components/zone-renderer.tsx");
    const configuredFields = [
      "tickerFontSize",
      "clockTimeFontSize",
      "clockLabelFontSize",
      "clockDateFontSize",
      "weatherFontSize",
      "newsTextSize",
      "countdownSize",
      "countdownTitleSize",
      "countdownLabelSize",
      "shapeIconTextSize",
      "footballFontSize",
      "plFixturesFontSize",
      "heathrowFontSize",
      "forecastFontSize",
      "earthquakeFontSize",
      "aircraftFontSize",
      "spacexFontSize",
    ];

    for (const field of configuredFields) {
      assert.match(
        renderer,
        new RegExp(`scaledFontSize\\([^\\n]*zone\\.${field}`),
      );
    }

    const agendaBranch = renderer.slice(
      renderer.indexOf('case "agenda"'),
      renderer.indexOf('case "sweepstake"'),
    );
    assert.ok(!agendaBranch.includes("scaledFontSize"));
    assert.ok(!agendaBranch.includes("sceneTextScale"));
  });

  it("uses canvas height only for canvas-spanning Player and Monitor scenes", () => {
    const player = read("client/src/pages/player.tsx");
    const monitor = read("client/src/pages/monitor.tsx");

    assert.match(
      player,
      /sceneTextScale=\{getSceneTextScale\(useCanvasMode \? canvasH : playerScreenH\)\}/,
    );
    assert.match(
      monitor,
      /sceneTextScale=\{getSceneTextScale\(useCanvasMode \? canvasH : viewportH\)\}/,
    );
    assert.match(
      player,
      /sceneTextScale=\{getSceneTextScale\(tileUseCanvasMode \? cwH : tile\.height\)\}/,
    );
  });

  it("resolves legacy text and QR tokens before applying the runtime ratio", () => {
    const renderer = read("client/src/components/zone-renderer.tsx");
    assert.match(
      renderer,
      /scaledFontSize\(resolveSceneFontSize\(\s*zone\.textFontSize,\s*TEXT_LEGACY_FONT_SIZES,\s*24,/,
    );
    assert.match(
      renderer,
      /scaledFontSize\(resolveSceneFontSize\(\s*zone\.qrLabelFontSize,\s*QR_LEGACY_FONT_SIZES,\s*16,/,
    );
  });

  it("builds warnings from authored aspect metadata rather than 1080px normalization", () => {
    const simulator = read("client/src/pages/simulator.tsx");
    const warningBlock = simulator.slice(
      simulator.indexOf("const layoutSizeWarning"),
      simulator.indexOf("const getZoneMedia"),
    );

    assert.ok(warningBlock.includes("getAuthoredSceneAspect"));
    assert.ok(warningBlock.includes("hasMaterialAspectRatioMismatch"));
    assert.ok(!warningBlock.includes("layoutH = 1080"));
    assert.ok(!warningBlock.includes("Math.round(1080"));
  });
});