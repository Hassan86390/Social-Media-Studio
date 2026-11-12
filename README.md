# Dream Motors Social Media Studio

A responsive, dependency-free listing workspace prepared for Cloudflare Pages.

## Run and validate

Requires Node.js 22+ and Python 3 for the optional development server.

```sh
npm test
npm run build
npm run dev
```

The development server uses port 5173. Cloudflare deploys the generated `dist` directory.

## Cloudflare Pages

1. Push this project to your GitHub repository.
2. In Cloudflare, open Workers & Pages → Create application → Pages → Import an existing Git repository.
3. Select the repository and branch. Framework preset: None. Build command: `npm run build`. Build output: `dist`.
4. Choose a project name, such as `dream-motors-studio`, and deploy. Cloudflare assigns `<project-name>.pages.dev`, subject to availability.

Alternatively, run `npm run build` and upload the contents of `dist` through Pages Direct Upload. The supplied deployment ZIP contains those files at its root.

No API credentials or runtime environment variables are required. HTTPS is required for clipboard access. This repository does not publish itself or manage your Cloudflare account.

## Available workflow

- Quick paste with conservative rule-based extraction, manual entry of all specified vehicle fields, warnings for conflicting years/transmissions, and a compact review form.
- Seven separate, editable, fact-based text formats. Independent regeneration and approval; edits to vehicle facts invalidate generated content.
- Dream Motors contact details, PKR formatting, seller-information disclaimers and basic phone/email redaction. Always manually review public copy for personal information, unsupported claims, and accuracy before use.
- Up to eight photographs, retained with drafts in IndexedDB in the current browser.
- Draft reopening, overwrite confirmation, private JSON backup and public text export. JSON backups contain private seller messages and images; handle securely. JSON import is not implemented.
- Feed and story copy for manual use in 1080 × 1350 and 1080 × 1920 Canva layouts. No automatic Canva editing, image composition, scheduling or social publishing.

## Scope and limitations

The original repository contained only a README: there was no existing application, database, inventory, media library, calendar, authentication or publishing integration to reuse. This implementation is a new local browser workspace, not an authenticated shared backend.

Generation uses deterministic templates, not an AI model. Extraction supports selected English terms, common Urdu labels/numerals and some Roman Urdu phrases; unrestricted mixed-language understanding is not implemented. Unrecognized facts must be entered manually. Conflicting model years and transmissions are flagged; other ambiguities require manual review. An inspected status is a user's explicit declaration, not an independently verified result.

Drafts do not sync between browsers or devices and may be removed by browser storage cleanup. Export backups. Do not use a shared browser for private seller records. There is no API key input in the frontend. Adding real AI, authentication and shared storage requires a separate server-side integration (for example Cloudflare Workers with protected routes and a database), plus credentials supplied through secure platform settings. Do not put secrets in static files.

Tests cover the provided Daihatsu Cuore case, incomplete details, conflicting information, selected Urdu/Roman Urdu input and private contact redaction.
