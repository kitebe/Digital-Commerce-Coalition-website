import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/firebase-server")) return { url: "data:text/javascript,export const getFirestoreDb=()=>globalThis.__mailingDb", shortCircuit: true };
    if (specifier.endsWith("/auth")) return { url: "data:text/javascript,export const isCmsAuthenticated=async()=>globalThis.__mailingAuth", shortCircuit: true };
    if (specifier === "next/server") return next("next/server.js", context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", source: ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { POST } = await import("../app/api/mailing-list/route.ts");
const { GET } = await import("../app/api/cms/mailing-list/route.ts");
let records;
beforeEach(() => {
  records = new Map();
  globalThis.__mailingAuth = false;
  globalThis.__mailingDb = {
    collection: (name) => {
      assert.equal(name, "mailingListSubscribers");
      return { doc: (id) => ({ id }), orderBy: () => ({ get: async () => ({ docs: [...records.values()].map((value) => ({ data: () => value })) }) }) };
    },
    runTransaction: async (operation) => operation({
      get: async (ref) => ({ exists: records.has(ref.id) }),
      create: (ref, value) => records.set(ref.id, value),
    }),
  };
});
const signup = (body, origin = "http://localhost") => POST(new Request("http://localhost/api/mailing-list", { method: "POST", headers: { origin }, body: JSON.stringify(body) }));
test("signup stores normalized email and consent once", async () => {
  assert.equal((await signup({ email: " Person@Example.com ", consent: true })).status, 200);
  assert.equal(records.size, 1);
  const original = [...records.values()][0];
  assert.equal(original.email, "person@example.com");
  assert.ok(original.consent);
  assert.ok(original.subscribedAt);
  await signup({ email: "person@example.com", consent: true });
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0], original);
});
test("invalid email, missing consent, cross-origin requests and spam do not write", async () => {
  assert.equal((await signup({ email: "invalid", consent: true })).status, 400);
  assert.equal((await signup({ email: "person@example.com", consent: false })).status, 400);
  assert.equal((await signup({ email: "person@example.com", consent: true }, "https://elsewhere.test")).status, 403);
  assert.equal((await signup({ email: "person@example.com", consent: true, website: "spam" })).status, 200);
  assert.equal(records.size, 0);
});
test("subscriber reads and CSV exports require authentication", async () => {
  for (const suffix of ["", "?format=csv"]) {
    assert.equal((await GET(new Request(`http://localhost/api/cms/mailing-list${suffix}`))).status, 401);
  }
  await signup({ email: "person@example.com", consent: true });
  globalThis.__mailingAuth = true;
  const list = await GET(new Request("http://localhost/api/cms/mailing-list"));
  assert.equal((await list.json()).subscribers[0].email, "person@example.com");
  const csv = await GET(new Request("http://localhost/api/cms/mailing-list?format=csv"));
  assert.equal(csv.headers.get("Cache-Control"), "no-store");
  assert.match(await csv.text(), /person@example.com/);
});
test("missing storage returns an error instead of accepting a signup", async () => {
  globalThis.__mailingDb = null;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await signup({ email: "person@example.com", consent: true })).status, 503);
    globalThis.__mailingAuth = true;
    assert.equal((await GET(new Request("http://localhost/api/cms/mailing-list"))).status, 503);
  } finally { console.error = originalError; }
  assert.equal(records.size, 0);
});
