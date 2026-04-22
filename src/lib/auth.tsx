import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import type { Profile } from "./database.types";

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  configured: boolean;
  /** True when the user arrived via a password reset email and must set a new password. */
  passwordRecovery: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  sendPasswordResetEmail: (email: string) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecoveryFromHash() {
  if (typeof window === "undefined") return false;
  const h = window.location.hash.slice(1);
  if (!h) return false;
  const params = new URLSearchParams(h);
  return params.get("type") === "recovery";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (isRecoveryFromHash() && data.session) {
        setPasswordRecovery(true);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        setPasswordRecovery(false);
      }
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile(data ?? null);
  };

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getSiteOrigin = () =>
    typeof window !== "undefined" ? window.location.origin : "";

  const value: AuthContextValue = {
    loading,
    user,
    session,
    profile,
    configured: supabaseConfigured,
    passwordRecovery,
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    signUp: async (email, password, displayName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      return error ? { error: error.message } : {};
    },
    signInWithMagicLink: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email });
      return error ? { error: error.message } : {};
    },
    sendPasswordResetEmail: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${getSiteOrigin()}/update-password` }
      );
      return error ? { error: error.message } : {};
    },
    updatePassword: async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (!error) {
        setPasswordRecovery(false);
        if (typeof window !== "undefined" && window.location.hash) {
          const path = window.location.pathname + window.location.search;
          window.history.replaceState(null, "", path);
        }
      }
      return error ? { error: error.message } : {};
    },
    signOut: async () => {
      setPasswordRecovery(false);
      await supabase.auth.signOut();
    },
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
