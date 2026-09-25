import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SchoologyClientError, type SchoologyClient } from "../src/schoology/client";
import type { SchoologyConfigResult } from "../src/schoology/config";
import { publicRouteError } from "../src/schoology/routes";
import {
  completeSchoologyAuthorization,
  getSchoologyStatus,
  retrieveSchoologyGradebook,
  startSchoologyAuthorization,
  type SchoologyDependencies,
} from "../src/schoology/service";
import { EncryptedSchoologyStore, type StoredAccessToken, type StoredRequestToken } from "../src/schoology/store";

const configResult: SchoologyConfigResult = { available: true, config: {
  consumerKey: "consumer-key", consumerSecret: "consumer-secret-value",
  appOrigin: "https://grades.example.org",
  callbackUrl: "https://grades.example.org/api/integrations/schoology/callback",
  sessionSecret: "s".repeat(32), tokenEncryptionKey: Buffer.alloc(32), storePath: "/tmp/store",
  tenantOrigin: "https://fuhsd.schoology.com", apiOrigin: "https://api.schoology.com",
} };

function fixture(): SchoologyDependencies & { records: { request?: StoredRequestToken; access?: StoredAccessToken; deleted?: boolean }; calls: string[] } {
  const records: { request?: StoredRequestToken; access?: StoredAccessToken; deleted?: boolean } = {};
  const calls: string[] = [];
  const store = {
    createSession: async () => "created-session-id-that-is-long-enough",
    saveRequestToken: async (_session: string, token: StoredRequestToken) => { records.request = token; },
    consumeRequestToken: async (_session: string, expected: { token: string; state: string; now: number }) => {
      const token = records.request;
      if (!token || token.token !== expected.token || token.state !== expected.state || token.expiresAt <= expected.now) return null;
      delete records.request; return token;
    },
    saveAccessToken: async (_session: string, token: StoredAccessToken) => { records.access = token; },
    getAccessToken: async () => records.access ?? null,
    pruneExpiredRecords: async () => undefined,
    invalidateAccessTokenIfMatches: async (_session: string, expected: StoredAccessToken) => {
      const current = records.access;
      if (!current || current.token !== expected.token || current.tokenSecret !== expected.tokenSecret ||
          current.userId !== expected.userId || current.expiresAt !== expected.expiresAt) return false;
      delete records.access;
      if (!records.request) records.deleted = true;
      return true;
    },
    deleteSession: async () => { records.deleted = true; delete records.request; delete records.access; },
  } as unknown as EncryptedSchoologyStore;
  const client = {
    requestToken: async (callback: string) => { calls.push(callback); return { token: "request", tokenSecret: "request-secret", callbackConfirmed: true }; },
    exchangeAccessToken: async () => ({ token: "access", tokenSecret: "access-secret", callbackConfirmed: null }),
    getCurrentUser: async () => ({ uid: "101", name_display: "Ada", school_name: "Monta Vista High School" }),
    getUserSections: async () => ({ section: [{ id: "11", course_title: "Biology" }] }),
    getUserGrades: async () => ({ section: [{ section_id: "11", period: [{ assignment: [{ assignment_id: "1", grade: "9" }] }] }] }),
    getSectionCategories: async () => ({ grading_category: [{ id: "5", title: "Work", weight: "100", calculation_type: 2, drop_lowest: 0 }] }),
    getSectionAssignments: async () => ({ assignment: [{ id: "1", title: "Lab", grading_category: "5", max_points: "10" }] }),
  } as unknown as SchoologyClient;
  return { configResult, store, client, records, calls, now: () => 1_000, randomState: () => "state-value" };
}

