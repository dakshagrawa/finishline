import assert from "node:assert/strict";
import test from "node:test";
import type { SchoologyConfig } from "../src/schoology/config";
import { SchoologyClient, SchoologyClientError } from "../src/schoology/client";
import { buildOAuthAuthorization } from "../src/schoology/oauth";

const config: SchoologyConfig = {
  consumerKey: "consumer-key",
  consumerSecret: "consumer-secret-value",
  appOrigin: "https://grades.example.org",
  callbackUrl: "https://grades.example.org/api/integrations/schoology/callback",
  sessionSecret: "s".repeat(32),
  tokenEncryptionKey: Buffer.alloc(32),
  storePath: "/tmp/store.json",
  tenantOrigin: "https://fuhsd.schoology.com",
  apiOrigin: "https://api.schoology.com",
};

const access = { token: "access-token", tokenSecret: "access-secret" };

test("read-only client pins OAuth and API calls to documented provider origins", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/oauth/request_token")) return new Response("oauth_token=request&oauth_token_secret=secret&oauth_callback_confirmed=true");
    if (url.endsWith("/oauth/access_token")) return new Response("oauth_token=access&oauth_token_secret=secret");
    return Response.json({ uid: "101", name_display: "Student" });
  };
  const client = new SchoologyClient(config, { fetcher, nonce: () => "nonce", now: () => 1_700_000_000_000 });
  await client.requestToken();
  await client.exchangeAccessToken({ token: "request", tokenSecret: "secret" });
  await client.getCurrentUser(access);
  assert.deepEqual(requests.map((request) => request.url), [
    "https://fuhsd.schoology.com/oauth/request_token",
    "https://fuhsd.schoology.com/oauth/access_token",
    "https://api.schoology.com/v1/users/me",
  ]);
  for (const request of requests) {
    assert.equal(request.init?.method, "GET");
    assert.match(String((request.init?.headers as Record<string, string>).Authorization), /^OAuth /);
  }
});

test("access-token exchange carries an optional provider verifier in the signed request", async () => {
  let requested = "";
  let authorization = "";
  const client = new SchoologyClient(config, {
    nonce: () => "nonce",
    now: () => 1_700_000_000_000,
    fetcher: async (input, init) => {
      requested = String(input);
      authorization = String((init?.headers as Record<string, string>).Authorization);
      return new Response("oauth_token=access&oauth_token_secret=secret");
    },
  });
  await client.exchangeAccessToken(access, "provider-verifier");
  assert.equal(new URL(requested).searchParams.get("oauth_verifier"), "provider-verifier");
  assert.match(authorization, /oauth_signature=/);
});

test("read-only client exposes section, grade, assignment, and category reads", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input); urls.push(url);
    if (url.endsWith("/sections")) return Response.json({ section: [{ id: "11" }] });
    if (url.endsWith("/grades")) return Response.json({ section: [] });
    if (url.endsWith("/assignments")) return Response.json({ assignment: [] });
    return Response.json({ grading_category: [] });
  };
  const client = new SchoologyClient(config, { fetcher });
  await client.getUserSections("101", access);
  await client.getUserGrades("101", access);
  await client.getSectionAssignments("11", access);
  await client.getSectionCategories("11", access);
  assert.deepEqual(urls, [
    "https://api.schoology.com/v1/users/101/sections",
    "https://api.schoology.com/v1/users/101/grades",
    "https://api.schoology.com/v1/sections/11/assignments",
    "https://api.schoology.com/v1/sections/11/grading_categories",
  ]);
  assert.equal("createGrade" in client, false);
  assert.equal("updateGrade" in client, false);
  assert.equal("deleteGrade" in client, false);
});

