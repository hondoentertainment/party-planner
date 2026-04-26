import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), ".");

/** So `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` work for `npx playwright test` without manual export. */
function loadE2EKeysFromLocalEnv() {
  const p = resolve(__root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    if (m[1] !== "E2E_EMAIL" && m[1] !== "E2E_PASSWORD") continue;
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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? previewOrigin,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: previewOrigin,
    // Set PW_REUSE_DEV_SERVER=1 to attach to a server you already started on the same port.
    reuseExistingServer: !!process.env.PW_REUSE_DEV_SERVER,
    timeout: 120_000,
  },
});
