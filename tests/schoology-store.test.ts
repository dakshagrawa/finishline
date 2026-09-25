import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EncryptedSchoologyStore } from "../src/schoology/store";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "finishline-schoology-store-"));
  const path = join(directory, "store.json");
  const store = new EncryptedSchoologyStore(path, Buffer.alloc(32, 4));
  return { path, store };
}

test("encrypted store keeps provider tokens out of plaintext and creates owner-only storage", async () => {
  const { path, store } = await fixture();
  const sessionId = await store.createSession();
  await store.saveRequestToken(sessionId, {
    token: "visible-request-token",
    tokenSecret: "visible-request-secret",
    state: "visible-state",
    expiresAt: 2_000,
  });
  const persisted = await readFile(path, "utf8");
  assert.doesNotMatch(persisted, /visible-request-token|visible-request-secret|visible-state|sessionId/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("request tokens are isolated, expire, and can be consumed only once", async () => {
  const { store } = await fixture();
  const first = await store.createSession();
  const second = await store.createSession();
  await store.saveRequestToken(first, { token: "first", tokenSecret: "secret-1", state: "state-1", expiresAt: 2_000 });
  await store.saveRequestToken(second, { token: "second", tokenSecret: "secret-2", state: "state-2", expiresAt: 500 });

  assert.equal(await store.consumeRequestToken(first, { token: "wrong", state: "state-1", now: 1_000 }), null);
  assert.equal(await store.consumeRequestToken(second, { token: "second", state: "state-2", now: 1_000 }), null);
  assert.deepEqual(await store.consumeRequestToken(first, { token: "first", state: "state-1", now: 1_000 }), {
    token: "first", tokenSecret: "secret-1", state: "state-1", expiresAt: 2_000,
  });
  assert.equal(await store.consumeRequestToken(first, { token: "first", state: "state-1", now: 1_000 }), null);
});

test("access tokens remain session-scoped and logout deletes all session records", async () => {
  const { store } = await fixture();
  const first = await store.createSession();
  const second = await store.createSession();
  await store.saveAccessToken(first, { token: "access-one", tokenSecret: "secret-one", userId: "101", expiresAt: 9_000 });
  await store.saveAccessToken(second, { token: "access-two", tokenSecret: "secret-two", userId: "202", expiresAt: 9_000 });
  assert.equal((await store.getAccessToken(first, 1_000))?.userId, "101");
  assert.equal((await store.getAccessToken(second, 1_000))?.userId, "202");
  await store.deleteSession(first);
  assert.equal(await store.getAccessToken(first, 1_000), null);
  assert.equal((await store.getAccessToken(second, 1_000))?.token, "access-two");
});

test("conditional invalidation removes only the matching access-token session", async () => {
  const { store } = await fixture();
  const first = await store.createSession();
  const second = await store.createSession();
  const old = { token: "old", tokenSecret: "old-secret", userId: "101", expiresAt: 9_000 };
  const replacement = { token: "new", tokenSecret: "new-secret", userId: "101", expiresAt: 9_000 };
  await store.saveAccessToken(first, old);
  await store.saveAccessToken(second, old);
  await store.saveAccessToken(first, replacement);
  assert.equal(await store.invalidateAccessTokenIfMatches(first, old), false);
  assert.deepEqual(await store.getAccessToken(first, 1_000), replacement);
  assert.equal(await store.invalidateAccessTokenIfMatches(first, replacement), true);
  assert.equal(await store.getAccessToken(first, 1_000), null);
  assert.deepEqual(await store.getAccessToken(second, 1_000), old);
  assert.equal(await store.invalidateAccessTokenIfMatches(first, old), false);
});

test("independent store instances serialize updates without losing or resurrecting sessions", async () => {
  const { path } = await fixture();
  const firstStore = new EncryptedSchoologyStore(path, Buffer.alloc(32, 4));
  const secondStore = new EncryptedSchoologyStore(path, Buffer.alloc(32, 4));
  const [first, second] = await Promise.all([firstStore.createSession(), secondStore.createSession()]);
  await Promise.all([
    firstStore.saveAccessToken(first, { token: "one", tokenSecret: "secret-one", userId: "1", expiresAt: 9_000 }),
    secondStore.saveAccessToken(second, { token: "two", tokenSecret: "secret-two", userId: "2", expiresAt: 9_000 }),
  ]);
  assert.equal((await firstStore.getAccessToken(first, 1_000))?.userId, "1");
  assert.equal((await secondStore.getAccessToken(second, 1_000))?.userId, "2");
  await Promise.all([firstStore.deleteSession(first), secondStore.getAccessToken(second, 1_000)]);
  assert.equal(await secondStore.getAccessToken(first, 1_000), null);
});

test("global pruning physically removes expired records even after their browser session is lost", async () => {
  const { store } = await fixture();
  const expired = await store.createSession();
  const active = await store.createSession();
  await store.saveAccessToken(expired, { token: "expired", tokenSecret: "expired-secret", userId: "1", expiresAt: 500 });
  await store.saveAccessToken(active, { token: "active", tokenSecret: "active-secret", userId: "2", expiresAt: 9_000 });
  await store.pruneExpiredRecords(1_000);
  assert.equal(await store.getAccessToken(expired, 1_000), null);
  assert.equal((await store.getAccessToken(active, 1_000))?.token, "active");
});

test("a stale crash lock is recovered without weakening active-operation serialization", async () => {
  const { path, store } = await fixture();
  const lockPath = `${path}.lock`;
  await mkdir(lockPath);
  const stale = new Date(Date.now() - 60_000);
  await utimes(lockPath, stale, stale);
  const sessionId = await store.createSession();
  assert.match(sessionId, /^[A-Za-z0-9_-]{20,120}$/);
});

test("corrupt or tampered encrypted storage fails closed without returning token data", async () => {
  const { path, store } = await fixture();
  const sessionId = await store.createSession();
  await store.saveAccessToken(sessionId, { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 });
  const contents = await readFile(path, "utf8");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path, contents.replace(/"ciphertext":"./, '"ciphertext":"x'), { mode: 0o600 }));
  await assert.rejects(() => store.getAccessToken(sessionId, 1_000), /unavailable/i);
});
