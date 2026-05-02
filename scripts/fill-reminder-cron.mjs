#!/usr/bin/env node
/**
 * Writes `supabase/sql/enable_reminder_cron.generated.sql` by copying
 * `enable_reminder_cron.sql` and replacing the placeholder functions base URL
 * with `https://<project-ref>.supabase.co/functions/v1`.
 *
 * Requires a linked Supabase project (`supabase link`) so
 * `supabase/.temp/project-ref` exists.
 *
 * You must still replace the `app.reminder_cron_secret` REPLACE_ME line in the
 * generated file before pasting into the SQL editor.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const refPath = path.join(root, "supabase", ".temp", "project-ref");
const templatePath = path.join(root, "supabase", "sql", "enable_reminder_cron.sql");
const outPath = path.join(root, "supabase", "sql", "enable_reminder_cron.generated.sql");

if (!fs.existsSync(refPath)) {
  console.error("Missing supabase/.temp/project-ref — run `npx supabase link` from the repo root first.");
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error(`Missing ${templatePath}`);
  process.exit(1);
}

const ref = fs.readFileSync(refPath, "utf8").trim();
if (!/^[a-z0-9]{20}$/.test(ref)) {
  console.error(`Unexpected project ref in ${refPath}: ${ref}`);
  process.exit(1);
}

let sql = fs.readFileSync(templatePath, "utf8");
sql = sql.replace(
  /https:\/\/REPLACE_ME\.supabase\.co\/functions\/v1/g,
  `https://${ref}.supabase.co/functions/v1`,
);

fs.writeFileSync(outPath, sql, "utf8");
console.log(`Wrote ${outPath}`);
console.log("Next: replace REPLACE_ME_with_a_64_char_hex_secret with your REMINDER_CRON_SECRET, then paste into Supabase SQL Editor.");
