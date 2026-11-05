import { defineConfig, devices } from "@playwright/test";

const PORT = 4179;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  // The scripted upstream keeps one clock and one set of call counts.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off"
  },
  webServer: {
    command: "npm run build && tsx scripts/local-server.ts --fixture",
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    stdout: "ignore"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    {
      name: "phone-chromium",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }
    },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } }
  ]
});
