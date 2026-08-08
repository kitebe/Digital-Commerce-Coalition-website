import "server-only";

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCmsEntry, type CmsFieldErrors } from "./schemas";
import type { CmsCollection, CmsContent, CmsEntry, PublishState } from "./types";
import { getFirestoreDb } from "./firebase-server";
import type { Transaction } from "firebase-admin/firestore";

const contentPath = join(process.cwd(), "data", "cms-content.json");

export class CmsConflictError extends Error {}
export class CmsValidationError extends Error {
  constructor(message: string, public fieldErrors: CmsFieldErrors) {
    super(message);
  }
}

export type SaveAction = "save-draft" | "publish" | "save-published" | "unpublish";

export interface CmsRepository {
  read(): Promise<CmsContent>;
  create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent>;
  update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent>;
  delete(collection: CmsCollection, id: string, version: number): Promise<CmsContent>;
  reorder(collection: CmsCollection, orderedIds: string[]): Promise<CmsContent>;
}

let writeQueue = Promise.resolve<any>(undefined);
const enqueue = <T>(operation: () => Promise<T> | T): Promise<T> => {
  const result = writeQueue.then(operation);
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
  async read() {
    const content = JSON.parse(readFileSync(contentPath, "utf8")) as CmsContent;
    if (content.schemaVersion !== 2) {
      throw new Error("CMS data needs migration. Run npm run migrate:cms-v2.");
    }
    return content;
  }

  create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction) {
    return enqueue(async () => {
      const content = await this.read();
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
    return enqueue(async () => {
      const content = await this.read();
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
    return enqueue(async () => {
      const content = await this.read();
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
    return enqueue(async () => {
      const content = await this.read();
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

class FirebaseCmsRepository implements CmsRepository {
  async read(): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    const docRef = db.collection("cms").doc("content");
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      let content: CmsContent;
      try {
        const fileRepo = new FileCmsRepository();
        content = await fileRepo.read();
      } catch (e) {
        content = {
          schemaVersion: 2,
          blogPosts: [],
          events: [],
          publications: [],
          reports: [],
          pressCoverage: [],
          members: [],
        };
      }
      await docRef.set(JSON.parse(JSON.stringify(content)));
      return content;
    }
    return docSnap.data() as CmsContent;
  }

  async create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    const docRef = db.collection("cms").doc("content");
    return await db.runTransaction(async (transaction: Transaction) => {
      const docSnap = await transaction.get(docRef);
      let content: CmsContent;
      if (!docSnap.exists) {
        try {
          const fileRepo = new FileCmsRepository();
          content = await fileRepo.read();
        } catch (e) {
          content = {
            schemaVersion: 2,
            blogPosts: [],
            events: [],
            publications: [],
            reports: [],
            pressCoverage: [],
            members: [],
          };
        }
      } else {
        content = docSnap.data() as CmsContent;
      }
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
      transaction.set(docRef, JSON.parse(JSON.stringify(next)));
      return next;
    });
  }

  async update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    const docRef = db.collection("cms").doc("content");
    return await db.runTransaction(async (transaction: Transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("CMS content not found in database.");
      const content = docSnap.data() as CmsContent;
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
      transaction.set(docRef, JSON.parse(JSON.stringify(next)));
      return next;
    });
  }

  async delete(collection: CmsCollection, id: string, version: number): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    const docRef = db.collection("cms").doc("content");
    return await db.runTransaction(async (transaction: Transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("CMS content not found in database.");
      const content = docSnap.data() as CmsContent;
      const peers = getCollection(content, collection);
      const current = peers.find((entry) => entry.id === id);
      if (!current) throw new Error("Entry not found.");
      if (current.version !== version) throw new CmsConflictError("This entry changed in another session. Reload before deleting it.");
      const next = { ...content, [collection]: peers.filter((entry) => entry.id !== id) } as CmsContent;
      transaction.set(docRef, JSON.parse(JSON.stringify(next)));
      return next;
    });
  }

  async reorder(collection: CmsCollection, orderedIds: string[]): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    const docRef = db.collection("cms").doc("content");
    return await db.runTransaction(async (transaction: Transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("CMS content not found in database.");
      const content = docSnap.data() as CmsContent;
      const peers = getCollection(content, collection);
      if (orderedIds.length !== peers.length || new Set(orderedIds).size !== peers.length) {
        throw new Error("The display order is incomplete.");
      }
      const byId = new Map(peers.map((entry) => [entry.id, entry]));
      const ordered = orderedIds.map((id) => byId.get(id));
      if (ordered.some((entry) => !entry)) throw new Error("The display order contains an unknown entry.");
      const next = { ...content, [collection]: ordered as CmsEntry[] } as CmsContent;
      transaction.set(docRef, JSON.parse(JSON.stringify(next)));
      return next;
    });
  }
}

const isFirebaseAdminConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
};

export const cmsRepository: CmsRepository = isFirebaseAdminConfigured()
  ? new FirebaseCmsRepository()
  : new FileCmsRepository();

export const readCmsContent = () => cmsRepository.read();

