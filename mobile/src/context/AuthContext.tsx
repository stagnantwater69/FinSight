import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { LoginInput, Profile, RegisterInput, UpdateProfileInput } from "../lib/types";

/**
 * Session state.
 *
 * Same flow as web — the backend owns registration and login, Supabase owns the
 * session — but the session lands in the device keystore rather than
 * localStorage (see lib/supabase.ts).
 */
interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /**
   * Replaces the cached profile with one the server just returned.
   *
   * Used by the avatar upload, which POSTs multipart and gets the updated
   * profile back — re-fetching /auth/me afterwards would be a second round
   * trip for data already in hand.
   */
  setProfileFromServer: (updated: Profile) => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

async function fetchProfile(): Promise<Profile | null> {
  try {
    return await api.get<Profile>("/auth/me");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restoring from the keystore is async and can be slow on a cold start, so
    // the splash/loading state is held until it resolves rather than briefly
    // showing Login to an already-signed-in user.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) setProfile(await fetchProfile());
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function applySession(session: { access_token: string; refresh_token: string }, p: Profile) {
    // The backend returns the session; hand it to supabase-js so it persists it
    // to the keystore and takes over refreshing.
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    setProfile(p);
  }

  async function login(input: LoginInput) {
    const data = await api.post<{ profile: Profile; session: { access_token: string; refresh_token: string } }>(
      "/auth/login",
      input
    );
    await applySession(data.session, data.profile);
  }

  async function register(input: RegisterInput) {
    const data = await api.post<{ profile: Profile; session: { access_token: string; refresh_token: string } }>(
      "/auth/register",
      input
    );
    await applySession(data.session, data.profile);
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // A failed server-side logout must not strand the user in a signed-in
      // shell — clear the local session regardless.
    }
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function updateProfile(input: UpdateProfileInput) {
    setProfile(await api.patch<Profile>("/auth/me", input));
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api.post("/auth/change-password", { currentPassword, newPassword });
    // The backend rotates the password via Supabase, which invalidates existing
    // sessions — so the user is signed out and asked to log in again rather
    // than left holding a token the server will start rejecting.
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ profile, loading, login, register, logout, updateProfile, changePassword, setProfileFromServer: setProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { errorMessage };
