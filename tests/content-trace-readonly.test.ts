import test from "node:test";
import assert from "node:assert/strict";
import { storage } from "../server/storage";
import { resolveScreenContent, type ResolverDeps } from "../server/contentResolver";
import { db, pool } from "../server/db";
import { sql, like, eq } from "drizzle-orm";
import { clients, screens } from "../shared/schema";

// Smoke test for the /api/admin/screens/:id/content-trace endpoint's safety
// invariant: the resolver — which the endpoint runs verbatim — must only invoke
// read-only storage methods. We wrap `storage` in a Proxy and assert that no
// method whose name starts with create/insert/update/upsert/delete/set/clear
// is touched while resolving content for a real screen row.

const PREFIX = "__TEST_TRACE_RO__";
let testClientId: string;
let testScreenId: string;

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

test.before(async () => {
  await cleanup();
  const [client] = await db
    .insert(clients)
    .values({ name: `${PREFIX}client` })
    .returning();
  testClientId = client.id;
  const [screen] = await db
    .insert(screens)
    .values({
      name: `${PREFIX}screen`,
      clientId: testClientId,
      isPaired: false,
    })
    .returning();
  testScreenId = screen.id;
});

test.after(async () => {
  await cleanup();
  await pool.end();
});

test("resolver invoked by content-trace endpoint never calls a mutating storage method", async () => {
  const callLog: string[] = [];
  const writePrefixes = ["create", "insert", "update", "upsert", "delete", "set", "clear", "remove"];

  const readOnlyStorage = new Proxy(storage as any, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const name = String(prop);
      return (...args: any[]) => {
        callLog.push(name);
        if (writePrefixes.some((p) => name.startsWith(p))) {
          throw new Error(
            `Resolver attempted to invoke mutating storage method: ${name}`,
          );
        }
        return value.apply(target, args);
      };
    },
  });

  const screen = await storage.getScreen(testScreenId);
  assert.ok(screen, "fixture screen should exist");

  const result = await resolveScreenContent(
    screen!,
    new Date(),
    readOnlyStorage as ResolverDeps,
  );

  // Resolver returned without calling any mutating method (would have thrown).
  assert.ok(callLog.length > 0, "resolver should have invoked at least one storage method");
  for (const name of callLog) {
    assert.ok(
      !writePrefixes.some((p) => name.startsWith(p)),
      `unexpected write call: ${name}`,
    );
  }

  // Sanity: trace was produced.
  assert.ok(result.trace.length > 0);
  assert.equal(result.trace[0].kind, "screen-info");

  // And the screen row is unchanged.
  const after = await db.select().from(screens).where(eq(screens.id, testScreenId));
  assert.equal(after.length, 1);
  assert.equal(after[0].name, `${PREFIX}screen`);
});
