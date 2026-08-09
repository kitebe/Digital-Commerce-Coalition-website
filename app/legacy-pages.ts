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

const routeAliases: Record<string, string> = {
  "./index.html": "/",
  "./blog.html": "/blog",
  "./blog-post.html": "/blog-post",
  "./blog-trust.html": "/blog-trust",
  "./events.html": "/events",
  "./event.html": "/event",
  "./press.html": "/press",
  "./publications.html": "/publications",
  "./publication.html": "/publication",
  "./reports.html": "/reports",
};

const readPageSource = (filename: string) =>
  readFileSync(join(process.cwd(), "legacy-html", filename), "utf8");

const readRuntimeSource = (filename: string) =>
  readFileSync(join(process.cwd(), "public", filename), "utf8");

const managedScripts: Record<
  string,
  {
    collection: CmsCollection;
    variable: string;
    rendererMarker: string;
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

const toPublicItem = (collection: CmsCollection, item: CmsEntry) => {
  const {
    publishState: _publishState,
    id: _id,
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    publishedAt: _publishedAt,
    ...publicItem
  } = item;
  if (collection === "blogPosts") {
    const post = item as CmsContent["blogPosts"][number];
    const bodyHtml = mergeCmsBlogIntro(post.intro, post.body);
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
      href: `./event.html?event=${event.slug}`,
      bodyHtml: String(event.body || ""),
      description: String(event.body || "").replace(/<[^>]+>/g, ""),
    };
  }
  if (collection === "publications") {
    const publication = item as CmsContent["publications"][number];
    return { ...publicItem, date: formatMonthDate(publication.date), bodyHtml: publication.body };
  }
  if (collection === "reports") {
    return { ...publicItem, date: formatMonthDate(String((publicItem as { date?: string }).date || "")) };
  }
  if (collection === "pressCoverage") {
    return { ...publicItem, date: formatExactDate(String((publicItem as { date?: string }).date || "")) };
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
  const source = readRuntimeSource(filename);
  const managedScript = managedScripts[filename];
  if (!managedScript) return source;

  const rendererStart = source.indexOf(managedScript.rendererMarker);
  if (rendererStart < 0) {
    throw new Error(`Could not find the renderer in ${filename}`);
  }

  return `const ${managedScript.variable} = ${JSON.stringify(
    getPublishedContent(
      managedScript.collection,
      content[managedScript.collection],
      previewId,
    ),
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
