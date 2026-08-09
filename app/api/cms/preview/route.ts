import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "../../../../lib/cms/auth";
import { readCmsContent } from "../../../../lib/cms/store";
import type { CmsCollection, CmsEntry } from "../../../../lib/cms/types";
import { getCmsEntrySlug } from "../../../legacy-pages";

export const dynamic = "force-dynamic";

const collections = new Set<CmsCollection>(["blogPosts", "events", "pressCoverage", "publications", "reports", "members"]);

const previewUrl = (collection: CmsCollection, entry: CmsEntry) => {
  const id = encodeURIComponent(entry.id);
  const slug = encodeURIComponent(getCmsEntrySlug(entry));
  if (collection === "blogPosts") return `/blog/${slug}?cmsPreview=${id}`;
  if (collection === "events") return `/events/${slug}?cmsPreview=${id}`;
  if (collection === "publications") return `/publications/${slug}?cmsPreview=${id}`;
  if (collection === "reports") return `/reports/${slug}?cmsPreview=${id}`;
  if (collection === "members") return `/?cmsPreview=${id}#council`;
  return `/press/${slug}?cmsPreview=${id}`;
};

export async function GET(request: Request) {
  if (!(await isCmsAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(request.url);
  const mode = await draftMode();
  if (url.searchParams.get("disable") === "1") {
    mode.disable();
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  const collection = url.searchParams.get("collection") as CmsCollection | null;
  const id = url.searchParams.get("id");
  if (!collection || !collections.has(collection) || !id) {
    return NextResponse.json({ error: "Choose an entry to preview." }, { status: 400 });
  }
  const content = await readCmsContent();
  const entry = (content[collection] as CmsEntry[]).find((item) => item.id === id);
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  mode.enable();
  return NextResponse.redirect(new URL(previewUrl(collection, entry), request.url));
}
