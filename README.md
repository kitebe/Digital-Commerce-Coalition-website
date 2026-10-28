# Digital Commerce Coalition website

The site runs on Next.js using the App Router. The existing visual system and
content scripts are preserved while each former HTML page is exposed as a clean
Next.js route.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Content studio

Configure `.env.local` with the Firebase web app settings (`NEXT_PUBLIC_FIREBASE_*`)
and Admin SDK credentials (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`). Set a
strong `CMS_SECRET` for session signing. Firebase's private key is used as a
server-only fallback when a separate session secret is absent. Enable the sign-in
providers used by your administrators, then restart the server. Open
[http://localhost:3000/admin](http://localhost:3000/admin) to manage content.
`CMS_PASSWORD` is also supported for password-based sessions. Never commit secrets.

The content studio includes rich-text article and detail editing, draft and
published states, authenticated previews, locked URL slugs, date/month pickers,
conflict-safe item updates, and homepage member management. Rich text supports
headings, lists, links, quotes, code, tables, uploaded images, and YouTube
embeds.

CMS content is stored in Firebase Firestore. Configure the Firebase Storage
bucket (`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`) and grant the service account access
for image and PDF uploads. Production uploads fail with an actionable message if
cloud storage is unavailable; they never fall back to an ephemeral server disk.
Local disk uploads are supported only in development when no bucket is configured.

The initial CMS content was migrated from the original JavaScript data files.
To intentionally recreate the CMS data from those files, run `npm run seed:cms`.
The seed command also upgrades the generated data to the current versioned CMS
schema. Existing version-one data can be upgraded independently with
`npm run migrate:cms-v2`; the migration is idempotent and creates a backup
before changing the content file.

## Event mailing list

The Events page collects email addresses with explicit consent. Signups are stored
in the Firestore `mailingListSubscribers` collection using the existing Admin SDK
credentials. Duplicate email addresses keep their original signup date. In `/admin`,
open **Mailing list** to search subscribers, refresh the list, or export all signups
as CSV (including signup time, source, and consent). Subscriber access requires a
CMS session. Email campaigns are sent separately using the exported list.

Run `npm run test:mailing-list` for storage, validation, and access-control checks
against a Firestore test double, and `npx playwright test tests/mailing-list.spec.ts`
for the signup and admin interface checks.

## Production

```bash
npm run build
npm start
```

Legacy URLs such as `/events.html` redirect to their clean equivalents. Content
detail pages use collection and slug paths:

- `/blog/building-trust-into-everyday-digital-commerce`
- `/events/future-of-trusted-digital-commerce`
- `/publications/example-publication`
- `/reports/example-report`
- `/press/example-coverage`

Old query-parameter URLs permanently redirect to these canonical routes.

## Regression checks

Run `npm run typecheck`, `npm run build`, and `npm test`. Tests require Node.js
22.15+ (24 recommended). Install Chromium once with `npx playwright install chromium`.
The browser suite starts its own development server on port 3100 and uses the
configured Firebase project for read-only page/content checks. CMS writes, user
management, uploads, and Firebase sign-in are mocked in browser tests. Repository
transaction tests use an in-memory Firestore double and run separately with
`npm run test:store`.
