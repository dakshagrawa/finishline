"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { EvidenceChoice, ProjectBrief, TimeHorizon } from "../lib/project-brief";
import { validateProjectBrief } from "../lib/project-brief";
import {
  createProject,
  restoreProject,
  SAMPLE_PROJECT,
  serializeProject,
  toggleEvidence,
  toggleMilestone,
  type StoredProject,
} from "../lib/project-store";

const STORAGE_KEY = "finishline.project.v1";

type FieldName = keyof ProjectBrief;
type FormErrors = Partial<Record<FieldName, string>>;

const evidenceOptions: Array<{ value: EvidenceChoice; title: string; hint: string }> = [
  { value: "demo", title: "A demo", hint: "Show the main path working." },
  { value: "artifact", title: "An artifact", hint: "Share a finished file or link." },
  { value: "feedback", title: "Feedback", hint: "Capture a real audience response." },
];

const horizonOptions: TimeHorizon[] = [7, 14, 30];

function textError(value: string, label: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return `${label} is required.`;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return `${label} needs a word or number.`;
  if (normalized.length > 500) return `${label} must be 500 characters or fewer.`;
  return undefined;
}

function errorsFor(form: HTMLFormElement): FormErrors {
  const data = new FormData(form);
  const errors: FormErrors = {};
  const textFields: Array<[FieldName, string]> = [
    ["roughIdea", "Rough idea"],
    ["audience", "Audience"],
    ["desiredOutcome", "Outcome"],
    ["availableSkillsResources", "Skills and resources"],
  ];

  for (const [field, label] of textFields) {
    const message = textError(String(data.get(field) ?? ""), label);
    if (message) errors[field] = message;
  }

  const hours = Number(data.get("weeklyHours"));
  if (!Number.isFinite(hours) || hours < 1 || hours > 168 || !Number.isInteger(hours * 2)) {
    errors.weeklyHours = "Enter between 1 and 168 hours per week.";
  }
  const horizon = Number(data.get("timeHorizon"));
  if (!horizonOptions.includes(horizon as TimeHorizon)) {
    errors.timeHorizon = "Choose a valid time horizon.";
  }
  const evidence = data.get("evidenceChoice");
  if (!evidenceOptions.some((option) => option.value === evidence)) {
    errors.evidenceChoice = "Choose valid proof of progress.";
  }
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p className="field-error" id={id}>{message}</p>;
}

