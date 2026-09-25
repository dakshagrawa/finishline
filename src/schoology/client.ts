import type { SchoologyConfig } from "./config";
import { buildOAuthAuthorization, parseOAuthTokenResponse, type OAuthTokenResponse } from "./oauth";

export interface SchoologyAccessToken {
  token: string;
  tokenSecret: string;
}

interface ClientOptions {
  fetcher?: typeof fetch;
  nonce?: () => string;
  now?: () => number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxPages?: number;
}

export class SchoologyClientError extends Error {
  constructor(
    public readonly code: "authorization" | "rate_limit" | "provider_unavailable" | "invalid_response" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "SchoologyClientError";
  }
}

export class SchoologyClient {
  private readonly fetcher: typeof fetch;
  private readonly nonce: () => string;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxPages: number;

  constructor(
    private readonly config: SchoologyConfig,
    options: ClientOptions = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.nonce = options.nonce ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 2_000_000;
    this.maxPages = options.maxPages ?? 10;
  }

  private authorization(url: string, token?: SchoologyAccessToken, callback?: string): string {
    return buildOAuthAuthorization({
      method: "GET",
      url,
      consumerKey: this.config.consumerKey,
      consumerSecret: this.config.consumerSecret,
      token: token?.token,
      tokenSecret: token?.tokenSecret,
      callback,
      nonce: this.nonce(),
      timestamp: Math.floor(this.now() / 1_000).toString(),
    });
  }

