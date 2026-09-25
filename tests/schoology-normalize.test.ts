import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSchoologyGradebook } from "../src/schoology/normalize";

const profile = { uid: "101", name_display: "Ada Student", school_name: "Monta Vista High School" };
const sections = {
  section: [
    { id: "11", course_title: "Biology", section_title: "Biology - 2", section_school_code: "BIO-2" },
    { id: "22", course_title: "Algebra II", section_title: "Algebra II - 4" },
  ],
};
const categoriesBySection = {
  "11": { grading_category: [
    { id: "501", title: "Tests", weight: "70", calculation_type: 2, drop_lowest: 0 },
    { id: "502", title: "Labs", weight: "30", calculation_type: 2, drop_lowest: 0 },
  ] },
  "22": { grading_category: [{ id: "601", title: "Coursework", weight: "100", calculation_type: 2, drop_lowest: 0 }] },
};
const assignmentsBySection = {
  "11": { assignment: [
    { id: "1001", title: "Unit 1", grading_category: "501", max_points: "50" },
    { id: "1002", title: "Lab 1", grading_category: "502", max_points: "20" },
    { id: "1003", title: "Excused", grading_category: "502", max_points: "10" },
  ] },
  "22": { assignment: [{ id: "2001", title: "Quiz", grading_category: "601", max_points: "25" }] },
};
const grades = {
  section: [
    { section_id: "11", period: [{ period_id: "p1", assignment: [
      { assignment_id: "1001", grade: "45", exception: "0" },
      { assignment_id: "1002", grade: "18.5", exception: "0" },
      { assignment_id: "1003", grade: null, exception: "1" },
    ] }] },
    { section_id: "22", period: [{ period_id: "p1", assignment: [{ assignment_id: "2001", grade: null, exception: "2" }] }] },
  ],
};

test("normalizes Schoology profile, sections, categories, assignments, and grades into Gradebook v1", () => {
  const gradebook = normalizeSchoologyGradebook({ profile, sections, categoriesBySection, assignmentsBySection, grades });
  assert.equal(gradebook.version, 1);
  assert.equal(gradebook.source, "schoology");
  assert.deepEqual(gradebook.student, { name: "Ada Student", school: "Monta Vista High School" });
  assert.equal(gradebook.courses.length, 2);
  assert.deepEqual(gradebook.courses[0], {
    id: "course-1",
    name: "Biology",
    period: "2",
    teacher: "",
    categories: [
      { name: "Tests", weight: 0.7, assignments: [{ id: "c1-g1-a1", title: "Unit 1", score: 45, maxPoints: 50, dropped: false }] },
      { name: "Labs", weight: 0.3, assignments: [
        { id: "c1-g2-a1", title: "Lab 1", score: 18.5, maxPoints: 20, dropped: false },
        { id: "c1-g2-a2", title: "Excused", score: null, maxPoints: 10, dropped: false, excludedReason: "excused" },
      ] },
    ],
  });
  assert.equal(gradebook.courses[1].categories[0].assignments[0].score, null);
  assert.equal(gradebook.courses[1].categories[0].assignments[0].dropped, false);
  assert.equal(gradebook.courses[1].categories[0].assignments[0].excludedReason, "incomplete");
});

test("normalizer rejects missing category weights rather than inventing an official calculation", () => {
  assert.throws(() => normalizeSchoologyGradebook({
    profile,
    sections: { section: [{ id: "11", course_title: "Biology" }] },
    categoriesBySection: { "11": { grading_category: [{ id: "501", title: "Work", calculation_type: 2, drop_lowest: 0 }, { id: "502", title: "Tests", calculation_type: 2, drop_lowest: 0 }] } },
    assignmentsBySection: { "11": { assignment: [
      { id: "1001", title: "Work one", grading_category: "501", max_points: 10 },
      { id: "1002", title: "Test one", grading_category: "502", max_points: 20 },
    ] } },
    grades: { section: [{ section_id: "11", period: [{ assignment: [{ assignment_id: "1001", grade: "8" }] }] }] },
  }), /category weights/i);
});

