import "server-only";

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCmsEntry, type CmsFieldErrors } from "./schemas";
import type { CmsCollection, CmsContent, CmsEntry, PublishState } from "./types";

const contentPath = join(process.cwd(), "data", "cms-content.json");

export class CmsConflictError extends Error {}
export class CmsValidationError extends Error {
  constructor(message: string, public fieldErrors: CmsFieldErrors) {
    super(message);
  }
}

export type SaveAction = "save-draft" | "publish" | "save-published" | "unpublish";

export interface CmsRepository {
  read(): CmsContent;
  create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent>;
  update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent>;
  delete(collection: CmsCollection, id: string, version: number): Promise<CmsContent>;
  reorder(collection: CmsCollection, orderedIds: string[]): Promise<CmsContent>;
}

let writeQueue = Promise.resolve();
const enqueue = <T>(operation: () => T) => {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
};

const getCollection = (content: CmsContent, collection: CmsCollection): CmsEntry[] =>
  content[collection] as CmsEntry[];

const writeContent = (content: CmsContent) => {
  const serialized = `${JSON.stringify(content, null, 2)}\n`;
  if (serialized.length > 5_000_000) throw new Error("The CMS content file exceeds the 5 MB limit.");
  const temporaryPath = `${contentPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, serialized, "utf8");
  renameSync(temporaryPath, contentPath);
};

const desiredState = (action: SaveAction, current?: PublishState): PublishState => {
  if (action === "publish" || action === "save-published") return "published";
  if (action === "unpublish" || action === "save-draft") return "draft";
  return current || "draft";
};

class FileCmsRepository implements CmsRepository {
  read() {
    const content = JSON.parse(readFileSync(contentPath, "utf8")) as CmsContent;
    if (content.schemaVersion !== 2) {
      throw new Error("CMS data needs migration. Run npm run migrate:cms-v2.");
    }
    return content;
  }

  create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction) {
    return enqueue(() => {
      const content = this.read();
      const peers = getCollection(content, collection);
      const now = new Date().toISOString();
      const publishState = desiredState(action);
      const candidate = {
        ...value,
        id: randomUUID(),
        version: 1,
        publishState,
        createdAt: now,
        updatedAt: now,
        ...(publishState === "published" ? { publishedAt: now } : {}),
      };
      const validation = validateCmsEntry(collection, candidate, publishState, peers);
      if (!validation.entry) throw new CmsValidationError(validation.error || "Invalid content.", validation.fieldErrors);
      const next = { ...content, [collection]: [...peers, validation.entry] } as CmsContent;
      writeContent(next);
      return next;
    });
  }

  update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction) {
    return enqueue(() => {
      const content = this.read();
      const peers = getCollection(content, collection);
      const index = peers.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Entry not found.");
      const current = peers[index];
      if (current.version !== version) throw new CmsConflictError("This entry changed in another session. Reload before saving again.");

      const now = new Date().toISOString();
      const publishState = desiredState(action, current.publishState);
      const oldSlug = "slug" in current ? current.slug : undefined;
      const newSlug = "slug" in value ? String(value.slug || "") : undefined;
      const previousSlugs = oldSlug && newSlug && oldSlug !== newSlug
        ? Array.from(new Set([...(current.previousSlugs || []), oldSlug])).slice(-25)
        : current.previousSlugs;
      const candidate = {
        ...current,
        ...value,
        id: current.id,
        version: current.version + 1,
        publishState,
        createdAt: current.createdAt,
        updatedAt: now,
        ...(publishState === "published" ? { publishedAt: current.publishedAt || now } : {}),
        ...(previousSlugs?.length ? { previousSlugs } : {}),
      };
      const validation = validateCmsEntry(collection, candidate, publishState, peers);
      if (!validation.entry) throw new CmsValidationError(validation.error || "Invalid content.", validation.fieldErrors);
      const nextItems = peers.map((entry, entryIndex) => entryIndex === index ? validation.entry! : entry);
      const next = { ...content, [collection]: nextItems } as CmsContent;
      writeContent(next);
      return next;
    });
  }

  delete(collection: CmsCollection, id: string, version: number) {
    return enqueue(() => {
      const content = this.read();
      const peers = getCollection(content, collection);
      const current = peers.find((entry) => entry.id === id);
      if (!current) throw new Error("Entry not found.");
      if (current.version !== version) throw new CmsConflictError("This entry changed in another session. Reload before deleting it.");
      const next = { ...content, [collection]: peers.filter((entry) => entry.id !== id) } as CmsContent;
      writeContent(next);
      return next;
    });
  }

  reorder(collection: CmsCollection, orderedIds: string[]) {
    return enqueue(() => {
      const content = this.read();
      const peers = getCollection(content, collection);
      if (orderedIds.length !== peers.length || new Set(orderedIds).size !== peers.length) {
        throw new Error("The display order is incomplete.");
      }
      const byId = new Map(peers.map((entry) => [entry.id, entry]));
      const ordered = orderedIds.map((id) => byId.get(id));
      if (ordered.some((entry) => !entry)) throw new Error("The display order contains an unknown entry.");
      const next = { ...content, [collection]: ordered as CmsEntry[] } as CmsContent;
      writeContent(next);
      return next;
    });
  }
}

export const cmsRepository: CmsRepository = new FileCmsRepository();
export const readCmsContent = () => cmsRepository.read();
