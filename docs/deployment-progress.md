# Free evaluation deployment

- Starting commit: f275a26; working branch: codex/deploy-free-evaluation.
- Approved: fresh empty store, Netlify Free and Supabase Free, no paid upgrades.
- Supabase: rdjfmffuikevlsohqsgn, Singapore. Production database postgres; separate acceptance database iza_eval_test.
- Netlify: iza-pos-hardware-eval, site ID 090dd7aa-c746-40bf-b403-af534571883d. User authorized account via CLI ticket. Browser GitHub sign-in reached Supabase; Google sign-in reached the existing Netlify account.
- Service-role key transferred directly into Netlify and marked secret. No user copying required.
- Runtime uses transaction pooler port 6543, migrations session pooler port 5432. Database role iza_app; temporary CREATEDB permission revoked after provisioning.
- All ten migrations applied to both databases. RLS enabled on all public tables. Server role uses BYPASSRLS; no public policies grant POS access.
- Production and acceptance image buckets created. Branch deployments and deploy previews target the test database/bucket. Production remains empty.
- Important: --alias creates a branch deployment, even when CLI build --context differs. Branch-deploy environment therefore explicitly configured for acceptance tests.
- Verified: 192 existing unit tests; 15 recovery/sync checks; packaged-refund regression red then green; local schema diff clean; local bootstrap/concurrent-sales integration; production compilation; TypeScript; lint zero errors.
- Browser verified login, catalog create/refresh, reports. Checkout test locator corrected from Charge to actual Checkout label; full browser pass pending.
- Netlify packaging runs locally on Windows with Node 22, official optional native binaries restored. A build must finish before running local production browser tests because it replaces .next files.
- Final hosted acceptance checks and production publication remain in progress.
- Keep all credentials and the bootstrap capability in ignored/private files; never commit the setup URL token.
- Local Netlify adapter failed on a Windows CJS/webpack path in middleware. Switching to a Git-backed Netlify Linux build. No production deployment has occurred.
