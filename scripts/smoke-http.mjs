/**
 * HTTP smoke against a deployed origin — same defaults as `.github/workflows/smoke.yml`.
 *
 * Usage:
 *   npm run ops:smoke -- https://party-planner-five.vercel.app
 *   SMOKE_URL=https://your.app npm run ops:smoke
 *   SMOKE_PATHS="/ /healthz /privacy /terms /s/demo" npm run ops:smoke -- https://...
 *
 * Loads `SMOKE_URL` / `SMOKE_PATHS` from `.env.local` when not set (optional).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 30_000;

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
    if ((key === "SMOKE_URL" || key === "SMOKE_PATHS") && process.env[key] === undefined && val) {
      process.env[key] = val;
    }
  }
}

loadDotEnvLocal();

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const baseArg = positional[0];
const rawBase =
  baseArg ?? process.env.SMOKE_URL?.trim() ?? process.env.VITE_PUBLIC_SITE_URL?.trim() ?? "";

if (!rawBase) {
  console.error(
    "[ops:smoke] Set SMOKE_URL (or pass origin as first arg), or set VITE_PUBLIC_SITE_URL in .env.local.",
  );
  process.exit(2);
}

const base = rawBase.replace(/\/+$/, "");

const paths = (process.env.SMOKE_PATHS ?? "/ /healthz /privacy /terms").trim().split(/\s+/);
let failed = 0;

async function probe(pathname) {
  const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { Accept: "*/*", "User-Agent": "party-planner-ops-smoke/1" },
    });
    const code = res.status;
    const ok = code >= 200 && code < 400;
    console.log(`${ok ? "OK" : "FAIL"} HTTP ${code} — ${url}`);
    if (!ok) failed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL — ${url} (${msg})`);
    failed++;
  } finally {
    clearTimeout(t);
  }
}

for (const p of paths) {
  const pathname = p.startsWith("/") ? p : `/${p}`;
  await probe(pathname);
}

if (failed) {
  console.error(`[ops:smoke] ${failed} path(s) failed`);
  process.exit(1);
}
console.log("[ops:smoke] All paths succeeded");
