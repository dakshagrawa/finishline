'use client';

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  calculateCourseGrade,
  calculateUnweightedGpa,
  GRADEBOOK_TEMPLATE_JSON,
  getLetterGrade,
  parseGradebook,
  type Assignment,
  type Course,
  type Gradebook,
} from "./gradebook";

interface Simulation extends Assignment {
  categoryIndex: number;
}

type SimulationMap = Record<string, Simulation[]>;
type SchoologyStatus =
  | { state: "checking" }
  | { state: "unavailable"; reason: string }
  | { state: "disconnected" }
  | { state: "connected" };

const SCHOOLLOGY_API_ROOT = "/api/integrations/schoology";
const DEMO_STORAGE_KEY = "finishline.grades.demo.v1";

const DEMO_GRADEBOOK: Gradebook = {
  version: 1,
  source: "demo",
  student: { name: "Demo Student", school: "Sample school" },
  courses: [
    {
      id: "demo-calculus", name: "AP Calculus BC", period: "1", teacher: "Sample teacher",
      categories: [{ name: "Tests", weight: 1, assignments: [{ id: "demo-calc-test", title: "Chapter test", score: 92, maxPoints: 100 }] }],
    },
    {
      id: "demo-physics", name: "AP Physics C", period: "2", teacher: "Sample teacher",
      categories: [{ name: "Labs", weight: 1, assignments: [{ id: "demo-physics-lab", title: "Motion lab", score: 95, maxPoints: 100 }] }],
    },
  ],
};

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function mergeSimulations(course: Course, simulations: Simulation[]): Course {
  return {
    ...course,
    categories: course.categories.map((category, categoryIndex) => ({
      ...category,
      assignments: [...category.assignments, ...simulations.filter((item) => item.categoryIndex === categoryIndex)],
    })),
  };
}

