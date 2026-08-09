import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { readCmsContent } from "../lib/cms/store";
import { mergeCmsBlogIntro } from "../lib/cms/rich-text";
import type { CmsCollection, CmsContent, CmsEntry } from "../lib/cms/types";

export type PageDefinition = {
  source: string;
  title: string;
  description: string;
  bodyClass: string;
  scripts: string[];
  dynamicHead?: {
    titleSelector: string;
    descriptionSelector: string;
  };
};

export const pages = {
  home: {
    source: "index.html",
    title: "Digital Commerce Coalition",
    description:
      "Strengthening people and planet-positive outcomes in India's digital commerce ecosystem.",
    bodyClass: "",
    scripts: ["members-data.js", "script.js"],
  },
  blog: {
    source: "blog.html",
    title: "Blog",
    description: "Ideas and perspectives from the Digital Commerce Coalition.",
    bodyClass: "blog-page",
    scripts: ["blog-data.js", "script.js"],
  },
  "blog-post": {
    source: "blog-post.html",
    title: "Article",
    description: "An article from the Digital Commerce Coalition.",
    bodyClass: "blog-page blog-post-page",
    scripts: ["blog-data.js", "blog-post.js", "script.js"],
    dynamicHead: {
      titleSelector: "#blog-post-title",
      descriptionSelector: "#blog-post-excerpt",
    },
  },
  "blog-trust": {
    source: "blog-trust.html",
    title: "Building Trust into Everyday Digital Commerce",
    description:
      "Trust is shaped by the small moments that help people understand, choose and resolve issues with confidence.",
    bodyClass: "blog-page trust-article-page",
    scripts: ["blog-data.js", "blog-trust.js", "script.js"],
  },
  events: {
    source: "events.html",
    title: "Events",
    description: "Events from the Digital Commerce Coalition.",
    bodyClass: "events-page",
    scripts: ["events-data.js", "script.js"],
  },
  event: {
    source: "event.html",
    title: "Event",
    description: "An event from the Digital Commerce Coalition.",
    bodyClass: "events-page event-detail-page",
    scripts: ["events-data.js", "event-detail.js", "script.js"],
    dynamicHead: {
      titleSelector: "#event-detail-title",
      descriptionSelector: "#event-detail-summary",
    },
  },
  press: {
    source: "press.html",
    title: "Press",
    description: "Digital Commerce Coalition press coverage.",
    bodyClass: "press-page",
    scripts: ["press-data.js", "script.js"],
  },
  publications: {
    source: "publications.html",
    title: "Publications",
    description: "Publications from the Digital Commerce Coalition.",
    bodyClass: "publications-page",
    scripts: ["publications-data.js", "script.js"],
  },
  publication: {
    source: "publication.html",
    title: "Publication",
    description: "A Digital Commerce Coalition publication.",
    bodyClass: "publication-detail-page",
    scripts: ["publications-data.js", "script.js"],
  },
  reports: {
    source: "reports.html",
    title: "Reports",
    description: "Reports from the Digital Commerce Coalition.",
    bodyClass: "reports-page",
    scripts: ["reports-data.js", "script.js"],
  },
} satisfies Record<string, PageDefinition>;

export type PageKey = keyof typeof pages;

export const contentDetailPages = {
  blog: {
    collection: "blogPosts",
    page: pages["blog-post"],
    indexPath: "/blog",
  },
  events: {
    collection: "events",
    page: pages.event,
    indexPath: "/events",
  },
  publications: {
    collection: "publications",
    page: pages.publication,
    indexPath: "/publications",
  },
  reports: {
    collection: "reports",
    page: {
      source: "content-detail.html",
      title: "Report",
      description: "A report from the Digital Commerce Coalition.",
      bodyClass: "publication-detail-page content-detail-page",
      scripts: ["report-detail-data.js", "content-detail.js", "script.js"],
      dynamicHead: {
        titleSelector: "#content-detail-title",
        descriptionSelector: "#content-detail-description",
      },
    },
    indexPath: "/reports",
  },
  press: {
    collection: "pressCoverage",
    page: {
      source: "content-detail.html",
      title: "Press",
      description: "Press coverage of the Digital Commerce Coalition.",
      bodyClass: "publication-detail-page content-detail-page",
      scripts: ["press-detail-data.js", "content-detail.js", "script.js"],
      dynamicHead: {
        titleSelector: "#content-detail-title",
        descriptionSelector: "#content-detail-description",
      },
    },
    indexPath: "/press",
  },
} satisfies Record<string, { collection: CmsCollection; page: PageDefinition; indexPath: string }>;

