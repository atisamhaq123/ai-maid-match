# Maid-Match implementation audit

Audit date: 2026-10-21 (Asia/Karachi). This is a local implementation audit, not a declaration that a deployed production service has passed live acceptance testing.

## Result

The production build passes, TypeScript passes, 26 automated tests pass, and Chrome end-to-end checks pass, including 30 route/viewport combinations. The app is implemented in the independent sibling directory `AI SaaS MVPs/maid-match`. This build step did not edit, add, or remove files in Quotient.

Public launch is blocked by cloud setup: the new database schema is not installed, copied Stripe product branding is for another application, and this copy still uses a localhost origin. The full live authentication, AI and payment lifecycle has not been executed. No existing Stripe subscription, Supabase schema, Vercel project or user account was mutated by this audit.

## Verified locally

| Area | Evidence |
| --- | --- |
| Framework compatibility | Read installed Next.js 16.4.2 documentation for client/server components, route handlers, Proxy and Turbopack. Production build includes all routes and Proxy. |
| Type safety | Strict TypeScript; `npm run typecheck` and the build's type check pass. |
| Database installation | Full consolidated migration executes in isolated PGlite PostgreSQL with Supabase role/auth stubs. |
| Tenant isolation | Real RLS tests prove an outsider sees zero family/saved rows and cannot mutate another family. |
| Role boundaries | Database rejects members invoking billing leases, changing plan columns, creating invitations or escalating memberships. HTTP routes also check membership/owner identity. |
| Shared-project safety | Only `mm_` tables/functions and Maid-Match policies are created. Test proves unrelated public-function grants remain intact. |
| Email/session protection | Server uses Supabase `getUser`, requires verified email, isolates cookies and refreshes through Proxy. Unauthenticated `/app` redirects; unauthenticated mutations return 401. |
| Invitation access | Tokens are random 256-bit values; only SHA-256 hashes are stored. Acceptance is email-bound, expiring, single-use and subject to atomic family size limits. Revocation/member removal are owner-only. |
| Request hardening | Origin checks, bounded JSON reads, no-store responses, CSP nonces, frame denial, nosniff, referrer and permissions headers. Cross-origin billing returns 403. |
| Matching | Unavailable/nonconsented profiles excluded. Score ranges bounded. Currency mismatch never counts as within budget. Names, bios and experience do not influence scores; no protected-attribute ranking. |
| Form validation | Budget, working hours, services, days, household size, languages, duplicate preferences and impossible calendar dates checked. DB separately validates requirements and optimistic versions. |
| Data conflicts | Repeated saves do not duplicate a match. Stale arrangement versions fail. Past interview dates fail. Household updates have version checks. |
| Usage/entitlements | SQL reserves daily AI usage atomically. Trial/paid access depends on current status and valid period. Read access remains after expiration; saved-data deletion remains possible. Plan changes preserve usage. |
| Billing concurrency | Database leases reject concurrent acquisition, wrong tokens and expired tokens. Unique customer/subscription constraints and a single authoritative subscription are used. |
| Stripe mapping | Invalid/identical prices, wrong customer, wrong application/family metadata, unexpected quantities/item counts and unsupported states fail closed. |
| Duplicate subscriptions | Multiple blocking subscriptions rejected in test and live modes. Unrelated subscriptions on a family customer also stop processing. |
| Checkout reuse | Pure policy tests cover same-plan reuse, other-plan expiration and untouched unrelated sessions. Server additionally checks actual Checkout line-item price/quantity before reuse. |
| Plan changes | Tests verify exact existing item IDs for upgrade and downgrade and no portal flow when the target price is already current. Portal configuration explicitly permits configured prices and prorations. |
| Stripe returns | Checkout return validates mode, customer, client reference and application/family metadata before reconciliation. UI syncs on return before loading workspace state. |
| Webhooks | Stripe SDK tests verify exact raw payload signatures and reject tampering. Missing signature returns 400 in the running app. Database event replay is idempotent. Reconciliation re-reads the current subscription rather than applying event payload state. |
| Stale subscription selection | Old canceled subscription cannot displace a current active subscription. Lease validation prevents stale writers from persisting after another lease takes over. |
| Billing status UI | Trial/current plan, past due/canceled/incomplete labels, period end and cancellation scheduling are displayed from server state. Current-plan selection is disabled. Demo/member controls disabled. |
| Demo behavior | Browser tests cover filters, saved-profile persistence, sample AI explanation, interview planning, household preference persistence and disabled demo payments. |
| Responsive pages | Chrome checked `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/demo` at 360, 390, 768, 1024 and 1440 px. No horizontal overflow. Desktop/mobile screenshots inspected. |
| Runtime errors | Browser test asserts no uncaught page errors. |
| Secret exposure | Readiness script scans compiled browser JS/JSON against actual configured server secret values; no service-role, OpenAI, Stripe secret or webhook signing secret found. |

