export interface Assignment {
  id: string;
  title: string;
  score: number | null;
  maxPoints: number;
  dropped?: boolean;
  excludedReason?: "excused" | "incomplete";
}

export interface Category {
  name: string;
  weight: number;
  assignments: Assignment[];
}

export interface Course {
  id: string;
  name: string;
  period: string;
  teacher: string;
  categories: Category[];
}

export interface Gradebook {
  version: 1;
  student: { name: string; school: string };
  courses: Course[];
  source: "local" | "demo" | "schoology";
}

export const GRADEBOOK_TEMPLATE_JSON = `${JSON.stringify({
  version: 1,
  student: { name: "Your name", school: "Your school" },
  courses: [{
    name: "Example course",
    period: "1",
    teacher: "Teacher name",
    categories: [{
      name: "Tests",
      weight: 1,
      assignments: [
        { title: "Unit test", score: 90, maxPoints: 100 },
        { title: "Future test", score: null, maxPoints: 100 },
      ],
    }],
  }],
}, null, 2)}\n`;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, fallback?: string): string {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized && fallback === undefined) throw new Error(`${label} cannot be blank.`);
  if (normalized.length > 120) throw new Error(`${label} must be at most 120 characters.`);
  return normalized || fallback || "";
}

function finite(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  if (value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

function list(value: unknown, label: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}–${maximum} ${label}.`);
  }
  return value;
}

export function parseGradebook(json: string): Gradebook {
  if (new TextEncoder().encode(json).byteLength > 1_000_000) throw new Error("Template is too large. Keep it below 1 MB.");
  if (!json.trim()) throw new Error("Choose a JSON gradebook template first.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The template is not valid JSON.");
  }
  const root = record(parsed, "Template");
  if (root.version !== 1) throw new Error("Unsupported template version. Use version 1.");
  const student = root.student === undefined ? {} : record(root.student, "Student");
  const courses = list(root.courses, "courses", 1, 32).map((courseValue, courseIndex) => {
    const course = record(courseValue, `Course ${courseIndex + 1}`);
    const categories = list(course.categories, "categories", 1, 30).map((categoryValue, categoryIndex) => {
      const category = record(categoryValue, `Category ${categoryIndex + 1}`);
      const categoryName = text(category.name, `Category ${categoryIndex + 1} name`);
      return {
        name: categoryName,
        weight: finite(category.weight, `Category ${categoryIndex + 1} weight`, 0, 1),
        assignments: list(category.assignments, "assignments", 1, 200).map((assignmentValue, assignmentIndex) => {
          const assignment = record(assignmentValue, `Assignment ${assignmentIndex + 1}`);
          if (assignment.dropped !== undefined && typeof assignment.dropped !== "boolean") {
            throw new Error(`Assignment ${assignmentIndex + 1} dropped must be a boolean.`);
          }
          if (assignment.excludedReason !== undefined && assignment.excludedReason !== "excused" && assignment.excludedReason !== "incomplete") {
            throw new Error(`Assignment ${assignmentIndex + 1} excluded reason is invalid.`);
          }
          return {
            id: `c${courseIndex + 1}-g${categoryIndex + 1}-a${assignmentIndex + 1}`,
            title: text(assignment.title, `Assignment ${assignmentIndex + 1} title`),
            score: assignment.score == null ? null : finite(assignment.score, "Assignment score", 0, 1_000_000),
            maxPoints: finite(assignment.maxPoints, "Assignment maximum points", 0.01, 1_000_000),
            dropped: assignment.dropped === true,
            ...(assignment.excludedReason === "excused" || assignment.excludedReason === "incomplete"
              ? { excludedReason: assignment.excludedReason as "excused" | "incomplete" }
              : {}),
          };
        }),
      };
    });
    if (!categories.some((category) => category.weight > 0)) {
      throw new Error(`Course ${courseIndex + 1} needs at least one positive category weight.`);
    }
    return {
      id: `course-${courseIndex + 1}`,
      name: text(course.name, `Course ${courseIndex + 1} name`),
      period: text(course.period, `Course ${courseIndex + 1} period`, ""),
      teacher: text(course.teacher, `Course ${courseIndex + 1} teacher`, ""),
      categories,
    };
  });
  return {
    version: 1,
    source: "local",
    student: {
      name: text(student.name, "Student name", "Student"),
      school: text(student.school, "Student school", "School"),
    },
    courses,
  };
}

export function calculateCategoryGrade(category: Category) {
  const included = category.assignments.filter((assignment) => assignment.score !== null && !assignment.dropped && !assignment.excludedReason);
  const earned = included.reduce((sum, assignment) => sum + (assignment.score ?? 0), 0);
  const total = included.reduce((sum, assignment) => sum + assignment.maxPoints, 0);
  return { earned, total, percentage: total > 0 ? earned / total * 100 : null };
}

export function calculateCourseGrade(course: Course) {
  const categoryGrades = course.categories.map(calculateCategoryGrade);
  const active = course.categories.map((category, index) => ({ category, grade: categoryGrades[index] }))
    .filter(({ category, grade }) => category.weight > 0 && grade.percentage !== null);
  const totalWeight = active.reduce((sum, { category }) => sum + category.weight, 0);
  return totalWeight > 0
    ? active.reduce((sum, { category, grade }) => sum + (grade.percentage ?? 0) * category.weight, 0) / totalWeight
    : null;
}

export function getLetterGrade(percentage: number | null): string {
  if (percentage === null) return "—";
  const thresholds: Array<[number, string]> = [[97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"], [77, "C+"], [73, "C"], [70, "C-"], [67, "D+"], [63, "D"], [60, "D-"]];
  return thresholds.find(([minimum]) => percentage >= minimum)?.[1] ?? "F";
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 4, A: 4, "A-": 4,
  "B+": 3.33, B: 3, "B-": 2.67,
  "C+": 2.33, C: 2, "C-": 1.67,
  "D+": 1.33, D: 1, "D-": 0.67,
  F: 0,
};

export function calculateUnweightedGpa(courses: Course[]): { value: number | null; contributingCourses: number } {
  const percentages = courses.map(calculateCourseGrade).filter((grade): grade is number => grade !== null);
  return {
    value: percentages.length
      ? percentages.reduce((total, percentage) => total + GRADE_POINTS[getLetterGrade(percentage)], 0) / percentages.length
      : null,
    contributingCourses: percentages.length,
  };
}
