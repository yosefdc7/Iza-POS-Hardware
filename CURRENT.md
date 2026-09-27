# CURRENT.md

## Objective
Deploy a fresh empty Iza POS evaluation store on Netlify Free and Supabase Free, verify it, and deliver working access and private setup links.

## Status
Implementation in progress on codex/deploy-free-evaluation. Netlify and Supabase browser setup complete; acceptance deployment packaging in progress; production not published.

## Completed
- New Supabase Singapore project rdjfmffuikevlsohqsgn and Netlify site iza-pos-hardware-eval (090dd7aa-c746-40bf-b403-af534571883d) provisioned.
- Forward schema reconciliation migration, guarded one-time administrator bootstrap, removal of default-account seeding, production readiness checks, sale request idempotency, administrator mutation checks.
- Checkout IDs now persist across reloads; queued writes track cashier ownership; account switch replaces browser credentials.

## Important Decisions
- Fresh isolated empty store; no paid upgrades. Existing Supabase projects untouched.
- Secrets remain in ignored .env.deployment.local and private deployment tooling outside repository. Never put bootstrap token in tracked files.
- User uses remote Codex: account handoffs must use links accessible on their device.

## Changed Files
See git diff and docs/deployment-progress.md. Main changes cover auth/setup, sales, browser/offline storage, schema and deployment config.

## Verification
- All 21 unit test files / 192 tests passed before final reviewer fixes.
- Checkout recovery and offline sync targeted tests: 15 passed after fixes.
- Local PostgreSQL full migration chain applied; schema diff reported no difference.
- Local HTTP integration passed setup race, login, no default account, concurrent/idempotent sale, packaging stock deduction and split payment.
- Lint: zero errors, 142 existing warnings before final changes.
- Production build currently running after installing missing Windows optional native dependencies. Browser test must be rerun (first run blocked by native CSS dependency).

## Next
Finish acceptance Netlify deployment, rebuild once with the packaged-refund fix, run hosted API and browser checks, publish the verified artifact to production, verify fresh store, deliver private setup URL. Source changed after the current preview build compiled, so this preview does not include the refund fix.

## Blockers / Unknowns
No remaining user account input needed. Supabase and Netlify browser sign-ins succeeded, pooler connectivity verified, storage key saved as Netlify secret, buckets created, all ten migrations applied to postgres and iza_eval_test. Production verified zero users/sales and all public tables protected by RLS. See docs/deployment-progress.md.
