import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run the real repository against a small Firestore double, never live data.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "./firebase-server") return { url: "data:text/javascript,export const getFirestoreDb=()=>globalThis.__testFirestore", shortCircuit: true };
    try { return next(specifier, context); }
    catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { cmsRepository, CmsConflictError } = await import("../lib/cms/store.ts");
const entry = (id, slug = id) => ({ id, version: 1, publishState: "draft", createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z", title: id, slug, eventDate: "2026-10-27" });
let data, writes, beforeTransaction;
beforeEach(() => {
  data = { events: [entry("one"), entry("two")] };
  writes = [];
  beforeTransaction = () => {};
  const snapshot = collection => ({ docs: (data[collection] || []).map(item => ({ id: item.id, data: () => structuredClone(item) })) });
  globalThis.__testFirestore = {
    collection: name => ({ name, get: async () => snapshot(name), doc: id => ({ name, id }) }),
    runTransaction: async operation => {
      beforeTransaction();
      return operation({
        get: async ref => ref.id ? { exists: true, data: () => structuredClone(data[ref.name].find(item => item.id === ref.id)) } : snapshot(ref.name),
        set: (ref, value) => writes.push({ type: "set", ref, value }),
        update: (ref, value) => writes.push({ type: "update", ref, value }),
        delete: ref => writes.push({ type: "delete", ref }),
      });
    },
  };
});

test("reordering changes only order and retains concurrent content edits", async () => {
  beforeTransaction = () => { data.events[0].title = "Edited in another session"; data.events[0].version = 2; };
  const result = await cmsRepository.reorder("events", ["two", "one"]);
  assert.equal(result.events[1].title, "Edited in another session");
  assert.equal(result.events[1].version, 2);
  assert.deepEqual(writes.map(write => write.value), [{ _order: 0 }, { _order: 1 }]);
  assert.ok(writes.every(write => write.type === "update"));
});

test("reordering rejects a concurrently changed collection", async () => {
  beforeTransaction = () => { data.events.push(entry("three")); };
  await assert.rejects(cmsRepository.reorder("events", ["two", "one"]), CmsConflictError);
  assert.equal(writes.length, 0);
});

test("updates reject stale versions without writing", async () => {
  beforeTransaction = () => { data.events[0].version = 2; };
  await assert.rejects(cmsRepository.update("events", "one", 1, { title: "Stale edit" }, "save-draft"), CmsConflictError);
  assert.equal(writes.length, 0);
});

test("create checks slug uniqueness against the transactional snapshot", async () => {
  beforeTransaction = () => { data.events.push(entry("three", "new-event")); };
  await assert.rejects(cmsRepository.create("events", entry("new", "new-event"), "save-draft"), error => error.fieldErrors?.slug === "This slug is already in use.");
  assert.equal(writes.length, 0);
});
