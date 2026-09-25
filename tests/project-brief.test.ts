import assert from "node:assert/strict";
import test from "node:test";

import {
  generateScopePlan,
  normalizeIdea,
  validateProjectBrief,
} from "../src/lib/project-brief";

test("normalizeIdea trims repeated whitespace but keeps the student's words", () => {
  assert.equal(
    normalizeIdea("  Help   ELD students\nfind school resources  "),
    "Help ELD students find school resources",
  );
});

test("normalizeIdea rejects an empty idea", () => {
  assert.throws(() => normalizeIdea("   \n  "), /idea cannot be blank/i);
});

test("normalizeIdea rejects ideas longer than the text cap", () => {
  assert.throws(
    () => normalizeIdea("x".repeat(501)),
    /idea must be 500 characters or fewer/i,
  );
});

const validInput = {
  roughIdea: "  Help   ELD students find resources ",
  audience: " ELD students ",
  desiredOutcome: " Students find support faster ",
  availableSkillsResources: " HTML, interviews, and a school directory ",
  weeklyHours: 4,
  timeHorizon: 14,
  evidenceChoice: "demo",
} as const;

test("validateProjectBrief returns a normalized complete brief", () => {
  assert.deepEqual(validateProjectBrief(validInput), {
    roughIdea: "Help ELD students find resources",
    audience: "ELD students",
    desiredOutcome: "Students find support faster",
    availableSkillsResources: "HTML, interviews, and a school directory",
    weeklyHours: 4,
    timeHorizon: 14,
    evidenceChoice: "demo",
  });
});

test("validateProjectBrief rejects every blank required text field", () => {
  const fields = [
    "roughIdea",
    "audience",
    "desiredOutcome",
    "availableSkillsResources",
  ] as const;

  for (const field of fields) {
    assert.throws(
      () => validateProjectBrief({ ...validInput, [field]: " \n " }),
      new RegExp(`${field} cannot be blank`, "i"),
    );
  }
});

test("validateProjectBrief rejects text that is too long to make a useful plan", () => {
  assert.throws(
    () => validateProjectBrief({ ...validInput, roughIdea: "x".repeat(501) }),
    /roughIdea must be 500 characters or fewer/i,
  );
});

test("validateProjectBrief rejects punctuation-only required text", () => {
  const fields = [
    "roughIdea",
    "audience",
    "desiredOutcome",
    "availableSkillsResources",
  ] as const;

  for (const field of fields) {
    for (const punctuation of ["!!!", "。！？"]) {
      assert.throws(
        () => validateProjectBrief({ ...validInput, [field]: punctuation }),
        new RegExp(`${field} must include usable text`, "i"),
      );
    }
  }
});

test("validateProjectBrief requires half-hour increments from 1 through 168", () => {
  for (const weeklyHours of [0, 0.5, 1.25, -1, 167.75, 168.5, 169, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => validateProjectBrief({ ...validInput, weeklyHours }),
      /weeklyHours must be between 1 and 168 in 0.5-hour increments/i,
    );
  }

  for (const weeklyHours of [1, 1.5, 168]) {
    assert.equal(validateProjectBrief({ ...validInput, weeklyHours }).weeklyHours, weeklyHours);
  }
});

test("validateProjectBrief accepts only 7, 14, or 30 day horizons", () => {
  assert.throws(
    () =>
      validateProjectBrief({ ...validInput, timeHorizon: 21 }),
    /timeHorizon must be 7, 14, or 30/i,
  );
});

test("validateProjectBrief accepts only supported evidence choices", () => {
  assert.throws(
    () =>
      validateProjectBrief({ ...validInput, evidenceChoice: "likes" }),
    /evidenceChoice must be demo, artifact, or feedback/i,
  );
});

test("validateProjectBrief requires a complete object", () => {
  const { audience: _audience, ...missingAudience } = validInput;

  assert.throws(() => validateProjectBrief(null), /brief must be an object/i);
  assert.throws(
    () => validateProjectBrief(missingAudience),
    /audience cannot be blank/i,
  );
});

test("generateScopePlan produces the complete deterministic coach output", () => {
  const first = generateScopePlan(validInput);
  const second = generateScopePlan(validInput);

  assert.deepEqual(first, second);
  assert.equal(
    first.problemStatement,
    'ELD students need "Help ELD students find resources" so they can reach this outcome: Students find support faster.',
  );
  assert.deepEqual(first.nonGoals, [
    "No accounts, sign-in, or user profiles.",
    "No external APIs, AI, or LLM features.",
    "No work beyond a 14-day version using HTML, interviews, and a school directory within 4 hours per week.",
  ]);
  assert.deepEqual(first.firstTask, {
    minutes: 25,
    action:
      "Write the smallest testable promise for ELD students and list what a demo must show.",
  });
  assert.equal(first.milestones.length, 4);
  assert.match(first.definitionOfDone, /ELD students.*support faster.*demo/i);
  assert.deepEqual(first.evidenceChecklist, [
    "Save the working link, file, or prototype.",
    "Record a short demo showing the outcome for ELD students.",
    "Confirm every milestone and the definition of done are checked off.",
  ]);
});

test("generateScopePlan always emits a single-sentence problem statement", () => {
  const plan = generateScopePlan({
    ...validInput,
    roughIdea: "Build one thing。 Then another！",
    audience: "Students？",
    desiredOutcome: "Finish a useful project。 On time！",
  });

  assert.equal((plan.problemStatement.match(/[.!?。！？]/g) ?? []).length, 1);
  assert.match(plan.problemStatement, /\.$/);
});

test("generateScopePlan uses clean fragments and preserves capitalization", () => {
  const plan = generateScopePlan({
    ...validInput,
    audience: "NASA STEM students.",
    desiredOutcome: "Use NASA APIs.",
    availableSkillsResources: "HTML.",
  });
  const rendered = JSON.stringify(plan);

  assert.doesNotMatch(rendered, /\.\./);
  assert.match(plan.definitionOfDone, /NASA STEM students can.*Use NASA APIs/);
  assert.doesNotMatch(rendered, /nasa apis/);
});

test("generateScopePlan reflects the weekly capacity", () => {
  const lowCapacity = generateScopePlan({ ...validInput, weeklyHours: 2 });
  const highCapacity = generateScopePlan({ ...validInput, weeklyHours: 8 });

  assert.notDeepEqual(lowCapacity, highCapacity);
  assert.match(lowCapacity.nonGoals.join(" "), /2 hours per week/);
  assert.match(highCapacity.nonGoals.join(" "), /8 hours per week/);
});
