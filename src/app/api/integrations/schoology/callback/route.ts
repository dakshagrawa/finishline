import { NextResponse } from "next/server";
import { readSessionId } from "../../../../../schoology/routes";
import { completeSchoologyAuthorization, runtimeDependencies } from "../../../../../schoology/service";

export const dynamic = "force-dynamic";

function failure(origin: string, code: string): NextResponse {
  const url = new URL("/grades", origin);
  url.searchParams.set("schoology", code);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  const dependencies = runtimeDependencies();
  if (!dependencies.configResult.available) {
    return NextResponse.json({ error: dependencies.configResult.reason }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
  const config = dependencies.configResult.config;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== config.appOrigin) return failure(config.appOrigin, "invalid");
  const oauthToken = requestUrl.searchParams.get("oauth_token");
  const state = requestUrl.searchParams.get("state");
  const verifier = requestUrl.searchParams.get("oauth_verifier") ?? undefined;
  const sessionId = await readSessionId(config);
  if (!oauthToken || !state || !sessionId) return failure(config.appOrigin, "invalid");
  try {
    await completeSchoologyAuthorization(sessionId, { oauthToken, state, verifier }, dependencies);
    const response = NextResponse.redirect(`${config.appOrigin}/grades?schoology=connected`, 303);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch {
    return failure(config.appOrigin, "invalid");
  }
}
