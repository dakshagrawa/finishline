import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("interactive workspace includes the complete accessible intake and board", async () => {
  const workspace = await readFile(
    new URL("../src/components/project-workspace.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );

  for (const label of [
    "Rough idea",
    "Who is it for?",
    "What should change?",
    "Skills and resources",
    "Hours per week",
    "Time horizon",
    "Proof of progress",
  ]) {
    assert.match(workspace, new RegExp(label, "i"));
  }

  for (const section of [
    "Problem",
    "Not doing",
    "First 25 minutes",
    "Milestones",
    "Definition of done",
    "Evidence",
  ]) {
    assert.match(workspace, new RegExp(section, "i"));
  }

  assert.match(workspace, /aria-invalid/);
  assert.match(workspace, /role="alert"/);
  assert.match(workspace, /localStorage/);
  assert.match(workspace, /Sample/);
  assert.match(workspace, /Start a new project/);
  assert.doesNotMatch(workspace, /behavior:\s*"smooth"/, "JavaScript scrolling must respect reduced-motion preferences");
  assert.match(styles, /--label-accent:\s*#5b2b82/, "small accent text needs an AA-contrast Monta Vista purple token");
  assert.doesNotMatch(styles, /#617f00|#688600/, "legacy low-contrast small-text colors must not return");
  assert.doesNotMatch(styles, /\.board-topbar \.local-note\s*\{[^}]*display:\s*none/s, "the not-saved warning must remain visible on mobile");
  assert.match(styles, /h1:focus[^\{]*\{[^}]*outline:\s*3px solid/s, "programmatically focused headings need a clean visible focus ring");
});
