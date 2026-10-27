import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { validateCmsEntry } from "../lib/cms/schemas";

const cookie = createHmac("sha256", "local-regression-secret").update("dcc-cms-authenticated").digest("hex");
const emptyContent = { schemaVersion: 2, blogPosts: [], events: [], publications: [], reports: [], pressCoverage: [], members: [] };

async function authenticate(page: Page) {
  await page.context().addCookies([{ name: "dcc_cms_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
}

async function newEvent(page: Page) {
  await authenticate(page);
  await page.goto("/admin");
  await page.getByRole("navigation").getByRole("button", { name: /Events/ }).click();
  await page.getByRole("button", { name: "New event" }).click();
}

// Fail closed: browser tests must never write to the connected CMS.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/cms/content", async route => {
    if (route.request().method() === "GET") return route.continue();
    await route.fulfill({ status: 500, json: { error: "Unexpected test mutation blocked." } });
  });
  await page.route("**/api/cms/media", route => route.fulfill({ status: 500, json: { error: "Test upload blocked." } }));
  await page.route("**/api/cms/users", route => route.fulfill({ json: { users: [], currentUserRole: "superadmin" } }));
});

test("email login opens dashboard without a manual reload", async ({ page }) => {
  const payload = Buffer.from(JSON.stringify({ sub: "regression-user", email: "admin@example.test", aud: "test", iss: "test", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  await page.route("https://identitytoolkit.googleapis.com/**", route => route.fulfill({ json: route.request().url().includes("accounts:lookup") ? { users: [{ localId: "regression-user", email: "admin@example.test", emailVerified: true, providerUserInfo: [] }] } : {
    kind: "identitytoolkit#VerifyPasswordResponse", localId: "regression-user", email: "admin@example.test", displayName: "Admin", idToken: `eyJhbGciOiJub25lIn0.${payload}.test`, refreshToken: "test-refresh-token", expiresIn: "3600", registered: true,
  } }));
  await page.route("**/api/cms/session", route => route.request().method() === "DELETE" ? route.continue() : route.fulfill({ json: { authenticated: true }, headers: { "set-cookie": `dcc_cms_session=${cookie}; Path=/; HttpOnly; SameSite=Lax` } }));
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Workspace overview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("publishing shows actionable errors and preserves event HTML", async ({ page }) => {
  await newEvent(page);
  const html = '<h2>Our event</h2><p>Join the discussion.</p>';
  await page.getByPlaceholder("Event details (HTML supported)...").fill(html);
  await expect(page.getByPlaceholder("Event details (HTML supported)...")).toHaveValue(html);
  await page.route("**/api/cms/content", route => route.fulfill({ status: 400, json: { error: "Check the highlighted fields.", fieldErrors: { imageAlt: "This field is required before publishing.", location: "This field is required before publishing.", slug: "This slug is already in use." } } }));
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Complete these fields" })).toContainText("Event image description:");
  await expect(page.getByRole("alert").filter({ hasText: "Complete these fields" })).toContainText("URL slug: This slug is already in use.");
  await page.getByRole("button", { name: "Open all fields" }).click();
  await expect(page.getByLabel(/^Event image description/)).toBeVisible();
});

test("save failure is recoverable and successful publish updates editor", async ({ page }) => {
  await newEvent(page);
  await page.route("**/api/cms/content", route => route.abort("failed"));
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Could not connect. Your changes are still here; please try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.route("**/api/cms/content", async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { content: { ...emptyContent, events: [{ ...body.item, id: "test-event", version: 1, publishState: "published" }] } } });
  });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await expect(page.getByText("Published changes saved.", { exact: true })).toBeVisible();
});

test("upload failure releases publishing controls", async ({ page }) => {
  await newEvent(page);
  await page.route("**/api/cms/media", route => route.abort("failed"));
  await page.locator('input[type="file"]').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("test") });
  await expect(page.getByText("Could not connect. Your changes are still here; please try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
});

test("content endpoint returns resolved collections", async ({ page }) => {
  await authenticate(page);
  const response = await page.request.get("/api/cms/content");
  expect(response.ok()).toBe(true);
  const content = await response.json();
  for (const collection of Object.keys(emptyContent).filter(key => key !== "schemaVersion")) expect(Array.isArray(content[collection])).toBe(true);
});

test("published events accept long asset URLs and reject impossible dates", () => {
  const event = { id: "test", version: 1, publishState: "published", createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z", title: "Test event", slug: "test-event", eventDate: "2026-10-27", format: "Roundtable", summary: "Test summary", location: "Virtual", image: `https://example.test/image.png?token=${"a".repeat(600)}`, imageAlt: "Participants", body: "A meaningful description" };
  expect(validateCmsEntry("events", event, "published", []).entry).toBeDefined();
  expect(validateCmsEntry("events", { ...event, eventDate: "2026-02-30" }, "published", []).fieldErrors.eventDate).toBeDefined();
  expect(validateCmsEntry("events", { ...event, imageAlt: "" }, "published", []).fieldErrors.imageAlt).toBeDefined();
});

test("public routes load and legacy URLs redirect", async ({ page }) => {
  for (const path of ["/", "/blog", "/events", "/publications", "/reports", "/press"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator(".next-page-root")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
  }
  await page.goto("/events.html");
  await expect(page).toHaveURL(/\/events$/);
});

test("public detail links open without script errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const section of ["blog", "events", "publications", "reports", "press"]) {
    await page.goto(`/${section}`);
    const link = page.locator(`main a[href^="/${section}/"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${section}/[^/]+$`));
    await expect(page.locator("main h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("mobile navigation and page widths work across public pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/blog", "/events", "/publications", "/reports", "/press"]) {
    await page.goto(path);
    const menu = page.getByRole("button", { name: "Open menu", exact: true });
    await menu.click();
    await expect(page.getByRole("button", { name: "Close menu", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Mobile sections" })).toBeVisible();
    await page.getByRole("button", { name: "Close menu", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), path).toBe(true);
  }
});