test("pagination follows only same-origin links and enforces a strict page cap", async () => {
  let count = 0;
  const fetcher: typeof fetch = async () => {
    count += 1;
    return Response.json({
      section: [{ id: String(count) }],
      links: count < 3 ? { next: `/v1/users/101/sections?page=${count + 1}` } : {},
    });
  };
  const client = new SchoologyClient(config, { fetcher, maxPages: 3 });
  const result = await client.getUserSections("101", access);
  assert.deepEqual((result as { section: Array<{ id: string }> }).section.map((item) => item.id), ["1", "2", "3"]);

  const hostile = new SchoologyClient(config, { fetcher: async () => Response.json({ section: [], links: { next: "https://attacker.invalid/steal" } }) });
  await assert.rejects(() => hostile.getUserSections("101", access), /pagination link/i);

  const endless = new SchoologyClient(config, { fetcher: async () => Response.json({ section: [], links: { next: "/v1/users/101/sections?page=next" } }), maxPages: 2 });
  await assert.rejects(() => endless.getUserSections("101", access), /page limit/i);
});

test("API redirects stay on the pinned API origin and are re-signed with fresh OAuth values", async () => {
  const requests: Array<{ url: string; authorization: string; init?: RequestInit }> = [];
  let nonce = 0;
  let time = 1_700_000_000_000;
  const client = new SchoologyClient(config, {
    nonce: () => `nonce-${++nonce}`,
    now: () => { const current = time; time += 1_000; return current; },
    fetcher: async (input, init) => {
      requests.push({ url: String(input), authorization: String((init?.headers as Record<string, string>).Authorization), init });
      if (requests.length === 1) return new Response(null, { status: 303, headers: { location: "/v1/users/101?page=2&filter=active" } });
      return Response.json({ uid: "101", name_display: "Student" });
    },
  });
  assert.deepEqual(await client.getCurrentUser(access), { uid: "101", name_display: "Student" });
  assert.deepEqual(requests.map(({ url }) => url), ["https://api.schoology.com/v1/users/me", "https://api.schoology.com/v1/users/101?page=2&filter=active"]);
  for (const [index, request] of requests.entries()) {
    assert.equal(request.authorization, buildOAuthAuthorization({
      method: "GET", url: request.url,
      consumerKey: config.consumerKey, consumerSecret: config.consumerSecret,
      token: access.token, tokenSecret: access.tokenSecret,
      nonce: `nonce-${index + 1}`, timestamp: String(1_700_000_000 + index),
    }));
  }
  assert.match(requests[0].authorization, /oauth_nonce="nonce-1"/);
  assert.match(requests[1].authorization, /oauth_nonce="nonce-2"/);
  assert.match(requests[0].authorization, /oauth_timestamp="1700000000"/);
  assert.match(requests[1].authorization, /oauth_timestamp="1700000001"/);
  assert.notEqual(requests[0].authorization, requests[1].authorization);
  for (const request of requests) {
    assert.equal(request.init?.redirect, "manual");
    assert.equal(request.init?.cache, "no-store");
    assert.ok(request.init?.signal);
  }
});

test("malformed pagination link is classified as invalid_response", async () => {
  let calls = 0;
  const client = new SchoologyClient(config, { fetcher: async () => {
    calls += 1;
    return Response.json({ section: [], links: { next: "http://[invalid" } });
  } });
  await assert.rejects(() => client.getUserSections("101", access),
    (error: unknown) => error instanceof SchoologyClientError && error.code === "invalid_response");
  assert.equal(calls, 1);
});

test("pagination never signs links carrying URL credentials or fragments", async () => {
  for (const next of ["https://user:pass@api.schoology.com/v1/users/101/sections", "/v1/users/101/sections#fragment"]) {
    let calls = 0;
    const client = new SchoologyClient(config, { fetcher: async () => {
      calls += 1;
      return Response.json({ section: [], links: { next } });
    } });
    await assert.rejects(() => client.getUserSections("101", access), /pagination link/i);
    assert.equal(calls, 1);
  }
});

test("API redirects reject a different origin without forwarding credentials", async () => {
  const urls: string[] = [];
  const client = new SchoologyClient(config, { fetcher: async (input) => {
    urls.push(String(input));
    return new Response(null, { status: 302, headers: { location: "https://attacker.invalid/v1/users/101" } });
  } });
  await assert.rejects(() => client.getCurrentUser(access), (error: unknown) => error instanceof SchoologyClientError && error.code === "invalid_response" && /redirect/i.test(error.message));
  assert.deepEqual(urls, ["https://api.schoology.com/v1/users/me"]);
});

