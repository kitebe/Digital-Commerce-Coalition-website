import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

test("event signup validates consent, reports errors and allows retry on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route("**/api/mailing-list", async (route) => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({ email: "reader@example.com", consent: true, website: "" });
    await route.fulfill(attempts === 1 ? { status: 503, json: { error: "Please try again shortly." } } : { json: { message: "You’re on the list!" } });
  });
  await page.goto("/events");
  const form = page.locator("#event-updates-form");
  await form.getByLabel("Email address").fill("reader@example.com");
  await form.getByRole("button", { name: "Sign up for updates" }).click();
  expect(attempts).toBe(0);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Sign up for updates" }).click();
  await expect(form.getByRole("status")).toHaveText("Please try again shortly.");
  await expect(form.getByLabel("Email address")).toHaveValue("reader@example.com");
  await form.getByRole("button", { name: "Sign up for updates" }).click();
  await expect(form.getByRole("status")).toHaveText("You’re on the list!");
  await expect(form.getByLabel("Email address")).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await form.screenshot({ path: "test-results/mailing-list-mobile.png" });
});

test("admin mailing list displays and searches subscribers", async ({ page }) => {
  const cookie = createHmac("sha256", "local-regression-secret").update("dcc-cms-authenticated").digest("hex");
  await page.context().addCookies([{ name: "dcc_cms_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
  await page.route("**/api/cms/mailing-list", (route) => route.fulfill({ json: { subscribers: [{ email: "reader@example.com", subscribedAt: "2026-10-28T09:00:00.000Z", source: "events" }] } }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Mailing list", exact: true }).click();
  await expect(page.getByRole("cell", { name: "reader@example.com" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/cms/mailing-list?format=csv");
  await page.getByRole("textbox", { name: "Search subscribers" }).fill("no-match");
  await expect(page.getByText("No matching subscribers.")).toBeVisible();
  await page.getByRole("button", { name: /Dashboard/ }).click();
  await expect(page.getByText("Workspace overview", { exact: true })).toBeVisible();
});
