import { PageView } from "./page-view";
import { getMetadata, pages } from "./legacy-pages";

export const metadata = getMetadata(pages.home);

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cmsPreview?: string }> }) {
  const { cmsPreview } = await searchParams;
  return <PageView page={pages.home} requestedPreviewId={cmsPreview} />;
}
