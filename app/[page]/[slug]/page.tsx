import { draftMode, headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { PageView } from "../../page-view";
import {
  contentDetailPages,
  findCmsEntryBySlug,
  getCmsEntryMetadata,
  getCmsEntrySlug,
  getMetadata,
  pages,
  type ContentSection,
} from "../../legacy-pages";

type DetailRouteProps = {
  params: Promise<{ page: string; slug: string }>;
  searchParams: Promise<{ cmsPreview?: string }>;
};

export const dynamic = "force-dynamic";

const isContentSection = (value: string): value is ContentSection => value in contentDetailPages;
const trustArticleSlug = "building-trust-into-everyday-digital-commerce";

const isTrustArticleFallback = async (props: DetailRouteProps) => {
  const { page, slug } = await props.params;
  return page === "blog" && slug === trustArticleSlug;
};

const getRouteEntry = async ({ params, searchParams }: DetailRouteProps) => {
  const { page, slug } = await params;
  if (!isContentSection(page)) return null;
  const preview = await draftMode();
  const { cmsPreview } = await searchParams;
  const previewId = preview.isEnabled ? cmsPreview : undefined;
  const entry = await findCmsEntryBySlug(contentDetailPages[page].collection, slug, previewId);
  return entry ? { section: page, slug, entry, previewId } : null;
};

export async function generateMetadata(props: DetailRouteProps) {
  const route = await getRouteEntry(props);
  if (!route) return (await isTrustArticleFallback(props)) ? getMetadata(pages["blog-trust"]) : {};
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const canonicalPath = `/${route.section}/${encodeURIComponent(getCmsEntrySlug(route.entry))}`;
  return {
    ...getCmsEntryMetadata(route.section, route.entry),
    ...(host ? { alternates: { canonical: `${protocol}://${host}${canonicalPath}` } } : {}),
  };
}

export default async function ContentDetailRoute(props: DetailRouteProps) {
  const route = await getRouteEntry(props);
  if (!route) {
    if (await isTrustArticleFallback(props)) return <PageView page={pages["blog-trust"]} />;
    notFound();
  }

  const canonicalSlug = getCmsEntrySlug(route.entry);
  if (route.slug !== canonicalSlug) {
    const previewQuery = route.previewId ? `?cmsPreview=${encodeURIComponent(route.previewId)}` : "";
    permanentRedirect(`/${route.section}/${encodeURIComponent(canonicalSlug)}${previewQuery}`);
  }

  return (
    <PageView
      page={contentDetailPages[route.section].page}
      requestedPreviewId={route.previewId}
    />
  );
}