test("authorization start binds a short-lived request token to session and callback state", async () => {
  const dependencies = fixture();
  const result = await startSchoologyAuthorization(null, dependencies);
  assert.equal(result.sessionId, "created-session-id-that-is-long-enough");
  assert.equal(new URL(result.authorizeUrl).origin, "https://fuhsd.schoology.com");
  assert.equal(new URL(result.authorizeUrl).searchParams.get("oauth_token"), "request");
  assert.equal(new URL(dependencies.calls[0]).searchParams.get("state"), "state-value");
  assert.deepEqual(dependencies.records.request, { token: "request", tokenSecret: "request-secret", state: "state-value", expiresAt: 601_000 });
});

test("authorization start replaces a deleted cookie session with a new session ID", async () => {
  const dependencies = fixture();
  const oldId = "deleted-session-id-that-is-long-enough";
  const newId = "new-session-id-that-is-long-enough";
  const sessions = new Set([oldId]);
  dependencies.store!.createSession = async () => { sessions.add(newId); return newId; };
  dependencies.store!.saveRequestToken = async (id: string, token: StoredRequestToken) => {
    if (!sessions.has(id)) throw new Error("Schoology session is unavailable.");
    dependencies.records.request = token;
  };
  dependencies.store!.deleteSession = async (id: string) => { sessions.delete(id); };
  await dependencies.store!.deleteSession(oldId);
  assert.deepEqual(await getSchoologyStatus(oldId, dependencies), { available: true, connected: false });
  const started = await startSchoologyAuthorization(oldId, dependencies);
  assert.equal(started.sessionId, newId);
  assert.equal(new URL(started.authorizeUrl).searchParams.get("oauth_token"), "request");
  assert.equal(dependencies.records.request?.token, "request");
});

test("failed OAuth starts do not retain empty encrypted sessions", async () => {
  const dependencies = fixture();
  const directory = await mkdtemp(join(tmpdir(), "finishline-schoology-failed-start-"));
  const store = new EncryptedSchoologyStore(join(directory, "store.json"), Buffer.alloc(32, 4));
  dependencies.store = store;
  const oldSession = await store.createSession(1_000);
  const oldAccess = { token: "old", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  await store.saveAccessToken(oldSession, oldAccess);
  let created: string | undefined;
  const create = store.createSession.bind(store);
  store.createSession = async (now) => { created = await create(now); return created; };
  dependencies.client!.requestToken = async () => { throw new Error("provider unavailable"); };
  await assert.rejects(() => startSchoologyAuthorization(oldSession, dependencies), /provider unavailable/);
  assert.equal(created, undefined);
  assert.deepEqual(await store.getAccessToken(oldSession, 1_000), oldAccess);

  dependencies.client!.requestToken = async () => ({ token: "request", tokenSecret: "secret", callbackConfirmed: true });
  store.saveRequestToken = async () => { throw new Error("save unavailable"); };
  await assert.rejects(() => startSchoologyAuthorization(oldSession, dependencies), /save unavailable/);
  assert.ok(created);
  await assert.rejects(() => store.saveAccessToken(created!, oldAccess), /session is unavailable/i);
  assert.deepEqual(await store.getAccessToken(oldSession, 1_000), oldAccess);
});

test("failed old-session cleanup does not publish a new orphan OAuth session", async () => {
  const dependencies = fixture();
  const directory = await mkdtemp(join(tmpdir(), "finishline-schoology-cleanup-"));
  const store = new EncryptedSchoologyStore(join(directory, "store.json"), Buffer.alloc(32, 4));
  dependencies.store = store;
  const oldSession = await store.createSession(1_000);
  let created!: string;
  const create = store.createSession.bind(store);
  store.createSession = async (now) => { created = await create(now); return created; };
  const remove = store.deleteSession.bind(store);
  store.deleteSession = async (id) => {
    if (id === oldSession) throw new Error("cleanup unavailable");
    await remove(id);
  };
  await assert.rejects(() => startSchoologyAuthorization(oldSession, dependencies), /cleanup unavailable/);
  assert.notEqual(created, oldSession);
  await assert.rejects(() => store.saveAccessToken(created, { token: "a", tokenSecret: "b", userId: "101", expiresAt: 9_000 }), /session is unavailable/i);
});

test("callback consumes request token once, validates profile, and stores a session-lifetime access token", async () => {
  const dependencies = fixture();
  const started = await startSchoologyAuthorization(null, dependencies);
  assert.equal(started.sessionId, "created-session-id-that-is-long-enough");
  await completeSchoologyAuthorization(started.sessionId, { oauthToken: "request", state: "state-value" }, dependencies);
  assert.equal(dependencies.records.request, undefined);
  assert.deepEqual(dependencies.records.access, {
    token: "access", tokenSecret: "access-secret", userId: "101", expiresAt: 1_801_000,
  });
  await assert.rejects(() => completeSchoologyAuthorization("existing-session-id-that-is-long-enough", { oauthToken: "request", state: "state-value" }, dependencies), /invalid or expired/i);
});

test("gradebook retrieval uses only the session-bound user and returns normalized Schoology data", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  assert.deepEqual(await getSchoologyStatus("session", dependencies), { available: true, connected: true });
  const gradebook = await retrieveSchoologyGradebook("session", dependencies);
  assert.equal(gradebook.source, "schoology");
  assert.equal(gradebook.courses[0].categories[0].assignments[0].score, 9);
});

