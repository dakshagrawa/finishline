import AppShell from "./app-shell";

const clubResources = [
  {
    title: "Current club information",
    description: "Monta Vista directs students to Minga first for current club details and announcements.",
    href: "https://mvhs.fuhsd.org/student-life/student-activities/clubs",
    label: "Open official MVHS club page",
  },
  {
    title: "Student Life directory",
    description: "The Student Life Commission maintains an independent directory. Its public list is labeled 2024–25, so verify details before attending.",
    href: "https://www.mvclubs.com/clublist",
    label: "Open MV Clubs directory",
  },
  {
    title: "Start or manage a club",
    description: "Find chartering guidance, meeting expectations, and contacts through Monta Vista Student Activities.",
    href: "https://mvhs.fuhsd.org/student-life/student-activities",
    label: "Open Student Activities",
  },
];

export default function MvhsClubs() {
  return (
    <AppShell active="clubs">
      <header className="mvhs-section-header">
        <p className="mvhs-kicker">Student life</p>
        <h1>Find your people.</h1>
        <p>Use current, student-maintained sources instead of a copied or stale Gunn directory.</p>
      </header>
      <section className="mvhs-resource-grid" aria-label="MVHS club resources">
        {clubResources.map((resource) => (
          <article className="mvhs-card mvhs-resource-card" key={resource.title}>
            <span aria-hidden="true">◇</span>
            <h2>{resource.title}</h2>
            <p>{resource.description}</p>
            <a href={resource.href} target="_blank" rel="noreferrer">{resource.label} ↗</a>
          </article>
        ))}
      </section>
      <aside className="mvhs-truth-note">
        <strong>Why there is no copied club list</strong>
        <p>The public MV Clubs spreadsheet linked today is labeled 2024–25 and contains older details. This dashboard will not present it as current 2026–27 information.</p>
      </aside>
    </AppShell>
  );
}
