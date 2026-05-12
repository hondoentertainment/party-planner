import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Untyped client: schema snapshot is `database.types.gen.ts`; we cast or type
// results at boundaries where needed. `createClient<Database>()` can break
// against postgrest-js GenericSchema until every table/relationship matches.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  {
    auth: { persistSession: true, autoRefreshToken: true },
  },
);
