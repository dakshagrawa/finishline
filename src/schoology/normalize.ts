import type { Assignment, Category, Course, Gradebook } from "../grades/gradebook";

interface SchoologyPayloads {
  profile: unknown;
  sections: unknown;
  categoriesBySection: Record<string, unknown>;
  assignmentsBySection: Record<string, unknown>;
  grades: unknown;
}

type ObjectRecord = Record<string, unknown>;

function object(value: unknown, label: string): ObjectRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid Schoology ${label}.`);
  return value as ObjectRecord;
}

function array(value: unknown, label: string, maximum: number): ObjectRecord[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Schoology ${label}.`);
  if (value.length > maximum) throw new Error(`Schoology ${label} exceeds ${maximum}.`);
  return value.map((item) => object(item, label));
}

function text(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== "string") throw new Error(`Invalid Schoology ${label}.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum) throw new Error(`Invalid Schoology ${label}.`);
  return normalized;
}

function optionalText(value: unknown, maximum = 160): string {
  if (value === undefined || value === null || value === "") return "";
  return text(String(value), "text", maximum);
}

function identifier(value: unknown, label: string): string {
  const normalized = typeof value === "number" ? String(value) : value;
  if (typeof normalized !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(normalized)) throw new Error(`Invalid Schoology ${label}.`);
  return normalized;
}

function canonicalPeriodId(value: unknown, label: string): string {
  const normalized = identifier(value, label);
  const prefixedNumeric = /^p(\d+)$/.exec(normalized);
  return prefixedNumeric?.[1] ?? normalized;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  const converted = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(converted) || converted < minimum || converted > maximum) throw new Error(`Invalid Schoology ${label}.`);
  return converted;
}

function providerFlag(value: unknown, label: string, fallback: 0 | 1): 0 | 1 {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = finiteNumber(value, label, 0, 1);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid Schoology ${label}.`);
  return parsed as 0 | 1;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function rejectNonDefaultNumbers(record: ObjectRecord, fields: Array<[string, number]>, label: string): void {
  for (const [field, defaultValue] of fields) {
    if (present(record[field]) && finiteNumber(record[field], `${label} ${field}`, -1_000_000, 1_000_000) !== defaultValue) {
      throw new Error(`Schoology ${label} are not supported safely.`);
    }
  }
}

function rejectNonDefaultText(record: ObjectRecord, fields: Array<[string, string]>, label: string): void {
  for (const [field, defaultValue] of fields) {
    if (present(record[field]) && String(record[field]).trim() !== defaultValue) {
      throw new Error(`Schoology ${label} are not supported safely.`);
    }
  }
}

function collection(payload: unknown, key: string, label: string, maximum: number): ObjectRecord[] {
  const record = object(payload, label);
  return array(record[key], label, maximum);
}

function periodFromSection(section: ObjectRecord): string {
  const explicit = section.period;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return optionalText(String(explicit), 40);
  const title = optionalText(section.section_title, 160);
  const match = title.match(/(?:^|\s[-–—:]\s|\bperiod\s+)(\d{1,2})\s*$/i);
  return match?.[1] ?? "";
}

interface GradeIndex {
  records: Map<string, { score: number | null; dropped: boolean; excludedReason?: "excused" | "incomplete" }>;
  sectionIds: Set<string>;
  periodIdsBySection: Map<string, string | null>;
}

