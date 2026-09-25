import { NextResponse } from "next/server";
import { clearSessionCookie, readSessionId, jsonNoStore } from "../../../../../schoology/routes";
import { requestHasValidOrigin } from "../../../../../schoology/session";
import { logoutSchoology, runtimeDependencies } from "../../../../../schoology/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const dependencies = runtimeDependencies();
  if (!dependencies.configResult.available) return jsonNoStore({ error: dependencies.configResult.reason }, 503);
  const config = dependencies.configResult.config;
  if (!requestHasValidOrigin(request, config.appOrigin)) return jsonNoStore({ error: "Invalid request origin." }, 403);
  const sessionId = await readSessionId(config);
  await logoutSchoology(sessionId, dependencies);
  const response = NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  clearSessionCookie(response);
  return response;
}