export type ContentSection = keyof typeof contentDetailPages;

export const getCmsEntrySlug = (item: CmsEntry) => {
  if ("slug" in item && typeof item.slug === "string" && item.slug.trim()) return item.slug;
  const title = "title" in item ? String(item.title || "") : "";
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

export async function findCmsEntryBySlug(
  collection: CmsCollection,
  slug: string,
  previewId?: string,
) {
  const content = await readCmsContent();
  return (content[collection] as CmsEntry[]).find((item) => {
    const visible = item.publishState !== "draft" || (Boolean(previewId) && item.id === previewId);
    return visible && (getCmsEntrySlug(item) === slug || item.previousSlugs?.includes(slug));
  });
}

export function getCmsEntryMetadata(section: ContentSection, entry: CmsEntry): Metadata {
  const rawDescription =
    "excerpt" in entry ? entry.excerpt :
    "summary" in entry ? entry.summary :
    "description" in entry ? entry.description :
    "publication" in entry ? `${entry.publication}: ${entry.title}` : "";
  const description = String(rawDescription || contentDetailPages[section].page.description)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: "title" in entry ? entry.title : contentDetailPages[section].page.title,
    description,
  };
}

const routeAliases: Record<string, string> = {
  "./index.html": "/",
  "./blog.html": "/blog",
  "./blog-post.html": "/blog",
  "./blog-trust.html": "/blog/building-trust-into-everyday-digital-commerce",
  "./events.html": "/events",
  "./event.html": "/events",
  "./press.html": "/press",
  "./publications.html": "/publications",
  "./publication.html": "/publications",
  "./reports.html": "/reports",
};

const readPageSource = (filename: string) => {
  try {
    return readFileSync(join(process.cwd(), "legacy-html", filename), "utf8");
  } catch (error) {
    console.error(`[LegacyPages] Error reading legacy-html/${filename}:`, error);
    return `<!doctype html><html><body><main><section><h1>Digital Commerce Coalition</h1></section></main></body></html>`;
  }
};

const readRuntimeSource = (filename: string) => {
  try {
    return readFileSync(join(process.cwd(), "public", filename), "utf8");
  } catch (error) {
    console.error(`[LegacyPages] Error reading public/${filename}:`, error);
    return "";
  }
};

const managedScripts: Record<
  string,
  {
    collection: CmsCollection;
    variable: string;
    rendererMarker?: string;
    dataOnly?: boolean;
  }
> = {
  "blog-data.js": {
    collection: "blogPosts",
    variable: "dccBlogPosts",
    rendererMarker: "const createBlogCard",
  },
  "events-data.js": {
    collection: "events",
    variable: "dccEvents",
    rendererMarker: "const createEventCard",
  },
  "press-data.js": {
    collection: "pressCoverage",
    variable: "dccPressCoverage",
    rendererMarker: "const createPressCard",
  },
  "publications-data.js": {
    collection: "publications",
    variable: "dccPublications",
    rendererMarker: "const createPublicationCover",
  },
  "reports-data.js": {
    collection: "reports",
    variable: "dccReports",
    rendererMarker: "const createReportCard",
  },
  "members-data.js": {
    collection: "members",
    variable: "dccMembers",
    rendererMarker: "const renderMembers",
  },
  "report-detail-data.js": {
    collection: "reports",
    variable: "dccContentItems",
    dataOnly: true,
  },
  "press-detail-data.js": {
    collection: "pressCoverage",
    variable: "dccContentItems",
    dataOnly: true,
  },
};

const formatExactDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
};

const formatMonthDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
};

