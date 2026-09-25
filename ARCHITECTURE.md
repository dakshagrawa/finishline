# Architecture

Finishline is an **unofficial**, local-first Next.js application. It is not affiliated with or endorsed by Monta Vista High School (MVHS) or FUHSD. The six user-facing routes live under `src/app`:

| Route | Responsibility | Main implementation |
| --- | --- | --- |
| `/` | School-day dashboard with Cupertino time and source-linked calendar/schedule context | `src/mvhs/dashboard.tsx`, `src/mvhs/schedule.ts` |
| `/grades` | Local Grade Lab for import and what-if calculations; optional Schoology UI is authorization-gated | `src/grades/grade-calculator.tsx`, `src/grades/gradebook.ts` |
| `/clubs` | Official club-information handoff | `src/mvhs/clubs.tsx` |
| `/tools` | Local finals score calculator and school-resource links | `src/mvhs/tools.tsx`, `src/mvhs/finals.ts` |
| `/projects` | Deterministic Finishline project coach | `src/components/project-workspace.tsx`, `src/lib/project-brief.ts`, `src/lib/project-store.ts` |
| `/settings` | Privacy boundaries and data provenance | `src/mvhs/settings.tsx` |

The shared shell is `src/mvhs/app-shell.tsx`. Schedule and calendar reference data are bundled in `src/mvhs/schedule.ts`; the 2025–26 bell-schedule template is not a confirmed 2026–27 schedule. The app links official MVHS/FUHSD sources for verification. See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for Gunn WATT attribution and the gunn.one reference boundary; the implementation is independently written. No official school mark is shipped or implied by the unofficial dashboard.

## Data flow and persistence

- Project-coach state is validated and persisted in browser `localStorage` (`finishline.project.v1`). It is not a server account or sync service.
- Imported gradebooks and calculations remain in client React memory. Only the built-in Grade Lab demo uses tab-scoped `sessionStorage` (`finishline.grades.demo.v1`). Do not put real student grades into persistent browser storage.
- The legacy repository is separate and untouched by this dashboard/Grade Lab integration. Do not delete or modify it as part of this project.
- Schoology API routes under `src/app/api/integrations/schoology/` exist, but the integration is disabled by default. Its server config requires explicit enablement, app credentials, HTTPS app origin, session secret, encryption key, and absolute encrypted-store path. No local test proves live FUHSD access.
- Activation requires a FUHSD-approved app, exact HTTPS callback registration, privacy/security review, and an authorized end-to-end test. If enabled, OAuth records use a server-side encrypted file store bound to a session; grade responses are `no-store` and stay in client memory. This file store is **single-instance/single-host only**: a multi-instance deployment needs a managed encrypted store with equivalent isolation, atomicity, expiry and deletion behavior. Follow [`SCHOOLOGY_INTEGRATION.md`](./SCHOOLOGY_INTEGRATION.md) before any activation; this document does not authorize it.

No Schoology passwords, copied cookies, scraping, telemetry, analytics, or runtime AI are part of the intended design. Do not describe deployment or third-party authorization as verified based on local checks.
