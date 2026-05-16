/**
 * Sanity-check variables for production parity (Vercel vs CI vs Supabase Edge).
 * Does not fail by default — prints PASS/WARN/FAIL lines. Exit 1 only with --strict
 * when a required Vite var is missing (use in release pipelines if desired).
 * On GitHub Actions, warns when E2E_EMAIL / E2E_PASSWORD are unset (Playwright skips).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const strict = process.argv.includes("--strict");

function loadDotEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined && val !== "") process.env[key] = val;
  }
}

loadDotEnvLocal();

const issues = [];

function need(name, hint) {
  const v = process.env[name]?.trim();
  if (!v) issues.push({ level: "fail", msg: `Missing ${name} — ${hint}` });
}

function want(name, hint, predicate = (v) => !!v?.trim()) {
  const v = process.env[name];
  if (!predicate(v)) issues.push({ level: "warn", msg: `Optional ${name} unset or weak — ${hint}` });
}

// Required for anything beyond SetupNotice in the built app
need("VITE_SUPABASE_URL", "Supabase project URL (Vercel + CI for real builds).");
need("VITE_SUPABASE_ANON_KEY", "Supabase anon key.");

want(
  "VITE_PUBLIC_SITE_URL",
  "canonical URLs for OG/public share (no trailing slash).",
);
want(
  "VITE_SECURITY_CONTACT",
  "RFC 9116 Contact for security.txt (avoid @example.com / @invalid placeholders in production).",
  (v) => !!v?.trim() && !/@example\.com|security@example|@invalid|not-configured/i.test(v),
);
want("VITE_SENTRY_DSN", "browser error reporting (optional but recommended for prod).");

if (process.env.GITHUB_ACTIONS === "true") {
  if (!process.env.E2E_EMAIL?.trim() || !process.env.E2E_PASSWORD?.trim()) {
    issues.push({
      level: "warn",
      msg:
        "GitHub Actions: E2E_EMAIL / E2E_PASSWORD unset — signed-in Playwright tests skip (set repo Secrets → Actions).",
    });
  }
}

// Edge / email parity (not Vite — remind operator)
if (!process.env.APP_URL?.trim()) {
  issues.push({
    level: "warn",
    msg: "APP_URL not set in this shell — must be set on Supabase Edge secrets to match production.",
  });
}

let exitCode = 0;
for (const x of issues) {
  const tag = x.level === "fail" ? "FAIL" : "WARN";
  console.log(`[ops:check-env] ${tag}: ${x.msg}`);
  if (x.level === "fail" && strict) exitCode = 1;
}

if (issues.length === 0) {
  console.log("[ops:check-env] PASS: core VITE_* variables look present.");
} else if (!strict) {
  console.log("[ops:check-env] Review warnings above. Run with --strict to fail on missing required vars.");
}

process.exit(exitCode);
