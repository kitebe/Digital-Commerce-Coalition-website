import { draftMode } from "next/headers";
import type { PageDefinition } from "./legacy-pages";
import { LegacyRuntime } from "./legacy-runtime";
import {
  getBodyClassScript,
  getPageMarkup,
  getPageRuntime,
} from "./legacy-pages";

export async function PageView({ page, requestedPreviewId }: { page: PageDefinition; requestedPreviewId?: string }) {
  const preview = await draftMode();
  const previewId = preview.isEnabled ? requestedPreviewId : undefined;
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
