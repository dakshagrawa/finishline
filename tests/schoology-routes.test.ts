import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SchoologyClientError } from "../src/schoology/client";
import { publicRouteError } from "../src/schoology/routes";
import { retrieveSchoologyGradebook, SchoologyAuthorizationError, type SchoologyDependencies } from "../src/schoology/service";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("storage authorization errors are generic 502 responses, never public authentication failures", async () => {
  const response = publicRouteError(new Error("Schoology authorization storage is unavailable."));
  assert.equal(response.status, 502);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { error: "Schoology connection is temporarily unavailable." });
});

test("typed provider authorization failures get a safe static 401 message", async () => {
  const response = publicRouteError(new SchoologyClientError("authorization", "private-provider-token=secret"));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { error: "Schoology authorization is required." });
});

test("missing access and invalid callback remain typed 401 without echoing details", async () => {
  const dependencies = {
    configResult: { available: true, config: {} },
    store: { getAccessToken: async () => null },
    client: {},
  } as unknown as SchoologyDependencies;
  let missingAccess: unknown;
  await assert.rejects(() => retrieveSchoologyGradebook("missing", dependencies), (error: unknown) => {
    missingAccess = error;
    return error instanceof SchoologyAuthorizationError;
  });
  const response = publicRouteError(missingAccess);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { error: "Schoology authorization is required." });
  const callback = publicRouteError(new SchoologyAuthorizationError("private callback token"));
  assert.equal(callback.status, 401);
  assert.deepEqual(await callback.json(), { error: "Schoology authorization is required." });
  const unknown = publicRouteError(new Error("authorization required: private token"));
  assert.equal(unknown.status, 502);
  assert.deepEqual(await unknown.json(), { error: "Schoology connection is temporarily unavailable." });
});

test("disabled route handlers execute fail-closed without redirecting to a request-controlled host", async () => {
  const previous = process.env.SCHOOLOGY_INTEGRATION_ENABLED;
  delete process.env.SCHOOLOGY_INTEGRATION_ENABLED;
  try {
    const [{ GET: status }, { POST: start }, { GET: callback }, { GET: gradebook }, { POST: logout }] = await Promise.all([
      import("../src/app/api/integrations/schoology/status/route"),
      import("../src/app/api/integrations/schoology/start/route"),
      import("../src/app/api/integrations/schoology/callback/route"),
      import("../src/app/api/integrations/schoology/gradebook/route"),
      import("../src/app/api/integrations/schoology/logout/route"),
    ]);
    const statusResponse = await status();
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), {
      available: false,
      connected: false,
      reason: "Schoology connection is awaiting district authorization and deployment configuration.",
    });
    for (const response of [
      await start(new Request("https://attacker.invalid/api/integrations/schoology/start", { method: "POST", headers: { origin: "https://attacker.invalid" } })),
      await callback(new Request("https://attacker.invalid/api/integrations/schoology/callback?oauth_token=x&state=y")),
      await gradebook(),
      await logout(new Request("https://attacker.invalid/api/integrations/schoology/logout", { method: "POST", headers: { origin: "https://attacker.invalid" } })),
    ]) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("location"), null);
    }
  } finally {
    if (previous === undefined) delete process.env.SCHOOLOGY_INTEGRATION_ENABLED;
    else process.env.SCHOOLOGY_INTEGRATION_ENABLED = previous;
  }
});

test("Schoology routes expose only the gated read-only OAuth lifecycle", async () => {
  const paths = [
    "src/app/api/integrations/schoology/status/route.ts",
    "src/app/api/integrations/schoology/start/route.ts",
    "src/app/api/integrations/schoology/callback/route.ts",
    "src/app/api/integrations/schoology/gradebook/route.ts",
    "src/app/api/integrations/schoology/logout/route.ts",
  ];
  const contents = await Promise.all(paths.map(read));
  assert.match(contents[0], /getSchoologyStatus/);
  assert.match(contents[1], /requestHasValidOrigin/);
  assert.match(contents[1], /startSchoologyAuthorization/);
  assert.match(contents[2], /completeSchoologyAuthorization/);
  assert.match(contents[3], /retrieveSchoologyGradebook/);
  assert.match(contents[4], /logoutSchoology/);
  assert.match(contents[4], /requestHasValidOrigin/);
  assert.doesNotMatch(contents.join("\n"), /password|username|document\.cookie|localStorage|sessionStorage/i);
});

test("Schoology API responses disable caching and callbacks never expose tokens", async () => {
  const helper = await read("src/schoology/routes.ts");
  assert.match(helper, /Cache-Control.*no-store/);
  assert.match(helper, /SCHOOLOGY_SESSION_COOKIE/);
  assert.match(helper, /parseSessionCookie/);
  assert.match(helper, /cookies\(\)/);
  const callback = await read("src/app/api/integrations/schoology/callback/route.ts");
  assert.match(callback, /\/grades\?schoology=connected/);
  assert.doesNotMatch(callback, /access\.token|tokenSecret|oauth_token.*searchParams\.set/);
});

test("Schoology operations documentation records the official OAuth and reauthorization contract", async () => {
  const operations = await read("SCHOOLOGY_INTEGRATION.md");
  assert.match(operations, /three-legged OAuth 1\.0/i);
  assert.match(operations, /HMAC-SHA1/i);
  assert.match(operations, /fuhsd\.schoology\.com\/oauth\/request_token/i);
  assert.match(operations, /fuhsd\.schoology\.com\/oauth\/authorize/i);
  assert.match(operations, /fuhsd\.schoology\.com\/oauth\/access_token/i);
  assert.match(operations, /401.*reauthor/i);
  assert.match(operations, /Important OAuth\/API Authentication Update/i);
});

test("runbook distinguishes the registered base callback from each state-bearing callback", async () => {
  const operations = await read("SCHOOLOGY_INTEGRATION.md");
  assert.match(operations, /registered (?:production )?HTTPS base callback/i);
  assert.match(operations, /appends a random `state` query parameter[^\n]*per-attempt callback/i);
  assert.match(operations, /FUHSD[^\n]*accept[^\n]*exact constructed (?:callback )?URL[^\n]*before activation/i);
  assert.doesNotMatch(operations, /the exact registered HTTPS callback(?:[,.;]|\s+a unique)/i);
});

test("runbook excludes student passwords but acknowledges server-held OAuth secrets", async () => {
  const operations = await read("SCHOOLOGY_INTEGRATION.md");
  assert.match(operations, /student Schoology\/SSO passwords never enter Finishline/i);
  assert.match(operations, /server[^\n]*approved app credentials[^\n]*token secrets[^\n]*securely/i);
  assert.doesNotMatch(operations, /credentials never enter Finishline/i);
});
