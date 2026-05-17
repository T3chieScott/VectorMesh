import test from "node:test";
import assert from "node:assert/strict";
import { safeFetch, SsrfBlockedError, __test__ } from "../server/safeFetch";

// Task #210 — SSRF protections used by the agenda-sync engine. Every
// agenda feed URL is user-supplied, so we must refuse to talk to
// internal addresses, cloud-metadata endpoints, link-local, and so on,
// even when reached via redirects.

test("isBlockedV4 blocks loopback, RFC1918, link-local and metadata", () => {
  for (const ip of [
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254", // AWS/GCP metadata
    "100.64.0.1",      // CGNAT
    "0.0.0.0",
    "224.0.0.1",       // multicast
    "255.255.255.255", // broadcast
    "240.0.0.1",       // reserved
  ]) {
    assert.equal(__test__.isBlockedV4(ip), true, `${ip} should be blocked`);
  }
});

test("isBlockedV4 allows public IPv4 addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.190.46", "199.232.41.140"]) {
    assert.equal(__test__.isBlockedV4(ip), false, `${ip} should be allowed`);
  }
});

test("isBlockedV6 blocks loopback / unique-local / link-local / multicast / v4-mapped", () => {
  for (const ip of [
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",  // v4-mapped loopback
    "::ffff:169.254.169.254",
    "64:ff9b::a.b.c.d".replace("a.b.c.d", "127.0.0.1"),
    "2002:7f00:0001::1", // 6to4 wrapping 127.0.0.1
    "2001::1",           // Teredo
  ]) {
    assert.equal(__test__.isBlockedV6(ip), true, `${ip} should be blocked`);
  }
});

test("isBlockedV6 allows public IPv6 addresses", () => {
  for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(__test__.isBlockedV6(ip), false, `${ip} should be allowed`);
  }
});

test("safeFetch refuses non-http(s) schemes", async () => {
  await assert.rejects(
    () => safeFetch("file:///etc/passwd"),
    SsrfBlockedError,
  );
  await assert.rejects(
    () => safeFetch("gopher://evil.test/_"),
    SsrfBlockedError,
  );
});

test("safeFetch refuses URLs with embedded credentials", async () => {
  await assert.rejects(
    () => safeFetch("http://user:pass@example.com/x"),
    SsrfBlockedError,
  );
});

test("safeFetch refuses literal loopback / metadata IPs without DNS", async () => {
  await assert.rejects(
    () => safeFetch("http://127.0.0.1/admin"),
    SsrfBlockedError,
  );
  await assert.rejects(
    () => safeFetch("http://169.254.169.254/latest/meta-data/"),
    SsrfBlockedError,
  );
  await assert.rejects(
    () => safeFetch("http://[::1]/x"),
    SsrfBlockedError,
  );
});

test("safeFetch refuses hostnames that resolve to a private IP", async () => {
  // Inject a fake DNS resolver that maps a public-looking name to
  // a private IP, the classic DNS-rebinding attack vector.
  const lookupImpl = async () => [{ address: "10.0.0.5", family: 4 as const }];
  let fetchCalled = false;
  const fetchImpl: any = async () => { fetchCalled = true; return new Response(""); };
  await assert.rejects(
    () => safeFetch("http://attacker-controlled.example.com/feed.ics", { lookupImpl, fetchImpl }),
    SsrfBlockedError,
  );
  assert.equal(fetchCalled, false, "fetch must never be called when DNS resolves to a private range");
});

test("safeFetch refuses if ANY resolved address is private (DNS-rebind safe)", async () => {
  // Two A records: one public, one private. We must still refuse.
  const lookupImpl = async () => [
    { address: "8.8.8.8", family: 4 as const },
    { address: "192.168.1.1", family: 4 as const },
  ];
  const fetchImpl: any = async () => new Response("");
  await assert.rejects(
    () => safeFetch("http://mixed.example.com/feed.ics", { lookupImpl, fetchImpl }),
    SsrfBlockedError,
  );
});

test("safeFetch re-validates redirect targets — public → private is blocked", async () => {
  // First hop: public host returns 302 → http://127.0.0.1/admin.
  // The second hop must be refused (literal loopback IP).
  const lookupImpl = async () => [{ address: "8.8.8.8", family: 4 as const }];
  const calls: string[] = [];
  const fetchImpl: any = async (url: string) => {
    calls.push(url);
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    }
    return new Response("should-not-reach");
  };
  await assert.rejects(
    () => safeFetch("http://public.example.com/feed.ics", { lookupImpl, fetchImpl }),
    SsrfBlockedError,
  );
  assert.equal(calls.length, 1, "must not follow the redirect into a private IP");
});

test("safeFetch allows a public → public 302 chain", async () => {
  const lookupImpl = async () => [{ address: "8.8.8.8", family: 4 as const }];
  let n = 0;
  const fetchImpl: any = async () => {
    n++;
    if (n === 1) return new Response(null, { status: 302, headers: { location: "https://other.example.com/feed.ics" } });
    return new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { status: 200 });
  };
  const res = await safeFetch("http://public.example.com/feed.ics", { lookupImpl, fetchImpl });
  assert.equal(res.status, 200);
  assert.ok(res.text.includes("VCALENDAR"));
});

test("safeFetch caps body size", async () => {
  const lookupImpl = async () => [{ address: "8.8.8.8", family: 4 as const }];
  // 50 KB body, cap at 1 KB.
  const huge = "A".repeat(50_000);
  const fetchImpl: any = async () => new Response(huge, { status: 200 });
  await assert.rejects(
    () => safeFetch("http://public.example.com/feed.ics", { lookupImpl, fetchImpl, maxBytes: 1024 }),
    SsrfBlockedError,
  );
});

test("safeFetch caps redirect count", async () => {
  const lookupImpl = async () => [{ address: "8.8.8.8", family: 4 as const }];
  let n = 0;
  const fetchImpl: any = async () => {
    n++;
    return new Response(null, { status: 302, headers: { location: `https://example${n}.com/x` } });
  };
  await assert.rejects(
    () => safeFetch("http://example.com/x", { lookupImpl, fetchImpl }),
    SsrfBlockedError,
  );
});
