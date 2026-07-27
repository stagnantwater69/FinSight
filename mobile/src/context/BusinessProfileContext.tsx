import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { BusinessProfile, BusinessProfileInput, ExpenseCategory } from "../lib/types";

/**
 * Active business + its categories.
 *
 * Same soft-delete model as web: archive/restore only, no hard delete anywhere.
 * `listArchived` fetches on demand rather than keeping archived profiles in
 * `profiles`, so the switcher never accidentally offers one.
 */
interface Value {
  profiles: BusinessProfile[];
  selected: BusinessProfile | null;
  categories: ExpenseCategory[];
  loading: boolean;
  selectProfile: (id: number) => void;
  refresh: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  createProfile: (input: BusinessProfileInput) => Promise<BusinessProfile>;
  updateProfile: (id: number, input: Partial<BusinessProfileInput>) => Promise<BusinessProfile>;
  archiveProfile: (id: number) => Promise<void>;
  restoreProfile: (id: number) => Promise<void>;
  listArchived: () => Promise<BusinessProfile[]>;
}

const Ctx = createContext<Value | undefined>(undefined);

export function BusinessProfileProvider({ children }: { children: ReactNode }) {
  const { profile: user } = useAuth();
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BusinessProfile[]>("/business-profiles");
      setProfiles(data);
      setSelectedId((current) => (current && data.some((p) => p.id === current) ? current : data[0]?.id ?? null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setProfiles([]);
      setSelectedId(null);
      setCategories([]);
      setLoading(false);
      return;
    }
    refresh();
  }, [user?.id, refresh]);

  const refreshCategories = useCallback(async () => {
    if (!selectedId) {
      setCategories([]);
      return;
    }
    setCategories(await api.get<ExpenseCategory[]>("/records/categories", { businessProfileId: selectedId }));
  }, [selectedId]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <Ctx.Provider
      value={{
        profiles,
        selected,
        categories,
        loading,
        selectProfile: setSelectedId,
        refresh,
        refreshCategories,
        createProfile: async (input) => {
          const created = await api.post<BusinessProfile>("/business-profiles", input);
          setProfiles((prev) => [...prev, created]);
          setSelectedId(created.id);
          return created;
        },
        updateProfile: async (id, input) => {
          const updated = await api.patch<BusinessProfile>(`/business-profiles/${id}`, input);
          setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
          return updated;
        },
        // Archiving can remove the active business, so the list is reloaded and
        // the selection allowed to fall back to whatever remains.
        archiveProfile: async (id) => {
          await api.post(`/business-profiles/${id}/archive`);
          await refresh();
        },
        restoreProfile: async (id) => {
          await api.post(`/business-profiles/${id}/restore`);
          await refresh();
        },
        listArchived: async () => {
          const all = await api.get<BusinessProfile[]>("/business-profiles", { includeArchived: true });
          return all.filter((p) => p.isArchived);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useBusinessProfiles() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBusinessProfiles must be used within BusinessProfileProvider");
  return ctx;
}
