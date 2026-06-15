---
name: Additive fields on shared public payloads
description: How to add optional data to an existing public/shared API response without breaking legacy consumers.
---

# Additive fields on shared public payloads

When enriching an existing public response (e.g. the email-scrubbed sweepstake
display endpoint) with a new optional section, OMIT the new key entirely when the
feature is off — do not emit `null`, `{}`, or a disabled stub.

Pattern: `res.json({ ...base, ...(live ? { live } : {}) })`.

**Why:** existing players/consumers and tests assert on the legacy payload shape.
Emitting `live: null` (or any always-present new key) changes the serialized
bytes for every consumer even when the feature is disabled, which breaks
byte-identical expectations and can confuse cache/diff logic. A task reviewer
flagged "payload no longer byte-identical when feature off" as blocking precisely
because of an always-present new key.

**How to apply:** any time you add a feature-flagged field to a response shared by
old clients, gate the key's presence on the flag, and add a test asserting the
key is absent when the flag is off (and present when on). Also gate the feature's
"configured" check on ALL required env/config (e.g. require BOTH token AND season
id), not just one, so a half-configured deploy degrades gracefully instead of
emitting a broken section.