const normalizePublicAssetPaths = <T,>(value: T): T => {
  if (typeof value === "string") {
    return value
      .replace(/^\.\/(assets|uploads)\//, "/$1/")
      .replace(/(["'])\.\/(assets|uploads)\//g, "$1/$2/") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizePublicAssetPaths(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizePublicAssetPaths(item)]),
    ) as T;
  }
  return value;
};

const toPublicItem = (collection: CmsCollection, item: CmsEntry) => {
  const {
    publishState: _publishState,
    id: _id,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    publishedAt: _publishedAt,
    ...rawPublicItem
  } = item;
  const publicItem = normalizePublicAssetPaths(rawPublicItem);
  if (collection === "blogPosts") {
    const post = item as CmsContent["blogPosts"][number];
    const bodyHtml = normalizePublicAssetPaths(mergeCmsBlogIntro(post.intro, post.body));
    const { intro: _intro, ...blogPublicItem } = publicItem as typeof publicItem & { intro?: unknown };
    const words = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return { ...blogPublicItem, date: formatExactDate(post.date), bodyHtml, readingTime: `${Math.max(1, Math.ceil(words / 220))} min read` };
  }
  if (collection === "events") {
    const event = item as CmsContent["events"][number];
    const match = event.eventDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    return {
      ...publicItem,
      day: date ? String(date.getUTCDate()) : "",
      month: date ? new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date) : "",
      year: date ? String(date.getUTCFullYear()) : "",
      href: `/events/${encodeURIComponent(event.slug)}`,
      bodyHtml: normalizePublicAssetPaths(String(event.body || "")),
      description: String(event.body || "").replace(/<[^>]+>/g, ""),
    };
  }
  if (collection === "publications") {
    const publication = item as CmsContent["publications"][number];
    return { ...publicItem, date: formatMonthDate(publication.date), bodyHtml: normalizePublicAssetPaths(publication.body) };
  }
  if (collection === "reports") {
    return {
      ...publicItem,
      slug: getCmsEntrySlug(item),
      contentKind: "report",
      date: formatMonthDate(String((publicItem as { date?: string }).date || "")),
    };
  }
  if (collection === "pressCoverage") {
    return {
      ...publicItem,
      slug: getCmsEntrySlug(item),
      contentKind: "press",
      date: formatExactDate(String((publicItem as { date?: string }).date || "")),
    };
  }
  return publicItem;
};

const getPublishedContent = (
  collection: CmsCollection,
  value: CmsContent[CmsCollection],
  previewId?: string,
) => {
  const isPublished = (item: unknown) =>
    !item ||
    typeof item !== "object" ||
    !("publishState" in item) ||
    (item as { publishState?: string; id?: string }).publishState !== "draft" ||
    (Boolean(previewId) && (item as { id?: string }).id === previewId);

  if (collection === "events") {
    const events = (value as CmsContent["events"]).filter(isPublished);
    const todayParts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => todayParts.find((item) => item.type === type)?.value || "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    return {
      upcoming: events.filter((event) => event.eventDate >= today).map((event) => toPublicItem(collection, event)),
      past: events.filter((event) => event.eventDate < today).map((event) => toPublicItem(collection, event)),
    };
  }

  return (value as CmsEntry[]).filter(isPublished).map((item) => toPublicItem(collection, item));
};

const getRuntimeScript = (filename: string, content: CmsContent, previewId?: string) => {
  const managedScript = managedScripts[filename];
  if (!managedScript) return readRuntimeSource(filename);

  const publicContent = getPublishedContent(
    managedScript.collection,
    content[managedScript.collection],
    previewId,
  );
  if (managedScript.dataOnly) {
    return `const ${managedScript.variable} = ${JSON.stringify(publicContent, null, 2)};`;
  }

  const source = readRuntimeSource(filename);
  if (!managedScript.rendererMarker) {
    throw new Error(`Could not find the renderer configuration for ${filename}`);
  }
  const rendererStart = source.indexOf(managedScript.rendererMarker);
  if (rendererStart < 0) {
    throw new Error(`Could not find the renderer in ${filename}`);
  }

  return `const ${managedScript.variable} = ${JSON.stringify(
    publicContent,
    null,
    2,
  )};\n\n${source.slice(rendererStart)}`;
};

export function getPageMarkup(page: PageDefinition) {
  const source = readPageSource(page.source);
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];

  if (!body) {
    throw new Error(`Could not find a body element in ${page.source}`);
  }

  let markup = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  for (const [legacyUrl, nextUrl] of Object.entries(routeAliases)) {
    markup = markup.replaceAll(legacyUrl, nextUrl);
  }

  return markup.replaceAll('"./assets/', '"/assets/');
}

export async function getPageRuntime(page: PageDefinition, previewId?: string) {
  const content = page.scripts.some((script) => managedScripts[script])
    ? await readCmsContent()
    : null;
  const source = page.scripts
    .map((script) =>
      content ? getRuntimeScript(script, content, previewId) : readRuntimeSource(script),
    )
    .join("\n\n");
  return `(function () {\n${source}\n})();`.replaceAll("</script", "<\\/script");
}

export function getBodyClassScript(bodyClass: string) {
  return `document.body.className=${JSON.stringify(bodyClass)};`;
}

export function getMetadata(page: PageDefinition): Metadata {
  return {
    title: page.title === "Digital Commerce Coalition" ? { absolute: page.title } : page.title,
    description: page.description,
  };
}
