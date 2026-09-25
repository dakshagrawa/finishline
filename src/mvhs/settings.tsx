import AppShell from "./app-shell";
import { FUHSD_CALENDAR_SOURCE, MVHS_SCHEDULE_SOURCE } from "./schedule";

export default function MvhsSettings() {
  return (
    <AppShell active="settings">
      <header className="mvhs-section-header">
        <p className="mvhs-kicker">Settings & privacy</p>
        <h1>You stay in control.</h1>
        <p>This unofficial dashboard works without an account. An optional Schoology OAuth connection stays disabled until FUHSD authorizes and configures it.</p>
      </header>
      <section className="mvhs-settings-grid">
        <article className="mvhs-card">
          <p className="mvhs-kicker">Data</p>
          <h2>What stays on this device</h2>
          <dl className="mvhs-privacy-list">
            <div><dt>Project coach</dt><dd>Saved in this browser’s local storage.</dd></div>
            <div><dt>Imported/retrieved grades</dt><dd>Kept in React memory until reset or page close.</dd></div>
            <div><dt>Schoology authorization</dt><dd>If FUHSD enables it, OAuth tokens stay encrypted on the server and are deleted on disconnect.</dd></div>
            <div><dt>Grade demo</dt><dd>Saved only for the current browser tab.</dd></div>
            <div><dt>School schedule</dt><dd>Bundled public reference data; no background requests.</dd></div>
          </dl>
        </article>
        <article className="mvhs-card">
          <p className="mvhs-kicker">Provenance</p>
          <h2>Verify official information</h2>
          <div className="mvhs-official-links">
            <a href={MVHS_SCHEDULE_SOURCE.url} target="_blank" rel="noreferrer"><strong>Regular bell schedule</strong><span>{MVHS_SCHEDULE_SOURCE.label} ↗</span></a>
            <a href={FUHSD_CALENDAR_SOURCE.url} target="_blank" rel="noreferrer"><strong>Academic calendar</strong><span>{FUHSD_CALENDAR_SOURCE.label} ↗</span></a>
            <div className="mvhs-credit-row"><strong>Reference credits</strong><span>Gunn WATT interaction patterns · MIT licensed; implementation independently written.</span></div>
          </div>
        </article>
      </section>
      <aside className="mvhs-truth-note">
        <strong>Schoology connection is authorization-gated</strong>
        <p>Finishline never asks for Schoology or Google credentials, copies cookies, or scrapes pages. Live retrieval requires FUHSD-approved Schoology OAuth/API access and a verified production callback; without that configuration, the connection remains unavailable and local Grade Lab still works.</p>
      </aside>
    </AppShell>
  );
}
