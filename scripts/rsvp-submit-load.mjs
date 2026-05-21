/**
 * Operator-only helper: fires multiple `submit_public_rsvp` RPC calls via REST.
 * Can trip rate limits or pollute guest lists — use a disposable token / test event only.
 *
 * Environment (pick URL + anon key):
 * - RSVP_SHARE_TOKEN — public share token (required)
 * - SUPABASE_URL — e.g. https://YOUR_REF.supabase.co (required unless RSVP_LOAD_URL is absolute)
 * - SUPABASE_ANON_KEY — project anon JWT (also accepts VITE_SUPABASE_ANON_KEY)
 * - RSVP_LOAD_URL — optional full POST endpoint; default `${SUPABASE_URL}/rest/v1/rpc/submit_public_rsvp`
 * - RSVP_LOAD_COUNT — number of submits (default 5)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvKeys(keys) {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    if (!keys.has(key)) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined && val) process.env[key] = val;
  }
}

loadDotEnvKeys(
  new Set([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "RSVP_LOAD_URL",
    "RSVP_SHARE_TOKEN",
    "RSVP_LOAD_COUNT",
  ]),
);

const token = process.env.RSVP_SHARE_TOKEN?.trim();
const anon =
  process.env.SUPABASE_ANON_KEY?.trim() ?? process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const baseUrl = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim() ?? "";

const rawCount = process.env.RSVP_LOAD_COUNT?.trim();
const count = Math.max(1, Number.parseInt(rawCount ?? "5", 10) || 5);

let postUrl = process.env.RSVP_LOAD_URL?.trim();
if (!postUrl && baseUrl) {
  postUrl = `${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/submit_public_rsvp`;
}

console.warn(
  "\n[!] Abuse warning: This script submits real RSVP RPCs. Use only on disposable share links / staging.\n[!] Repeated runs can exhaust per-minute limits or inflate guest counts.\n",
);

if (!token) {
  console.error("Missing RSVP_SHARE_TOKEN.");
  process.exit(2);
}
if (!anon) {
  console.error("Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY).");
  process.exit(2);
}
if (!postUrl) {
  console.error("Set RSVP_LOAD_URL or SUPABASE_URL (or VITE_SUPABASE_URL).");
  process.exit(2);
}

let rpcUrl;
try {
  rpcUrl = new URL(postUrl);
  if (!/^https?:$/.test(rpcUrl.protocol)) throw new Error("http(s) only");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Invalid RSVP_LOAD_URL / URL: ${msg}`);
  process.exit(2);
}

const stamp = Date.now();
let failures = 0;

for (let i = 0; i < count; i++) {
  const email = `loadtest+${stamp}+${i}@invalid.example`;
  const name = `Load test guest ${stamp} #${i + 1}`;
  const body = {
    _token: token,
    _payload: {
      name,
      email,
      rsvp: "yes",
      plus_ones: 0,
    },
  };

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45_000);
  let res;
  try {
    res = await fetch(rpcUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (err) {
    clearTimeout(t);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FAIL #${i + 1} network: ${msg}`);
    failures++;
    continue;
  }
  clearTimeout(t);

  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL #${i + 1} HTTP ${res.status}: ${text.slice(0, 500)}`);
    failures++;
    continue;
  }
  console.log(`OK #${i + 1} ${name} → ${text.slice(0, 120)}`);
}

if (failures > 0) {
  console.error(`\nExiting with failures: ${failures} / ${count}`);
  process.exit(1);
}

console.log(`\nDone (${count} ok).`);
