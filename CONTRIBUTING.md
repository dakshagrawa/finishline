# Contributing

This is an unofficial MVHS student tool, not a school or district service. Keep the project local-first and respect the reference/attribution boundaries in [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). Keep the separate legacy repository untouched.

## Local setup

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Local-first routes need no Schoology credentials. Keep Schoology disabled: do not use real student credentials or grades while developing and do not enable OAuth without the FUHSD approvals and production verification in [`SCHOOLOGY_INTEGRATION.md`](./SCHOOLOGY_INTEGRATION.md). Never commit secrets, student data, session files, or local environment files.

## Checks before review

```sh
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

CI runs these on `pull_request` and pushes to `main` using Node 24, `npm ci`, and a read-only `contents: read` token. A passing CI run verifies code checks, not live provider behavior, accessibility across devices, or district authorization. For UI changes, manually verify desktop and narrow viewport behavior, keyboard focus, and truthful source labels. For behavior changes, add a failing test first, then implement and rerun the full suite.

## Review boundaries

Repository visibility is not a security boundary. Before each public release or future change, audit reachable history and proposed files for real student data, tokens, secrets, private screenshots, and asset redistribution rights. Never commit or publish real student data, gradebooks, tokens, secrets, or private screenshots; use synthetic fixtures. Never post student data, tokens, or private screenshots in issues and pull requests; they are not secret channels. Maintain linked official sources, mark reference-year schedule data clearly, and preserve the Gunn WATT MIT notice. Do not claim MVHS/FUHSD endorsement or live Schoology access: Schoology remains disabled pending district authorization. Dependabot proposes weekly npm and GitHub Actions updates; review and run checks before merging. A maintainer must configure required checks and branch protection separately; the read-only CI workflow does not enable them automatically.
