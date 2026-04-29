export interface E2ECredentials {
  email: string;
  password: string;
  displayName: string;
}

export function getE2ECredentials(): E2ECredentials | null {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !supabaseAnonKey) return null;

  return {
    email,
    password,
    displayName: process.env.E2E_DISPLAY_NAME ?? "E2E Test User",
  };
}
