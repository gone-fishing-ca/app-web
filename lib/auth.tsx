"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Provider, User as SbUser } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { User } from "./api";

// Currently we ship only Google SSO. Apple is documented in
// AUTH-PROVIDERS.md and easy to re-add — widen this union when you do.
export type OAuthProvider = Extract<Provider, "google">;

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

function toAppUser(u: SbUser | null | undefined): User | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.name as string | undefined) ?? (meta.full_name as string | undefined) ?? null;
  return { id: u.id, email: u.email ?? "", name };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(toAppUser(data.session?.user ?? null));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session?.user ?? null));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: name ? { name } : undefined },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Supabase redirects to its own /auth/v1/callback, then bounces back here.
        // Landing on /login is fine — the useEffect above sees the session and
        // forwards the user to /trips.
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw new Error(error.message);
    // The browser is about to navigate away to the provider; nothing else to do.
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithOAuth, signOut }),
    [user, loading, signIn, signUp, signInWithOAuth, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
