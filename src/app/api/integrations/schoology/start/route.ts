import { NextResponse } from "next/server";
import { publicRouteError, readSessionId, setSessionCookie, jsonNoStore } from "../../../../../schoology/routes";
import { requestHasValidOrigin } from "../../../../../schoology/session";
import { runtimeDependencies, startSchoologyAuthorization } from "../../../../../schoology/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const dependencies = runtimeDependencies();
  if (!dependencies.configResult.available) return jsonNoStore({ error: dependencies.configResult.reason }, 503);
  const config = dependencies.configResult.config;
  if (!requestHasValidOrigin(request, config.appOrigin)) return jsonNoStore({ error: "Invalid request origin." }, 403);
  try {
    const currentSession = await readSessionId(config);
    const started = await startSchoologyAuthorization(currentSession, dependencies);
    const response = NextResponse.redirect(started.authorizeUrl, 303);
    await setSessionCookie(response, started.sessionId, config);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    return publicRouteError(error);
  }
}
