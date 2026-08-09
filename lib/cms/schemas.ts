import { z } from "zod";
import type {
  CmsCollection,
  CmsEntry,
  PublishState,
  RichTextNode,
} from "./types";

const safeString = z.string().max(20_000);
const shortString = z.string().max(500);
const workflowSchema = z.object({
  id: z.string().min(1).max(100),
  version: z.number().int().min(1),
  publishState: z.enum(["draft", "published"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  previousSlugs: z.array(z.string().max(120)).max(25).optional(),
});

const allowedNodes = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem",
  "blockquote", "codeBlock", "horizontalRule", "hardBreak", "table", "tableRow",
  "tableHeader", "tableCell", "figureImage", "youtube",
]);
const allowedMarks = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
const isSafeLink = (value: unknown) =>
  typeof value === "string" && /^(https?:\/\/|mailto:|\/)/i.test(value);
const isSafeAsset = (value: unknown) =>
  typeof value === "string" && /^(\/uploads\/|\.\/assets\/|\/assets\/)/.test(value);
const isYoutube = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return ["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host);
  } catch {
    return false;
  }
};

const validateRichNode = (node: RichTextNode, issues: string[], depth = 0) => {
  if (depth > 12) {
    issues.push("Rich content is nested too deeply.");
    return;
  }
  if (!node.type || !allowedNodes.has(node.type)) {
    issues.push(`Unsupported rich-text block: ${node.type || "unknown"}.`);
    return;
  }
  if (node.text && node.text.length > 20_000) issues.push("A rich-text node is too long.");
  node.marks?.forEach((mark: { type: string; attrs?: Record<string, unknown> }) => {
    if (!allowedMarks.has(mark.type)) issues.push(`Unsupported text style: ${mark.type}.`);
    if (mark.type === "link" && !isSafeLink(mark.attrs?.href)) {
      issues.push("Rich-text links must use http, https, mailto, or an internal path.");
    }
  });
  if (node.type === "figureImage") {
    if (!isSafeAsset(node.attrs?.src)) issues.push("Inline images must use an uploaded website asset.");
    if (!String(node.attrs?.alt || "").trim()) issues.push("Inline images require alternative text.");
  }
  if (node.type === "youtube" && !isYoutube(node.attrs?.src)) {
    issues.push("Only YouTube video URLs can be embedded.");
  }
  node.content?.forEach((child: RichTextNode) => validateRichNode(child, issues, depth + 1));
};

export const richTextDocumentSchema = safeString;

const commonSlug = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");
const exactDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a complete date.");
const monthDate = z.string().regex(/^\d{4}-\d{2}$/, "Choose a month and year.");
const stringList = z.array(shortString).max(100);

export const entrySchemas = {
  blogPosts: workflowSchema.extend({
    slug: commonSlug.or(z.literal("")), date: exactDate.or(z.literal("")), category: shortString,
    title: shortString, excerpt: safeString, author: shortString, image: shortString,
    imageAlt: shortString, intro: safeString.optional(), body: safeString, takeaways: stringList,
  }),
  events: workflowSchema.extend({
    slug: commonSlug.or(z.literal("")), eventDate: exactDate.or(z.literal("")).optional(), format: shortString.optional(),
    title: shortString, summary: safeString.optional(), location: shortString.optional(), image: shortString.optional(),
    imageAlt: shortString.optional(), body: safeString.optional(), topics: stringList.optional(), linkLabel: shortString.optional(),
    aboutEyebrow: shortString.optional(), aboutHeading: shortString.optional(), topicsHeading: shortString.optional(),
  }),
  pressCoverage: workflowSchema.extend({
    publication: shortString, date: exactDate.or(z.literal("")), title: shortString, url: safeString,
  }),
  publications: workflowSchema.extend({
    slug: commonSlug.or(z.literal("")), type: shortString.optional(), date: exactDate.or(z.literal("")).optional(),
    title: shortString, shortTitle: shortString.optional(), description: safeString.optional(), body: safeString.optional(),
    coverImage: shortString.optional(), accent: z.enum(["cyan", "lavender", "violet"]).optional(),
    pdf: safeString.nullable().optional(), pages: shortString.nullable().optional(), themes: stringList.optional(),
  }),
  reports: workflowSchema.extend({
    type: shortString.optional(), date: exactDate.or(z.literal("")).optional(), title: shortString,
    description: safeString.optional(), coverImage: shortString.optional(), pdf: safeString.nullable().optional(),
  }),
  members: workflowSchema.extend({ name: shortString, logo: shortString, logoAlt: shortString }),
} satisfies Record<CmsCollection, z.ZodType>;

export type CmsFieldErrors = Record<string, string>;

const required = (errors: CmsFieldErrors, item: Record<string, unknown>, fields: string[]) => {
  fields.forEach((field) => {
    if (!String(item[field] ?? "").trim()) errors[field] = "This field is required before publishing.";
  });
};

export function validateCmsEntry(
  collection: CmsCollection,
  value: unknown,
  publishState: PublishState,
  peers: CmsEntry[],
): { entry?: CmsEntry; fieldErrors: CmsFieldErrors; error?: string } {
  const parsed = entrySchemas[collection].safeParse(value);
  if (!parsed.success) {
    const fieldErrors: CmsFieldErrors = {};
    parsed.error.issues.forEach((issue) => {
      const key = String(issue.path[0] || "content");
      fieldErrors[key] ||= issue.message;
    });
    return { fieldErrors, error: "Check the highlighted fields." };
  }

  const entry = parsed.data as CmsEntry;
  const record = entry as unknown as Record<string, unknown>;
  const fieldErrors: CmsFieldErrors = {};
  if (publishState === "published") {
    if (collection === "blogPosts") required(fieldErrors, record, ["title", "slug", "date", "category", "excerpt", "author", "image", "imageAlt"]);
    if (collection === "events") required(fieldErrors, record, ["title", "slug", "eventDate", "format", "summary", "location", "image", "imageAlt"]);
    if (collection === "publications") required(fieldErrors, record, ["title", "shortTitle", "slug", "type", "date", "description", "coverImage"]);
    if (collection === "reports") required(fieldErrors, record, ["title", "type", "date", "description", "coverImage"]);
    if (collection === "pressCoverage") required(fieldErrors, record, ["title", "publication", "date", "url"]);
    if (collection === "members") required(fieldErrors, record, ["name", "logo", "logoAlt"]);

    if ((collection === "blogPosts" || collection === "events") && String(record.body || "").length < 10) {
      fieldErrors.body = "Add meaningful content before publishing.";
    }
    if (collection === "pressCoverage") {
      try {
        const url = new URL(String(record.url));
        if (!/^https?:$/.test(url.protocol)) throw new Error();
      } catch {
        fieldErrors.url = "Enter a complete http or https URL.";
      }
    }
  }

  if ("slug" in record && record.slug) {
    const slug = String(record.slug);
    const duplicate = peers.some((peer) => peer.id !== entry.id && "slug" in peer && peer.slug === slug);
    if (duplicate) fieldErrors.slug = "This slug is already in use.";
  }

  return Object.keys(fieldErrors).length
    ? { fieldErrors, error: "Check the highlighted fields." }
    : { entry, fieldErrors };
}
