# Dream Motors Social Media Studio

Vehicle listing workspace for Cloudflare Pages, with an optional D1-backed private account system and server-side OpenAI integration.

## Current features

- Quick paste in English, Urdu or Roman Urdu through optional AI; conservative rule-based extraction remains available without AI. Review editable vehicle fields and ambiguity warnings before generation.
- Seven editable text formats, independent regeneration, approvals, private contact redaction and seller-information disclaimers. AI output always requires human fact checking.
- Local IndexedDB drafts retained across this upgrade, up to eight compressed photos, JSON backup and public text exports.
- Searchable saved vehicle inventory with Available / Reserved / Sold / Required / Archived statuses. Existing listings reopen for editing without creating new records.
- Content calendar with channel and manual task statuses, device-local date/time entry, and UTC iCalendar export. Calendar entries are reminders, not automatic social posts.
- Branded PNG downloads, 1080 × 1350 feed and 1080 × 1920 story. Posters use reviewed facts and the first attached photo. No Canva API integration.
- Optional username/password accounts, private D1 listings/photos, explicit individual sync, optimistic revisions, request size limits, HttpOnly Secure SameSite sessions, PBKDF2 password hashes and database-backed rate limits.

## Local build and unit checks

Node.js 22+ required. No application dependencies or frontend secrets.

```sh
npm test
npm run build
npm run dev
```

`npm run dev` serves static assets on port 5173. Local drafts, inventory, calendar, template generation and PNG export work there; `/api` requires the Cloudflare local runtime below. Build output is `dist`.

## Local cloud integration testing

Use the existing isolated checkout. Do not create a Git worktree for setup. Keep local credentials and state outside tracked source.

Create an ignored `wrangler.jsonc` in the project root for local testing (remove it before production deployment, or replace the ID with the real production database ID):

```json
{
  "name": "dream-motors-studio",
  "pages_build_output_dir": "dist",
  "compatibility_date": "2026-11-10",
  "d1_databases": [{"binding":"DB", "database_name":"dream-motors-local", "database_id":"00000000-0000-0000-0000-000000000001"}]
}
```

```sh
npx --yes wrangler@4.160.1 d1 execute DB --local --file server/schema.sql
npx --yes wrangler@4.160.1 pages dev --port 8788
# In a second terminal, using the same checkout:
node scripts/smoke.mjs
```

On managed machines where the default config directory is unavailable, set `XDG_CONFIG_HOME` to a writable directory outside the checkout. The smoke test uses a real local D1 database and creates test accounts; run it only against your local test runtime. It checks authentication, account isolation, photos, concurrent stale writes, absent AI and auth rate limiting. Unit tests mock the AI provider; they do not establish real model availability or factual accuracy.

For optional local AI testing, put `OPENAI_API_KEY` in ignored `.dev.vars`. Never commit it. Default model: `gpt-4.1-mini`, override with `OPENAI_MODEL`. Real OpenAI requests incur provider usage charges.

## Production database setup

The Cloudflare token needs **Account → Cloudflare Pages → Edit** and **Account → D1 → Edit** for the intended account. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` securely in environment settings.

```sh
python3 scripts/provision-cloud.py
```

This creates/reuses the `dream-motors-studio` D1 database, applies the initial idempotent schema, and binds it to the Pages production environment as `DB`. It preserves unrelated D1 bindings. Production D1 access must be confirmed; local tests do not prove production readiness. Provisioning requires a token with D1 permission. The initial schema is not an upgrade migration for an older incompatible database.

Alternatively, create a D1 database in the Cloudflare dashboard, execute `server/schema.sql` using its console, then bind it under the Pages project's Settings → Bindings as `DB`.

## OpenAI configuration

In Cloudflare's **dream-motors-studio Pages project → Settings → Variables and Secrets**, add an encrypted secret named `OPENAI_API_KEY` to production. Enter the API key directly there, not in chat, the frontend, GitHub, or the Cloudflare API token field. Optional plain variable `OPENAI_MODEL` selects a compatible Chat Completions model. Redeploy after changing bindings/secrets. The key is used only by the server worker. Each signed-in user is limited to 30 AI requests per 15 minutes per IP/account pair. Configure appropriate provider project spending limits.

The AI endpoint strips common Pakistani phone numbers and emails, validates JSON shapes/size and forces inspection to unverified during extraction. These checks cannot guarantee factual correctness or catch all private information. Review every claim, price and personal detail before approving public content. Signup is public; each account sees only its own listings. There is no team sharing, email verification, self-service password reset or automatic social publishing.

## Deploy

```sh
npm test
npm run build
npx --yes wrangler@4.160.1 pages deploy dist --project-name=dream-motors-studio --branch=main
```

The build includes `_worker.js` and API routing. Use Wrangler for deployment of the complete backend. The project is served at `https://dream-motors-studio.pages.dev`. Verify `/api/session` and real account save/reopen after D1 is bound. Without D1, the server explicitly reports cloud storage unavailable and all local workflows remain usable. Without `OPENAI_API_KEY`, AI returns a clear configuration error and preserves existing content.

Cloud saves use explicit upload, per-user IDs and revision checks. They do not automatically merge local drafts or other-device edits. On a conflict, retain/export your local edits and reopen the cloud listing. Workspace limit: 500 cloud listings/account. Photos larger than 800 KB as data URLs must be re-added for compression before syncing. Private JSON exports include seller messages/photos; protect them. Browser storage can be cleared and is not a backup. On shared devices local drafts remain accessible after signing out.
