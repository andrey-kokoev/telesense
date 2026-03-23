import { defineConfig, devices } from "@playwright/test"

const isCI = Boolean(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CI,
)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
    // Use fake media devices for headless testing
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--allow-file-access-from-files",
        "--disable-web-security",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Grant permissions automatically
        contextOptions: {
          permissions: ["camera", "microphone"],
        },
      },
    },
  ],
  webServer: {
    command: "vp dev",
    url: "http://localhost:5173",
    reuseExistingServer: !isCI,
    timeout: 120000,
  },
})
