import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173/contents/blckjck_trainer/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === "win32" && !process.env.CI ? "msedge" : undefined),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/contents/blckjck_trainer/",
    reuseExistingServer: !process.env.CI,
  },
});
