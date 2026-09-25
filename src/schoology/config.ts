import { isAbsolute } from "node:path";

export const FUHSD_SCHOOLOGY_ORIGIN = "https://fuhsd.schoology.com";
export const SCHOOLOGY_API_ORIGIN = "https://api.schoology.com";
export const SCHOOLOGY_UNAVAILABLE_REASON = "Schoology connection is awaiting district authorization and deployment configuration.";

export interface SchoologyConfig {
  consumerKey: string;
  consumerSecret: string;
  appOrigin: string;
  callbackUrl: string;
  sessionSecret: string;
  tokenEncryptionKey: Buffer;
  storePath: string;
  tenantOrigin: typeof FUHSD_SCHOOLOGY_ORIGIN;
  apiOrigin: typeof SCHOOLOGY_API_ORIGIN;
}

export type SchoologyConfigResult =
  | { available: true; config: SchoologyConfig }
  | { available: false; reason: string };

function unavailable(): SchoologyConfigResult {
  return { available: false, reason: SCHOOLOGY_UNAVAILABLE_REASON };
}

function secureOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function encryptionKey(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) return null;
  return decoded;
}

export function readSchoologyConfig(environment: Record<string, string | undefined>): SchoologyConfigResult {
  if (environment.SCHOOLOGY_INTEGRATION_ENABLED !== "true") return unavailable();

  const consumerKey = environment.SCHOOLOGY_CONSUMER_KEY?.trim();
  const consumerSecret = environment.SCHOOLOGY_CONSUMER_SECRET?.trim();
  const appOrigin = secureOrigin(environment.APP_URL?.trim());
  const sessionSecret = environment.SESSION_SECRET;
  const tokenEncryptionKey = encryptionKey(environment.TOKEN_ENCRYPTION_KEY);
  const storePath = environment.SCHOOLOGY_STORE_PATH?.trim();

  if (
    !consumerKey || consumerKey.length < 8 ||
    !consumerSecret || consumerSecret.length < 16 ||
    !appOrigin ||
    !sessionSecret || sessionSecret.length < 32 ||
    !tokenEncryptionKey ||
    !storePath || !isAbsolute(storePath)
  ) return unavailable();

  return {
    available: true,
    config: {
      consumerKey,
      consumerSecret,
      appOrigin,
      callbackUrl: `${appOrigin}/api/integrations/schoology/callback`,
      sessionSecret,
      tokenEncryptionKey,
      storePath,
      tenantOrigin: FUHSD_SCHOOLOGY_ORIGIN,
      apiOrigin: SCHOOLOGY_API_ORIGIN,
    },
  };
}