## Read-only connected-service checks

- All expected environment keys are present in the copied environment file.
- Stripe is configured in **test mode**.
- Starter/Pro prices exist, differ, are active monthly recurring prices, and use the same currency.
- Their Stripe product branding does not currently match Maid-Match. No products/prices were changed.
- `mm_organizations` is not available through the connected Supabase project. Install the new additive migration first.
- The production HTTPS-origin check fails as expected for local development.

## Remaining launch acceptance

1. Apply the consolidated migration, preserving all existing Quotient data and configuration.
2. Add this application's Auth callbacks to the Supabase allowlist without removing Quotient's. Verify signup confirmation, resend, logout, recovery, expired links, a real owner/member session and cross-family denial against hosted Supabase. Configure SMTP, authentication rate limits and compromised-password protections appropriate to the project.
3. Import real consented maid profiles through a trusted administration process. Verify profile withdrawal and updated availability. There is deliberately no candidate/recruitment UI and no maid self-signup.
4. Give this app its own Starter/Pro product prices and webhook signing secret under the existing environment variable names. Verify its public webhook destination and customer portal.
5. In a dedicated test family, complete Starter checkout -> Pro upgrade -> Starter downgrade -> cancel -> reactivate. Confirm plan/period state on the first return and after asynchronous webhook retries. Test event delivery out of order and service outages against actual Stripe. Unit/SQL policy tests do not replace this full external lifecycle test.
6. Verify real AI model access, refusal/timeout behavior and quota behavior. The local demo uses a clearly labeled sample explanation; no paid AI requests were made during testing.
7. Deploy to a separate Vercel project with its HTTPS origin; rerun the readiness script and browser checks against that origin. Add alerting for webhook failures, database/AI failures and unexpected billing mappings.
8. Establish consent/reference checks, incident support, tenant deletion/export procedures, backups and restore drills. Legal policies, jurisdiction-specific employment requirements and formal accessibility certification are outside this implementation audit.

## Operational limits and review notes

- Interview times and arrangement status are family records. The app does not contact maids, confirm appointments, execute employment agreements or process maid wages.
- Invitation links are shared manually; the app does not send invitation emails.
- The maid directory is global to eligible family workspaces, while household preferences, notes, saved records, members and billing are private per family. No exact addresses, private contact details or documents are part of directory profiles.
- Directory reads are capped at 1,000 available profiles per request; introduce paginated/server-side search and matching before exceeding that catalog size. Hosted database load, large catalogs and provider outage recovery have not been load-tested.
- Matching compares normalized city/service-area strings, monthly expected pay in the same currency, listed skills/days/hours/living arrangement and work-related communication languages. It does not convert exchange rates, geocode distance, verify credentials or infer availability on a start date.
- AI explanations are not persisted. Their reserved attempt counts even if the provider fails, preventing unbounded free retries. Only structured requirements and anonymous score evidence are sent to OpenAI.
- Family memberships share Supabase's account directory with Quotient because the user requested copied credentials. Application tables and auth cookie names are separate; changing shared Auth settings affects both projects.
- The schema has one owner per family. Ownership transfer and account self-deletion are not implemented; administrators must handle owner-account deletion and orphan-workspace cleanup through an audited process.
- Documentation describes the first Maid-Match schema. There is no legacy Maid-Match schema to upgrade. Do not run a Quotient legacy migration for this application.

## Commands and artifacts

- `npm.cmd run typecheck`
- `npm.cmd test` (26 passing tests)
- `npm.cmd run build`
- `npm.cmd start`, then `npm.cmd run test:browser`
- `npm.cmd run check:production` (intentionally fails until launch setup is complete)

Screenshots: `artifacts/landing-desktop.png`, `artifacts/workspace-desktop.png`, `artifacts/signup-desktop.png`, `artifacts/landing-mobile.png`, `artifacts/demo-mobile.png`, `artifacts/login-mobile.png`.
