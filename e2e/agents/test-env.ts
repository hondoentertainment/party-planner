import { spawnSync } from "node:child_process";

export interface E2ECredentials {
  email: string;
  password: string;
  displayName: string;
}

const MISSING_CREDENTIALS_REASON =
  "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests";

const UNREACHABLE_HOST_REASON =
  "configured Supabase host does not resolve; signed-in E2E tests need a live project";

/** Sync DNS probe. `dns.lookupSync` is not available on the Node 22 CI image. */
export function supabaseHostResolves(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (!hostname) return false;
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `require("node:dns").lookup(${JSON.stringify(hostname)}, (err) => process.exit(err ? 1 : 0))`,
      ],
      { timeout: 8_000, stdio: "ignore" },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function computeAuthenticatedE2ESkipReason(): string | null {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !supabaseAnonKey) {
    return MISSING_CREDENTIALS_REASON;
  }
  if (!supabaseHostResolves(supabaseUrl)) {
    return UNREACHABLE_HOST_REASON;
  }
  return null;
}

/** Why signed-in specs should skip, or null when credentials + live host are available. */
export const authenticatedE2ESkipReason = computeAuthenticatedE2ESkipReason();

export function getE2ECredentials(): E2ECredentials | null {
  if (authenticatedE2ESkipReason) return null;

  return {
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
    displayName: process.env.E2E_DISPLAY_NAME ?? "E2E Test User",
  };
}
