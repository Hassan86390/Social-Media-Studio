# Main Dream Motors planner integration

Main application: https://dream-motors-social-studio.natriq73.workers.dev/
Vehicle workspace: https://dream-motors-social-studio.natriq73.workers.dev/vehicles/

This integration reuses the existing **Supabase owner login**, `STUDIO` Durable Object namespace and `StudioStore` class. It does not need D1 or a new account. The existing login, posts, reminders, publishing desk, media, analytics, links and planner tables retain their original code and storage identity.

The original backend TypeScript was recovered from the live Worker's source map. The editable React frontend source was unavailable, so its deployed HTML, JavaScript chunks, stylesheet, icons, manifest and service worker are preserved under `public`. These compiled frontend files should not be hand-edited. An additional script provides a vehicle-workspace link after a successful session check. Future redesign of the original planner should use the original React source when available.

## Build and deploy

From the repository root:

```sh
npm test
npm run build:workers
npx --yes wrangler@4.160.1 deploy --config workers-studio/wrangler.jsonc
```

`keep_vars` retains the existing Supabase/owner variables and server secrets. Do not change the Worker name, `StudioStore` class, `STUDIO` binding or owner-email identity: they select existing persistent data. No existing table is dropped or replaced. Verify the deployed namespace ID still matches its predeployment value. Do not add a migration that deletes or renames this class.

The additive schema creates `vehicle_listings`, `vehicle_photos`, and `vehicle_media`. Listing writes use revision checks. Transfers to the original planner create a **Draft**, preserve the proposed schedule, use the native media uploader/validation, and retain a linked post ID so repeated transfer does not create duplicate posts. Later transfers do not overwrite an existing planner post; edit that post in the planner. Imported library photos reuse existing media records. Native JSON backups include vehicle listings and photographs.

Local browser drafts are separate from the standalone Pages origin; they are not silently uploaded or moved. The old Pages site remains accessible.

## Optional OpenAI

In this **Worker's** Cloudflare Settings → Variables and Secrets, add encrypted `OPENAI_API_KEY`. Optionally set `OPENAI_MODEL` (default `gpt-4.1-mini`). Do not add it to frontend assets or commit it. The AI handler uses the existing verified owner session, rate limits requests, validates response structure, redacts common private contact patterns, and requires manual review of generated claims. Without the secret, templates, inventory, media, posters and planner integration work; AI returns a clear unavailable message.

## Integration validation

`scripts/workers-smoke.mjs` targets **localhost:8790 only** and expects an isolated local Supabase auth stub; it must not be pointed at production. Tests use no real credentials. Run a local Worker with separate state and dummy Supabase configuration, then run the smoke script. It checks shared authentication, private API guards, listing revisions, preservation of a native planner post, idempotent transfer, reuse of native media, and inclusion in backups. Browser checks additionally exercise both the original planner UI and the new vehicle workspace. A local auth stub never ships in production assets or the Worker.

Real production Supabase login must be checked by the account owner; no owner password was supplied to this coding session. The backend retains the deployed login implementation. AI tests use a mocked provider; real OpenAI availability requires a valid server secret and provider account.
