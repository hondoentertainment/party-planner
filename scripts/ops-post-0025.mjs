#!/usr/bin/env node
/**
 * Post-deploy checklist after migrations 0025–0026 (large-event RSVP + guest stats RPC).
 *
 * Runs local checks that do not need production credentials. Optional steps:
 *   - `npx supabase db query --linked --file supabase/verify_remote.sql` when CLI is linked
 *   - `npm run ops:smoke` when SMOKE_URL is set in .env.local or the environment
 *
 * Usage: npm run ops:post-0025
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined && val) process.env[key] = val;
  }
}

loadDotEnvLocal();

function run(label, cmd, args, { optional = false } = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    if (optional) {
      console.warn(`  (skipped — ${label} optional step failed or unavailable)`);
      return false;
    }
    process.exit(r.status ?? 1);
  }
  return true;
}

console.log("Party Planner — post-0025/0026 operator checklist\n");

run("Lint", "npm", ["run", "lint"]);
run("Production build", "npm", ["run", "build"]);
run("Deploy env parity", "node", ["scripts/check-deploy-env.mjs"]);

const hasE2e =
  Boolean(process.env.E2E_EMAIL?.trim()) && Boolean(process.env.E2E_PASSWORD?.trim());
if (hasE2e) {
  run("Playwright (signed-in + public RSVP)", "npm", ["run", "test:e2e"]);
} else {
  console.log(
    "\n→ Playwright E2E skipped (set E2E_EMAIL + E2E_PASSWORD in .env.local or CI secrets for full coverage)",
  );
}

run(
  "Remote schema verify (verify_remote.sql)",
  "npx",
  ["supabase", "db", "query", "--linked", "--file", "supabase/verify_remote.sql"],
  { optional: true },
);

if (process.env.SMOKE_URL?.trim()) {
  run("HTTP smoke", "npm", ["run", "ops:smoke"]);
} else {
  console.log("\n→ HTTP smoke skipped (set SMOKE_URL in .env.local or run: npm run ops:smoke -- https://your-host)");
}

console.log(`
Manual steps (production):
  1. npm run db:push   — apply 0025 + 0026 if not already on remote
  2. Supabase SQL Editor → supabase/verify_remote.sql (rows 21–22 OK)
  3. Deploy app (Vercel prod) so guest pagination + RSVP error UX match RPC
  4. Smoke a disposable share: RSVP → same-email update → recovery link
  5. Stage-only rate-limit probe: RSVP_SHARE_TOKEN=… npm run ops:rsvp-load
  6. gh secret set E2E_EMAIL / E2E_PASSWORD if CI should run signed-in tests
`);
