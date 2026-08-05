import { notFound } from "next/navigation";
import { PageView } from "../page-view";
import { getMetadata, pages, type PageKey } from "../legacy-pages";

type RouteProps = {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ cmsPreview?: string }>;
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

export default async function RoutedPage({ params, searchParams }: RouteProps) {
  const { page } = await params;
  const { cmsPreview } = await searchParams;

  if (!isPageKey(page)) notFound();

  return <PageView page={pages[page]} requestedPreviewId={cmsPreview} />;
}