test("normalizer rejects assignments Schoology marks as non-grade-bearing", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  for (const assignmentFlag of [
    { count_in_grade: 0, collected_only: 0 },
    { count_in_grade: 1, collected_only: 1 },
  ]) {
    assert.throws(() => normalizeSchoologyGradebook({
      ...base,
      assignmentsBySection: {
        ...assignmentsBySection,
        "11": { assignment: [
          { ...assignmentsBySection["11"].assignment[0], ...assignmentFlag },
          ...assignmentsBySection["11"].assignment.slice(1),
        ] },
      },
    }), /non-grade-bearing/i);
  }
});

test("normalizer rejects assignments whose grading category is missing or ambiguous", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    assignmentsBySection: {
      ...assignmentsBySection,
      "11": { assignment: [
        ...assignmentsBySection["11"].assignment,
        { id: "1999", title: "Unmatched zero", grading_category: "999", max_points: 100 },
      ] },
    },
    grades: {
      section: [{ section_id: "11", period: [{ assignment: [{ assignment_id: "1999", grade: "0" }] }] }, grades.section[1]],
    },
  }), /assignment grading category/i);

  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    categoriesBySection: {
      ...categoriesBySection,
      "11": { grading_category: [
        ...categoriesBySection["11"].grading_category,
        { ...categoriesBySection["11"].grading_category[0] },
      ] },
    },
  }), /duplicate grading category/i);
});

test("normalizer rejects duplicate assignments and orphan or duplicate grade records", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    assignmentsBySection: {
      ...assignmentsBySection,
      "11": { assignment: [
        ...assignmentsBySection["11"].assignment,
        { ...assignmentsBySection["11"].assignment[0] },
      ] },
    },
  }), /duplicate assignment/i);

  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    grades: {
      section: [{ section_id: "11", period: [{ assignment: [
        ...grades.section[0].period[0].assignment,
        { assignment_id: "1999", grade: "0" },
      ] }] }, grades.section[1]],
    },
  }), /grade record.*assignment/i);

  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    grades: {
      section: [{ section_id: "11", period: [{ assignment: [
        ...grades.section[0].period[0].assignment,
        { assignment_id: "1001", grade: "0" },
      ] }] }, grades.section[1]],
    },
  }), /duplicate grade record/i);
});

test("normalizer rejects duplicate or unknown grade sections while allowing assignments without grades", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    sections: { section: [...sections.section, { ...sections.section[0] }] },
  }), /duplicate course section/i);
  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    grades: { section: [...grades.section, { section_id: "99", period: [] }] },
  }), /grade section.*course section/i);
  const noGrades = normalizeSchoologyGradebook({ ...base, grades: { section: [] } });
  assert.equal(noGrades.courses[0].categories[0].assignments[0].score, null);
});

test("normalizer keeps identical assignment IDs isolated by section", () => {
  const result = normalizeSchoologyGradebook({
    profile,
    sections,
    categoriesBySection,
    assignmentsBySection: {
      ...assignmentsBySection,
      "22": { assignment: [{ ...assignmentsBySection["22"].assignment[0], id: "1001" }] },
    },
    grades: {
      section: [
        grades.section[0],
        { section_id: "22", period: [{ assignment: [{ assignment_id: "1001", grade: "12" }] }] },
      ],
    },
  });
  assert.equal(result.courses[0].categories[0].assignments[0].score, 45);
  assert.equal(result.courses[1].categories[0].assignments[0].score, 12);
});

