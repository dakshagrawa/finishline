import assert from "node:assert/strict";
import test from "node:test";
import {
  FUHSD_SCHOOLOGY_ORIGIN,
  SCHOOLOGY_API_ORIGIN,
  readSchoologyConfig,
} from "../src/schoology/config";

const validEnv = {
  SCHOOLOGY_INTEGRATION_ENABLED: "true",
  SCHOOLOGY_CONSUMER_KEY: "consumer-key",
  SCHOOLOGY_CONSUMER_SECRET: "consumer-secret-value",
  APP_URL: "https://grades.example.org",
  SESSION_SECRET: "s".repeat(32),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SCHOOLOGY_STORE_PATH: "/var/lib/finishline/schoology-store.json",
};

test("Schoology integration fails closed when deployment configuration is missing", () => {
  const result = readSchoologyConfig({});
  assert.deepEqual(result, {
    available: false,
    reason: "Schoology connection is awaiting district authorization and deployment configuration.",
  });
});

test("Schoology integration accepts only a complete secure server configuration", () => {
  const result = readSchoologyConfig(validEnv);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.config.tenantOrigin, "https://fuhsd.schoology.com");
  assert.equal(result.config.apiOrigin, "https://api.schoology.com");
  assert.equal(result.config.callbackUrl, "https://grades.example.org/api/integrations/schoology/callback");
  assert.equal(result.config.storePath, "/var/lib/finishline/schoology-store.json");
});

test("Schoology integration rejects unsafe URLs, weak keys, and implicit activation", () => {
  const cases = [
    { ...validEnv, SCHOOLOGY_INTEGRATION_ENABLED: "1" },
    { ...validEnv, APP_URL: "http://grades.example.org" },
    { ...validEnv, APP_URL: "https://user:pass@grades.example.org" },
    { ...validEnv, SESSION_SECRET: "short" },
    { ...validEnv, TOKEN_ENCRYPTION_KEY: Buffer.alloc(31).toString("base64") },
    { ...validEnv, SCHOOLOGY_STORE_PATH: "relative/store.json" },
  ];
  for (const environment of cases) assert.equal(readSchoologyConfig(environment).available, false);
});

test("Schoology provider hosts are fixed and cannot be supplied by callers", () => {
  assert.equal(FUHSD_SCHOOLOGY_ORIGIN, "https://fuhsd.schoology.com");
  assert.equal(SCHOOLOGY_API_ORIGIN, "https://api.schoology.com");
  const result = readSchoologyConfig({
    ...validEnv,
    SCHOOLOGY_TENANT_ORIGIN: "https://attacker.invalid",
    SCHOOLOGY_API_ORIGIN: "https://attacker.invalid",
  });
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.config.tenantOrigin, FUHSD_SCHOOLOGY_ORIGIN);
  assert.equal(result.config.apiOrigin, SCHOOLOGY_API_ORIGIN);
});
