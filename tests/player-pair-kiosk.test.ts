// Task #303 — reusable pairing code (kiosk mode) coverage for the
// extracted POST /api/player/pair handler in server/playerPairHandler.ts.
//
// Behaviour pinned here:
//   1. Unknown code → 404.
//   2. Unpaired screen pairs normally (kiosk flag irrelevant).
//   3. Already-paired screen + kioskModeEnabled OFF → 409, and no
//      pairing state is written (the live device keeps its token).
//   4. Already-paired screen + kioskModeEnabled ON → 200 with a FRESH
//      deviceToken (differs from the old one), pairing state fanned
//      out, and a "kiosk_repair" audit_logs row is written.
//   5. Canvas wall: the single-claim gate looks at every member (a
//      wall is "paired" if ANY member holds a live token), and a
//      kiosk re-pair fans the new token out to every member.
//
// Uses a stub storage (no DB) so it runs fast and deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { buildPlayerPairHandler } from "../server/playerPairHandler";

interface StubScreen {
  id: string;
  name: string;
  pairingCode: string | null;
  isPaired: boolean;
  deviceToken: string | null;
  kioskModeEnabled: boolean;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
}

function makeStubStorage(screens: StubScreen[], wallOf?: (s: StubScreen) => StubScreen[]) {
  const calls = {
    setPairingState: [] as Array<{ ids: string[]; state: Record<string, unknown> }>,
    auditLogs: [] as Array<Record<string, unknown>>,
  };
  const storage = {
    async getScreenByPairingCode(code: string) {
      return (screens.find((s) => s.pairingCode === code) as any) ?? undefined;
    },
    async getCanvasMembers(screen: StubScreen) {
      return (wallOf ? wallOf(screen) : [screen]) as any;
    },
    async setCanvasPairingState(ids: string[], state: Record<string, unknown>) {
      calls.setPairingState.push({ ids, state });
    },
    async createAuditLog(entry: Record<string, unknown>) {
      calls.auditLogs.push(entry);
      return entry as any;
    },
  };
  return { storage: storage as any, calls };
}

function makeReq(body: Record<string, unknown>): Request {
  return { body, headers: {}, ip: "203.0.113.9" } as unknown as Request;
}

function makeRes() {
  const out: { status: number; body: any } = { status: 200, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: any) {
      out.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, out };
}

test("unknown pairing code → 404", async () => {
  const { storage } = makeStubStorage([]);
  const handler = buildPlayerPairHandler(storage);
  const { res, out } = makeRes();
  await handler(makeReq({ pairingCode: "NOPE99" }), res);
  assert.equal(out.status, 404);
});

test("unpaired screen pairs normally (kiosk off)", async () => {
  const s: StubScreen = {
    id: "s1", name: "Lobby", pairingCode: "ABC123",
    isPaired: false, deviceToken: null, kioskModeEnabled: false,
  };
  const { storage, calls } = makeStubStorage([s]);
  const handler = buildPlayerPairHandler(storage);
  const { res, out } = makeRes();
  await handler(makeReq({ pairingCode: "ABC123", hardwareInfo: { hostname: "pi-1" } }), res);
  assert.equal(out.status, 200);
  assert.equal(out.body.screenId, "s1");
  assert.ok(out.body.deviceToken, "fresh token issued");
  assert.equal(calls.setPairingState.length, 1);
  assert.deepEqual(calls.setPairingState[0].ids, ["s1"]);
  assert.equal(calls.auditLogs.length, 0, "no kiosk audit for a first-time pair");
});

test("already paired + kiosk OFF → 409 and no state written", async () => {
  const s: StubScreen = {
    id: "s1", name: "Lobby", pairingCode: "ABC123",
    isPaired: true, deviceToken: "old-token", kioskModeEnabled: false,
  };
  const { storage, calls } = makeStubStorage([s]);
  const handler = buildPlayerPairHandler(storage);
  const { res, out } = makeRes();
  await handler(makeReq({ pairingCode: "ABC123" }), res);
  assert.equal(out.status, 409);
  assert.match(out.body.error, /already paired/i);
  assert.equal(calls.setPairingState.length, 0, "live device keeps its token");
  assert.equal(calls.auditLogs.length, 0);
});

test("already paired + kiosk ON → fresh token + kiosk_repair audit", async () => {
  const s: StubScreen = {
    id: "s1", name: "Kiosk PC", pairingCode: "KIO456",
    isPaired: true, deviceToken: "old-token", kioskModeEnabled: true,
  };
  const { storage, calls } = makeStubStorage([s]);
  const handler = buildPlayerPairHandler(storage);
  const { res, out } = makeRes();
  await handler(makeReq({ pairingCode: "KIO456", hardwareInfo: { hostname: "kiosk-7" } }), res);
  assert.equal(out.status, 200);
  assert.ok(out.body.deviceToken, "token issued");
  assert.notEqual(out.body.deviceToken, "old-token", "old token is replaced");
  assert.equal(calls.setPairingState.length, 1);
  assert.equal(calls.setPairingState[0].state.deviceToken, out.body.deviceToken);
  assert.equal(calls.auditLogs.length, 1, "kiosk re-pair is audited");
  assert.equal(calls.auditLogs[0].action, "kiosk_repair");
  assert.equal(calls.auditLogs[0].entityId, "s1");
});

test("canvas wall: any paired member blocks when kiosk OFF; kiosk ON fans new token to all members", async () => {
  const owner: StubScreen = {
    id: "w1", name: "Wall A", pairingCode: "WAL111",
    isPaired: false, deviceToken: null, kioskModeEnabled: false,
    canvasWidth: 3840, canvasHeight: 1080,
  };
  const sibling: StubScreen = {
    id: "w2", name: "Wall B", pairingCode: "WAL222",
    isPaired: true, deviceToken: "wall-token", kioskModeEnabled: false,
  };
  const wall = [owner, sibling];
  const { storage } = makeStubStorage(wall, () => wall);
  const handler = buildPlayerPairHandler(storage);

  // Kiosk OFF on the matched screen → 409 even though the matched
  // screen itself is not the paired member.
  {
    const { res, out } = makeRes();
    await handler(makeReq({ pairingCode: "WAL111" }), res);
    assert.equal(out.status, 409, "wall already claimed via sibling");
  }

  // Flip kiosk ON on the matched screen → re-pair allowed, token
  // fanned out to every member, canvas metadata returned.
  owner.kioskModeEnabled = true;
  const { storage: storage2, calls } = makeStubStorage(wall, () => wall);
  const handler2 = buildPlayerPairHandler(storage2);
  const { res, out } = makeRes();
  await handler2(makeReq({ pairingCode: "WAL111" }), res);
  assert.equal(out.status, 200);
  assert.deepEqual(calls.setPairingState[0].ids, ["w1", "w2"], "token fans out to whole wall");
  assert.equal(out.body.canvas.ownerScreenId, "w1");
  assert.equal(calls.auditLogs.length, 1);
  assert.equal(calls.auditLogs[0].action, "kiosk_repair");
});
