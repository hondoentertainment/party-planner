/**
 * Regenerate a Supabase type snapshot for diffing against src/lib/database.types.ts.
 * Requires: npm i -D supabase, Supabase login or access token, and a project id.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadLocalEnv(), ...process.env };
const id = env.SUPABASE_PROJECT_ID;
if (!id) {
  console.error(
    "Set SUPABASE_PROJECT_ID (Supabase → Project Settings → General → Reference ID) in the environment or .env.local, then run `npx supabase login` once."
  );
  process.exit(1);
}

const out = execSync(
  `npx supabase gen types typescript --project-id "${id}" --schema public`,
  { encoding: "utf8", cwd: root, shell: true, stdio: ["pipe", "pipe", "inherit"] }
);

const header = `/**
 * Auto-generated: npm run db:types
 * Copy relevant parts into database.types.ts or use this file to diff when the DB changes.
 * Do not import this file directly in app code.
 */

`;
const outPath = join(root, "src", "lib", "database.types.gen.ts");
writeFileSync(outPath, header + out, "utf8");
console.log("Wrote", outPath);
