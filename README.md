# Maid-Match

A family-focused, multi-tenant Next.js application for finding household help. Built in its own sibling folder; Quotient source, migrations and environment files are not modified.

## Run locally

Requires Node.js 24 and npm.

```powershell
cd "D:\upwork sample projects\upwork projects\AI SaaS MVPs\maid-match"
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3400. Explore the complete browser-local sample at http://localhost:3400/demo. The demo contains fictional profiles and does not make AI or billing requests.

The copied `.env.local` uses the same service credentials and variable names as Quotient. Only this copy's `NEXT_PUBLIC_APP_URL` is changed to `http://localhost:3400`. It is ignored by Git. Do not upload it with application source. Maid-Match uses its own `maid-match-auth` cookie.

## Features

- Supabase email signup, verification, login, logout, password recovery and reset.
- Private family workspaces, workspace switching and owner/member roles.
- Email-bound invitation links, revocation and member removal. Links are shared by the owner; the app does not send invitation emails.
- Household location, pay budget/currency, service needs, working days, daily hours, living arrangement, start date and communication languages.
- Consent-based maid directory; saved matches; explicit reasons and gaps for requirement coverage.
- AI family assistant with model-generated shortlist scores, explanations, interview questions, and an animated loader.
- Family interview planner, private notes, arrangement status, local timezone display and activity history. Scheduling is a private planning record, not a confirmed appointment or a notification to a maid.
- Starter and Pro organization subscriptions, a 14-day Starter trial, signed webhooks, serialized billing operations, direct Stripe reconciliation and plan changes in Billing Portal.
- Accessible native dialogs, mobile navigation, filters, empty states and errors.
- Database-enforced limits and optimistic version checks for household preferences and saved arrangements.

## Role of AI

The AI family assistant generates a shortlist of up to five relevant profiles and its own 0-100 suitability score for each. Families can add work-related priorities such as cooking, budget, or weekday availability. Each recommendation includes reasons, gaps to discuss, interview questions, and actions to view or save the profile.

Scores shown as **AI fit** come from the configured OpenAI model. The server validates scores and IDs but does not calculate replacement scores or silently substitute fixed percentages. Cards without a current AI assessment say **Ask AI to score**. After assessment, the directory sorts scored profiles by the model's score. Changing the household requirements or family workspace clears those assessments.

The existing deterministic matching function only retrieves a bounded review pool and supplies a default discovery order. It is not presented as an AI score. For a large catalog, up to 60 relevant available profiles are submitted from the first 1,000 directory records; the assistant displays the number reviewed. Rule-based scores are never sent to the model.

Live matching shares saved household requirements, the family's assistant request, and work-related profile facts with `https://api.openai.com/v1/chat/completions`, using `OPENAI_API_KEY` and `OPENAI_CHAT_MODEL`. Names, profile photos, biographies, contact details, and private saved-match notes are excluded from the structured profile payload. Use the assistant request for household tasks and work-related priorities rather than contact details. This data flow was explicitly approved by the project owner.

The endpoint requires authenticated family membership, a valid saved household brief, and a current trial/subscription. It reserves the existing daily AI allowance before calling the provider. Invalid profile IDs, duplicate recommendations, invalid scores, incomplete/refused responses, expired requests, changed household versions, and withdrawn profiles are rejected. Failures show an error and do not fabricate an AI result. Each request uses one daily AI attempt, including a failed provider attempt.

AI scores are subjective compatibility estimates, not verified ratings, hiring decisions, or guarantees. The assistant uses work-related evidence, not identity, appearance, or protected traits. Families make the final decision and verify information directly. It does not verify references, contact maids, or confirm appointments.

The animated loading state runs only during the request, without a fake percentage, and supports reduced-motion preferences. The demo shows a clearly labeled, fixed example shortlist with example scores and makes no OpenAI request. Live model scores are generated anew and may vary between requests. Results are session-only, not persisted to the database. No schema migration is needed for the assistant.

