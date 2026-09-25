import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SchoologyClientError } from "./client";
import type { SchoologyConfig } from "./config";
import { SchoologyAuthorizationError } from "./service";
import {
  createSessionCookie,
  parseSessionCookie,
  SCHOOLOGY_SESSION_COOKIE,
} from "./session";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function readSessionId(config: SchoologyConfig): Promise<string | null> {
  const cookieStore = await cookies();
  return parseSessionCookie(cookieStore.get(SCHOOLOGY_SESSION_COOKIE)?.value, config.sessionSecret);
}

export async function setSessionCookie(response: NextResponse, sessionId: string, config: SchoologyConfig): Promise<void> {
  const cookie = createSessionCookie(sessionId, config.sessionSecret);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SCHOOLOGY_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function publicRouteError(error: unknown): NextResponse {
  const authorization = error instanceof SchoologyAuthorizationError ||
    (error instanceof SchoologyClientError && error.code === "authorization");
  return jsonNoStore({ error: authorization ? "Schoology authorization is required." : "Schoology connection is temporarily unavailable." }, authorization ? 401 : 502);
}