export default function ProjectWorkspace() {
  const [project, setProject] = useState<StoredProject | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const intakeHeading = useRef<HTMLHeadingElement>(null);
  const boardHeading = useRef<HTMLHeadingElement>(null);
  const focusTarget = useRef<"intake" | "board" | null>(null);

  useEffect(() => {
    try {
      setProject(restoreProject(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      setProject(SAMPLE_PROJECT);
      setStorageAvailable(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || focusTarget.current === null) return;
    const target = focusTarget.current === "intake" ? intakeHeading.current : boardHeading.current;
    target?.focus();
    focusTarget.current = null;
  }, [project, ready]);

  function persist(next: StoredProject) {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeProject(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    setProject(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = errorsFor(event.currentTarget);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0] as FieldName;
      event.currentTarget.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
      return;
    }

    const data = new FormData(event.currentTarget);
    try {
      const brief = validateProjectBrief({
        roughIdea: data.get("roughIdea"),
        audience: data.get("audience"),
        desiredOutcome: data.get("desiredOutcome"),
        availableSkillsResources: data.get("availableSkillsResources"),
        weeklyHours: Number(data.get("weeklyHours")),
        timeHorizon: Number(data.get("timeHorizon")),
        evidenceChoice: data.get("evidenceChoice"),
      });
      focusTarget.current = "board";
      persist(createProject(brief));
    } catch {
      setErrors({ roughIdea: "Review the project details and try again." });
      event.currentTarget.elements.namedItem("roughIdea") instanceof HTMLElement &&
        (event.currentTarget.elements.namedItem("roughIdea") as HTMLElement).focus();
      return;
    }
    window.scrollTo({ top: 0 });
  }

  function startNew() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    focusTarget.current = "intake";
    setProject(null);
    setErrors({});
  }

  const storageLabel = storageAvailable ? "Saved locally" : "Storage unavailable";
  const storageMessage = storageAvailable
    ? "Saved only on this device"
    : "Not saved · storage unavailable";

  if (!ready) {
    return (
      <div className="workspace loading-shell">
        <p className="local-note" role="status">Loading your local project…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="workspace intake-shell">
        <header className="topbar">
          <a className="wordmark" href="#intake" aria-label="Finishline home">Finishline<span>.</span></a>
          <div className="topbar-actions">
            <p className="local-note" role="status" aria-label={storageLabel}><span aria-hidden="true">●</span> Private by default · {storageMessage}</p>
            <a className="text-button" href="/grades">Grade lab</a>
          </div>
        </header>

        <section className="intake" id="intake" aria-labelledby="intake-title">
          <div className="intake-intro">
            <p className="eyebrow">Make the finish line visible · Build momentum.</p>
            <h1 id="intake-title" tabIndex={-1} ref={intakeHeading}>What are you ready to finish?</h1>
            <p>Give us the rough edges. Finishline will turn them into a small, specific plan you can start today.</p>
          </div>

          <form className="intake-form" onSubmit={handleSubmit} noValidate>
            {Object.keys(errors).length > 0 && (
              <div className="error-summary" role="alert">
                Check the highlighted fields. Your project has not been created yet.
              </div>
            )}

            <div className="field full-field">
              <label htmlFor="roughIdea">Rough idea</label>
              <span className="field-hint" id="roughIdea-hint">What do you want to make, change, or explore?</span>
              <textarea id="roughIdea" name="roughIdea" rows={4} maxLength={500} aria-invalid={Boolean(errors.roughIdea)} aria-describedby={`roughIdea-hint${errors.roughIdea ? " roughIdea-error" : ""}`} placeholder="A simple guide that helps new students find support…" />
              <FieldError id="roughIdea-error" message={errors.roughIdea} />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="audience">Who is it for?</label>
                <span className="field-hint" id="audience-hint">Name one specific group.</span>
                <input id="audience" name="audience" maxLength={500} aria-invalid={Boolean(errors.audience)} aria-describedby={`audience-hint${errors.audience ? " audience-error" : ""}`} placeholder="New students" />
                <FieldError id="audience-error" message={errors.audience} />
              </div>
              <div className="field">
                <label htmlFor="desiredOutcome">What should change?</label>
                <span className="field-hint" id="desiredOutcome-hint">Describe the useful outcome.</span>
                <input id="desiredOutcome" name="desiredOutcome" maxLength={500} aria-invalid={Boolean(errors.desiredOutcome)} aria-describedby={`desiredOutcome-hint${errors.desiredOutcome ? " desiredOutcome-error" : ""}`} placeholder="They find help in under two minutes" />
                <FieldError id="desiredOutcome-error" message={errors.desiredOutcome} />
              </div>
            </div>

            <div className="field full-field">
              <label htmlFor="availableSkillsResources">Skills and resources</label>
              <span className="field-hint" id="availableSkillsResources-hint">What can you already use? People count, too.</span>
              <input id="availableSkillsResources" name="availableSkillsResources" maxLength={500} aria-invalid={Boolean(errors.availableSkillsResources)} aria-describedby={`availableSkillsResources-hint${errors.availableSkillsResources ? " availableSkillsResources-error" : ""}`} placeholder="Writing, HTML, and three student interviews" />
              <FieldError id="availableSkillsResources-error" message={errors.availableSkillsResources} />
            </div>

            <div className="form-grid compact-grid">
              <div className="field">
                <label htmlFor="weeklyHours">Hours per week</label>
                <span className="field-hint" id="weeklyHours-hint">Be honest, not heroic.</span>
                <input id="weeklyHours" name="weeklyHours" type="number" min="1" max="168" step="0.5" inputMode="decimal" aria-invalid={Boolean(errors.weeklyHours)} aria-describedby={`weeklyHours-hint${errors.weeklyHours ? " weeklyHours-error" : ""}`} placeholder="4" />
                <FieldError id="weeklyHours-error" message={errors.weeklyHours} />
              </div>
              <fieldset className="choice-field" aria-describedby={errors.timeHorizon ? "timeHorizon-error" : undefined}>
                <legend>Time horizon</legend>
                <span className="field-hint">Pick a deadline close enough to feel real.</span>
                <div className="segmented">
                  {horizonOptions.map((days) => (
                    <label key={days}><input type="radio" name="timeHorizon" value={days} /> <span>{days} days</span></label>
                  ))}
                </div>
                <FieldError id="timeHorizon-error" message={errors.timeHorizon} />
              </fieldset>
            </div>

            <fieldset className="choice-field evidence-field" aria-describedby={errors.evidenceChoice ? "evidenceChoice-error" : undefined}>
              <legend>Proof of progress</legend>
              <span className="field-hint">What evidence will make “done” undeniable?</span>
              <div className="evidence-options">
                {evidenceOptions.map((option) => (
                  <label key={option.value}>
                    <input type="radio" name="evidenceChoice" value={option.value} />
                    <span><strong>{option.title}</strong><small>{option.hint}</small></span>
                  </label>
                ))}
              </div>
              <FieldError id="evidenceChoice-error" message={errors.evidenceChoice} />
            </fieldset>

            <div className="form-finish">
              <p>No account. No cloud. Just a practical plan.</p>
              <button className="primary-button" type="submit">Build my finish line <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  const completed = [...project.milestoneDone, ...project.evidenceDone].filter(Boolean).length;
  const total = project.milestoneDone.length + project.evidenceDone.length;
  const percentage = Math.round((completed / total) * 100);

  return (
    <div className="workspace board-shell">
      <header className="topbar board-topbar">
        <a className="wordmark" href="#project-board" aria-label="Finishline project board">Finishline<span>.</span></a>
        <div className="topbar-actions">
          <p className="local-note" role="status" aria-label={storageLabel}><span aria-hidden="true">●</span> {storageMessage}</p>
          <a className="text-button" href="/grades">Grade lab</a>
          <button className="text-button" type="button" onClick={startNew}>Start a new project</button>
        </div>
      </header>

      <section className="board-heading" id="project-board" aria-labelledby="board-title">
        <div>
          <div className="title-meta">
            {project.isSample && <span className="sample-badge">Sample</span>}
            <span>{project.brief.timeHorizon} day plan</span>
            <span>{project.brief.weeklyHours} hours / week</span>
          </div>
          <h1 id="board-title" tabIndex={-1} ref={boardHeading}>{project.brief.roughIdea}</h1>
          {project.isSample && <p className="sample-note">This believable example shows how your own project will look. Check anything off, or clear it and start fresh.</p>}
        </div>
        <div className="progress-card" aria-label={`${percentage}% of checklist complete`}>
          <strong>{percentage}%</strong><span>complete</span>
          <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
          <span className="sr-only" role="status" aria-live="polite">{percentage}% of checklist complete</span>
        </div>
      </section>

      <div className="board-grid">
        <section className="board-card problem-card" aria-labelledby="problem-title">
          <p className="card-kicker">01 · Scope</p>
          <h2 id="problem-title">Problem</h2>
          <p className="problem-statement">{project.plan.problemStatement}</p>
          <h3>Not doing</h3>
          <ul className="non-goals">{project.plan.nonGoals.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="board-card first-task-card" aria-labelledby="first-task-title">
          <p className="card-kicker">Start here</p>
          <div className="time-chip">25 min</div>
          <h2 id="first-task-title">First 25 minutes</h2>
          <p>{project.plan.firstTask.action}</p>
          <span className="start-cue" aria-hidden="true">→</span>
        </section>

        <section className="board-card milestones-card" aria-labelledby="milestones-title">
          <p className="card-kicker">02 · Make</p>
          <h2 id="milestones-title">Milestones</h2>
          <div className="checklist">
            {project.plan.milestones.map((item, index) => (
              <label className={project.milestoneDone[index] ? "checked" : ""} key={item}>
                <input type="checkbox" checked={project.milestoneDone[index]} onChange={() => persist(toggleMilestone(project, index))} />
                <span className="checkmark" aria-hidden="true" /><span><small>Step {String(index + 1).padStart(2, "0")}</small>{item}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="board-card done-card" aria-labelledby="done-title">
          <p className="card-kicker">03 · Finish</p>
          <h2 id="done-title">Definition of done</h2>
          <blockquote>{project.plan.definitionOfDone}</blockquote>
          <h3>Evidence</h3>
          <div className="checklist evidence-checklist">
            {project.plan.evidenceChecklist.map((item, index) => (
              <label className={project.evidenceDone[index] ? "checked" : ""} key={item}>
                <input type="checkbox" checked={project.evidenceDone[index]} onChange={() => persist(toggleEvidence(project, index))} />
                <span className="checkmark" aria-hidden="true" /><span>{item}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <footer className="board-footer">
        <p><strong>Keep it small.</strong> A finished useful thing beats a perfect imaginary one.</p>
        <button className="secondary-button" type="button" onClick={startNew}>{project.isSample ? "Clear sample & start fresh" : "Clear project & start fresh"}</button>
      </footer>
    </div>
  );
}
