"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { getMe } from "@/lib/api";
import type { MeResponse, Role } from "@/lib/types";

interface AuthContextValue {
  loading: boolean;
  user: User | null;
  session: Session | null;
  me: MeResponse | null;
  role: Role | string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ role: string | null }>;
  signInWithGoogle: (next: string) => Promise<void>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshMe: () => Promise<MeResponse | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getBrowserClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(
    async (accessToken: string): Promise<MeResponse | null> => {
      try {
        // Profiles are provisioned by the auth.users signup trigger
        // (0001_security_lockdown.sql), NOT by any client-callable RPC.
        const meRes = await getMe(accessToken);
        setMe(meRes);
        return meRes;
      } catch (e) {
        // /me can fail if backend is offline; keep session but surface nothing fatal.
        setMe(null);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.access_token) {
        bootstrap(data.session.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess) setMe(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, bootstrap]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        setError(signErr.message);
        throw signErr;
      }
      const token = data.session?.access_token;
      let role: string | null = null;
      if (token) {
        // Never let a slow/hanging /me block sign-in navigation.
        const meRes = await Promise.race([
          bootstrap(token),
          new Promise<MeResponse | null>((resolve) =>
            setTimeout(() => resolve(null), 6000)
          ),
        ]);
        role = (meRes?.role as string) ?? null;
      }
      return { role };
    },
    [supabase, bootstrap]
  );

  const signInWithGoogle = useCallback(
    async (next: string) => {
      setError(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthErr) {
        setError(oauthErr.message);
        throw oauthErr;
      }
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signErr) {
        setError(signErr.message);
        throw signErr;
      }
      const needsConfirmation = !data.session;
      if (data.session?.access_token) {
        await bootstrap(data.session.access_token);
      }
      return { needsConfirmation };
    },
    [supabase, bootstrap]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
  }, [supabase]);

  const resetPassword = useCallback(
    async (email: string) => {
      setError(null);
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login`
          : undefined;
      const { error: resErr } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo }
      );
      if (resErr) {
        setError(resErr.message);
        throw resErr;
      }
    },
    [supabase]
  );

  const refreshMe = useCallback(async () => {
    if (!session?.access_token) return null;
    return bootstrap(session.access_token);
  }, [session, bootstrap]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        session,
        me,
        role:
          ((me?.role as string) ??
            ((me?.profile as Record<string, unknown> | null)?.role as string)) ??
          null,
        error,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        resetPassword,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
