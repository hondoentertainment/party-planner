/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SENTRY_DSN: string;
  /** Overrides Sentry `environment` (e.g. staging); otherwise production vs development from build. */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_VAPID_PUBLIC_KEY: string;
  /** Public https origin for OG canonical URLs on guest share pages (no trailing slash). */
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** RFC 9116 Contact line for built `security.txt` (e.g. mailto:security@example.com). */
  readonly VITE_SECURITY_CONTACT?: string;
  /** Plausible Analytics domain (e.g. party.example.com). Loads script only in production builds. */
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  /** Override Plausible script URL (for self-hosted plausible). */
  readonly VITE_PLAUSIBLE_SCRIPT_URL?: string;
  /** Build / deploy revision (set by Vite from CI SHA or package version). */
  readonly VITE_APP_RELEASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
