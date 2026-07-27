import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api";
import type { LoginInput, Profile, RegisterInput, UpdateProfileInput } from "../lib/types";

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(): Promise<Profile | null> {
  try {
    const { data } = await api.get<Profile>("/auth/me");
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        setProfile(await fetchProfile());
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function login(input: LoginInput) {
    const { data } = await api.post<{ profile: Profile; session: { access_token: string; refresh_token: string } }>(
      "/auth/login",
      input
    );
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    setProfile(data.profile);
  }

  async function register(input: RegisterInput) {
    const { data } = await api.post<{ profile: Profile; session: { access_token: string; refresh_token: string } }>(
      "/auth/register",
      input
    );
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    setProfile(data.profile);
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function updateProfile(input: UpdateProfileInput) {
    const { data } = await api.patch<Profile>("/auth/me", input);
    setProfile(data);
  }

  return (
    <AuthContext.Provider value={{ profile, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
