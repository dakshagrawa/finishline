import { jsonNoStore, publicRouteError, readSessionId } from "../../../../../schoology/routes";
import { retrieveSchoologyGradebook, runtimeDependencies } from "../../../../../schoology/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const dependencies = runtimeDependencies();
  if (!dependencies.configResult.available) return jsonNoStore({ error: dependencies.configResult.reason }, 503);
  const sessionId = await readSessionId(dependencies.configResult.config);
  if (!sessionId) return jsonNoStore({ error: "Schoology authorization is required." }, 401);
  try {
    return jsonNoStore(await retrieveSchoologyGradebook(sessionId, dependencies));
  } catch (error) {
    return publicRouteError(error);
  }
}
