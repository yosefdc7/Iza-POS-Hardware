# CURRENT.md

## Objective
Deploy a fresh empty Iza POS store on Netlify Free and Supabase Free and deliver verified access and private setup links.

## Status
Complete: production is live at https://iza-pos-hardware-eval.netlify.app. Private setup link delivered separately. No administrator created in production.

## Completed
- Netlify/Supabase browser setup, private credentials, pooled PostgreSQL connections and separate production/acceptance databases.
- Ten migrations applied, schema reconciled, RLS enabled on all public tables, image buckets created.
- Guarded one-time setup, no default accounts, readiness checks, administrator mutation checks, persistent checkout IDs, cashier-owned offline queue and account-switch credentials.
- Packaged-product refunds restore base-unit stock.
- Explicit Netlify Next.js runtime configured; Linux cloud build avoids local Windows middleware packaging failure.

## Important Decisions
- Free plans only; existing projects untouched. Final store starts empty.
- Netlify branch acceptance uses iza_eval_test and iza-pos-test-images. Production uses postgres and iza-pos-images.
- No credentials or setup tokens in tracked files. Secrets stay in ignored .env.deployment.local and Netlify.
- Git pushes trigger automatic Netlify builds; do not additionally trigger duplicate builds.

## Changed Files
See Git commits and docs/deployment-progress.md.

## Verification
- Existing unit suite: 21 files / 192 tests passed.
- Recovery and sync regression tests: 15 passed; packaged-refund route regression: passed after verified failing case.
- TypeScript passed; lint zero errors, 143 warnings.
- Hosted integration passed setup race, auth, concurrent/lost-response checkout retries, stock/receipt integrity, split payments, packaged refunds, cashier restrictions and image upload/read.
- Hosted Chromium test passed login, catalog create/refresh, reports, checkout/receipt, offline sale queue and reconnect replay with exact stock check.
- Acceptance runtime commit 85ec253; URL https://acceptance--iza-pos-hardware-eval.netlify.app; deployment 6ab8c1068b13c40008ea4168.

- Production deployment 6ab8c24d98c19600081b669a, runtime commit 9a643c7. Health 200; setup incomplete; zero staff/products/sales; invalid bootstrap token rejected. Private-link browser load enables setup form and clears URL fragment.
- Acceptance fixtures and test uploaded images removed after passing tests.

## Next
User opens the private setup link to create their administrator account. Future app changes pushed to codex/deploy-free-evaluation deploy automatically.

## Blockers / Unknowns
No account handoff needed. Hardware printer interaction is not part of the automated browser verification.

