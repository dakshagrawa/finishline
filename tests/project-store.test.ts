import assert from "node:assert/strict";
import test from "node:test";

import {
  createProject,
  parseProject,
  resetProject,
  restoreProject,
  SAMPLE_PROJECT,
  serializeProject,
  toggleEvidence,
  toggleMilestone,
  updateProject,
} from "../src/lib/project-store";

const brief = {
  roughIdea: "Create a welcoming school resource guide",
  audience: "new students",
  desiredOutcome: "find the right support in under two minutes",
  availableSkillsResources: "writing, HTML, and three student interviews",
  weeklyHours: 4,
  timeHorizon: 14,
  evidenceChoice: "demo",
} as const;

test("createProject makes a versioned project that survives serialization", () => {
  const project = createProject(brief);
  const restored = parseProject(serializeProject(project));

  assert.deepEqual(restored, project);
  assert.equal(project.version, 1);
  assert.equal(project.isSample, false);
  assert.equal(project.milestoneDone.length, project.plan.milestones.length);
  assert.ok(project.milestoneDone.every((item) => item === false));
  assert.equal(project.evidenceDone.length, project.plan.evidenceChecklist.length);
});

test("parseProject rejects corrupted, incomplete, and future-version data", () => {
  const project = createProject(brief);

  assert.equal(parseProject("not json"), null);
  assert.equal(parseProject("null"), null);
  assert.equal(parseProject(JSON.stringify({ ...project, brief: null })), null);
  assert.equal(parseProject(JSON.stringify({ ...project, version: 99 })), null);
  assert.equal(
    parseProject(JSON.stringify({ ...project, milestoneDone: [false] })),
    null,
  );
  for (const weeklyHours of [0.5, 1.25, 167.75]) {
    assert.equal(
      parseProject(JSON.stringify({ ...project, brief: { ...project.brief, weeklyHours } })),
      null,
    );
  }
});

test("toggle helpers immutably change only the requested checklist item", () => {
  const project = createProject(brief);
  const milestoneChanged = toggleMilestone(project, 1);
  const evidenceChanged = toggleEvidence(milestoneChanged, 0);

  assert.notEqual(milestoneChanged, project);
  assert.deepEqual(milestoneChanged.milestoneDone, [false, true, false, false]);
  assert.deepEqual(evidenceChanged.evidenceDone, [true, false, false]);
  assert.deepEqual(project.milestoneDone, [false, false, false, false]);
  assert.equal(toggleMilestone(project, -1), project);
  assert.equal(toggleEvidence(project, 99), project);
});

test("restore, update, and reset helpers provide a safe local-first lifecycle", () => {
  assert.equal(SAMPLE_PROJECT.isSample, true);
  assert.deepEqual(restoreProject(null), SAMPLE_PROJECT);
  assert.deepEqual(restoreProject("corrupted"), SAMPLE_PROJECT);

  const progressed = toggleMilestone(createProject(brief), 0);
  const updated = updateProject(progressed, {
    ...brief,
    roughIdea: "Publish a smaller guide",
    timeHorizon: 7,
  });

  assert.equal(updated.brief.roughIdea, "Publish a smaller guide");
  assert.equal(updated.plan.milestones.length, 3);
  assert.ok(updated.milestoneDone.every((item) => item === false));
  assert.equal(updated.isSample, false);
  assert.equal(resetProject(), null);
});
