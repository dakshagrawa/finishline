import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOAuthAuthorization,
  parseOAuthTokenResponse,
  percentEncode,
} from "../src/schoology/oauth";

test("OAuth signer matches the RFC 5849 HMAC-SHA1 example", () => {
  const authorization = buildOAuthAuthorization({
    method: "GET",
    url: "http://photos.example.net/photos",
    consumerKey: "dpf43f3p2l4k3l03",
    consumerSecret: "kd94hf93k423kf44",
    token: "nnch734d00sl2jdk",
    tokenSecret: "pfkkdhi9sl3r4s00",
    nonce: "kllo9940pd9333jh",
    timestamp: "1191242096",
    requestParameters: { file: "vacation.jpg", size: "original" },
  });
  assert.match(authorization, /^OAuth /);
  assert.match(authorization, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
  assert.match(authorization, /oauth_consumer_key="dpf43f3p2l4k3l03"/);
});

test("OAuth percent encoding follows RFC 3986 rather than form encoding", () => {
  assert.equal(percentEncode("Ladies + Gentlemen"), "Ladies%20%2B%20Gentlemen");
  assert.equal(percentEncode("An encoded string!"), "An%20encoded%20string%21");
  assert.equal(percentEncode("Dogs, Cats & Mice"), "Dogs%2C%20Cats%20%26%20Mice");
  assert.equal(percentEncode("!*'()"), "%21%2A%27%28%29");
});

test("OAuth signer includes query parameters, sorts duplicates, and can sign without a user token", () => {
  const authorization = buildOAuthAuthorization({
    method: "GET",
    url: "https://fuhsd.schoology.com/oauth/request_token?z=last&a=first&a=second",
    consumerKey: "consumer-key",
    consumerSecret: "consumer-secret",
    nonce: "fixed-nonce",
    timestamp: "1234567890",
    callback: "https://grades.example.org/api/integrations/schoology/callback",
  });
  assert.match(authorization, /oauth_callback=/);
  assert.doesNotMatch(authorization, /oauth_token=/);
  assert.match(authorization, /oauth_signature=/);
});

test("OAuth token responses are strict and reject missing or duplicate secrets", () => {
  assert.deepEqual(parseOAuthTokenResponse("oauth_token=request-key&oauth_token_secret=request-secret&oauth_callback_confirmed=true"), {
    token: "request-key",
    tokenSecret: "request-secret",
    callbackConfirmed: true,
  });
  assert.throws(() => parseOAuthTokenResponse("oauth_token=key"), /token response/i);
  assert.throws(() => parseOAuthTokenResponse("oauth_token=one&oauth_token=two&oauth_token_secret=secret"), /duplicate/i);
  assert.throws(() => parseOAuthTokenResponse("oauth_token=key&oauth_token_secret="), /token response/i);
});

test("Schoology OAuth authorization identifies the documented realm without signing it", () => {
  const authorization = buildOAuthAuthorization({
    method: "GET",
    url: "https://fuhsd.schoology.com/oauth/request_token",
    consumerKey: "consumer-key",
    consumerSecret: "consumer-secret",
    callback: "https://finishline.example/api/integrations/schoology/callback",
    nonce: "realm-test-nonce",
    timestamp: "1700000000",
  });
  assert.match(authorization, /^OAuth realm="Schoology API", /);
  assert.equal((authorization.match(/realm=/g) ?? []).length, 1);
});
