import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the grade lab preserves local use while gating Schoology behind same-origin OAuth routes", async () => {
  const [route, component, gradebook, styles, projectWorkspace, architecture] = await Promise.all([
    read("src/app/grades/page.tsx"),
    read("src/grades/grade-calculator.tsx"),
    read("src/grades/gradebook.ts"),
    read("src/app/globals.css"),
    read("src/components/project-workspace.tsx"),
    read("ARCHITECTURE.md"),
  ]);

  assert.match(route, /GradeCalculator/);
  assert.match(route, /AppShell/);
  assert.match(route, /active="grades"/);
  assert.match(component, /Schoology passwords never enter Finishline/i);
  assert.match(component, /Open a local version 1 gradebook/i);
  assert.match(component, /Continue with Schoology/i);
  assert.match(component, /SCHOOLLOGY_API_ROOT = "\/api\/integrations\/schoology"/);
  assert.match(component, /type="file"/);
  assert.match(component, /aria-hidden="true"[^>]*tabIndex=\{-1\}/);
  assert.match(component, /Download template/);
  assert.match(component, /Explore demo/);
  assert.match(gradebook, /GRADEBOOK_TEMPLATE_JSON/);
  assert.match(styles, /\.grades-shell/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.grades-layout/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*\.grades-shell/);
  assert.match(styles, /\.grades-shell h1:focus/);
  assert.match(styles, /\.grades-shell input\.sr-only\s*\{[^}]*width:\s*1px/s);
  assert.match(styles, /\.grades-assignment\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
  assert.match(projectWorkspace, /href="\/grades"/);
  assert.match(architecture, /legacy (?:project|repository)[^\n]* (?:separate|untouched)/i);
  assert.match(architecture, /(?:Imported gradebooks|Local Grade Lab)[^\n]*client React memory/i);
  assert.match(architecture, /Schoology[^\n]*disabled by default/i);

  const shipped = `${route}\n${component}\n${gradebook}`;
  assert.doesNotMatch(shipped, /https?:\/\//i);
  assert.doesNotMatch(shipped, /fuhsd\.schoology\.com|api\.schoology\.com/i);
});
