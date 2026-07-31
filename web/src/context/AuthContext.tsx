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
  uploadAvatar: (file: File) => Promise<void>;
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

    /*
     * `loading` MUST end up false on every path, including the failing ones.
     *
     * It gates the whole app: `/` renders null while loading and ProtectedRoute
     * renders "Loading…", so a rejected getSession() — an unreachable Supabase
     * project, a corrupt token in localStorage — used to leave the entire site
     * blank forever with nothing on screen to say why. Treating a failed
     * session read as "signed out" is the honest outcome: we could not
     * establish who the user is, so the app should offer them the login screen
     * rather than hang.
     */
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        if (data.session) {
          setProfile(await fetchProfile());
        }
      })
      .catch((err) => {
        console.error("Could not read the stored session:", err);
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
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

  async function uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<Profile>("/auth/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setProfile(data);
  }

  return (
    <AuthContext.Provider value={{ profile, loading, login, register, logout, updateProfile, uploadAvatar }}>
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
