import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Player and Monitor consume one canonical Agenda payload revision", () => {
  const routes = read("server/agendaRoutes.ts");
  const zone = read("client/src/components/agenda/AgendaConfigZoneWidget.tsx");

  assert.ok(routes.includes('payloadRevision = createHash("sha256")'));
  assert.ok(routes.includes("JSON.stringify({ config: publicConfig, items: publicItems, effectiveDay })"));
  assert.ok(zone.includes("completionBinding.activationId}:${displayData.payloadRevision}"));
  assert.ok(zone.includes("setData(payload)"));
  assert.ok(!zone.includes("frozenActivationRef.current !== activationKey) {\n              setData(payload)"));
});

test("Monitor scene identity reaches the shared Agenda widget without separate filtering", () => {
  const monitor = read("client/src/pages/monitor.tsx");
  const surface = read("client/src/components/screen-render-surface.tsx");
  const renderer = read("client/src/components/zone-renderer.tsx");

  assert.ok(monitor.includes("agendaPresentationActivationKey={frameSceneIdentity}"));
  assert.ok(surface.includes("agendaPresentationActivationKey={props.agendaPresentationActivationKey}"));
  assert.ok(renderer.includes("presentationActivationKey={agendaPresentationActivationKey}"));
  assert.doesNotMatch(monitor, /statusFilter|resolveAgendaItems/);
});