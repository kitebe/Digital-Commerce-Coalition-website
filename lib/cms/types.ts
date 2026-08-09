export type PublishState = "draft" | "published";

export type RichTextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
};

export type RichTextDocument = RichTextNode & {
  type: "doc";
};

export type EditorialWorkflow = {
  id: string;
  version: number;
  publishState: PublishState;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  previousSlugs?: string[];
};

export type BlogPost = EditorialWorkflow & {
  slug: string;
  date: string;
  category: string;
  title: string;
  excerpt: string;
  author: string;
  image: string;
  imageAlt: string;
  /** Retained temporarily so older CMS entries can be migrated into the body. */
  intro?: string;
  body: string;
  takeaways: string[];
};

export type CmsEvent = EditorialWorkflow & {
  slug: string;
  eventDate: string;
  format: string;
  title: string;
  summary: string;
  location: string;
  image: string;
  imageAlt: string;
  body: string;
  topics: string[];
  linkLabel: string;
  aboutEyebrow?: string;
  aboutHeading?: string;
  topicsHeading?: string;
};

export type PressCoverage = EditorialWorkflow & {
  slug: string;
  publication: string;
  date: string;
  title: string;
  url: string;
};

export type Publication = EditorialWorkflow & {
  slug: string;
  type: string;
  date: string;
  title: string;
  shortTitle: string;
  description: string;
  body: string;
  coverImage: string;
  accent: "cyan" | "lavender" | "violet";
  pdf: string | null;
  pages: string | null;
  themes: string[];
};

export type Report = EditorialWorkflow & {
  slug: string;
  type: string;
  date: string;
  title: string;
  description: string;
  coverImage: string;
  pdf: string | null;
};

export type Member = EditorialWorkflow & {
  name: string;
  logo: string;
  logoAlt: string;
};

export type CmsContent = {
  schemaVersion: 2;
  blogPosts: BlogPost[];
  events: CmsEvent[];
  pressCoverage: PressCoverage[];
  publications: Publication[];
  reports: Report[];
  members: Member[];
};

export type CmsCollection = Exclude<keyof CmsContent, "schemaVersion">;
export type CmsEntry = CmsContent[CmsCollection][number];
