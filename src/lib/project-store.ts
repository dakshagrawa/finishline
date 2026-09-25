import {
  generateScopePlan,
  validateProjectBrief,
  type ProjectBrief,
  type ScopePlan,
} from "./project-brief";

export const PROJECT_STORE_VERSION = 1 as const;

export interface StoredProject {
  version: typeof PROJECT_STORE_VERSION;
  brief: ProjectBrief;
  plan: ScopePlan;
  milestoneDone: boolean[];
  evidenceDone: boolean[];
  isSample: boolean;
}

export function createProject(
  briefInput: ProjectBrief,
  options: { isSample?: boolean } = {},
): StoredProject {
  const brief = validateProjectBrief(briefInput);
  const plan = generateScopePlan(brief);

  return {
    version: PROJECT_STORE_VERSION,
    brief,
    plan,
    milestoneDone: plan.milestones.map(() => false),
    evidenceDone: plan.evidenceChecklist.map(() => false),
    isSample: options.isSample ?? false,
  };
}

export const SAMPLE_PROJECT = createProject(
  {
    roughIdea: "Create a welcoming school resource guide",
    audience: "new students",
    desiredOutcome: "find the right support in under two minutes",
    availableSkillsResources: "writing, HTML, and three student interviews",
    weeklyHours: 4,
    timeHorizon: 14,
    evidenceChoice: "demo",
  },
  { isSample: true },
);

export function updateProject(
  _project: StoredProject,
  brief: ProjectBrief,
): StoredProject {
  return createProject(brief);
}

export function resetProject(): null {
  return null;
}

export function serializeProject(project: StoredProject): string {
  return JSON.stringify(project);
}

export function toggleMilestone(
  project: StoredProject,
  index: number,
): StoredProject {
  if (!Number.isInteger(index) || index < 0 || index >= project.milestoneDone.length) {
    return project;
  }

  const milestoneDone = [...project.milestoneDone];
  milestoneDone[index] = !milestoneDone[index];
  return { ...project, milestoneDone };
}

export function toggleEvidence(
  project: StoredProject,
  index: number,
): StoredProject {
  if (!Number.isInteger(index) || index < 0 || index >= project.evidenceDone.length) {
    return project;
  }

  const evidenceDone = [...project.evidenceDone];
  evidenceDone[index] = !evidenceDone[index];
  return { ...project, evidenceDone };
}

export function parseProject(value: string): StoredProject | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.version !== PROJECT_STORE_VERSION ||
      typeof candidate.isSample !== "boolean"
    ) {
      return null;
    }

    const brief = validateProjectBrief(candidate.brief);
    const plan = generateScopePlan(brief);
    const milestoneDone = candidate.milestoneDone;
    const evidenceDone = candidate.evidenceDone;

    if (
      !isBooleanList(milestoneDone, plan.milestones.length) ||
      !isBooleanList(evidenceDone, plan.evidenceChecklist.length)
    ) {
      return null;
    }

    return {
      version: PROJECT_STORE_VERSION,
      brief,
      plan,
      milestoneDone,
      evidenceDone,
      isSample: candidate.isSample,
    };
  } catch {
    return null;
  }
}

function isBooleanList(value: unknown, length: number): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "boolean")
  );
}

export function restoreProject(value: string | null): StoredProject {
  return value === null ? SAMPLE_PROJECT : (parseProject(value) ?? SAMPLE_PROJECT);
}
