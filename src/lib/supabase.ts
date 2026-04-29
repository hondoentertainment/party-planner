import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Use untyped client; we maintain hand-written types in `database.types.ts`
// and cast results explicitly where needed. Avoids fighting Supabase's
// complex generic schema typing for a hand-maintained schema.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);