  private async withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SchoologyClientError("timeout", "Schoology took too long to respond."));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([operation(controller.signal), expired]);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
      }
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  }

  private async fetchOnce(url: string, authorization: string, signal: AbortSignal): Promise<Response> {
    if (signal.aborted) throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/json" },
        redirect: "manual",
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
      }
      throw new SchoologyClientError("provider_unavailable", "Schoology is unavailable right now.");
    }

    if (signal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      this.assertSuccessfulResponse(response);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      throw new SchoologyClientError("invalid_response", "Schoology response is too large.");
    }
    return response;
  }

  private assertSuccessfulResponse(response: Response): void {
    if (response.status >= 300 && response.status < 400) {
      throw new SchoologyClientError("invalid_response", "Schoology returned an unexpected redirect.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new SchoologyClientError("authorization", "Schoology authorization is unavailable or expired.");
    }
    if (response.status === 429) {
      throw new SchoologyClientError("rate_limit", "Schoology received too many requests. Try again later.");
    }
    if (!response.ok) {
      throw new SchoologyClientError("provider_unavailable", "Schoology is unavailable right now.");
    }
  }

  private redirectTarget(response: Response, currentUrl: string): string | null {
    if (![301, 302, 303, 307, 308].includes(response.status)) return null;
    const location = response.headers.get("location");
    if (!location) throw new SchoologyClientError("invalid_response", "Schoology redirect is missing a Location.");
    let target: URL;
    try {
      target = new URL(location, currentUrl);
    } catch {
      throw new SchoologyClientError("invalid_response", "Schoology returned an invalid redirect.");
    }
    if (target.origin !== this.config.apiOrigin || !target.pathname.startsWith("/v1/") ||
        target.username || target.password || target.hash || location.includes("#")) {
      throw new SchoologyClientError("invalid_response", "Schoology returned an unsafe redirect.");
    }
    return target.toString();
  }

  private async boundedText(response: Response, signal: AbortSignal): Promise<string> {
    if (signal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const onAbort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", onAbort, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (signal.aborted) throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
        if (done) break;
        length += value.byteLength;
        if (length > this.maxResponseBytes) {
          void reader.cancel().catch(() => {});
          throw new SchoologyClientError("invalid_response", "Schoology response is too large.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (signal.aborted) throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
      return new TextDecoder().decode(bytes);
    } finally {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
    }
  }

  private async oauthToken(
    url: string,
    token?: SchoologyAccessToken,
    callback?: string,
    requestParameters?: Record<string, string>,
  ): Promise<OAuthTokenResponse> {
    const authorization = buildOAuthAuthorization({
      method: "GET",
      url,
      consumerKey: this.config.consumerKey,
      consumerSecret: this.config.consumerSecret,
      token: token?.token,
      tokenSecret: token?.tokenSecret,
      callback,
      requestParameters,
      nonce: this.nonce(),
      timestamp: Math.floor(this.now() / 1_000).toString(),
    });
    return this.withDeadline(async (signal) => {
      const response = await this.fetchOnce(url, authorization, signal);
      this.assertSuccessfulResponse(response);
      try {
        return parseOAuthTokenResponse(await this.boundedText(response, signal));
      } catch (error) {
        if (error instanceof SchoologyClientError) throw error;
        throw new SchoologyClientError("invalid_response", "Schoology returned an invalid OAuth token response.");
      }
    });
  }

  async requestToken(callbackUrl = this.config.callbackUrl): Promise<OAuthTokenResponse> {
    const callback = new URL(callbackUrl);
    if (callback.origin !== this.config.appOrigin || callback.pathname !== "/api/integrations/schoology/callback") {
      throw new SchoologyClientError("invalid_response", "Schoology callback URL is invalid.");
    }
    return this.oauthToken(`${this.config.tenantOrigin}/oauth/request_token`, undefined, callback.toString());
  }

  async exchangeAccessToken(requestToken: SchoologyAccessToken, verifier?: string): Promise<OAuthTokenResponse> {
    const url = new URL(`${this.config.tenantOrigin}/oauth/access_token`);
    if (verifier) url.searchParams.set("oauth_verifier", verifier);
    return this.oauthToken(url.toString(), requestToken);
  }

  private async json(url: string, token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.withDeadline(async (signal) => {
      let currentUrl = url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        if (signal.aborted) throw new SchoologyClientError("timeout", "Schoology took too long to respond.");
        response = await this.fetchOnce(currentUrl, this.authorization(currentUrl, token), signal);
        const target = this.redirectTarget(response, currentUrl);
        if (target === null) break;
        if (redirects === 3) throw new SchoologyClientError("invalid_response", "Schoology exceeded the redirect limit.");
        currentUrl = target;
      }
      if (!response) throw new SchoologyClientError("provider_unavailable", "Schoology is unavailable right now.");
      this.assertSuccessfulResponse(response);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("application/json")) {
        throw new SchoologyClientError("invalid_response", "Schoology did not return JSON data.");
      }
      try {
        const parsed = JSON.parse(await this.boundedText(response, signal));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
        return parsed as Record<string, unknown>;
      } catch (error) {
        if (error instanceof SchoologyClientError) throw error;
        throw new SchoologyClientError("invalid_response", "Schoology returned invalid JSON data.");
      }
    });
  }

  private async paginated(url: string, token: SchoologyAccessToken, collectionKey: string): Promise<Record<string, unknown>> {
    const merged: unknown[] = [];
    let current: string | null = url;
    let finalPage: Record<string, unknown> = {};
    for (let page = 0; current && page < this.maxPages; page += 1) {
      finalPage = await this.json(current, token);
      const collection = finalPage[collectionKey];
      if (collection !== undefined && !Array.isArray(collection)) {
        throw new SchoologyClientError("invalid_response", "Schoology returned an invalid collection.");
      }
      merged.push(...(collection ?? []));
      const links = finalPage.links;
      const next = links && typeof links === "object" && !Array.isArray(links)
        ? (links as Record<string, unknown>).next
        : undefined;
      if (next === undefined || next === null || next === "") {
        current = null;
        break;
      }
      if (typeof next !== "string") throw new SchoologyClientError("invalid_response", "Schoology returned an invalid pagination link.");
      let resolved: URL;
      try {
        resolved = new URL(next, this.config.apiOrigin);
      } catch {
        throw new SchoologyClientError("invalid_response", "Schoology returned an invalid pagination link.");
      }
      if (resolved.origin !== this.config.apiOrigin || !resolved.pathname.startsWith("/v1/") ||
          resolved.username || resolved.password || resolved.hash || next.includes("#")) {
        throw new SchoologyClientError("invalid_response", "Schoology returned an unsafe pagination link.");
      }
      current = resolved.toString();
    }
    if (current) throw new SchoologyClientError("invalid_response", "Schoology pagination exceeded the page limit.");
    return { ...finalPage, [collectionKey]: merged, links: {} };
  }

  async getCurrentUser(token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.json(`${this.config.apiOrigin}/v1/users/me`, token);
  }

  async getUserSections(userId: string, token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.paginated(`${this.config.apiOrigin}/v1/users/${encodeURIComponent(userId)}/sections`, token, "section");
  }

  async getUserGrades(userId: string, token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.paginated(`${this.config.apiOrigin}/v1/users/${encodeURIComponent(userId)}/grades`, token, "section");
  }

  async getSectionAssignments(sectionId: string, token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.paginated(`${this.config.apiOrigin}/v1/sections/${encodeURIComponent(sectionId)}/assignments`, token, "assignment");
  }

  async getSectionCategories(sectionId: string, token: SchoologyAccessToken): Promise<Record<string, unknown>> {
    return this.paginated(`${this.config.apiOrigin}/v1/sections/${encodeURIComponent(sectionId)}/grading_categories`, token, "grading_category");
  }
}