export default function GradeCalculator() {
  const fileInput = useRef<HTMLInputElement>(null);
  const entryHeading = useRef<HTMLHeadingElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<"entry" | "dashboard" | null>(null);
  const [gradebook, setGradebook] = useState<Gradebook | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [simulations, setSimulations] = useState<SimulationMap>({});
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [schoologyStatus, setSchoologyStatus] = useState<SchoologyStatus>({ state: "checking" });
  const [schoologyBusy, setSchoologyBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`${SCHOOLLOGY_API_ROOT}/status`, { cache: "no-store" })
      .then(async (response) => {
        const status = await response.json() as { available?: boolean; connected?: boolean; reason?: string };
        if (!active) return;
        if (!status.available) setSchoologyStatus({ state: "unavailable", reason: status.reason ?? "Schoology connection is unavailable." });
        else setSchoologyStatus({ state: status.connected ? "connected" : "disconnected" });
      })
      .catch(() => { if (active) setSchoologyStatus({ state: "unavailable", reason: "Schoology connection is temporarily unavailable." }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let stored: string | null;
    try {
      stored = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
    } catch {
      setStorageAvailable(false);
      return;
    }
    if (!stored) return;
    try {
      const restored = parseGradebook(stored);
      setGradebook({ ...restored, source: "demo" });
      setSelectedCourseId(restored.courses[0].id);
    } catch {
      try {
        window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
        setStorageAvailable(true);
      } catch {
        setStorageAvailable(false);
      }
    }
  }, []);

  useEffect(() => {
    if (pendingFocus.current === "dashboard" && gradebook) dashboardHeading.current?.focus();
    if (pendingFocus.current === "entry" && !gradebook) entryHeading.current?.focus();
    pendingFocus.current = null;
  }, [gradebook]);

  useEffect(() => {
    if (!gradebook || gradebook.source !== "demo") return;
    try {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(gradebook));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [gradebook]);

  function openJson(text: string) {
    try {
      const parsed = parseGradebook(text);
      pendingFocus.current = "dashboard";
      setGradebook(parsed);
      setSelectedCourseId(parsed.courses[0].id);
      setSimulations({});
      setEditNotice("");
      setError("");
      try { window.sessionStorage.removeItem(DEMO_STORAGE_KEY); } catch { /* imported data stays usable in memory */ }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open that gradebook.");
    }
  }

  function importJson() {
    openJson(json);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Template is too large. Keep it below 1 MB.");
      return;
    }
    if (file.type && !["application/json", "text/json", "text/plain"].includes(file.type)) {
      setError("Choose a JSON gradebook template.");
      return;
    }
    openJson(await file.text());
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([GRADEBOOK_TEMPLATE_JSON], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "finishline-gradebook-template.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openDemo() {
    const demo = structuredClone(DEMO_GRADEBOOK);
    pendingFocus.current = "dashboard";
    setGradebook(demo);
    setSelectedCourseId(demo.courses[0].id);
    setSimulations({});
    setEditNotice("");
    setError("");
    try {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demo));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }

  async function loadSchoologyGrades() {
    setSchoologyBusy(true);
    setError("");
    try {
      const response = await fetch(`${SCHOOLLOGY_API_ROOT}/gradebook`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) setSchoologyStatus({ state: "disconnected" });
        throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to load Schoology grades.");
      }
      const parsed = parseGradebook(JSON.stringify(payload));
      const gradebookFromSchoology: Gradebook = { ...parsed, source: "schoology" };
      pendingFocus.current = "dashboard";
      setGradebook(gradebookFromSchoology);
      setSelectedCourseId(gradebookFromSchoology.courses[0].id);
      setSimulations({});
      setSchoologyStatus({ state: "connected" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Schoology grades.");
    } finally {
      setSchoologyBusy(false);
    }
  }

  async function disconnectSchoology() {
    setSchoologyBusy(true);
    setError("");
    try {
      const response = await fetch(`${SCHOOLLOGY_API_ROOT}/logout`, { method: "POST" });
      if (!response.ok) throw new Error("Unable to disconnect Schoology.");
      setSchoologyStatus({ state: "disconnected" });
      resetGradeLab();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disconnect Schoology.");
    } finally {
      setSchoologyBusy(false);
    }
  }

  function resetGradeLab() {
    try {
      window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    pendingFocus.current = "entry";
    setGradebook(null);
    setSelectedCourseId("");
    setSimulations({});
    setJson("");
    setEditNotice("");
    setError("");
  }

  if (!gradebook) {
    return (
      <div className="grades-workspace">
        <p className="grades-back-link">Private grade tools · Schoology passwords never enter Finishline</p>
        <section className="grades-entry">
          <p className="grades-eyebrow">MVHS · private grade lab</p>
          <h1 ref={entryHeading} tabIndex={-1}>Private what-if grades</h1>
          <p>Open a local version 1 gradebook, or—only after FUHSD authorization—connect through Schoology&apos;s own sign-in. Provider tokens stay encrypted on the server; retrieved grades live in this page&apos;s React memory.</p>
          <aside className="grades-schoology" aria-label="Schoology connection">
            <strong>Schoology connection</strong>
            {schoologyStatus.state === "checking" && <p role="status">Checking deployment authorization…</p>}
            {schoologyStatus.state === "unavailable" && <p role="status">{schoologyStatus.reason}</p>}
            {schoologyStatus.state === "disconnected" && (
              <form action={`${SCHOOLLOGY_API_ROOT}/start`} method="post">
                <p>Use FUHSD&apos;s Schoology authorization page. Finishline never collects your password.</p>
                <button type="submit">Continue with Schoology</button>
              </form>
            )}
            {schoologyStatus.state === "connected" && (
              <div>
                <p role="status">Schoology is authorized. Load a fresh read-only grade snapshot when you are ready.</p>
                <button type="button" disabled={schoologyBusy} onClick={() => void loadSchoologyGrades()}>{schoologyBusy ? "Loading…" : "Load Schoology grades"}</button>
                <button type="button" disabled={schoologyBusy} onClick={() => void disconnectSchoology()}>Disconnect Schoology</button>
              </div>
            )}
          </aside>
          {!storageAvailable && <p role="status" aria-label="Storage unavailable">Demo not saved · storage unavailable</p>}
          <label htmlFor="gradebook-json">Gradebook JSON</label>
          <textarea id="gradebook-json" value={json} onChange={(event) => setJson(event.target.value)} rows={10} />
          <div className="grades-entry-actions">
            <button type="button" onClick={importJson}>Open gradebook</button>
            <input ref={fileInput} className="sr-only" type="file" accept="application/json,.json,text/plain" aria-hidden="true" tabIndex={-1} onChange={(event) => void importFile(event)} />
            <button type="button" onClick={() => fileInput.current?.click()}>Open JSON file</button>
            <button type="button" onClick={openDemo}>Explore demo</button>
            <button type="button" onClick={downloadTemplate}>Download template</button>
          </div>
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    );
  }

  const derivedCourses = gradebook.courses.map((item) => mergeSimulations(item, simulations[item.id] ?? []));
  const course = derivedCourses.find((item) => item.id === selectedCourseId) ?? derivedCourses[0];
  const courseIndex = gradebook.courses.findIndex((item) => item.id === course.id);
  const overall = calculateCourseGrade(course);
  const gpa = calculateUnweightedGpa(derivedCourses);

  function updateAssignment(categoryIndex: number, assignmentIndex: number, field: "score" | "maxPoints", value: string) {
    const numberValue = value === "" && field === "score" ? null : Number(value);
    if (numberValue !== null && !Number.isFinite(numberValue)) return;
    setGradebook((current) => {
      if (!current) return current;
      const courses = structuredClone(current.courses);
      const assignment = courses[courseIndex].categories[categoryIndex].assignments[assignmentIndex];
      if (field === "score") assignment.score = numberValue === null ? null : Math.max(0, Math.min(1_000_000, numberValue));
      else if (numberValue !== null) assignment.maxPoints = Math.max(0.01, Math.min(1_000_000, numberValue));
      return { ...current, courses };
    });
  }

  function updateWeight(categoryIndex: number, value: string) {
    if (!gradebook) return;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return;
    const nextWeight = Math.max(0, Math.min(1, numberValue));
    const baseCourse = gradebook.courses[courseIndex];
    const leavesPositiveWeight = baseCourse.categories.some((category, index) => index === categoryIndex ? nextWeight > 0 : category.weight > 0);
    if (!leavesPositiveWeight) {
      setEditNotice("At least one category weight must stay above zero.");
      return;
    }
    setEditNotice("");
    setGradebook((current) => {
      if (!current) return current;
      const courses = structuredClone(current.courses);
      courses[courseIndex].categories[categoryIndex].weight = nextWeight;
      return { ...current, courses };
    });
  }

  function addSimulation(categoryIndex: number) {
    const maxPoints = course.categories[categoryIndex].assignments[0]?.maxPoints ?? 100;
    const item: Simulation = {
      id: `simulation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "New simulation",
      score: maxPoints,
      maxPoints,
      categoryIndex,
    };
    setSimulations((current) => ({ ...current, [course.id]: [...(current[course.id] ?? []), item] }));
  }

  function updateSimulation(id: string, updates: Partial<Simulation>) {
    setSimulations((current) => ({
      ...current,
      [course.id]: (current[course.id] ?? []).map((item) => item.id === id ? { ...item, ...updates } : item),
    }));
  }

  function removeSimulation(id: string) {
    setSimulations((current) => ({
      ...current,
      [course.id]: (current[course.id] ?? []).filter((item) => item.id !== id),
    }));
  }

  return (
    <div className="grades-workspace">
      <header className="grades-header">
        <strong className="grades-back-link">Grade Lab</strong>
        <div className="grades-header-actions">
          <span role="status" aria-label={storageAvailable ? "Grade data location" : "Storage unavailable"}>
            {gradebook.source === "demo"
              ? storageAvailable ? "Demo saved for this tab" : "Demo not saved · storage unavailable"
              : gradebook.source === "schoology" ? "Schoology data · React memory only" : "Imported data · React memory only"}
          </span>
          {gradebook.source === "schoology" && <button type="button" disabled={schoologyBusy} onClick={() => void disconnectSchoology()}>Disconnect Schoology</button>}
          <button type="button" onClick={resetGradeLab} aria-label="Reset grade lab">Reset</button>
        </div>
      </header>
      <section className="grades-summary" aria-label="Grade summary">
        <div>
          <span>Unweighted what-if GPA</span>
          <strong>{gpa.value === null ? "—" : gpa.value.toFixed(2)}</strong>
          <small>{gpa.contributingCourses} courses with calculated grades · not an official GPA</small>
        </div>
        <div>
          <span>Active course</span>
          <strong>{percent(overall)}</strong>
          <small>{getLetterGrade(overall)} · simulated work included</small>
        </div>
      </section>
      <div className="grades-layout">
        <nav className="grades-course-selector" aria-label="Courses">
          {derivedCourses.map((item) => {
            const itemGrade = calculateCourseGrade(item);
            return (
              <button key={item.id} type="button" aria-pressed={item.id === course.id} onClick={() => { setSelectedCourseId(item.id); setEditNotice(""); }}>
                <span>{item.name}</span> <strong>{percent(itemGrade)}</strong>
              </button>
            );
          })}
        </nav>
        <section className="grades-dashboard">
          <h1 ref={dashboardHeading} tabIndex={-1}>{course.name}</h1>
          <p>{percent(overall)} · {getLetterGrade(overall)}</p>
          {editNotice && <p role="status" aria-label="Invalid category weights">{editNotice}</p>}
          {course.categories.map((category, categoryIndex) => {
            const realAssignmentCount = gradebook.courses[courseIndex].categories[categoryIndex].assignments.length;
            return (
              <section className="grades-category" key={`${categoryIndex}-${category.name}`}>
                <h2>{category.name}</h2>
                <label>
                  {category.name} weight
                  <input type="number" min="0" max="1" step="0.01" value={category.weight} onChange={(event) => updateWeight(categoryIndex, event.target.value)} />
                </label>
                {category.assignments.map((assignment, assignmentIndex) => {
                  const simulated = assignmentIndex >= realAssignmentCount;
      const excluded = assignment.dropped || assignment.excludedReason;
      return (
        <div className={`grades-assignment${simulated ? " grades-simulation" : ""}${excluded ? " grades-dropped" : ""}`} key={assignment.id}>
                      {simulated ? (
                        <label>
                          Simulation name
                          <input value={assignment.title} maxLength={120} onChange={(event) => updateSimulation(assignment.id, { title: event.target.value.slice(0, 120) })} />
                        </label>
                      ) : (
                        <div className="grades-assignment-title">
                          <strong>{assignment.title}</strong>
                          {assignment.dropped && <span className="grades-excluded">Excluded · dropped</span>}
                          {assignment.excludedReason && <span className="grades-excluded">Excluded · {assignment.excludedReason}</span>}
                        </div>
                      )}
                      <label className="grades-score-slider">
                        <span className="sr-only">{assignment.title} score slider</span>
                        <input
                          aria-label={`${assignment.title} score slider`}
                          disabled={Boolean(excluded)}
                          type="range"
                          min="0"
                          max={Math.max(100, assignment.maxPoints * 2)}
                          step="0.5"
                          value={assignment.score ?? 0}
                          onChange={(event) => simulated
                            ? updateSimulation(assignment.id, { score: Number(event.target.value) })
                            : updateAssignment(categoryIndex, assignmentIndex, "score", event.target.value)}
                        />
                      </label>
                      <label>
                        {assignment.title} score
                        <input disabled={Boolean(excluded)} type="number" min="0" max="1000000" step="0.5" value={assignment.score ?? ""} onChange={(event) => simulated ? updateSimulation(assignment.id, { score: event.target.value === "" ? null : Math.max(0, Math.min(1_000_000, Number(event.target.value))) }) : updateAssignment(categoryIndex, assignmentIndex, "score", event.target.value)} />
                      </label>
                      <label>
                        {assignment.title} maximum points
                        <input disabled={Boolean(excluded)} type="number" min="0.01" max="1000000" step="0.5" value={assignment.maxPoints} onChange={(event) => simulated ? updateSimulation(assignment.id, { maxPoints: Math.max(0.01, Math.min(1_000_000, Number(event.target.value))) }) : updateAssignment(categoryIndex, assignmentIndex, "maxPoints", event.target.value)} />
                      </label>
                      {simulated && <button type="button" onClick={() => removeSimulation(assignment.id)} aria-label={`Remove ${assignment.title}`}>Remove</button>}
                    </div>
                  );
                })}
                <button type="button" onClick={() => addSimulation(categoryIndex)} aria-label={`Add simulation to ${category.name}`}>+ Add simulated assignment</button>
              </section>
            );
          })}
        </section>
      </div>
    </div>
  );
}
