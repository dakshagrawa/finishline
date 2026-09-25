import { createHmac, timingSafeEqual } from "node:crypto";

export const SCHOOLOGY_SESSION_COOKIE = "finishline_schoology_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 60;

interface CookieDescriptor {
  name: typeof SCHOOLOGY_SESSION_COOKIE;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  };
}

function signature(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

export function createSessionCookie(sessionId: string, secret: string, _now = Date.now()): CookieDescriptor {
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(sessionId)) throw new Error("Invalid Schoology session ID.");
  return {
    name: SCHOOLOGY_SESSION_COOKIE,
    value: `${sessionId}.${signature(sessionId, secret)}`,
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}

export function parseSessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(sessionId) || !/^[A-Za-z0-9_-]{20,120}$/.test(supplied)) return null;
  const expected = signature(sessionId, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  return sessionId;
}

export function requestHasValidOrigin(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === expectedOrigin && origin === expectedOrigin;
  } catch {
    return false;
  }
}