test("provider authorization failure deletes the local token session and requires reauthorization", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  const error = new SchoologyClientError("authorization", "Schoology authorization is unavailable or expired.");
  dependencies.client!.getCurrentUser = async () => { throw error; };
  await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), (caught) => caught === error);
  assert.equal(dependencies.records.deleted, true);
  assert.equal(dependencies.records.access, undefined);
  assert.deepEqual(await getSchoologyStatus("session", dependencies), { available: true, connected: false });
  await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), /authorization is required/i);
});

test("stale authorization failure cannot delete a newly reauthorized token", async () => {
  const dependencies = fixture();
  const old = { token: "old", tokenSecret: "old-secret", userId: "101", expiresAt: 9_000 };
  const replacement = { token: "new", tokenSecret: "new-secret", userId: "101", expiresAt: 10_000 };
  dependencies.records.access = old;
  const error = new SchoologyClientError("authorization", "Authorization expired.");
  let failRequest!: (reason: Error) => void;
  dependencies.client!.getCurrentUser = () => new Promise((_, reject) => { failRequest = reject; });
  dependencies.store!.invalidateAccessTokenIfMatches = async (_id, expected) => {
    if (dependencies.records.access?.token !== expected.token || dependencies.records.access.tokenSecret !== expected.tokenSecret) return false;
    dependencies.records.deleted = true;
    delete dependencies.records.access;
    return true;
  };
  const pending = retrieveSchoologyGradebook("session", dependencies);
  await dependencies.store!.saveAccessToken("session", replacement);
  failRequest(error);
  await assert.rejects(() => pending, (caught) => caught === error);
  assert.deepEqual(dependencies.records.access, replacement);
  assert.deepEqual(await getSchoologyStatus("session", dependencies), { available: true, connected: true });
});