function gradeMap(gradesPayload: unknown): GradeIndex {
  const gradePayload = object(gradesPayload, "grades");
  const records: GradeIndex["records"] = new Map();
  const sectionIds = new Set<string>();
  const periodIdsBySection = new Map<string, string | null>();
  for (const section of array(gradePayload.section, "grade sections", 32)) {
    const finalGrades = section.final_grade;
    if (finalGrades !== undefined && finalGrades !== null && (!Array.isArray(finalGrades) || finalGrades.length > 0)) {
      throw new Error("Schoology final grades are not supported safely.");
    }
    const sectionId = identifier(section.section_id, "grade section ID");
    if (sectionIds.has(sectionId)) throw new Error("Schoology returned a duplicate grade section ID.");
    sectionIds.add(sectionId);
    const periods = section.period === undefined ? [] : array(section.period, "grade periods", 30);
    if (periods.length > 1) throw new Error("Schoology multiple grading periods are not supported safely.");
    const periodId = periods.length === 0 || !present(periods[0].period_id)
      ? null
      : canonicalPeriodId(periods[0].period_id, "grade period ID");
    periodIdsBySection.set(sectionId, periodId);
    for (const period of periods) {
      rejectNonDefaultNumbers(period, [["weight", 100], ["is_final", 0], ["override", 0], ["pending", 0]], "grading period calculation semantics");
      const grades = period.assignment === undefined ? [] : array(period.assignment, "grade records", 6_000);
      for (const grade of grades) {
        const assignmentId = identifier(grade.assignment_id, "grade assignment ID");
        const gradeKey = `${sectionId}:${assignmentId}`;
        if (records.has(gradeKey)) throw new Error("Schoology returned a duplicate grade record.");
        rejectNonDefaultNumbers(grade, [["is_final", 0], ["override", 0], ["pending", 0]], "grade calculation semantics");
        rejectNonDefaultText(grade, [["calculated_grade", ""], ["type", "assignment"]], "grade calculation semantics");
        const exception = grade.exception === undefined || grade.exception === null || grade.exception === ""
          ? 0
          : finiteNumber(grade.exception, "grade exception", 0, 100);
        if (exception === 1 || exception === 2) {
          records.set(gradeKey, {
            score: null,
            dropped: false,
            excludedReason: exception === 1 ? "excused" : "incomplete",
          });
        } else if (exception !== 0) {
          throw new Error("Invalid Schoology grade exception.");
        } else if (grade.grade === null || grade.grade === undefined || grade.grade === "") {
          records.set(gradeKey, { score: null, dropped: false });
        } else {
          records.set(gradeKey, {
            score: finiteNumber(grade.grade, "grade value", 0, 1_000_000),
            dropped: false,
          });
        }
      }
    }
  }
  return { records, sectionIds, periodIdsBySection };
}

function normalizedWeights(categories: Array<{ rawWeight: number | null }>): number[] {
  if (categories.some(({ rawWeight }) => rawWeight === null)) {
    throw new Error("Schoology category weights are unavailable.");
  }
  const total = categories.reduce((sum, { rawWeight }) => sum + (rawWeight ?? 0), 0);
  if (total <= 0) throw new Error("Schoology category weights are unavailable.");
  return categories.map(({ rawWeight }) => (rawWeight ?? 0) / total);
}

