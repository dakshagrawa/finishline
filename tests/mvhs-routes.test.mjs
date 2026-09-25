import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("MVHS dashboard routes preserve grades and project coach while adding the student shell", async () => {
  const [home, projects, clubs, tools, settings, layout] = await Promise.all([
    source("src/app/page.tsx"),
    source("src/app/projects/page.tsx"),
    source("src/app/clubs/page.tsx"),
    source("src/app/tools/page.tsx"),
    source("src/app/settings/page.tsx"),
    source("src/app/layout.tsx"),
  ]);

  assert.match(home, /MvhsDashboard/);
  assert.match(projects, /ProjectWorkspace/);
  assert.match(projects, /AppShell/);
  assert.match(projects, /active="projects"/);
  assert.match(projects, /mvhs-project-module/);
  assert.match(clubs, /MvhsClubs/);
  assert.match(tools, /MvhsTools/);
  assert.match(settings, /MvhsSettings/);
  assert.match(layout, /Monta Vista student dashboard/i);
});

test("Finishline shell stays unofficial and uses the Matador Notebook palette", async () => {
  const [shell, styles] = await Promise.all([
    source("src/mvhs/app-shell.tsx"),
    source("src/app/globals.css"),
  ]);
  assert.match(shell, /Finishline/);
  assert.match(shell, /Unofficial student tool/);
  assert.doesNotMatch(shell, /monta-vista-logo\.png|Monta Vista Matador/);
  assert.match(styles, /--notebook-purple:\s*#4b1f6f/i);
  assert.match(styles, /--notebook-gold:\s*#f4c542/i);
  assert.match(styles, /--notebook-red:\s*#9f1525/i);
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/i);
});

test("new dashboard UI stays local-first and credits the MIT reference", async () => {
  const [styles, notices, architecture] = await Promise.all([
    source("src/app/globals.css"),
    source("THIRD_PARTY_NOTICES.md"),
    source("ARCHITECTURE.md"),
  ]);
  assert.doesNotMatch(styles, /@import\s+url|url\(["']?https?:/i);
  assert.match(styles, /\.mvhs-app-shell/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*\.mvhs-main-nav/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /:root\s*\{[\s\S]*--accent:\s*#f4c542/i);
  assert.match(styles, /:root\s*\{[\s\S]*--label-accent:\s*#5b2b82/i);
  assert.match(styles, /\.grades-shell\s*\{[\s\S]*--grades-bg:\s*#130a1f/i);
  assert.match(styles, /--notebook-purple:\s*#4b1f6f/i);
  assert.match(styles, /--notebook-gold:\s*#f4c542/i);
  assert.match(notices, /Gunn WATT/i);
  assert.match(notices, /MIT License/i);
  assert.match(notices, /gunn\.one[^\n]*no (?:gunn\.one )?source code or assets were copied/i);
  assert.match(notices, /no official school (?:mark|logo)[^\n]*included/i);
  assert.match(architecture, /2025[–-]26[^\n]*not[^\n]*confirmed 2026[–-]27/i);
});

test("Matador Notebook collapses tablet and mobile shell boundaries without covering content", async () => {
  const styles = await source("src/app/globals.css");

  assert.match(styles, /@media\s*\(max-width:\s*820px\)[\s\S]*\.mvhs-app-shell\s*\{[\s\S]*display:\s*block[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media\s*\(max-width:\s*820px\)[\s\S]*\.mvhs-sidebar\s*\{[\s\S]*position:\s*static[\s\S]*height:\s*auto[\s\S]*width:\s*auto/);
  assert.match(styles, /@media\s*\(max-width:\s*820px\)[\s\S]*\.mvhs-brand,\s*\.mvhs-unofficial\s*\{\s*display:\s*none/);
  assert.match(styles, /@media\s*\(max-width:\s*820px\)[\s\S]*\.mvhs-hero-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*\.mvhs-sidebar\s*\{[\s\S]*position:\s*fixed[\s\S]*height:\s*auto/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*\.mvhs-brand,\s*\.mvhs-unofficial\s*\{\s*display:\s*none/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*\.mvhs-main-nav\s*\{\s*margin-top:\s*0/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*padding-bottom:\s*calc\(76px\s*\+/);
  assert.match(styles, /@media\s*\(max-width:\s*350px\)[\s\S]*padding-bottom:\s*calc\(144px\s*\+/);
});

test("no-school text stays legible against the purple inset", async () => {
  const styles = await source("src/app/globals.css");
  const notebook = styles.slice(styles.indexOf("/* Matador Notebook production shell"));
  assert.match(notebook, /\.mvhs-no-school\s*\{[^}]*color:\s*#fff\s*;/);
  assert.match(notebook, /\.mvhs-no-school p\s*\{[^}]*color:\s*#eee5f2\s*;/);
});

test("tool field names and percent suffixes use dark text on the light card", async () => {
  const styles = await source("src/app/globals.css");
  const notebook = styles.slice(styles.indexOf("/* Matador Notebook production shell"));
  assert.match(notebook, /\.mvhs-tool-fields label\s*\{[^}]*color:\s*var\(--notebook-muted\)/);
  assert.match(notebook, /\.mvhs-tool-fields label span\s*\{[^}]*color:\s*var\(--notebook-muted\)/);
});

test("unofficial affiliation remains visible at tablet and phone widths outside the navigation", async () => {
  const [shell, styles] = await Promise.all([source("src/mvhs/app-shell.tsx"), source("src/app/globals.css")]);
  assert.match(shell, /<main className="mvhs-main">\s*<p className="mvhs-mobile-unofficial">Unofficial student tool · not affiliated with FUHSD<\/p>/);
  const notebook = styles.slice(styles.indexOf("/* Matador Notebook production shell"));
  assert.match(notebook, /\.mvhs-mobile-unofficial\s*\{[^}]*display:\s*none/);
  assert.match(notebook, /@media\s*\(max-width:\s*820px\)\s*\{[^]*?\.mvhs-mobile-unofficial\s*\{[^}]*display:\s*block/);
});
