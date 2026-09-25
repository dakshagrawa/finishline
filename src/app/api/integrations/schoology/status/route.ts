import { jsonNoStore, readSessionId } from "../../../../../schoology/routes";
import { getSchoologyStatus, runtimeDependencies } from "../../../../../schoology/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const dependencies = runtimeDependencies();
  const sessionId = dependencies.configResult.available
    ? await readSessionId(dependencies.configResult.config)
    : null;
  return jsonNoStore(await getSchoologyStatus(sessionId, dependencies));
}