test("late old-session 401 during a consumed callback cannot delete the new encrypted session", async () => {
  const dependencies = fixture();
  const directory = await mkdtemp(join(tmpdir(), "finishline-schoology-reconnect-"));
  const store = new EncryptedSchoologyStore(join(directory, "store.json"), Buffer.alloc(32, 4));
  dependencies.store = store;
  const oldSession = await store.createSession(1_000);
  const other = await store.createSession(1_000);
  const old = { token: "old-access", tokenSecret: "old-secret", userId: "101", expiresAt: 9_000 };
  await store.saveAccessToken(oldSession, old);
  await store.saveAccessToken(other, old);
  let rejectOld!: (error: Error) => void;
  let startedOld!: () => void;
  const oldStarted = new Promise<void>((resolve) => { startedOld = resolve; });
  dependencies.client!.getCurrentUser = (token) => token.token === old.token
    ? new Promise((_, reject) => { rejectOld = reject; startedOld(); })
    : Promise.resolve({ uid: "101" });
  const pending = retrieveSchoologyGradebook(oldSession, dependencies);
  await oldStarted;
  const reconnect = await startSchoologyAuthorization(oldSession, dependencies);
  assert.notEqual(reconnect.sessionId, oldSession);
  let releaseExchange!: () => void;
  let exchangeStarted!: () => void;
  const exchangeEntered = new Promise<void>((resolve) => { exchangeStarted = resolve; });
  dependencies.client!.exchangeAccessToken = () => new Promise((resolve) => {
    releaseExchange = () => resolve({ token: "access", tokenSecret: "access-secret", callbackConfirmed: null });
    exchangeStarted();
  });
  const callback = completeSchoologyAuthorization(reconnect.sessionId, { oauthToken: "request", state: "state-value" }, dependencies);
  await exchangeEntered; // Request token is already consumed; exchange remains in flight.
  assert.equal(await store.consumeRequestToken(reconnect.sessionId, { token: "request", state: "state-value", now: 1_000 }), null);
  rejectOld(new SchoologyClientError("authorization", "Old access expired."));
  await assert.rejects(() => pending, SchoologyClientError);
  releaseExchange();
  await callback;
  assert.equal(await store.getAccessToken(oldSession, 1_000), null);
  await assert.rejects(() => store.saveAccessToken(oldSession, old), /session is unavailable/i);
  assert.equal((await store.getAccessToken(reconnect.sessionId, 1_000))?.token, "access");
  assert.deepEqual(await store.getAccessToken(other, 1_000), old);
});

test("parallel initial requests prioritize later authorization failure over an earlier rate limit", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  const rateLimit = new SchoologyClientError("rate_limit", "Rate limited.");
  const authorization = new SchoologyClientError("authorization", "Authorization expired.");
  let failAuthorization!: (reason: Error) => void;
  dependencies.client!.getCurrentUser = async () => { throw rateLimit; };
  dependencies.client!.getUserSections = () => new Promise((_, reject) => { failAuthorization = reject; });
  const pending = retrieveSchoologyGradebook("session", dependencies).then(
    () => null,
    (caught: unknown) => caught,
  );
  // Allow the earlier rate-limit rejection to settle before the second request fails.
  await new Promise((resolve) => setImmediate(resolve));
  failAuthorization(authorization);
  assert.equal(await pending, authorization);
  assert.equal(dependencies.records.deleted, true);
  assert.equal(dependencies.records.access, undefined);
});

test("parallel category requests prioritize a later authorization failure", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  dependencies.client!.getUserSections = async () => ({ section: [{ id: "11" }, { id: "12" }] });
  const authorization = new SchoologyClientError("authorization", "Authorization expired.");
  let failAuthorization!: (reason: Error) => void;
  dependencies.client!.getSectionCategories = (id: string) => id === "11"
    ? Promise.reject(new SchoologyClientError("rate_limit", "Rate limited."))
    : new Promise((_, reject) => { failAuthorization = reject; });
  const pending = retrieveSchoologyGradebook("session", dependencies).then(() => null, (caught: unknown) => caught);
  await new Promise((resolve) => setImmediate(resolve));
  failAuthorization(authorization);
  assert.equal(await pending, authorization);
  assert.equal(dependencies.records.deleted, true);
});

test("parallel assignment requests prioritize a later authorization failure", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  dependencies.client!.getUserSections = async () => ({ section: [{ id: "11" }, { id: "12" }] });
  const authorization = new SchoologyClientError("authorization", "Authorization expired.");
  let failAuthorization!: (reason: Error) => void;
  dependencies.client!.getSectionAssignments = (id: string) => id === "11"
    ? Promise.reject(new SchoologyClientError("rate_limit", "Rate limited."))
    : new Promise((_, reject) => { failAuthorization = reject; });
  const pending = retrieveSchoologyGradebook("session", dependencies).then(() => null, (caught: unknown) => caught);
  await new Promise((resolve) => setImmediate(resolve));
  failAuthorization(authorization);
  assert.equal(await pending, authorization);
  assert.equal(dependencies.records.deleted, true);
});

