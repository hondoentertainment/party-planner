#!/usr/bin/env node
/**
 * Production secret/variable parity check.
 *
 * Cross-checks three surfaces:
 *   1. Supabase Edge function secrets (`npx supabase secrets list`)
 *   2. GitHub repository variables + secrets (`gh variable list` / `gh secret list`)
 *   3. Local `.env.local` Vite vars (read-only, just to detect drift)
 *
 * Exits 0 if every required secret is **present by name** in its expected
 * surface, 1 if any required secret is missing. Optional secrets / variables
 * are listed as warnings only.
 *
 * The script never reads or prints secret VALUES — `supabase secrets list`
 * and `gh secret list` only return names + last-updated timestamps, which is
 * all this audit needs.
 *
 * Usage:
 *   npm run ops:secrets-audit            # warns on missing optionals
 *   npm run ops:secrets-audit -- --strict # fails on missing optionals too
 *
 * Requires:
 *   * `npx supabase` (Supabase CLI, project linked) for the Edge surface
 *   * `gh` (authenticated) for the GitHub surface
 *
 * Either CLI may be unavailable in dev — the script reports SKIP (not FAIL)
 * when a CLI is missing so the audit still surfaces useful info locally.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

const COLOR = process.stdout.isTTY ? {
  reset: "\x1b[0m", bold: "\x1b[1m", red: "\x1b[31m", yellow: "\x1b[33m",
  green: "\x1b[32m", dim: "\x1b[2m", blue: "\x1b[34m",
} : { reset: "", bold: "", red: "", yellow: "", green: "", dim: "", blue: "" };

const required = {
  supabase: [
    {
      name: "RESEND_API_KEY",
      why: "transactional email — every notify-* function fails without it",
    },
    {
      name: "FROM_EMAIL",
      why: "Resend `from` header; must match a verified Resend domain",
    },
    {
      name: "APP_URL",
      why: "deep links in emails (https://your-app.example.com)",
    },
    {
      name: "REMINDER_CRON_SECRET",
      why: "auth header for notify-event-reminder + notify-wrap-up cron",
    },
    {
      name: "UNSUBSCRIBE_TOKEN_SECRET",
      why: "HMAC key for one-click unsubscribe links (rotate to invalidate old links)",
    },
  ],
  supabaseOptional: [
    {
      name: "VAPID_PUBLIC_KEY",
      why: "web push (notify-assignment); pair with VITE_VAPID_PUBLIC_KEY in Vercel",
    },
    { name: "VAPID_PRIVATE_KEY", why: "web push private key" },
    {
      name: "VAPID_SUBJECT",
      why: "Web Push protocol contact (mailto:); function provides a default if unset",
    },
    {
      name: "BUG_REPORT_NOTIFY_EMAIL",
      why: "inbox for notify-bug-report; falls back to FROM_EMAIL if unset",
    },
  ],
  ghSecrets: [
    { name: "VITE_SUPABASE_URL", why: "CI build target Supabase project URL" },
    { name: "VITE_SUPABASE_ANON_KEY", why: "CI anon key" },
  ],
  ghSecretsOptional: [
    {
      name: "VITE_SECURITY_CONTACT",
      why: "RFC 9116 contact for /.well-known/security.txt (avoid placeholder)",
    },
    { name: "VITE_PUBLIC_SITE_URL", why: "canonical OG/middleware origin" },
    { name: "VITE_SENTRY_DSN", why: "browser error reporting" },
    { name: "VITE_PLAUSIBLE_DOMAIN", why: "privacy-friendly analytics" },
    { name: "E2E_EMAIL", why: "signed-in Playwright tests in CI" },
    { name: "E2E_PASSWORD", why: "signed-in Playwright tests in CI" },
    { name: "E2E_DISPLAY_NAME", why: "Playwright auth fixture display name" },
  ],
  ghVariables: [
    {
      name: "SMOKE_URL",
      why: "Smoke workflow target origin; falls back to deployment_status.target_url",
    },
  ],
  ghVariablesOptional: [
    {
      name: "SMOKE_PATHS",
      why: "Smoke paths; default `/ /healthz /privacy /terms` is fine for most apps",
    },
  ],
};

function tag(level) {
  switch (level) {
    case "PASS":
      return `${COLOR.green}PASS${COLOR.reset}`;
    case "FAIL":
      return `${COLOR.red}${COLOR.bold}FAIL${COLOR.reset}`;
    case "WARN":
      return `${COLOR.yellow}WARN${COLOR.reset}`;
    case "SKIP":
      return `${COLOR.dim}SKIP${COLOR.reset}`;
    default:
      return level;
  }
}

function header(text) {
  console.log(`\n${COLOR.bold}${COLOR.blue}━━ ${text} ━━${COLOR.reset}`);
}

function runCli(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    return {
      ok: false,
      output: `${result.stderr ?? ""}${result.stdout ?? ""}`.trim(),
    };
  }
  return { ok: true, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

const verdicts = [];
function record(level, surface, name, why, hint) {
  verdicts.push({ level, surface, name, why, hint });
  const line = `${tag(level)}  ${COLOR.dim}${surface.padEnd(14)}${COLOR.reset} ${name}`;
  console.log(line);
  if (level !== "PASS" && why) console.log(`        ${COLOR.dim}${why}${COLOR.reset}`);
  if (hint) console.log(`        ${COLOR.dim}↳ ${hint}${COLOR.reset}`);
}

// =============================================================
// Supabase Edge function secrets
// =============================================================
header("Supabase Edge function secrets");

const supaResult = runCli("npx", ["supabase", "secrets", "list"]);
if (!supaResult.ok) {
  for (const s of [...required.supabase, ...required.supabaseOptional]) {
    record(
      "SKIP",
      "supabase",
      s.name,
      "supabase CLI unavailable / project not linked",
      "run `npx supabase login` then `supabase link --project-ref <ref>`",
    );
  }
} else {
  const present = (name) => new RegExp(`\\b${name}\\b`).test(supaResult.output);
  for (const s of required.supabase) {
    if (present(s.name)) {
      record("PASS", "supabase", s.name);
    } else {
      record("FAIL", "supabase", s.name, s.why, `supabase secrets set ${s.name}=…`);
    }
  }
  for (const s of required.supabaseOptional) {
    if (present(s.name)) {
      record("PASS", "supabase", s.name);
    } else {
      record(
        "WARN",
        "supabase",
        s.name,
        s.why,
        `supabase secrets set ${s.name}=…`,
      );
    }
  }
}

// =============================================================
// GitHub repository secrets
// =============================================================
header("GitHub repository secrets");

const ghSecretResult = runCli("gh", ["secret", "list"]);
if (!ghSecretResult.ok) {
  for (const s of [...required.ghSecrets, ...required.ghSecretsOptional]) {
    record(
      "SKIP",
      "gh-secret",
      s.name,
      "gh CLI unavailable / not authenticated",
      "install gh, then `gh auth login`",
    );
  }
} else {
  const present = (name) => new RegExp(`\\b${name}\\b`).test(ghSecretResult.output);
  for (const s of required.ghSecrets) {
    if (present(s.name)) record("PASS", "gh-secret", s.name);
    else record("FAIL", "gh-secret", s.name, s.why, `gh secret set ${s.name}`);
  }
  for (const s of required.ghSecretsOptional) {
    if (present(s.name)) record("PASS", "gh-secret", s.name);
    else record("WARN", "gh-secret", s.name, s.why, `gh secret set ${s.name}`);
  }
}

// =============================================================
// GitHub repository variables
// =============================================================
header("GitHub repository variables");

const ghVarResult = runCli("gh", ["variable", "list"]);
if (!ghVarResult.ok) {
  for (const v of [...required.ghVariables, ...required.ghVariablesOptional]) {
    record("SKIP", "gh-var", v.name, "gh CLI unavailable / not authenticated");
  }
} else {
  const present = (name) => new RegExp(`\\b${name}\\b`).test(ghVarResult.output);
  for (const v of required.ghVariables) {
    if (present(v.name)) record("PASS", "gh-var", v.name);
    else
      record(
        "WARN",
        "gh-var",
        v.name,
        v.why,
        `gh variable set ${v.name} --body "https://your-app.example.com"`,
      );
  }
  for (const v of required.ghVariablesOptional) {
    if (present(v.name)) record("PASS", "gh-var", v.name);
    else
      record(
        "WARN",
        "gh-var",
        v.name,
        v.why,
        `gh variable set ${v.name} --body "..."`,
      );
  }
}

// =============================================================
// .env.local parity (informational)
// =============================================================
header("Local .env.local (informational)");

const envPath = path.join(root, ".env.local");
if (!fs.existsSync(envPath)) {
  console.log(
    `${tag("SKIP")}  ${COLOR.dim}.env.local not present (CI / fresh checkout)${COLOR.reset}`,
  );
} else {
  const text = fs.readFileSync(envPath, "utf-8");
  const has = (name) =>
    new RegExp(`^\\s*${name}\\s*=\\s*\\S`, "m").test(text);
  for (const name of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_PUBLIC_SITE_URL",
    "VITE_SECURITY_CONTACT",
    "VITE_SENTRY_DSN",
  ]) {
    if (has(name)) record("PASS", "env.local", name);
    else
      record(
        "WARN",
        "env.local",
        name,
        "missing locally — fine for CI but breaks local prod-parity testing",
      );
  }
}

// =============================================================
// Verdict
// =============================================================
const fails = verdicts.filter((v) => v.level === "FAIL").length;
const warns = verdicts.filter((v) => v.level === "WARN").length;
const skips = verdicts.filter((v) => v.level === "SKIP").length;

console.log();
if (fails > 0) {
  console.log(
    `${COLOR.red}${COLOR.bold}✗ ${fails} required secret(s) missing.${COLOR.reset} ${warns} warning(s), ${skips} skip(s).`,
  );
  process.exit(1);
}
if (strict && warns > 0) {
  console.log(
    `${COLOR.yellow}${COLOR.bold}⚠ ${warns} optional secret(s) missing (--strict).${COLOR.reset}`,
  );
  process.exit(1);
}
console.log(
  `${COLOR.green}${COLOR.bold}✓ Required secrets present.${COLOR.reset} ${warns} warning(s), ${skips} skip(s).`,
);
