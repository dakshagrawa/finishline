"use client";

import { useMemo, useState } from "react";
import AppShell from "./app-shell";
import { minimumFinalScore } from "./finals";

export default function MvhsTools() {
  const [current, setCurrent] = useState("92");
  const [weight, setWeight] = useState("15");
  const [target, setTarget] = useState("90");
  const result = useMemo(() => {
    if ([current, weight, target].some((value) => value.trim() === "")) return null;
    return minimumFinalScore(Number(current), Number(weight), Number(target));
  }, [current, weight, target]);
  const valid = result !== null;

  return (
    <AppShell active="tools">
      <header className="mvhs-section-header">
        <p className="mvhs-kicker">Local utilities</p>
        <h1>Small tools. Clear answers.</h1>
        <p>Everything on this page calculates in your browser. Nothing is uploaded.</p>
      </header>
      <section className="mvhs-tools-grid">
        <article className="mvhs-card mvhs-final-card">
          <div className="mvhs-card-heading">
            <div><p className="mvhs-kicker">Finals</p><h2>Minimum final score</h2></div>
            <span className="mvhs-status-pill">Local</span>
          </div>
          <div className="mvhs-tool-fields">
            <label>Current grade <span><input aria-label="Current grade" inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} />%</span></label>
            <label>Final weight <span><input aria-label="Final weight" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />%</span></label>
            <label>Target grade <span><input aria-label="Target grade" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />%</span></label>
          </div>
          <div className={`mvhs-final-result ${!valid ? "mvhs-final-invalid" : ""}`} role="status" aria-live="polite">
            {!valid ? (
              <><span>Check your values</span><strong>—</strong><small>Use grades from 0–200 and a final weight above 0 through 100.</small></>
            ) : result <= 0 ? (
              <><span>Minimum score needed</span><strong>0%</strong><small>You are already above your target even with a zero on the final.</small></>
            ) : result > 100 ? (
              <><span>Minimum score needed</span><strong>{result.toFixed(1)}%</strong><small>This target requires extra credit or a different grading outcome.</small></>
            ) : (
              <><span>Minimum score needed</span><strong>{result.toFixed(1)}%</strong><small>Assumes the final is exactly {Number(weight).toFixed(1)}% of the course grade.</small></>
            )}
          </div>
        </article>

        <article className="mvhs-card mvhs-resource-list-card">
          <p className="mvhs-kicker">Official links</p>
          <h2>MVHS resources</h2>
          <div className="mvhs-official-links">
            <a href="https://mvhs.fuhsd.org/about-us/general-information/bell-schedule" target="_blank" rel="noreferrer"><strong>Bell schedules</strong><span>Regular and special schedules ↗</span></a>
            <a href="https://mvhs.fuhsd.org/about-us/general-information/calendar-and-events" target="_blank" rel="noreferrer"><strong>Calendar and events</strong><span>Official school calendar ↗</span></a>
            <a href="https://mvhs.fuhsd.org/about-us/general-information/map-and-directions" target="_blank" rel="noreferrer"><strong>Campus map</strong><span>Official map and directions ↗</span></a>
            <a href="https://mvhs.fuhsd.org/about-us/general-information/daily-bulletinannouncements" target="_blank" rel="noreferrer"><strong>Daily bulletin</strong><span>Current announcements ↗</span></a>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