test("normalizer rejects unsupported grading-period and final-grade semantics", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  const secondPeriod = {
    period_id: "p2",
    assignment: [{ assignment_id: "1004", grade: "0" }],
  };
  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    assignmentsBySection: {
      ...assignmentsBySection,
      "11": { assignment: [
        ...assignmentsBySection["11"].assignment,
        { id: "1004", title: "Period two", grading_category: "501", max_points: 100 },
      ] },
    },
    grades: {
      section: [
        { ...grades.section[0], period: [...grades.section[0].period, secondPeriod], final_grade: [
          { period_id: "p1", weight: "20", grade: "100" },
          { period_id: "p2", weight: "80", grade: "0" },
        ] },
        grades.section[1],
      ],
    },
  }), /grading periods|final grades/i);

  assert.throws(() => normalizeSchoologyGradebook({
    ...base,
    grades: {
      section: [{ ...grades.section[0], final_grade: [{ period_id: "p1", weight: "100", grade: "91" }] }, grades.section[1]],
    },
  }), /final grades/i);

  const unsupportedGradeFields = [
    { is_final: 1 },
    { override: 1 },
    { pending: 1 },
    { calculated_grade: "45" },
    { type: "final" },
  ];
  for (const fields of unsupportedGradeFields) {
    assert.throws(() => normalizeSchoologyGradebook({
      ...base,
      grades: {
        section: [{ section_id: "11", period: [{ assignment: [{ ...grades.section[0].period[0].assignment[0], ...fields }] }] }, grades.section[1]],
      },
    }), /grade calculation semantics/i);
  }

  for (const fields of [{ is_final: 1 }, { grading_scale: "A-F" }, { grading_period: "99999" }]) {
    assert.throws(() => normalizeSchoologyGradebook({
      ...base,
      assignmentsBySection: {
        ...assignmentsBySection,
        "11": { assignment: [{ ...assignmentsBySection["11"].assignment[0], ...fields }, ...assignmentsBySection["11"].assignment.slice(1)] },
      },
    }), /assignment (?:calculation semantics|grading period)/i);
  }

  assert.doesNotThrow(() => normalizeSchoologyGradebook({
    ...base,
    assignmentsBySection: Object.fromEntries(Object.entries(assignmentsBySection).map(([sectionId, payload]) => [
      sectionId,
      { assignment: payload.assignment.map((assignment) => ({
        ...assignment,
        factor: "1",
        is_final: "0",
        grading_scale: "0",
        grading_period: "1",
      })) },
    ])),
    grades: {
      section: grades.section.map((section) => ({
        ...section,
        period: section.period.map((period) => ({
          ...period,
          weight: "100.00",
          assignment: period.assignment.map((grade) => ({
            ...grade,
            is_final: "0",
            override: null,
            pending: null,
            calculated_grade: null,
            type: "assignment",
          })),
        })),
      })),
    },
  }));
});

test("normalizer rejects malformed, excessive, or unsafe provider payloads", () => {
  const base = { profile, sections, categoriesBySection, assignmentsBySection, grades };
  const invalid: Array<[unknown, RegExp]> = [
    [{ ...base, profile: { uid: "101" } }, /student name/i],
    [{ ...base, sections: { section: [] } }, /course section/i],
    [{ ...base, sections: { section: Array.from({ length: 33 }, (_, index) => ({ id: String(index), course_title: "Course" })) } }, /course sections exceeds 32/i],
    [{ ...base, assignmentsBySection: { "11": { assignment: [{ id: "x", title: "Bad", grading_category: "501", max_points: 0 }] }, "22": assignmentsBySection["22"] } }, /maximum points/i],
    [{ ...base, grades: { section: [{ section_id: "11", period: [{ assignment: [{ assignment_id: "1001", grade: "Infinity" }] }] }] } }, /grade value/i],
    [{ ...base, categoriesBySection: { ...categoriesBySection, "11": { grading_category: [{ id: "501", title: "Tests", weight: "70", calculation_type: 1, drop_lowest: 0 }, { id: "502", title: "Labs", weight: "30", calculation_type: 2, drop_lowest: 0 }] } } }, /calculation rules/i],
    [{ ...base, categoriesBySection: { ...categoriesBySection, "11": { grading_category: [{ id: "501", title: "Tests", weight: "70", calculation_type: 2, drop_lowest: 1 }, { id: "502", title: "Labs", weight: "30", calculation_type: 2, drop_lowest: 0 }] } } }, /calculation rules/i],
    [{ ...base, assignmentsBySection: { ...assignmentsBySection, "11": { assignment: [{ id: "1001", title: "Weighted", grading_category: "501", max_points: 50, factor: 2 }, { id: "1002", title: "Lab", grading_category: "502", max_points: 20 }] } } }, /assignment weighting/i],
  ];
  for (const [input, message] of invalid) assert.throws(() => normalizeSchoologyGradebook(input as never), message);
});