test("API redirects reject absolute same-origin paths outside /v1/", async () => {
  const urls: string[] = [];
  const client = new SchoologyClient(config, { fetcher: async (input) => {
    urls.push(String(input));
    return new Response(null, { status: 307, headers: { location: "https://api.schoology.com/not-v1" } });
  } });
  await assert.rejects(() => client.getCurrentUser(access), /redirect/i);
  assert.equal(urls.length, 1);
});

test("API redirects reject a fourth hop", async () => {
  const urls: string[] = [];
  const client = new SchoologyClient(config, { fetcher: async (input) => {
    urls.push(String(input));
    return new Response(null, { status: 301, headers: { location: `/v1/users/${urls.length}` } });
  } });
  await assert.rejects(() => client.getCurrentUser(access), /redirect limit/i);
  assert.deepEqual(urls, [
    "https://api.schoology.com/v1/users/me",
    "https://api.schoology.com/v1/users/1",
    "https://api.schoology.com/v1/users/2",
    "https://api.schoology.com/v1/users/3",
  ]);
});

test("API redirects require Location", async () => {
  let calls = 0;
  const client = new SchoologyClient(config, { fetcher: async () => {
    calls += 1;
    return new Response(null, { status: 308 });
  } });
  await assert.rejects(() => client.getCurrentUser(access), /redirect.*Location/i);
  assert.equal(calls, 1);
});

test("API redirects reject malformed Location", async () => {
  let calls = 0;
  const client = new SchoologyClient(config, { fetcher: async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "http://[invalid" } });
  } });
  await assert.rejects(() => client.getCurrentUser(access), /invalid redirect/i);
  assert.equal(calls, 1);
});

test("OAuth request and access token endpoint redirects are never followed", async () => {
  for (const exchange of ["request", "access"] as const) {
    const urls: string[] = [];
    const client = new SchoologyClient(config, { fetcher: async (input) => {
      urls.push(String(input));
      return new Response(null, { status: 303, headers: { location: "https://attacker.invalid/steal" } });
    } });
    const invoke = () => exchange === "request" ? client.requestToken() : client.exchangeAccessToken(access);
    await assert.rejects(invoke, /redirect/i);
    assert.deepEqual(urls, [`${config.tenantOrigin}/oauth/${exchange}_token`]);
  }
});

test("API redirects reject URL credentials, fragments, and oversized declared responses", async () => {
  for (const location of ["https://user:pass@api.schoology.com/v1/users/101", "/v1/users/101#fragment", "/v1/users/101#"]) {
    let calls = 0;
    const client = new SchoologyClient(config, { fetcher: async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location } });
    } });
    await assert.rejects(() => client.getCurrentUser(access), /redirect/i);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const oversized = new SchoologyClient(config, { maxResponseBytes: 100, fetcher: async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "/v1/users/101", "content-length": "101" } });
  } });
  await assert.rejects(() => oversized.getCurrentUser(access), /too large/i);
  assert.equal(calls, 1);
});

test("oversized declared 401 is classified as authorization", async () => {
  const client = new SchoologyClient(config, { maxResponseBytes: 100, fetcher: async () =>
    new Response(null, { status: 401, headers: { "content-length": "101" } }) });
  await assert.rejects(() => client.getCurrentUser(access),
    (error: unknown) => error instanceof SchoologyClientError && error.code === "authorization");
});

test("oversized declared 403 and 429 preserve status classification", async () => {
  for (const [status, code] of [[403, "authorization"], [429, "rate_limit"]] as const) {
    const client = new SchoologyClient(config, { maxResponseBytes: 100, fetcher: async () =>
      new Response(null, { status, headers: { "content-length": "101" } }) });
    await assert.rejects(() => client.getCurrentUser(access),
      (error: unknown) => error instanceof SchoologyClientError && error.code === code);
  }
});

test("API body streaming beyond the deadline yields timeout", async () => {
  const client = new SchoologyClient(config, { timeoutMs: 20, fetcher: async () =>
    new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"uid":'));
      // Never finish: the request deadline must include body consumption.
    } }), { headers: { "content-type": "application/json" } }) });
  await Promise.race([
    assert.rejects(() => client.getCurrentUser(access),
      (error: unknown) => error instanceof SchoologyClientError && error.code === "timeout"),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("body timeout guard")), 300)),
  ]);
});

