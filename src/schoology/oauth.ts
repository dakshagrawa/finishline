import { createHmac, randomBytes } from "node:crypto";

export interface OAuthAuthorizationOptions {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  nonce?: string;
  timestamp?: string;
  requestParameters?: Record<string, string | readonly string[]>;
}

export interface OAuthTokenResponse {
  token: string;
  tokenSecret: string;
  callbackConfirmed: boolean | null;
}

export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function parameterPairs(options: OAuthAuthorizationOptions, oauth: Record<string, string>): Array<[string, string]> {
  const url = new URL(options.url);
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams) pairs.push([key, value]);
  for (const [key, value] of Object.entries(options.requestParameters ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) pairs.push([key, item]);
    } else {
      pairs.push([key, value as string]);
    }
  }
  for (const [key, value] of Object.entries(oauth)) {
    if (key !== "oauth_signature") pairs.push([key, value]);
  }
  return pairs.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = percentEncode(leftKey).localeCompare(percentEncode(rightKey));
    return keyOrder || percentEncode(leftValue).localeCompare(percentEncode(rightValue));
  });
}

function normalizedUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const defaultPort = (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80");
  const authority = `${url.hostname}${url.port && !defaultPort ? `:${url.port}` : ""}`;
  return `${url.protocol}//${authority}${url.pathname || "/"}`;
}

export function buildOAuthAuthorization(options: OAuthAuthorizationOptions): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: options.consumerKey,
    oauth_nonce: options.nonce ?? randomBytes(18).toString("base64url"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: options.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (options.token) oauth.oauth_token = options.token;
  if (options.callback) oauth.oauth_callback = options.callback;

  const normalizedParameters = parameterPairs(options, oauth)
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const baseString = [
    options.method.toUpperCase(),
    percentEncode(normalizedUrl(options.url)),
    percentEncode(normalizedParameters),
  ].join("&");
  const signingKey = `${percentEncode(options.consumerSecret)}&${percentEncode(options.tokenSecret ?? "")}`;
  oauth.oauth_signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const authorizationParameters = Object.entries(oauth)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");
  return `OAuth realm="Schoology API", ${authorizationParameters}`;
}

export function parseOAuthTokenResponse(body: string): OAuthTokenResponse {
  const params = new URLSearchParams(body);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw new Error("OAuth token response contains duplicate parameters.");
    seen.add(key);
  }
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!token?.trim() || !tokenSecret?.trim()) throw new Error("Invalid OAuth token response.");
  const callback = params.get("oauth_callback_confirmed");
  return {
    token,
    tokenSecret,
    callbackConfirmed: callback === null ? null : callback === "true",
  };
}
