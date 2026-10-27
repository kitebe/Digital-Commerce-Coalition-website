import "server-only";

import { randomUUID } from "node:crypto";
import { validateCmsEntry, type CmsFieldErrors } from "./schemas";
import type { CmsCollection, CmsContent, CmsEntry, PublishState } from "./types";
import { getFirestoreDb } from "./firebase-server";
import type { Transaction } from "firebase-admin/firestore";

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

const getCollection = (content: CmsContent, collection: CmsCollection): CmsEntry[] =>
  content[collection] as CmsEntry[];

const desiredState = (action: SaveAction, current?: PublishState): PublishState => {
  if (action === "publish" || action === "save-published") return "published";
  if (action === "unpublish" || action === "save-draft") return "draft";
  return current || "draft";
};

class FirebaseCmsRepository implements CmsRepository {
  async read(): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    const collections: CmsCollection[] = ["blogPosts", "events", "pressCoverage", "publications", "reports", "members"];
    const content: any = { schemaVersion: 2 };
    
    await Promise.all(collections.map(async (collection) => {
      const snap = await db.collection(collection).get();
      content[collection] = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      content[collection].sort((a: { _order?: number }, b: { _order?: number }) =>
        (a._order ?? 999999) - (b._order ?? 999999));
    }));

    return content as CmsContent;
  }

  async create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    const content = await this.read();
    return db.runTransaction(async (transaction: Transaction) => {
      const snap = await transaction.get(db.collection(collection));
      const peers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CmsEntry[];
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
    
      const nextOrder = Math.max(-1, ...peers.map((entry) => (entry as CmsEntry & { _order?: number })._order ?? -1)) + 1;
      const entryWithOrder = { ...validation.entry, _order: nextOrder };
      transaction.set(db.collection(collection).doc(entryWithOrder.id), JSON.parse(JSON.stringify(entryWithOrder)));
    
      return { ...content, [collection]: [...getCollection(content, collection), entryWithOrder] } as CmsContent;
    });
  }

  async update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    const content = await this.read();
    return await db.runTransaction(async (transaction: Transaction) => {
      const snap = await transaction.get(db.collection(collection));
      const peers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CmsEntry[];
      const index = peers.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Entry not found.");
      const current = peers[index];
      
      const docRef = db.collection(collection).doc(id);
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
      
      const entryWithOrder = { ...validation.entry, _order: (current as any)._order };
      transaction.set(docRef, JSON.parse(JSON.stringify(entryWithOrder)));
      
      const nextItems = getCollection(content, collection).map((entry) => entry.id === id ? entryWithOrder : entry);
      return { ...content, [collection]: nextItems } as CmsContent;
    });
  }

  async delete(collection: CmsCollection, id: string, version: number): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    return await db.runTransaction(async (transaction: Transaction) => {
      const docRef = db.collection(collection).doc(id);
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("Entry not found.");
      
      const dbCurrent = docSnap.data() as CmsEntry;
      if (dbCurrent.version !== version) throw new CmsConflictError("This entry changed in another session. Reload before deleting it.");
      
      transaction.delete(docRef);
      
      const content = await this.read();
      const peers = getCollection(content, collection);
      return { ...content, [collection]: peers.filter((entry) => entry.id !== id) } as CmsContent;
    });
  }

  async reorder(collection: CmsCollection, orderedIds: string[]): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    const content = await this.read();
    return db.runTransaction(async (transaction: Transaction) => {
      const snap = await transaction.get(db.collection(collection));
      const peers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CmsEntry[];
      if (orderedIds.length !== peers.length || new Set(orderedIds).size !== peers.length) {
        throw new CmsConflictError("The content list changed. Reload before changing the order.");
      }
      const byId = new Map(peers.map((entry) => [entry.id, entry]));
      const orderedItems = orderedIds.map((id, index) => {
        const entry = byId.get(id);
        if (!entry) throw new CmsConflictError("The display order contains an unknown entry. Reload and try again.");
        transaction.update(db.collection(collection).doc(id), { _order: index });
        return { ...entry, _order: index };
      });
      return { ...content, [collection]: orderedItems } as CmsContent;
    });
  }
}

export const cmsRepository: CmsRepository = new FirebaseCmsRepository();

export const readCmsContent = () => cmsRepository.read();