test("OAuth token body shares the fetch deadline", async () => {
  const client = new SchoologyClient(config, { timeoutMs: 20, fetcher: async () =>
    new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("oauth_token=request&"));
    } })) });
  await assert.rejects(() => client.requestToken(),
    (error: unknown) => error instanceof SchoologyClientError && error.code === "timeout");
});

test("redirect hops share one deadline while the second fetch is pending", async () => {
  let releaseFirst!: (response: Response) => void;
  let releaseSecond!: (response: Response) => void;
  let secondStarted!: () => void;
  const first = new Promise<Response>((resolve) => { releaseFirst = resolve; });
  const second = new Promise<Response>((resolve) => { releaseSecond = resolve; });
  const started = new Promise<void>((resolve) => { secondStarted = resolve; });
  const signals: AbortSignal[] = [];
  let calls = 0;
  const client = new SchoologyClient(config, {
    timeoutMs: 100,
    fetcher: async (_input, init) => {
      calls += 1;
      signals.push(init!.signal!);
      if (calls === 2) secondStarted();
      return calls === 1 ? first : second;
    },
  });
  const request = client.getCurrentUser(access);
  const timeout = assert.rejects(request,
    (error: unknown) => error instanceof SchoologyClientError && error.code === "timeout");
  releaseFirst(new Response(null, { status: 302, headers: { location: "/v1/users/101" } }));
  await started;
  assert.equal(calls, 2);
  assert.equal(signals[0], signals[1]);
  await timeout;
  assert.equal(signals[0].aborted, true);
  releaseSecond(Response.json({ uid: "101" }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});

test("a redirect returned after the deadline cannot sign or fetch another hop", async () => {
  let releaseFirst!: (response: Response) => void;
  const first = new Promise<Response>((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  let nonces = 0;
  let cancelled = false;
  const client = new SchoologyClient(config, {
    timeoutMs: 20,
    nonce: () => `nonce-${++nonces}`,
    fetcher: async () => {
      calls += 1;
      return calls === 1 ? first : Response.json({ uid: "101" });
    },
  });
  await assert.rejects(() => client.getCurrentUser(access),
    (error: unknown) => error instanceof SchoologyClientError && error.code === "timeout");
  assert.equal(calls, 1);
  assert.equal(nonces, 1);
  releaseFirst(new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
    status: 302, headers: { location: "/v1/users/101" },
  }));
  // A queued event-loop turn lets the abandoned fetch and redirect continuation settle.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(nonces, 1);
  assert.equal(cancelled, true);
});

test("streaming body stops reading once it exceeds the byte limit", async () => {
  const client = new SchoologyClient(config, { maxResponseBytes: 5, fetcher: async () =>
    new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode("123456"));
    } }), { headers: { "content-type": "application/json" } }) });
  await Promise.race([
    assert.rejects(() => client.getCurrentUser(access),
      (error: unknown) => error instanceof SchoologyClientError && error.code === "invalid_response" && /too large/i.test(error.message)),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("size guard")), 300)),
  ]);
});

test("client bounds redirects, response size, time, content type, and provider failures", async () => {
  const cases: Array<[typeof fetch, RegExp]> = [
    [async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }), /redirect/i],
    [async () => new Response("not-json", { headers: { "content-type": "text/html" } }), /JSON/i],
    [async () => new Response("x".repeat(1_000), { headers: { "content-type": "application/json", "content-length": "1000" } }), /too large/i],
    [async () => Response.json({}, { status: 401 }), /authorization/i],
    [async () => Response.json({}, { status: 429 }), /too many/i],
    [async () => Response.json({}, { status: 500 }), /unavailable/i],
  ];
  for (const [fetcher, message] of cases) {
    const client = new SchoologyClient(config, { fetcher, maxResponseBytes: 100 });
    await assert.rejects(() => client.getCurrentUser(access), message);
  }

  const timeoutClient = new SchoologyClient(config, {
    timeoutMs: 10,
    fetcher: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  await assert.rejects(() => timeoutClient.getCurrentUser(access), (error: unknown) => error instanceof SchoologyClientError && error.code === "timeout");
});
