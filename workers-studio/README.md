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

## Vehicle reference photos

In `/vehicles/`, use **Vehicle reference photos → Attach photos** above the vehicle fields. Attach up to eight JPEG/PNG/WebP files (3 MB input each). Click a thumbnail for a larger view; use Remove to detach it. Changes and photos are backed up automatically in this browser. While signed in, they also save automatically to cloud storage; wait for **Saved to cloud** before closing. Inventory entries show a photo count and a protected thumbnail. Full photo previews require the existing owner session. Photos also follow the existing explicit planner-transfer workflow.

## Automatic saving and reopening

Generated content, edits, approvals, car details and photos save automatically. Incomplete car details remain backed up locally until make and model are entered. Signed-in listings are saved to the existing Durable Object, using a serialized queue and optimistic revisions. The status bar distinguishes local backup, pending cloud saves, successful saves and failures. Save now / Save to cloud now can flush immediately.

Reopening restores the active listing and checks for a newer cloud version when the local copy is clean. On a fresh signed-in device it restores the latest cloud listing; Saved listings and Vehicle inventory also include cloud records. Signing in from the workspace opens the saved inventory. Existing browser-only drafts remain intact.

Network failures retain local backups and retry when connectivity returns. A stale cloud revision never silently overwrites another device: the conflict action first keeps a separate local backup, then opens the cloud version. Failed browser storage and failed cloud writes show **Not saved** instead of a success message. Vehicle fact edits retain old generated copy and require regeneration before approval or transfer.

This requires the same authorised sign-in on each device and an Internet connection for cloud saving. Changes are not uploaded while signed out. Browser-only backups cannot survive clearing browser storage; content that was never saved in earlier versions cannot be reconstructed automatically.

## Optional OpenAI

In this **Worker's** Cloudflare Settings → Variables and Secrets, add encrypted `OPENAI_API_KEY`. Optionally set `OPENAI_MODEL` (default `gpt-4.1-mini`). Do not add it to frontend assets or commit it. The AI handler uses the existing verified owner session, rate limits requests, validates response structure, redacts common private contact patterns, and requires manual review of generated claims. Without the secret, templates, inventory, media, posters and planner integration work; AI returns a clear unavailable message.

## Integration validation

`scripts/workers-smoke.mjs` targets **localhost:8790 only** and expects an isolated local Supabase auth stub; it must not be pointed at production. Tests use no real credentials. Run a local Worker with separate state and dummy Supabase configuration, then run the smoke script. It checks shared authentication, private API guards, listing revisions, preservation of a native planner post, idempotent transfer, reuse of native media, and inclusion in backups. Browser checks additionally exercise both the original planner UI and the new vehicle workspace. A local auth stub never ships in production assets or the Worker.

Real production Supabase login must be checked by the account owner; no owner password was supplied to this coding session. The backend retains the deployed login implementation. AI tests use a mocked provider; real OpenAI availability requires a valid server secret and provider account.
