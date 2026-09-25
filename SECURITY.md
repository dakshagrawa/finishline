# Security and privacy

Finishline is an unofficial student project, not an MVHS/FUHSD service. Repository visibility is not a security boundary. Before each public release or future change, audit reachable history and proposed files for real student data, tokens, secrets, private screenshots, and asset redistribution rights. Never commit or publish gradebooks, cookies, session-store files, or other identifying material. Never post student data, tokens, or private screenshots in issues and pull requests; they are not secret channels. Use synthetic test fixtures.

## Report a vulnerability

Email the maintainer privately at [daksh.agrawal@outlook.com](mailto:daksh.agrawal@outlook.com) with a minimal description and reproduction steps. Do not include real student records, credentials, or tokens, and do not publish an exploit or student data in a GitHub issue. There is no promised response SLA or active bug bounty.

## Deployment boundary

- The Schoology integration remains **disabled by default**, pending FUHSD-approved app/installation, exact HTTPS callback, privacy/security review, authorized test account, and successful end-to-end verification. See [`SCHOOLOGY_INTEGRATION.md`](./SCHOOLOGY_INTEGRATION.md). Local test/build success does not mean live access works.
- Keep application secrets server-only; do not expose OAuth tokens or real grade payloads to logs, browser storage, CI artifacts, or test fixtures. Grade snapshots should remain in React memory and responses use `no-store`. The isolated demo alone may use tab `sessionStorage`; the project coach uses validated `localStorage`.
- The encrypted file-backed OAuth store is designed for a single host/instance, not multi-instance hosting. Do not activate it on a stateless or horizontally scaled deployment without an equivalent managed encrypted store and verified isolation, expiry, and deletion.
- CI runs without secrets or deployment permissions. Dependency audits gate high-severity findings in both production and full dependency trees, but do not replace security review. Maintainers must configure required checks and branch protection in GitHub separately for each public release; CI alone does not enable them.

For source/attribution boundaries, consult [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
