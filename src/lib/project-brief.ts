export type TimeHorizon = 7 | 14 | 30;
export type EvidenceChoice = "demo" | "artifact" | "feedback";

export interface ProjectBrief {
  roughIdea: string;
  audience: string;
  desiredOutcome: string;
  availableSkillsResources: string;
  weeklyHours: number;
  timeHorizon: TimeHorizon;
  evidenceChoice: EvidenceChoice;
}

export interface ScopePlan {
  problemStatement: string;
  nonGoals: string[];
  firstTask: { minutes: 25; action: string };
  milestones: string[];
  definitionOfDone: string;
  evidenceChecklist: string[];
}

type TextField =
  | "roughIdea"
  | "audience"
  | "desiredOutcome"
  | "availableSkillsResources";

function normalizeText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} cannot be blank.`);
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new Error(`${label} cannot be blank.`);
  }

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    throw new Error(`${label} must include usable text.`);
  }

  if (normalized.length > 500) {
    throw new Error(`${label} must be 500 characters or fewer.`);
  }

  return normalized;
}

export function normalizeIdea(idea: string): string {
  return normalizeText(idea, "Idea");
}

function asSentencePhrase(value: string): string {
  return value
    .replace(/[.!?。！？]+/g, ";")
    .replace(/\s*;\s*/g, "; ")
    .replace(/(?:;\s*)+$/g, "")
    .replace(/^(?:;\s*)+/g, "")
    .trim();
}

function requireText(value: unknown, field: TextField): string {
  return normalizeText(value, field);
}

export function validateProjectBrief(input: unknown): ProjectBrief {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Brief must be an object.");
  }

  const brief = input as Record<string, unknown>;
  const evidenceChoice = brief.evidenceChoice;
  const timeHorizon = brief.timeHorizon;
  const weeklyHours = brief.weeklyHours;

  if (
    evidenceChoice !== "demo" &&
    evidenceChoice !== "artifact" &&
    evidenceChoice !== "feedback"
  ) {
    throw new Error("evidenceChoice must be demo, artifact, or feedback.");
  }

  if (timeHorizon !== 7 && timeHorizon !== 14 && timeHorizon !== 30) {
    throw new Error("timeHorizon must be 7, 14, or 30.");
  }

  if (
    typeof weeklyHours !== "number" ||
    !Number.isFinite(weeklyHours) ||
    weeklyHours < 1 ||
    weeklyHours > 168 ||
    !Number.isInteger(weeklyHours * 2)
  ) {
    throw new Error(
      "weeklyHours must be between 1 and 168 in 0.5-hour increments.",
    );
  }

  return {
    roughIdea: requireText(brief.roughIdea, "roughIdea"),
    audience: requireText(brief.audience, "audience"),
    desiredOutcome: requireText(brief.desiredOutcome, "desiredOutcome"),
    availableSkillsResources: requireText(
      brief.availableSkillsResources,
      "availableSkillsResources",
    ),
    weeklyHours,
    timeHorizon,
    evidenceChoice,
  };
}

export function generateScopePlan(input: unknown): ScopePlan {
  const brief = validateProjectBrief(input);
  const audience = asSentencePhrase(brief.audience);
  const roughIdea = asSentencePhrase(brief.roughIdea);
  const desiredOutcome = asSentencePhrase(brief.desiredOutcome);
  const resources = asSentencePhrase(brief.availableSkillsResources);
  const milestoneCount = brief.timeHorizon === 7 ? 3 : brief.timeHorizon === 14 ? 4 : 5;
  const milestonePool = [
    `Define one testable promise for ${audience}.`,
    `Build the smallest working version with ${resources}.`,
    `Test the main path with someone from ${audience}.`,
    `Fix the clearest problem and prepare the ${brief.evidenceChoice}.`,
    "Package the final version and record what changed.",
  ];

  return {
    problemStatement: `${audience} need "${roughIdea}" so they can reach this outcome: ${desiredOutcome}.`,
    nonGoals: [
      "No accounts, sign-in, or user profiles.",
      "No external APIs, AI, or LLM features.",
      `No work beyond a ${brief.timeHorizon}-day version using ${resources} within ${brief.weeklyHours} hours per week.`,
    ],
    firstTask: {
      minutes: 25,
      action: `Write the smallest testable promise for ${audience} and list what a ${brief.evidenceChoice} must show.`,
    },
    milestones: milestonePool.slice(0, milestoneCount),
    definitionOfDone: `${audience} can use the finished version to ${desiredOutcome}, and the ${brief.evidenceChoice} clearly proves it.`,
    evidenceChecklist: [
      "Save the working link, file, or prototype.",
      `Record a short ${brief.evidenceChoice} showing the outcome for ${audience}.`,
      "Confirm every milestone and the definition of done are checked off.",
    ],
  };
}
