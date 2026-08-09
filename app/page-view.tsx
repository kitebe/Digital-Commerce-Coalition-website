import { draftMode } from "next/headers";
import type { PageDefinition } from "./legacy-pages";
import { LegacyRuntime } from "./legacy-runtime";
import {
  getBodyClassScript,
  getPageMarkup,
  getPageRuntime,
} from "./legacy-pages";

export async function PageView({ page, requestedPreviewId }: { page: PageDefinition; requestedPreviewId?: string }) {
  let previewId: string | undefined = undefined;
  try {
    const preview = await draftMode();
    if (preview.isEnabled) previewId = requestedPreviewId;
  } catch {
    // Ignore draftMode resolution errors
  }
  const markup = getPageMarkup(page);
  const runtime = await getPageRuntime(page, previewId);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: getBodyClassScript(page.bodyClass) }} />
      <div className="next-page-root" dangerouslySetInnerHTML={{ __html: markup }} />
      <LegacyRuntime
        pageKey={page.source}
        runtime={runtime}
        dynamicHead={page.dynamicHead}
      />
    </>
  );
}
