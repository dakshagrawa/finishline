import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCategoryGrade,
  calculateCourseGrade,
  calculateUnweightedGpa,
  getLetterGrade,
  parseGradebook,
  type Course,
} from "../src/grades/gradebook";

const validTemplate = JSON.stringify({
  version: 1,
  student: { name: "  Ada Student  ", school: "  MVHS  " },
  courses: [{
    name: " Biology ", period: " 2 ", teacher: " Dr. Rivera ",
    categories: [
      { name: "Tests", weight: 0.7, assignments: [{ title: "Unit 1", score: 45, maxPoints: 50 }] },
      { name: "Labs", weight: 0.3, assignments: [{ title: "Lab 1", score: null, maxPoints: 20, dropped: true }] },
    ],
  }],
});

test("imports version 1 gradebooks with normalized positional IDs", () => {
  const data = parseGradebook(validTemplate);
  assert.equal(data.source, "local");
  assert.equal(data.student.name, "Ada Student");
  assert.equal(data.courses[0].id, "course-1");
  assert.equal(data.courses[0].categories[0].assignments[0].id, "c1-g1-a1");
  assert.equal(data.courses[0].categories[1].assignments[0].score, null);
});

test("rejects malformed, oversized, unsafe, and out-of-bound gradebooks", () => {
  assert.throws(() => parseGradebook("{bad"), /not valid JSON/i);
  assert.throws(() => parseGradebook(" ".repeat(1_000_001)), /below 1 MB/i);
  assert.throws(() => parseGradebook(JSON.stringify("é".repeat(600_000))), /below 1 MB/i);

  const base = JSON.parse(validTemplate);
  const invalidCases: Array<[unknown, RegExp]> = [
    [{ ...base, version: 2 }, /version 1/i],
    [{ ...base, courses: [] }, /1–32 courses/i],
    [{ ...base, courses: Array.from({ length: 33 }, () => base.courses[0]) }, /1–32 courses/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [] }] }, /1–30 categories/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], assignments: [] }] }] }, /1–200 assignments/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: base.courses[0].categories.map((category: Record<string, unknown>) => ({ ...category, weight: 0 })) }] }, /positive category weight/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], weight: Number.POSITIVE_INFINITY }] }] }, /finite number/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], assignments: [{ title: "x", score: -1, maxPoints: 1 }] }] }] }, /score.*between 0 and 1000000/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], assignments: [{ title: "x", score: 1, maxPoints: 0 }] }] }] }, /maximum points.*between 0.01 and 1000000/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], assignments: [{ title: "x", score: 1, maxPoints: 1, dropped: "true" }] }] }] }, /dropped.*boolean/i],
    [{ ...base, courses: [{ ...base.courses[0], categories: [{ ...base.courses[0].categories[0], assignments: [{ title: "x", score: null, maxPoints: 1, excludedReason: "missing" }] }] }] }, /excluded reason.*invalid/i],
    [{ ...base, student: { ...base.student, name: "x".repeat(121) } }, /student name.*120 characters/i],
  ];
  for (const [input, message] of invalidCases) {
    assert.throws(() => parseGradebook(JSON.stringify(input)), message);
  }
});

test("calculates duplicate-name categories by position and a contributor-only unweighted GPA", () => {
  const course: Course = {
    id: "course-1", name: "Extra credit", period: "1", teacher: "",
    categories: [
      { name: "Work", weight: 0.75, assignments: [
        { id: "one", title: "One", score: 12, maxPoints: 10 },
        { id: "ungraded", title: "Ungraded", score: null, maxPoints: 100 },
        { id: "dropped", title: "Dropped", score: 0, maxPoints: 100, dropped: true },
      ] },
      { name: "Work", weight: 0.25, assignments: [{ id: "two", title: "Two", score: 5, maxPoints: 10 }] },
      { name: "Empty", weight: 1, assignments: [{ id: "empty", title: "Empty", score: null, maxPoints: 10 }] },
    ],
  };
  assert.deepEqual(calculateCategoryGrade(course.categories[0]), { earned: 12, total: 10, percentage: 120 });
  assert.equal(calculateCourseGrade(course), 102.5);
  assert.equal(getLetterGrade(102.5), "A+");
  assert.deepEqual(calculateUnweightedGpa([course, { ...course, id: "empty", categories: [{ name: "None", weight: 1, assignments: [{ id: "none", title: "None", score: null, maxPoints: 10 }] }] }]), {
    value: 4,
    contributingCourses: 1,
  });
});