Implementation follows [OpenAI's Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).

## Supabase setup

Run **one additive consolidated migration** in the connected project's SQL Editor:

`supabase/migrations/001_maid_match.sql`

All tables/functions begin with `mm_`, so Maid-Match can coexist with Quotient. The migration never revokes grants on unrelated functions and never seeds fictional profiles into the shared database. Do not rerun it on a Maid-Match schema that already exists. This is the first Maid-Match schema: there is no older Maid-Match installation to upgrade. Existing Quotient installations still use this new additive migration, not a Quotient legacy migration.

Configure the Supabase Auth redirect allowlist for this additional app origin and `/auth/callback`, including the reset-password `next` query and invitation links. Keep Quotient's existing URLs in the allowlist. Configure production SMTP and email confirmation. Because both apps share the same Supabase project, they share the account directory and authentication settings, while application data and cookies remain separate.

The app intentionally has no recruitment/candidate management section or maid signup role. Import real, consented maid profiles into `public.mm_maids` using an administrator/service-role process. Keep display names limited to what the maid agrees to publish. Supported currencies are USD, PKR and AED. Expected pay is monthly. Skills and days use the labels in `lib/domain.ts`. Set `consent=true` and `available=true` only when appropriate. No real profiles are included with the project.

Withdrawing a profile or marking it unavailable removes it from discovery and AI inputs. Saved family records can still be removed without exposing withdrawn directory details. Use a documented operational process to confirm consent, update availability, verify references, handle profile removal and delete tenant data on request. Family data is not sent to other families.

## Optional sample maid profiles

For development/testing, run `supabase/optional-migrations/002_sample_maid_profiles.sql` in the Supabase SQL Editor after the main setup migration, then refresh the dashboard. It adds six clearly labeled fictional profiles to the database directory, visible to all families with a workspace. It is safe to rerun and does not overwrite existing records. Keep it out of production; the publication flags are for synthetic test data and do not establish consent for real people.

## Plans and entitlements

| Limit | Starter | Pro |
| --- | ---: | ---: |
| Saved maids per family | 20 | 100 |
| Family members including owner | 3 | 10 |
| AI requests per UTC day | 5 | 25 |

New families receive a 14-day Starter trial without a card. Paid entitlements require Stripe active/trialing status and an unexpired period. Past-due, unpaid, paused, incomplete, canceled and expired subscriptions do not grant write/AI access. Existing data stays readable, and private saved records can be deleted. Removing members and revoking invitations remain available after expiration. Failed provider requests consume their reserved AI attempt to prevent retry abuse. Plan changes never reset usage. A verified user may own at most five workspaces.

## Stripe setup

Use the existing variable names:

```dotenv
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
```

The copied prices are valid test-mode monthly prices but their product names belong to another app. Create Maid-Match Starter and Pro monthly prices in the same currency and change **only Maid-Match's** environment values. Retain Quotient's prices and subscriptions. The marketing page does not invent dollar amounts: the configured price appears in Stripe before payment.

Create a separate webhook endpoint for Maid-Match at `https://YOUR-DOMAIN/api/stripe/webhook`. Store that endpoint's signing secret in **Maid-Match's** `STRIPE_WEBHOOK_SECRET`. Copying a secret from a different endpoint does not configure this endpoint. Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Billing belongs to the family workspace. Only owners can manage it. Customers, sessions and subscriptions carry `application=maid-match` plus `organization_id`. The service reconciles before every action and on owner billing-screen entry; returns sync server-side before displaying updated state. Multiple blocking subscriptions are rejected in both test and live mode. Existing open Checkout sessions are reused only if the plan and actual price/item configuration match; others are expired. Plan switches use the exact subscription item through `subscription_update_confirm` with prorations and explicitly allowed products/prices.

A database lease serializes actions and webhook reconciliation. Supported events are marked complete only in the same transaction that persists current subscription state. Replayed events are idempotent. Older payloads cannot overwrite current state because reconciliation retrieves current Stripe data under the lease. A stale lease cannot persist changes. This does not modify existing subscriptions in the shared account.

Stripe CLI local webhook forwarding requires its own temporary `whsec_...` value in this app's local env file. Never use production payments for automated tests.

## Deployment to Vercel

1. Import this `maid-match` directory as its own project, with Node.js 24.
2. Set the same environment variable names from `.env.example`; set `NEXT_PUBLIC_APP_URL` to this app's HTTPS origin.
3. Apply the consolidated Maid-Match migration and configure the additional Auth redirect URLs.
4. Configure Maid-Match-specific prices and its webhook signing secret.
5. Use build command `npm run build` and install command `npm ci`.
6. Run the readiness audit and complete the cloud acceptance checks in `AUDIT.md` before public launch.

No automatic Vercel deployment or production database mutation has been performed.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
# In another terminal, while the server is running:
npm.cmd run test:browser
npm.cmd run check:production
```

Browser checks use installed Chrome at its standard Windows path; override with `CHROME_PATH`. `TEST_URL` overrides the browser base URL. The readiness check uses read-only service requests, prints no secret values, and exits nonzero while cloud setup remains incomplete. See `AUDIT.md` for evidence, remaining limitations and release checks.

## Dummy maid data with pictures

Run `supabase/migrations/004_dummy_maids_with_stock_photos.sql` in the Supabase SQL Editor after `001_maid_match.sql`, then refresh the dashboard. Migration 002 is optional: 004 inserts all six fictional profiles or adds pictures to existing marked samples. Rerunning does not duplicate profiles or overwrite real profiles. Portraits are stock photos of women from Pexels, stored as local JPEGs under `public/maids`, served by the app; no Supabase Storage setup is required. Profile cards and details display the pictures, with initials if an image cannot load. This is synthetic development/test data visible to every family workspace, not real people available for hire.

The illustrated-profile migration `003_dummy_maids_with_pictures.sql` was removed. Run `004_dummy_maids_with_stock_photos.sql` even if you previously applied 003: it adds the photo column if needed, inserts missing fictional profiles and updates marked sample profiles to the JPEG paths. It does not remove any database rows. Older sample SVG URLs are mapped to the replacement photos in the UI. Model photographs are placeholders, not the named fictional people or endorsements. Photo credits and source links are in `public/maids/SOURCES.md`.