test("failed invalidation reports a generic store error rather than disconnecting", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  dependencies.client!.getCurrentUser = async () => { throw new SchoologyClientError("authorization", "Authorization expired."); };
  dependencies.store!.invalidateAccessTokenIfMatches = async () => { throw new Error("sensitive-store-detail"); };
  let failure: unknown;
  await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), (caught: unknown) => {
    failure = caught;
    return caught instanceof Error && caught.message === "Schoology storage is temporarily unavailable.";
  });
  const response = publicRouteError(failure);
  assert.equal(response.status, 502);
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/);
  assert.deepEqual(await response.json(), { error: "Schoology connection is temporarily unavailable." });
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
  assert.deepEqual(await getSchoologyStatus("session", dependencies), { available: true, connected: true });
});

test("authorization failure while fetching categories also invalidates the session", async () => {
  const dependencies = fixture();
  dependencies.records.access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  const error = new SchoologyClientError("authorization", "Schoology authorization is unavailable or expired.");
  dependencies.client!.getSectionCategories = async () => { throw error; };
  await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), (caught) => caught === error);
  assert.equal(dependencies.records.deleted, true);
  assert.equal(dependencies.records.access, undefined);
});

for (const code of ["rate_limit", "provider_unavailable", "timeout", "invalid_response"] as const) {
  test(`${code} provider failure preserves the local token session`, async () => {
    const dependencies = fixture();
    const access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
    dependencies.records.access = access;
    const error = new SchoologyClientError(code, `Provider ${code}`);
    dependencies.client!.getCurrentUser = async () => { throw error; };
    await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), (caught) => caught === error);
    assert.equal(dependencies.records.deleted, undefined);
    assert.deepEqual(dependencies.records.access, access);
    assert.deepEqual(await getSchoologyStatus("session", dependencies), { available: true, connected: true });
  });
}

test("malformed sections and unsupported grading preserve the local token session", async () => {
  for (const corrupt of [
    (dependencies: SchoologyDependencies) => { dependencies.client!.getUserSections = async () => ({ section: null }) as never; },
    (dependencies: SchoologyDependencies) => { dependencies.client!.getSectionCategories = async () => ({ grading_category: [{ id: "5", title: "Work", weight: "100", calculation_type: 999 }] }) as never; },
  ]) {
    const dependencies = fixture();
    const access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
    dependencies.records.access = access;
    corrupt(dependencies);
    await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies));
    assert.equal(dependencies.records.deleted, undefined);
    assert.deepEqual(dependencies.records.access, access);
  }
});

test("generic provider failure preserves the local token session", async () => {
  const dependencies = fixture();
  const access = { token: "access", tokenSecret: "secret", userId: "101", expiresAt: 9_000 };
  dependencies.records.access = access;
  const error = new Error("Provider failed");
  dependencies.client!.getSectionAssignments = async () => { throw error; };
  await assert.rejects(() => retrieveSchoologyGradebook("session", dependencies), (caught) => caught === error);
  assert.equal(dependencies.records.deleted, undefined);
  assert.deepEqual(dependencies.records.access, access);
});

test("disabled integration reports its boundary and cannot start authorization", async () => {
  const dependencies: SchoologyDependencies = { configResult: { available: false, reason: "Awaiting approval." } };
  assert.deepEqual(await getSchoologyStatus(null, dependencies), { available: false, connected: false, reason: "Awaiting approval." });
  await assert.rejects(() => startSchoologyAuthorization(null, dependencies), /unavailable/i);
});
