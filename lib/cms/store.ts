import "server-only";

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateCmsEntry, type CmsFieldErrors } from "./schemas";
import type { CmsCollection, CmsContent, CmsEntry, PublishState } from "./types";
import { getFirestoreDb } from "./firebase-server";
import type { Transaction } from "firebase-admin/firestore";

const cmsDir = join(process.cwd(), "data", "cms");

const writeEntry = (collection: CmsCollection, entry: CmsEntry) => {
  const collectionDir = join(cmsDir, collection);
  if (!existsSync(collectionDir)) mkdirSync(collectionDir, { recursive: true });
  const temporaryPath = join(collectionDir, `${entry.id}.json.${process.pid}.tmp`);
  const finalPath = join(collectionDir, `${entry.id}.json`);
  writeFileSync(temporaryPath, JSON.stringify(entry, null, 2), "utf8");
  renameSync(temporaryPath, finalPath);
};

const deleteEntry = (collection: CmsCollection, id: string) => {
  const finalPath = join(cmsDir, collection, `${id}.json`);
  if (existsSync(finalPath)) rmSync(finalPath);
};

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

const writeContent = () => {
  // Legacy function replaced by multi-file writeEntry()
};

const desiredState = (action: SaveAction, current?: PublishState): PublishState => {
  if (action === "publish" || action === "save-published") return "published";
  if (action === "unpublish" || action === "save-draft") return "draft";
  return current || "draft";
};

// FileCmsRepository has been permanently removed in favor of native Firebase storage.

class FirebaseCmsRepository implements CmsRepository {
  async read(): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    const collections: CmsCollection[] = ["blogPosts", "events", "pressCoverage", "publications", "reports", "members"];
    const content: any = { schemaVersion: 2 };
    
    for (const collection of collections) {
      const snap = await db.collection(collection).get();
      content[collection] = snap.docs.map(doc => doc.data());
      content[collection].sort((a: any, b: any) => {
        const orderA = typeof a._order === 'number' ? a._order : 999999;
        const orderB = typeof b._order === 'number' ? b._order : 999999;
        return orderA - orderB;
      });
    }
    
    return content as CmsContent;
  }

  async create(collection: CmsCollection, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
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
    
    const entryWithOrder = { ...validation.entry, _order: peers.length };
    await db.collection(collection).doc(entryWithOrder.id).set(JSON.parse(JSON.stringify(entryWithOrder)));
    
    return { ...content, [collection]: [...peers, entryWithOrder] } as CmsContent;
  }

  async update(collection: CmsCollection, id: string, version: number, value: Record<string, unknown>, action: SaveAction): Promise<CmsContent> {
    const db = getFirestoreDb();
    if (!db) throw new Error("Firebase Firestore not initialized.");
    
    return await db.runTransaction(async (transaction: Transaction) => {
      const content = await this.read();
      const peers = getCollection(content, collection);
      const index = peers.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Entry not found.");
      const current = peers[index];
      
      const docRef = db.collection(collection).doc(id);
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("Entry not found in database.");
      const dbCurrent = docSnap.data() as CmsEntry;
      
      if (dbCurrent.version !== version) throw new CmsConflictError("This entry changed in another session. Reload before saving again.");
      
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
      
      const nextItems = peers.map((entry, entryIndex) => entryIndex === index ? entryWithOrder : entry);
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
    const peers = getCollection(content, collection);
    
    if (orderedIds.length !== peers.length || new Set(orderedIds).size !== peers.length) {
      throw new Error("The display order is incomplete.");
    }
    
    const byId = new Map(peers.map((entry) => [entry.id, entry]));
    const ordered = orderedIds.map((id) => byId.get(id));
    if (ordered.some((entry) => !entry)) throw new Error("The display order contains an unknown entry.");
    
    const batch = db.batch();
    const orderedItems = ordered.map((entry, index) => {
      const target = entry as CmsEntry;
      const itemWithOrder = { ...target, _order: index };
      batch.set(db.collection(collection).doc(target.id), JSON.parse(JSON.stringify(itemWithOrder)));
      return itemWithOrder;
    });
    
    await batch.commit();
    return { ...content, [collection]: orderedItems as CmsEntry[] } as CmsContent;
  }
}

const isFirebaseAdminConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
};

export const cmsRepository: CmsRepository = new FirebaseCmsRepository();

export const readCmsContent = () => cmsRepository.read();

