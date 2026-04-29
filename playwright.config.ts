import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), ".");

const E2E_ENV_KEYS = new Set(["E2E_EMAIL", "E2E_PASSWORD", "E2E_DISPLAY_NAME"]);

/** So E2E keys in `.env.local` work for `npx playwright test` without manual export. */
function loadE2EKeysFromLocalEnv() {
  const p = resolve(__root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!E2E_ENV_KEYS.has(m[1])) continue;
    if (process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

loadE2EKeysFromLocalEnv();

// Avoid port clashes with `vite preview` (4173) on the same machine. Override with PLAYWRIGHT_BASE_URL / PW_PREVIEW_PORT.
const previewPort = process.env.PW_PREVIEW_PORT ?? "4291";
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? previewOrigin;
const shouldStartPreview = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: shouldStartPreview
    ? {
        command: `npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
        url: previewOrigin,
        // Set PW_REUSE_DEV_SERVER=1 to attach to a server you already started on the same port.
        reuseExistingServer: !!process.env.PW_REUSE_DEV_SERVER,
        timeout: 120_000,
      }
    : undefined,
});
