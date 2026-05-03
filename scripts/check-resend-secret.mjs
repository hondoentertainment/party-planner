#!/usr/bin/env node
/**
 * Exit 0 if `RESEND_API_KEY` appears in `npx supabase secrets list` for the
 * linked project; exit 1 with a short message otherwise.
 *
 * Usage (from repo root, after `supabase link` + login):
 *   node scripts/check-resend-secret.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("npx", ["supabase", "secrets", "list"], {
  cwd: root,
  encoding: "utf-8",
  shell: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "supabase secrets list failed");
  process.exit(result.status ?? 1);
}

const out = `${result.stdout}\n${result.stderr}`;
if (!/\bRESEND_API_KEY\b/.test(out)) {
  console.error(
    "Missing RESEND_API_KEY in Supabase project secrets. Add it from https://resend.com → API Keys:\n" +
      '  npx supabase secrets set RESEND_API_KEY="re_..."\n' +
      "See OPERATIONS.md §0 step 5.",
  );
  process.exit(1);
}

console.log("RESEND_API_KEY is set (name present in secrets list).");
