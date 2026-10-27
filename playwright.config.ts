import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", headless: true },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/admin",
    reuseExistingServer: false,
    env: { CMS_PASSWORD: "local-regression-password", CMS_SECRET: "local-regression-secret" },
    timeout: 60_000,
  },
});
