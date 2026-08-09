import { notFound, permanentRedirect } from "next/navigation";
import { PageView } from "../page-view";
import { getMetadata, pages, type PageKey } from "../legacy-pages";

type RouteProps = {
  params: Promise<{ page: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const isPageKey = (value: string): value is Exclude<PageKey, "home"> =>
  value !== "home" && value in pages;

export function generateStaticParams() {
  return Object.keys(pages)
    .filter((page) => page !== "home")
    .map((page) => ({ page }));
}

export async function generateMetadata({ params }: RouteProps) {
  const { page } = await params;
  return isPageKey(page) ? getMetadata(pages[page]) : {};
}

const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const legacyDetailTarget = (
  page: string,
  query: Record<string, string | string[] | undefined>,
) => {
  const mappings: Record<string, { section: string; keys: string[]; fallback: string }> = {
    "blog-post": { section: "blog", keys: ["post", "slug"], fallback: "/blog" },
    event: { section: "events", keys: ["event", "slug"], fallback: "/events" },
    "event-page": { section: "events", keys: ["event", "slug"], fallback: "/events" },
    publication: { section: "publications", keys: ["slug", "publication"], fallback: "/publications" },
    report: { section: "reports", keys: ["report", "slug"], fallback: "/reports" },
    "press-release": { section: "press", keys: ["release", "press", "slug"], fallback: "/press" },
  };
  const aliases: Record<string, { section: string; keys: string[] }> = {
    blog: { section: "blog", keys: ["post"] },
    events: { section: "events", keys: ["event"] },
    publications: { section: "publications", keys: ["publication", "slug"] },
    reports: { section: "reports", keys: ["report", "slug"] },
    press: { section: "press", keys: ["release", "press", "slug"] },
  };
  const mapping = mappings[page] || aliases[page];
  if (!mapping) return null;
  const slug = mapping.keys.map((key) => firstValue(query[key])).find(Boolean);
  if (!slug) return "fallback" in mapping ? mapping.fallback : null;
  const preview = firstValue(query.cmsPreview);
  return `/${mapping.section}/${encodeURIComponent(slug)}${preview ? `?cmsPreview=${encodeURIComponent(preview)}` : ""}`;
};

export default async function RoutedPage({ params, searchParams }: RouteProps) {
  const { page } = await params;
  const query = await searchParams;
  if (page === "blog-trust") permanentRedirect("/blog/building-trust-into-everyday-digital-commerce");
  const legacyTarget = legacyDetailTarget(page, query);
  if (legacyTarget) permanentRedirect(legacyTarget);
  const cmsPreview = firstValue(query.cmsPreview);

  if (!isPageKey(page)) notFound();

  return <PageView page={pages[page]} requestedPreviewId={cmsPreview} />;
}
