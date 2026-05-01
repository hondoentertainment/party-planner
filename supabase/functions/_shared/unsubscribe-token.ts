// Shared HMAC-signed unsubscribe token helpers used by `notify-unsubscribe`,
// `notify-event-reminder`, and `notify-wrap-up`. Lives under `_shared/` so
// `supabase functions deploy` correctly bundles it with each function.
//
// Token format: `<base64url(payload)>.<base64url(hmac-sha256(payload))>`
// where payload is the UTF-8 string "<user_id>|<kind>|<expires_unix_seconds>".
//
// We use a JWT-shaped layout (sign the *encoded* payload, not the raw bytes)
// for two reasons:
//   1. The signature is computed over an ASCII-only string, so any future
//      base64url quirk in the email template can't change what was signed.
//   2. It mirrors what verifiers downstream of email clients expect — a few
//      antivirus scanners corrupt tokens that contain `=` padding, hence the
//      strict no-padding base64url here.
//
// HMAC-SHA-256 keys are read from the `UNSUBSCRIBE_TOKEN_SECRET` env var on
// every call (cheap, and lets the server rotate the secret without a redeploy).

declare const Deno: { env: { get(name: string): string | undefined } };

export type UnsubscribeKind =
  | "pre_7d"
  | "pre_3d"
  | "pre_1d"
  | "wrap_up_1d"
  | "all";

const VALID_KINDS: ReadonlyArray<UnsubscribeKind> = [
  "pre_7d",
  "pre_3d",
  "pre_1d",
  "wrap_up_1d",
  "all",
];

const SECRET_ENV_VAR = "UNSUBSCRIBE_TOKEN_SECRET";

export interface SignTokenOptions {
  userId: string;
  kind: UnsubscribeKind;
  /** TTL in days; defaults to 30 (matches notify-unsubscribe's clock-skew
   * tolerance, so a token shipped today is still valid a month from now). */
  ttlDays?: number;
}

export interface VerifiedToken {
  userId: string;
  kind: UnsubscribeKind;
  expiresAt: number; // unix seconds
}

function getSecret(): string {
  const secret = Deno.env.get(SECRET_ENV_VAR);
  if (!secret || secret.length < 32) {
    throw new Error(
      `${SECRET_ENV_VAR} is not set or is shorter than 32 bytes; ` +
        "generate one with `openssl rand -hex 32`.",
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  // btoa requires a binary string. Build it via charCode mapping rather than
  // String.fromCharCode(...spread) so we don't blow the call stack on long
  // inputs (signatures are short, but stay safe).
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign a one-click unsubscribe token. The returned string is safe to embed
 * in an `<a href>` (URL-safe base64, no padding, no reserved characters).
 */
export async function signToken(opts: SignTokenOptions): Promise<string> {
  const ttlDays = opts.ttlDays ?? 30;
  if (!opts.userId) throw new Error("signToken: userId is required");
  if (!VALID_KINDS.includes(opts.kind)) {
    throw new Error(`signToken: invalid kind "${opts.kind}"`);
  }
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new Error("signToken: ttlDays must be positive");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(ttlDays * 86400);
  const payload = `${opts.userId}|${opts.kind}|${expiresAt}`;
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(payload));

  const key = await importHmacKey(getSecret());
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encodedPayload),
    ),
  );

  return `${encodedPayload}.${base64UrlEncode(sig)}`;
}

/**
 * Verify an unsubscribe token. Returns the parsed payload on success; throws
 * with a user-actionable message otherwise. Uses crypto.subtle.verify which
 * runs in constant time — no timing-safe equality required.
 */
export async function verifyToken(token: string): Promise<VerifiedToken> {
  if (!token || typeof token !== "string") {
    throw new Error("Missing token.");
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed token.");
  }
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) {
    throw new Error("Malformed token.");
  }

  const key = await importHmacKey(getSecret());
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlDecode(encodedSig);
  } catch {
    throw new Error("Malformed token signature.");
  }

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(encodedPayload),
  );
  if (!ok) {
    throw new Error("Invalid token signature.");
  }

  let payload: string;
  try {
    payload = new TextDecoder().decode(base64UrlDecode(encodedPayload));
  } catch {
    throw new Error("Malformed token payload.");
  }

  const segments = payload.split("|");
  if (segments.length !== 3) {
    throw new Error("Malformed token payload.");
  }
  const [userId, kindStr, expiresStr] = segments;
  const expiresAt = Number.parseInt(expiresStr, 10);
  if (!userId || !Number.isFinite(expiresAt)) {
    throw new Error("Malformed token payload.");
  }
  if (!VALID_KINDS.includes(kindStr as UnsubscribeKind)) {
    throw new Error(`Invalid token kind "${kindStr}".`);
  }
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("Token has expired. Please use the link from a more recent email.");
  }

  return {
    userId,
    kind: kindStr as UnsubscribeKind,
    expiresAt,
  };
}
