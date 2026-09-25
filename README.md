# Monta Vista student dashboard

An unofficial, local-first student dashboard for Monta Vista High School. It combines a sourced school-day schedule, private grade simulations, local utilities, verified school-resource links, and the original Finishline project coach.

## Routes

- `/` — MVHS dashboard with Cupertino time, 2026–27 school-calendar boundaries, a clearly labeled 2025–26 bell-schedule reference, date browsing, official sources, and quick links.
- `/grades` — private what-if Grade Lab with validated local JSON/file import, editable points, assignment sliders, weighted categories, simulations, and an explicitly unofficial unweighted GPA. It also contains a fail-closed, district-authorization-gated Schoology OAuth connection; this remains unavailable until approved production credentials are supplied.
- `/clubs` — current official club-information entry points. It intentionally does not copy stale Gunn or old MVHS club records.
- `/tools` — browser-only minimum-final-score calculator and official MVHS resources.
- `/projects` — the preserved deterministic Finishline project coach.
- `/settings` — privacy boundaries, data provenance, and reference attribution.

## Privacy and accuracy

- No student password collection, browser-cookie replay, scraping, telemetry, analytics, or runtime AI.
- Schoology connection is disabled unless FUHSD authorizes the app and every server-only OAuth/session variable is securely configured.
- When enabled, OAuth provider tokens remain encrypted server-side; read-only grade snapshots are returned with `no-store` and held in React memory.
- Only the built-in Grade Lab demo may use tab-scoped `sessionStorage` under `finishline.grades.demo.v1`.
- Project-coach state uses validated browser `localStorage` under `finishline.project.v1`.
- The dashboard is not affiliated with or endorsed by MVHS or FUHSD.
- Period times come from the official MVHS page's published 2025–26 schedule and are labeled as a reference—not confirmed 2026–27 times. The official page remains linked prominently.
- Calendar boundaries and closures are sourced from the official 2026–27 FUHSD calendar.

## Reference boundary

The information architecture was informed by the MIT-licensed Gunn WATT project, but this implementation is independently written for Monta Vista and does not reuse Gunn branding, school records, maps, OAuth infrastructure, or external services. `gunn.one` was used only as behavioral inspiration because no license was found for its inspected source.

See:

- [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)
- [`SCHOOLOGY_INTEGRATION.md`](./SCHOOLOGY_INTEGRATION.md)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — routes, data flow, and deployment boundary
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Node 24 setup, checks, and review expectations
- [`SECURITY.md`](./SECURITY.md) — private vulnerability reporting and student-data handling

## Local setup and checks

Use Node.js 24 and npm. No Schoology credentials are needed for the local-first routes.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Before review, run:

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

Repository visibility is not a security boundary. Before each public release or future change, audit reachable history and proposed files for real student data, tokens, secrets, private screenshots, and asset redistribution rights. Never post student data, tokens, or private screenshots in issues and pull requests; they are not secret channels. The read-only CI workflow runs checks on pull requests and pushes to `main`; Dependabot proposes weekly npm and GitHub Actions updates. A maintainer must configure required checks and branch protection separately; CI alone does not enable them. Neither a passing build nor CI verifies FUHSD authorization, a production callback, or live Schoology access. The Schoology connection remains disabled pending district authorization.

## Authorship disclosure

Substantial implementation was AI-assistant-authored and must not be represented as wholly student-created. Any competition submission must disclose this assistance truthfully and meet that competition's eligibility and authorship requirements; this repository does not establish eligibility.