export function normalizeSchoologyGradebook(payloads: SchoologyPayloads): Gradebook {
  const profile = object(payloads.profile, "profile");
  const studentName = text(profile.name_display ?? profile.name, "student name", 120);
  const school = optionalText(profile.school_name ?? "Monta Vista High School", 120) || "Monta Vista High School";
  const sections = collection(payloads.sections, "section", "course sections", 32);
  if (sections.length < 1) throw new Error("Schoology must return at least one course section.");
  const gradeIndex = gradeMap(payloads.grades);
  const sectionIds = new Set<string>();
  const assignmentKeys = new Set<string>();

  const courses: Course[] = sections.map((section, courseIndex) => {
    const sectionId = identifier(section.id, "section ID");
    if (sectionIds.has(sectionId)) throw new Error("Schoology returned a duplicate course section ID.");
    sectionIds.add(sectionId);
    const providerCategories = collection(payloads.categoriesBySection[sectionId], "grading_category", "grading categories", 30);
    if (providerCategories.length < 1) throw new Error("Schoology must return at least one grading category.");
    const providerAssignments = collection(payloads.assignmentsBySection[sectionId], "assignment", "assignments", 6_000);

    const categoryIds = new Set<string>();
    const categoryModels = providerCategories.map((category) => {
      const categoryId = identifier(category.id, "category ID");
      if (categoryIds.has(categoryId)) throw new Error("Schoology returned a duplicate grading category ID.");
      categoryIds.add(categoryId);
      if (category.calculation_type === undefined || category.drop_lowest === undefined) {
        throw new Error("Schoology category calculation rules are unavailable.");
      }
      const calculationType = finiteNumber(category.calculation_type, "category calculation type", 1, 2);
      const dropLowest = finiteNumber(category.drop_lowest, "category drop-lowest rule", 0, 10);
      if (calculationType !== 2 || dropLowest !== 0) {
        throw new Error("Schoology category calculation rules are not supported safely.");
      }
      let rawWeight: number | null = null;
      const providerWeight = category.weight ?? category.weight_factor;
      if (providerWeight !== undefined && providerWeight !== null && String(providerWeight).trim() !== "") {
        rawWeight = finiteNumber(providerWeight, "category weight", 0, 1_000_000);
      }
      return { category, categoryId, rawWeight };
    });
    const weights = normalizedWeights(categoryModels);
    for (const assignment of providerAssignments) {
      const assignmentCategory = identifier(assignment.grading_category, "assignment grading category");
      if (!categoryIds.has(assignmentCategory)) {
        throw new Error("Schoology assignment grading category is unavailable.");
      }
    }

    const categories: Category[] = categoryModels.map(({ category, categoryId }, categoryIndex) => {
      const matchingAssignments = providerAssignments.filter((assignment) => String(assignment.grading_category) === categoryId);
      if (matchingAssignments.length > 200) throw new Error("Schoology assignments exceed 200 per category.");
      if (matchingAssignments.length < 1) throw new Error("Schoology grading categories must include at least one assignment.");
      const assignments: Assignment[] = matchingAssignments.map((assignment, assignmentIndex) => {
        const assignmentId = identifier(assignment.id, "assignment ID");
        const assignmentKey = `${sectionId}:${assignmentId}`;
        if (assignmentKeys.has(assignmentKey)) throw new Error("Schoology returned a duplicate assignment ID.");
        assignmentKeys.add(assignmentKey);
        rejectNonDefaultNumbers(assignment, [
          ["is_final", 0],
          ["grading_scale", 0],
          ["grading_scale_id", 0],
        ], "assignment calculation semantics");
        if (present(assignment.grading_period) && Number(assignment.grading_period) !== 0) {
          const assignmentPeriod = canonicalPeriodId(assignment.grading_period, "assignment grading period");
          if (assignmentPeriod !== gradeIndex.periodIdsBySection.get(sectionId)) {
            throw new Error("Schoology assignment grading period is not supported safely.");
          }
        }
        const grade = gradeIndex.records.get(assignmentKey) ?? { score: null, dropped: false };
        const countInGrade = providerFlag(assignment.count_in_grade, "assignment count-in-grade flag", 1);
        const collectedOnly = providerFlag(assignment.collected_only, "assignment collected-only flag", 0);
        if (countInGrade === 0 || collectedOnly === 1) {
          throw new Error("Schoology assignment is explicitly non-grade-bearing.");
        }
        const factor = assignment.factor === undefined
          ? 1
          : finiteNumber(assignment.factor, "assignment factor", 0, 1_000_000);
        if (factor !== 1) throw new Error("Schoology assignment weighting is not supported safely.");
        return {
          id: `c${courseIndex + 1}-g${categoryIndex + 1}-a${assignmentIndex + 1}`,
          title: text(assignment.title, "assignment title", 160),
          score: grade.score,
          maxPoints: finiteNumber(assignment.max_points, "maximum points", 0.01, 1_000_000),
          dropped: grade.dropped,
          ...(grade.excludedReason ? { excludedReason: grade.excludedReason } : {}),
        };
      });
      return {
        name: text(category.title, "category title", 120),
        weight: weights[categoryIndex],
        assignments,
      };
    });

    return {
      id: `course-${courseIndex + 1}`,
      name: text(section.course_title ?? section.section_title, "course title", 120),
      period: periodFromSection(section),
      teacher: optionalText(section.teacher_name ?? section.primary_instructor, 120),
      categories,
    };
  });

  for (const gradeSectionId of gradeIndex.sectionIds) {
    if (!sectionIds.has(gradeSectionId)) throw new Error("Schoology grade section has no matching course section.");
  }
  for (const gradeKey of gradeIndex.records.keys()) {
    if (!assignmentKeys.has(gradeKey)) throw new Error("Schoology grade record has no matching assignment.");
  }

  return {
    version: 1,
    source: "schoology",
    student: { name: studentName, school },
    courses,
  };
}
