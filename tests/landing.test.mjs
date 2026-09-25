import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("landing page is an unofficial local-first MVHS dashboard while Projects preserves Finishline", async () => {
  const [page, dashboard, projectRoute, workspace, styles] = await Promise.all([
    readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mvhs/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/projects/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/project-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MvhsDashboard/);
  assert.match(dashboard, /Unofficial|Built for Monta Vista/i);
  assert.match(dashboard, /Official MVHS bell schedules/i);
  assert.match(projectRoute, /ProjectWorkspace/);
  assert.match(workspace, /Finishline/);
  assert.match(workspace, /Build momentum\./);
  assert.doesNotMatch(styles, /@import\s+url|url\(["']?https?:/i, "local-first CSS must not fetch remote assets");
  assert.doesNotMatch(styles, /main\s*\{[^}]*overflow:\s*hidden/s, "page content must remain visible during zoom and narrow reflow");
  assert.match(styles, /overflow-wrap:\s*anywhere/, "long headings must reflow on narrow screens");
  assert.match(styles, /prefers-reduced-motion:\s*reduce/, "motion must respect the user's accessibility preference");
});
