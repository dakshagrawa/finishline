import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionCookie,
  parseSessionCookie,
  requestHasValidOrigin,
  SCHOOLOGY_SESSION_COOKIE,
} from "../src/schoology/session";

const secret = "s".repeat(32);

const sessionId = "session-id-that-is-long-enough";

test("session cookies are signed, HttpOnly, secure, same-site, and short lived", () => {
  const cookie = createSessionCookie(sessionId, secret, 1_000);
  assert.equal(cookie.name, SCHOOLOGY_SESSION_COOKIE);
  assert.match(cookie.value, /^session-id-that-is-long-enough\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(cookie.options, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1800,
  });
  assert.equal(parseSessionCookie(cookie.value, secret), sessionId);
});

test("session cookie verification rejects tampering and malformed values", () => {
  const cookie = createSessionCookie(sessionId, secret, 1_000);
  assert.equal(parseSessionCookie(`${cookie.value}x`, secret), null);
  assert.equal(parseSessionCookie("session-id", secret), null);
  assert.equal(parseSessionCookie("bad id.signature", secret), null);
  assert.equal(parseSessionCookie(cookie.value, "x".repeat(32)), null);
});

test("state-changing requests require an exact application origin", () => {
  const expected = "https://grades.example.org";
  assert.equal(requestHasValidOrigin(new Request(`${expected}/api/logout`, { method: "POST", headers: { origin: expected } }), expected), true);
  assert.equal(requestHasValidOrigin(new Request(`${expected}/api/logout`, { method: "POST", headers: { origin: "https://attacker.invalid" } }), expected), false);
  assert.equal(requestHasValidOrigin(new Request(`${expected}/api/logout`, { method: "POST" }), expected), false);
  assert.equal(requestHasValidOrigin(new Request(`${expected}/api/logout`, { method: "POST", headers: { origin: `${expected}.attacker.invalid` } }), expected), false);
});
