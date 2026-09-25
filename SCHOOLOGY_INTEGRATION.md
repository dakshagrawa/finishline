# FUHSD Schoology integration operations

## Current activation state

The integration code is implemented but **disabled by default**. Without every required server variable, `/grades` continues to provide local JSON/file import and the demo while showing that Schoology is awaiting district authorization.

Do not describe live sign-in or grade retrieval as working until an authorized FUHSD account completes the full production flow. Keep the integration disabled until FUHSD approves the app and the registered production callback and read-only retrieval have been verified with an authorized district test account; local tests alone cannot activate it.

## OAuth protocol contract

Finishline uses Schoology's official three-legged OAuth 1.0 flow with HMAC-SHA1:

1. The server requests a temporary token from `https://fuhsd.schoology.com/oauth/request_token` using the registered app consumer key and secret, a unique nonce, and a current timestamp. The registered HTTPS base callback is configured by the app; the service appends a random `state` query parameter to construct the per-attempt callback sent to Schoology. FUHSD must accept that exact constructed callback URL before activation.
2. The browser redirects to `https://fuhsd.schoology.com/oauth/authorize` with the temporary token and the same per-attempt callback. Schoology/FUHSD owns password and district SSO handling; student Schoology/SSO passwords never enter Finishline. The server holds approved app credentials and OAuth token secrets securely.
3. The callback must match the signed Finishline session, random state, and one-use request token before the server exchanges the approved token at `https://fuhsd.schoology.com/oauth/access_token`.
4. Read-only data calls use freshly signed requests to pinned `https://api.schoology.com/v1/` endpoints. Approved same-origin API redirects under `/v1/` are re-signed for the target URL and query with a new nonce and timestamp; cross-origin, non-API, and OAuth-token redirects are rejected.
5. A provider `401` or `403` conditionally invalidates only the local authorization matching the failed request and requires explicit full OAuth1 reauthorization. A stale failure must never delete a newly reauthorized session or an in-progress reauthorization. Schoology OAuth1 has no refresh-token shortcut; do not automatically restart authorization.

The tenant OAuth endpoints follow Schoology's documented `_domain` behavior. Do not substitute `/v1/oauth/*` endpoints unless FUHSD/Schoology supplies an app-registration contract requiring them.

## External approvals required

1. Obtain Schoology developer/app access.
2. Register an unpublished app with the exact production HTTPS origin and callback.
3. Ask FUHSD to install and authorize the app for a read-only student test.
4. Obtain the app-level OAuth 1.0 consumer key and secret from Schoology **App Profile → Options → API Info**.
5. Complete privacy/security review before handling real student data.

Personal keys, copied cookies, password forms, HTML scraping, Gunn.one infrastructure, and cross-student access are prohibited.

## Server configuration

Copy `.env.example` to a server-only environment file and configure:

```dotenv
SCHOOLOGY_INTEGRATION_ENABLED=true
SCHOOLOGY_CONSUMER_KEY=<app key>
SCHOOLOGY_CONSUMER_SECRET=<server-only app secret>
APP_URL=https://<exact production host>
SESSION_SECRET=<at least 32 random characters>
TOKEN_ENCRYPTION_KEY=<exactly 32 random bytes, base64 encoded>
SCHOOLOGY_STORE_PATH=/var/lib/finishline/schoology-store.json
```

Generate secrets without checking them into Git:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
```

The service accepts only:

- HTTPS `APP_URL` with no credentials, path, query, or fragment.
- Fixed tenant `https://fuhsd.schoology.com`.
- Fixed API origin `https://api.schoology.com`.
- An absolute encrypted-store path.
- An explicit activation value of `true`.

## Data lifecycle

- OAuth request tokens expire after 10 minutes and are consumed once.
- Access tokens are scoped to one signed, secure, `HttpOnly`, `SameSite=Lax` service session.
- The local encrypted store uses AES-256-GCM and mode `0600`.
- Finishline retains OAuth access records only for the signed browser session’s 30-minute lifetime, even though Schoology tokens may have a longer provider-side maximum.
- Provider tokens never enter browser storage or JSON responses.
- Retrieved grade snapshots are returned with `Cache-Control: no-store` and held in React memory.
- Normalization is intentionally fail-closed: Finishline currently accepts only one grading period per section, total-points/no-drop category math, default assignment factors, ordinary numeric assignment grades, and no provider final-grade aggregate, override, pending, final-exam, or grading-scale semantics. Unsupported provider rules produce an error instead of an approximate grade.
- Logout deletes the entire server session record and clears the cookie.
- Local Grade Lab imports and the isolated demo remain available without Schoology.

For multi-instance production deployment, replace the encrypted single-host file implementation with a managed encrypted database/KV store that provides equivalent isolation, atomicity, TTLs, and deletion guarantees.

## Production verification gate

Use an authorized FUHSD test account and verify:

```text
/grades → Continue with Schoology → FUHSD Schoology/SSO approval
→ callback → status connected → load gradebook → compare sections,
categories, assignments, points, exceptions, and weights → logout
```

Also verify:

- A second browser cannot access the first browser's session.
- Replayed and expired callbacks fail.
- A wrong `Origin` cannot start or end a session.
- Redirects and pagination cannot leave the pinned Schoology hosts.
- Logout deletes encrypted token records.
- Provider `401`, `429`, timeout, malformed JSON, and oversized responses produce bounded user-facing errors.
- No passwords, OAuth tokens, grade payloads, or callback parameters appear in logs.

## Official references

- Authentication: https://developers.schoology.com/api-documentation/authentication/
- Important OAuth/API Authentication Update: https://developers.schoology.com/api-documentation/important-api-authentication-update/
- User grades: https://developers.schoology.com/api-documentation/rest-api-v1/user-grades/
- User sections: https://developers.schoology.com/api-documentation/rest-api-v1/user-info-sections/
- Assignments: https://developers.schoology.com/api-documentation/rest-api-v1/assignment/
- Grading categories: https://developers.schoology.com/api-documentation/rest-api-v1/grading-categories/

Implementation tests and a production build verify the local code path. They do not establish FUHSD authorization or live provider functionality.
