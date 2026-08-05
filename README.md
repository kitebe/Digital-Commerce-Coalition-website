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

Copy `.env.example` to `.env.local`, choose a strong password and secret, then
restart the server. Open [http://localhost:3000/admin](http://localhost:3000/admin)
to manage articles, events, publications, reports, and press coverage.

The content studio includes rich-text article and detail editing, draft and
published states, authenticated previews, locked URL slugs, date/month pickers,
conflict-safe item updates, and homepage member management. Rich text supports
headings, lists, links, quotes, code, tables, uploaded images, and YouTube
embeds.

CMS content is stored atomically in `data/cms-content.json`. Uploaded images and
PDFs are stored in `public/uploads`. This storage model is intended for a
persistent Node.js host; serverless hosts with ephemeral filesystems should use
an external database and object store before production deployment.

The initial CMS content was migrated from the original JavaScript data files.
To intentionally recreate the CMS data from those files, run `npm run seed:cms`.
The seed command also upgrades the generated data to the current versioned CMS
schema. Existing version-one data can be upgraded independently with
`npm run migrate:cms-v2`; the migration is idempotent and creates a backup
before changing the content file.

## Production

```bash
npm run build
npm start
```

Legacy URLs such as `/events.html` redirect to their clean equivalents, such as
`/events`. Detail pages continue to accept their existing query parameters:

- `/event?event=future-of-trusted-digital-commerce`
- `/blog-post?post=building-trust-into-everyday-digital-commerce`

Publication detail URLs use `/publication?slug=...`. Until a publication has a
PDF configured in `public/publications-data.js`, its detail URL intentionally
redirects back to `/publications`.
