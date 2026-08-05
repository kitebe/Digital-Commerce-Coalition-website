import { NextResponse } from "next/server";
import { isCmsAuthenticated } from "../../../../lib/cms/auth";
import {
  cmsRepository,
  CmsConflictError,
  CmsValidationError,
  type SaveAction,
} from "../../../../lib/cms/store";
import type { CmsCollection } from "../../../../lib/cms/types";

export const dynamic = "force-dynamic";

const collections = new Set<CmsCollection>([
  "blogPosts", "events", "pressCoverage", "publications", "reports", "members",
]);
const actions = new Set<SaveAction>(["save-draft", "publish", "save-published", "unpublish"]);

const unauthorized = () => NextResponse.json({ error: "Unauthorized." }, { status: 401 });
const parseBody = async (request: Request) =>
  (await request.json().catch(() => null)) as Record<string, unknown> | null;
const getCollection = (body: Record<string, unknown> | null) =>
  typeof body?.collection === "string" && collections.has(body.collection as CmsCollection)
    ? body.collection as CmsCollection
    : null;
const respondToError = (error: unknown) => {
  if (error instanceof CmsConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof CmsValidationError) {
    return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 400 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Could not save content." },
    { status: 400 },
  );
};

export async function GET() {
  if (!(await isCmsAuthenticated())) return unauthorized();
  return NextResponse.json(cmsRepository.read(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await isCmsAuthenticated())) return unauthorized();
  const body = await parseBody(request);
  const collection = getCollection(body);
  const action = body?.action;
  if (!collection || !action || typeof action !== "string" || !actions.has(action as SaveAction) || !body?.item || typeof body.item !== "object") {
    return NextResponse.json({ error: "Invalid create request." }, { status: 400 });
  }
  try {
    const content = await cmsRepository.create(collection, body.item as Record<string, unknown>, action as SaveAction);
    return NextResponse.json({ content, savedAt: new Date().toISOString() }, { status: 201 });
  } catch (error) {
    return respondToError(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await isCmsAuthenticated())) return unauthorized();
  const body = await parseBody(request);
  const collection = getCollection(body);
  if (!collection) return NextResponse.json({ error: "Unknown collection." }, { status: 400 });
  try {
    if (body?.action === "reorder") {
      if (!Array.isArray(body.orderedIds) || !body.orderedIds.every((id) => typeof id === "string")) {
        return NextResponse.json({ error: "Invalid display order." }, { status: 400 });
      }
      const content = await cmsRepository.reorder(collection, body.orderedIds);
      return NextResponse.json({ content, savedAt: new Date().toISOString() });
    }
    if (
      typeof body?.id !== "string" || typeof body.version !== "number" ||
      typeof body.action !== "string" || !actions.has(body.action as SaveAction) ||
      !body.item || typeof body.item !== "object"
    ) {
      return NextResponse.json({ error: "Invalid update request." }, { status: 400 });
    }
    const content = await cmsRepository.update(
      collection, body.id, body.version, body.item as Record<string, unknown>, body.action as SaveAction,
    );
    return NextResponse.json({ content, savedAt: new Date().toISOString() });
  } catch (error) {
    return respondToError(error);
  }
}

export async function DELETE(request: Request) {
  if (!(await isCmsAuthenticated())) return unauthorized();
  const body = await parseBody(request);
  const collection = getCollection(body);
  if (!collection || typeof body?.id !== "string" || typeof body.version !== "number") {
    return NextResponse.json({ error: "Invalid delete request." }, { status: 400 });
  }
  try {
    const content = await cmsRepository.delete(collection, body.id, body.version);
    return NextResponse.json({ content, savedAt: new Date().toISOString() });
  } catch (error) {
    return respondToError(error);
  }
}
