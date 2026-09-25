"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AppShell from "./app-shell";
import {
  FUHSD_CALENDAR_SOURCE,
  getMvhsDay,
  MVHS_SCHEDULE_SOURCE,
  type ScheduleBlock,
} from "./schedule";

const TIME_ZONE = "America/Los_Angeles";
const subscribeToHydration = () => () => undefined;

function dateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    minuteOfDay: hour * 60 + minute,
    hour,
  };
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateKey(dateKey: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function TimelineBlock({ block, state }: { block: ScheduleBlock; state: "past" | "active" | "future" }) {
  return (
    <li className={`mvhs-period mvhs-period-${state}`}>
      <span className="mvhs-period-dot" aria-hidden="true" />
      <div>
        <strong>{block.label}</strong>
        <span>{block.start}–{block.end}</span>
      </div>
      {state === "active" && <small>Now</small>}
    </li>
  );
}

export default function MvhsDashboard({ initialNow }: { initialNow?: Date }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [now, setNow] = useState(() => initialNow ?? new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateParts(initialNow ?? new Date()).dateKey);
  const [followsToday, setFollowsToday] = useState(true);

  useEffect(() => {
    if (initialNow) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [initialNow]);

  const local = useMemo(() => dateParts(now), [now]);
  useEffect(() => {
    if (followsToday) setSelectedDateKey(local.dateKey);
  }, [followsToday, local.dateKey]);
  const isToday = selectedDateKey === local.dateKey;
  const viewedMinute = isToday ? local.minuteOfDay : 0;
  const day = useMemo(() => getMvhsDay(selectedDateKey, viewedMinute), [selectedDateKey, viewedMinute]);
  const longDate = formatDateKey(selectedDateKey);
  const shortDate = formatDateKey(selectedDateKey, false);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  if (!hydrated) {
    return (
      <AppShell active="home">
        <section className="mvhs-section-header" aria-busy="true">
          <p className="mvhs-kicker">MVHS · local dashboard</p>
          <h1>Loading local schedule…</h1>
          <p>Starting the browser clock without contacting an external service.</p>
        </section>
      </AppShell>
    );
  }

  const nextMessage = !isToday
    ? "Regular schedule overview for this date"
    : day.next
      ? `${day.next.label} starts in ${day.minutesUntilNext} min`
      : day.active
        ? `${day.active.label} is the final block today`
        : "The regular schedule is finished for today";

  return (
    <AppShell active="home">
      <header className="mvhs-page-header">
        <div>
          <p className="mvhs-kicker">{shortDate} · MVHS</p>
          <h1>{greeting(local.hour)}.</h1>
          <p>{longDate}</p>
        </div>
        <div className="mvhs-clock" aria-label={`Current Monta Vista time ${clock}`}>
          <span>{clock}</span><small>Cupertino time</small>
        </div>
      </header>

      <nav className="mvhs-date-controls" aria-label="Browse school schedule">
        <button type="button" aria-label="Previous day" onClick={() => { setFollowsToday(false); setSelectedDateKey((current) => shiftDateKey(current, -1)); }}>←</button>
        <button type="button" aria-label="Today" aria-pressed={isToday} onClick={() => { setFollowsToday(true); setSelectedDateKey(local.dateKey); }}>Today</button>
        <button type="button" aria-label="Next day" onClick={() => { setFollowsToday(false); setSelectedDateKey((current) => shiftDateKey(current, 1)); }}>→</button>
      </nav>

      <section className="mvhs-hero-grid" aria-label="Monta Vista schedule dashboard">
        <article className="mvhs-card mvhs-schedule-card">
          <div className="mvhs-card-heading">
            <div>
              <p className="mvhs-kicker">{isToday ? "Today" : longDate}</p>
              <h2>{day.kind === "school-day" ? day.scheduleName : isToday ? "No school today" : "No school this day"}</h2>
            </div>
            <span className={`mvhs-status-pill ${day.kind === "no-school" ? "mvhs-status-quiet" : ""}`}>
              {!isToday ? "Schedule" : day.active?.label ?? (day.kind === "school-day" ? "Between blocks" : "Calendar")}
            </span>
          </div>

          {day.kind === "no-school" ? (
            <div className="mvhs-no-school">
              <span aria-hidden="true">☀</span>
              <div>
                <strong>{day.reason}</strong>
                <p>{day.reason?.includes("Before the first day") ? "First day of school: August 17, 2026." : "Confirm exceptions and special schedules on the official calendar."}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mvhs-next-period" role="status">{nextMessage}</p>
              <ol className="mvhs-timeline">
                {day.blocks.map((block) => {
                  const state = day.active === block
                    ? "active"
                    : block.endMinutes <= viewedMinute
                      ? "past"
                      : "future";
                  return <TimelineBlock block={block} key={`${block.label}-${block.start}`} state={state} />;
                })}
              </ol>
            </>
          )}

          <div className="mvhs-source-note">
            <span>Regular template source: {MVHS_SCHEDULE_SOURCE.label}</span>
            <a href={MVHS_SCHEDULE_SOURCE.url} target="_blank" rel="noreferrer">Official MVHS bell schedules ↗</a>
          </div>
        </article>

        <aside className="mvhs-dashboard-rail">
          <article className="mvhs-card mvhs-event-card">
            <div className="mvhs-card-heading">
              <div><p className="mvhs-kicker">Key dates</p><h2>School calendar</h2></div>
              <a href={FUHSD_CALENDAR_SOURCE.url} target="_blank" rel="noreferrer">View all ↗</a>
            </div>
            <ol className="mvhs-events">
              <li><time dateTime="2026-08-17"><strong>17</strong><span>Aug</span></time><div><strong>First day of school</strong><span>All day</span></div></li>
              <li><time dateTime="2026-09-03"><strong>03</strong><span>Sep</span></time><div><strong>MVHS Back to School Night</strong><span>Official FUHSD calendar</span></div></li>
              <li><time dateTime="2026-09-07"><strong>07</strong><span>Sep</span></time><div><strong>Labor Day</strong><span>No classes</span></div></li>
            </ol>
          </article>

          <article className="mvhs-card mvhs-quick-card">
            <p className="mvhs-kicker">Quick launch</p>
            <h2>Your school toolkit</h2>
            <div className="mvhs-quick-links">
              <a href="/grades"><span>▤</span><strong>Grade Lab</strong><small>Private what-if calculator</small></a>
              <a href="/tools"><span>＋</span><strong>Finals calculator</strong><small>Minimum score needed</small></a>
              <a href="/clubs"><span>◇</span><strong>Find a club</strong><small>Official MVHS directory</small></a>
              <a href="/projects"><span>✓</span><strong>Finish a project</strong><small>Build a practical plan</small></a>
            </div>
          </article>
        </aside>
      </section>

      <footer className="mvhs-data-footer">
        <strong>Built for Monta Vista students.</strong>
        <span>Calendar dates are from the official 2026–27 FUHSD calendar. Period times are a 2025–26 reference template until MVHS publishes 2026–27 times.</span>
      </footer>
    </AppShell>
  );
}
