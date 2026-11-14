import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3142",
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: [
    {
      command: "node tests/browser/fixtures/backend.mjs",
      url: "http://127.0.0.1:54450/control",
    },
    {
      command: "npm run dev -- --webpack --port 3142",
      url: "http://localhost:3142/login",
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54450",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "browser-test-publishable-key",
      },
    },
  ],
});
