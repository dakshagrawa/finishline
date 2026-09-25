import { randomBytes } from "node:crypto";
import type { Gradebook } from "../grades/gradebook";
import { SchoologyClient, SchoologyClientError } from "./client";
import { readSchoologyConfig, type SchoologyConfig, type SchoologyConfigResult } from "./config";
import { normalizeSchoologyGradebook } from "./normalize";
import { EncryptedSchoologyStore } from "./store";

const REQUEST_TOKEN_TTL_MS = 10 * 60 * 1_000;
const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1_000;

export class SchoologyAuthorizationError extends Error {}

async function collectProviderBatch<T extends readonly unknown[]>(requests: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const results = await Promise.allSettled(requests);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  const failure = failures.find(({ reason }) => reason instanceof SchoologyClientError && reason.code === "authorization") ?? failures[0];
  if (failure) throw failure.reason;
  return results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

export interface SchoologyDependencies {
  configResult: SchoologyConfigResult;
  store?: EncryptedSchoologyStore;
  client?: SchoologyClient;
  now?: () => number;
  randomState?: () => string;
}

export type SchoologyStatus =
  | { available: false; connected: false; reason: string }
  | { available: true; connected: boolean };

export function runtimeDependencies(environment: Record<string, string | undefined> = process.env): SchoologyDependencies {
  const configResult = readSchoologyConfig(environment);
  if (!configResult.available) return { configResult };
  return {
    configResult,
    store: new EncryptedSchoologyStore(configResult.config.storePath, configResult.config.tokenEncryptionKey),
    client: new SchoologyClient(configResult.config),
  };
}

function enabled(dependencies: SchoologyDependencies): {
  config: SchoologyConfig;
  store: EncryptedSchoologyStore;
  client: SchoologyClient;
  now: () => number;
  randomState: () => string;
} {
  if (!dependencies.configResult.available || !dependencies.store || !dependencies.client) {
    throw new Error("Schoology connection is unavailable.");
  }
  return {
    config: dependencies.configResult.config,
    store: dependencies.store,
    client: dependencies.client,
    now: dependencies.now ?? Date.now,
    randomState: dependencies.randomState ?? (() => randomBytes(32).toString("base64url")),
  };
}

export async function getSchoologyStatus(sessionId: string | null, dependencies: SchoologyDependencies): Promise<SchoologyStatus> {
  if (!dependencies.configResult.available) {
    return { available: false, connected: false, reason: dependencies.configResult.reason };
  }
  const now = dependencies.now ?? Date.now;
  if (!dependencies.store) return { available: true, connected: false };
  await dependencies.store.pruneExpiredRecords(now());
  if (!sessionId) return { available: true, connected: false };
  return { available: true, connected: Boolean(await dependencies.store.getAccessToken(sessionId, now())) };
}

export async function startSchoologyAuthorization(
  sessionId: string | null,
  dependencies: SchoologyDependencies,
): Promise<{ sessionId: string; authorizeUrl: string }> {
  const { config, store, client, now, randomState } = enabled(dependencies);
  const state = randomState();
  const callback = new URL(config.callbackUrl);
  callback.searchParams.set("state", state);
  const requestToken = await client.requestToken(callback.toString());
  if (requestToken.callbackConfirmed !== true) throw new Error("Schoology did not confirm the callback URL.");
  const activeSessionId = await store.createSession(now());
  try {
    await store.saveRequestToken(activeSessionId, {
      token: requestToken.token,
      tokenSecret: requestToken.tokenSecret,
      state,
      expiresAt: now() + REQUEST_TOKEN_TTL_MS,
    });
  } catch (error) {
    await store.deleteSession(activeSessionId).catch(() => undefined);
    throw error;
  }
  if (sessionId && sessionId !== activeSessionId) {
    try {
      await store.deleteSession(sessionId);
    } catch (error) {
      await store.deleteSession(activeSessionId).catch(() => undefined);
      throw error;
    }
  }
  const authorize = new URL("/oauth/authorize", config.tenantOrigin);
  authorize.searchParams.set("oauth_token", requestToken.token);
  authorize.searchParams.set("oauth_callback", callback.toString());
  return { sessionId: activeSessionId, authorizeUrl: authorize.toString() };
}

export async function completeSchoologyAuthorization(
  sessionId: string,
  callback: { oauthToken: string; state: string; verifier?: string },
  dependencies: SchoologyDependencies,
): Promise<void> {
  const { store, client, now } = enabled(dependencies);
  const requestToken = await store.consumeRequestToken(sessionId, {
    token: callback.oauthToken,
    state: callback.state,
    now: now(),
  });
  if (!requestToken) throw new SchoologyAuthorizationError("Schoology authorization callback is invalid or expired.");
  const access = await client.exchangeAccessToken(
    { token: requestToken.token, tokenSecret: requestToken.tokenSecret },
    callback.verifier,
  );
  const profile = await client.getCurrentUser({ token: access.token, tokenSecret: access.tokenSecret });
  const rawUserId = profile.uid ?? profile.id;
  if ((typeof rawUserId !== "string" && typeof rawUserId !== "number") || !/^[0-9]{1,20}$/.test(String(rawUserId))) {
    throw new Error("Schoology did not return a valid user profile.");
  }
  await store.saveAccessToken(sessionId, {
    token: access.token,
    tokenSecret: access.tokenSecret,
    userId: String(rawUserId),
    expiresAt: now() + ACCESS_TOKEN_TTL_MS,
  });
}

export async function retrieveSchoologyGradebook(sessionId: string, dependencies: SchoologyDependencies): Promise<Gradebook> {
  const { store, client, now } = enabled(dependencies);
  const access = await store.getAccessToken(sessionId, now());
  if (!access) throw new SchoologyAuthorizationError("Schoology authorization is required.");
  const providerToken = { token: access.token, tokenSecret: access.tokenSecret };
  try {
    const [profile, sections, grades] = await collectProviderBatch([
      client.getCurrentUser(providerToken),
      client.getUserSections(access.userId, providerToken),
      client.getUserGrades(access.userId, providerToken),
    ]);
    const sectionRecords = sections.section;
    if (!Array.isArray(sectionRecords)) throw new Error("Schoology returned invalid course sections.");
    const sectionIds = sectionRecords.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) throw new Error("Schoology returned invalid course sections.");
      const id = (section as Record<string, unknown>).id;
      if ((typeof id !== "string" && typeof id !== "number") || !/^[A-Za-z0-9_-]{1,80}$/.test(String(id))) throw new Error("Schoology returned an invalid section ID.");
      return String(id);
    });
    const categoryEntries = await collectProviderBatch(sectionIds.map(async (sectionId) => [sectionId, await client.getSectionCategories(sectionId, providerToken)] as const));
    const assignmentEntries = await collectProviderBatch(sectionIds.map(async (sectionId) => [sectionId, await client.getSectionAssignments(sectionId, providerToken)] as const));
    return normalizeSchoologyGradebook({
      profile,
      sections,
      grades,
      categoriesBySection: Object.fromEntries(categoryEntries),
      assignmentsBySection: Object.fromEntries(assignmentEntries),
    });
  } catch (error) {
    if (error instanceof SchoologyClientError && error.code === "authorization") {
      try {
        await store.invalidateAccessTokenIfMatches(sessionId, access);
      } catch {
        throw new Error("Schoology storage is temporarily unavailable.");
      }
    }
    throw error;
  }
}

export async function logoutSchoology(sessionId: string | null, dependencies: SchoologyDependencies): Promise<void> {
  if (sessionId && dependencies.store) await dependencies.store.deleteSession(sessionId);
}
