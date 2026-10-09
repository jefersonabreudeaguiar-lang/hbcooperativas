"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import { normalizeUserRole, resolveAppUserRole } from "@/permissions";
import { resolveExperienceUser, resolveMobileCooperadoId } from "@/lib/mobileExperience";
import { PAINEL_MOBILE_PREF_EVENT } from "@/lib/mobilePainelPreference";
import {
  ensureCooperadoAppDataEagerWarm,
  isCooperadoInstantResumeEnabled,
} from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  getSession,
  login as doLogin,
  loginCreatorAdminPortal,
  logout as doLogout,
  registerCooperado,
  registerCooperativa,
  subscribe,
  ensureCooperativaInCloudForUser,
  preloadAppData,
  applyCloudProfileToLocalSession,
  getData,
  isAppDataWarm,
  waitForAppDataWarm,
} from "@/services/dataStore";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import {
  ensureCloudSessionReady,
  setActiveCloudProfile,
  userToCloudProfile,
  getLastCloudSyncError,
  fetchCloudSessionProfile,
} from "@/lib/security/clientSession";
import type { RegisterCooperadoInput, RegisterCooperativaInput } from "@/services/dataStore";

interface AuthContextType {
  /** Perfil efetivo na UI (no celular, responsável vira cooperado vinculado). */
  user: Omit<User, "password"> | null;
  /** Conta real na nuvem (responsável, cooperado, etc.). */
  accountUser: Omit<User, "password"> | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; redirectTo?: string }>;
  loginCreatorAdmin: (email: string, password: string) => Promise<boolean>;
  register: (input: RegisterCooperadoInput) => Promise<{ success: boolean; error?: string }>;
  registerCooperativa: (input: RegisterCooperativaInput) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function enrichAccountSession(session: Omit<User, "password">): Omit<User, "password"> {
  const mobileCooperadoId = resolveMobileCooperadoId(session);
  const data = getData();
  return {
    ...session,
    role: resolveAppUserRole(session, data),
    mobileCooperadoId: mobileCooperadoId ?? session.mobileCooperadoId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  /** Igual ao SSR — sessão/localStorage só após hydrate (evita React #418). */
  const [accountUser, setAccountUser] = useState<Omit<User, "password"> | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [painelPrefTick, setPainelPrefTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const experienceSigRef = useRef("");
  const appDataWarmRef = useRef(isAppDataWarm());

  const user = useMemo(
    () => resolveExperienceUser(accountUser, getData()),
    [accountUser, viewportTick, dataTick, painelPrefTick]
  );

  const refresh = useCallback(() => {
    const session = getSession();
    setAccountUser((prev) => {
      if (!session) return null;
      const normalized = enrichAccountSession(session);
      if (
        prev?.id === normalized.id &&
        prev?.email === normalized.email &&
        prev?.role === normalized.role &&
        prev?.cooperadoId === normalized.cooperadoId &&
        prev?.cooperativaId === normalized.cooperativaId &&
        prev?.mobileCooperadoId === normalized.mobileCooperadoId
      ) {
        return prev;
      }
      return normalized;
    });
    setLoading(false);
  }, []);

  useLayoutEffect(() => {
    if (isCooperadoInstantResumeEnabled()) {
      ensureCooperadoAppDataEagerWarm();
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    const warm = () => {
      if (isCooperadoInstantResumeEnabled()) {
        ensureCooperadoAppDataEagerWarm();
      } else {
        preloadAppData();
      }
    };
    if (isCooperadoInstantResumeEnabled()) {
      if (!isAppDataWarm()) warm();
      return;
    }
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warm, { timeout: 400 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsub = subscribe(() => {
      const messenger = isCooperadoPwaMessengerMode();
      const warm = isAppDataWarm();
      const justWarmed = warm && !appDataWarmRef.current;
      appDataWarmRef.current = warm;

      if (messenger) {
        const session = getSession();
        if (!session) return;
        const enriched = enrichAccountSession(session);
        const sig = [
          enriched.role,
          enriched.cooperadoId ?? "",
          enriched.mobileCooperadoId ?? "",
          enriched.cooperativaId ?? "",
          enriched.id,
        ].join("|");
        const sigChanged = sig !== experienceSigRef.current;
        if (sigChanged) experienceSigRef.current = sig;
        if (sigChanged || justWarmed) setDataTick((t) => t + 1);
        return;
      }

      /** Sync AppData não precisa re-parsear sessão — só atualiza `user` via dataTick. */
      setDataTick((t) => t + 1);
      if (justWarmed) refresh();

      const session = getSession();
      if (!session) return;

      const data = getData();
      const enriched = enrichAccountSession(session);
      const effective = resolveExperienceUser(enriched, data);
      if (!effective) return;
      const sig = [
        enriched.role,
        enriched.cooperadoId ?? "",
        enriched.mobileCooperadoId ?? "",
        effective.cooperadoId ?? "",
        effective.role,
      ].join("|");
      if (sig !== experienceSigRef.current) {
        experienceSigRef.current = sig;
        refresh();
      }
    });
    return unsub;
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setViewportTick((t) => t + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPref = () => setPainelPrefTick((t) => t + 1);
    window.addEventListener(PAINEL_MOBILE_PREF_EVENT, onPref);
    return () => window.removeEventListener(PAINEL_MOBILE_PREF_EVENT, onPref);
  }, []);

  useEffect(() => {
    if (!accountUser || loading) return;
    setActiveCloudProfile(userToCloudProfile(accountUser));
    void ensureCloudSessionReady();
    ensureCooperativaInCloudForUser(accountUser).catch(() => {});
  }, [accountUser?.id, loading]);

  useEffect(() => {
    if (!accountUser?.id || loading || typeof navigator === "undefined" || !navigator.onLine) return;

    let cancelled = false;
    const run = () => {
      void (async () => {
        const profile = await fetchCloudSessionProfile();
        if (cancelled || !profile) return;
        const synced = applyCloudProfileToLocalSession(profile);
        if (!synced || cancelled) return;
        if (
          synced.role !== accountUser.role ||
          synced.cooperadoId !== accountUser.cooperadoId ||
          synced.mobileCooperadoId !== accountUser.mobileCooperadoId
        ) {
          refresh();
        }
      })();
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [accountUser?.id, accountUser?.role, accountUser?.cooperadoId, accountUser?.mobileCooperadoId, loading, refresh]);

  const login = async (email: string, password: string) => {
    const result = await doLogin(email, password);
    if (result) {
      const cloudProfile = await fetchCloudSessionProfile();
      const synced = cloudProfile ? applyCloudProfileToLocalSession(cloudProfile) : null;
      const sessionUser = synced ?? getSession();
      const safeUser = enrichAccountSession(
        sessionUser ??
          (() => {
            const { password: _, ...u } = result;
            return u;
          })()
      );
      setAccountUser(safeUser);
      setActiveCloudProfile(userToCloudProfile(safeUser));
      await ensureCloudSessionReady(userToCloudProfile(safeUser));
      if (isCooperadoPwaMessengerMode()) {
        preloadAppData();
      } else {
        await waitForAppDataWarm(4000);
      }
      if (
        resolveAppUserRole(safeUser, getData()) === "cooperado" &&
        !isCooperadoPwaMessengerMode()
      ) {
        persistirInicioCardValorReceberCooperado(safeUser);
      }
      setLoading(false);
      const redirectTo = resolveAppUserRole(safeUser, getData()) === "parceiro" ? "/mercado-parceiro" : "/dashboard";
      return { ok: true as const, redirectTo };
    }
    return {
      ok: false as const,
      error:
        getLastCloudSyncError() ||
        "E-mail ou senha inválidos. Se usa Gmail, tente com ou sem pontos no e-mail.",
    };
  };

  const loginCreatorAdmin = async (email: string, password: string) => {
    const result = await loginCreatorAdminPortal(email, password);
    if (result) {
      const { password: _, ...safeUser } = result;
      setAccountUser(enrichAccountSession(safeUser));
      return true;
    }
    return false;
  };

  const register = async (input: RegisterCooperadoInput) => {
    const result = await registerCooperado(input);
    if (result.success) {
      setAccountUser({ ...result.user, role: normalizeUserRole(result.user.role) });
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const registerCooperativaAccount = async (input: RegisterCooperativaInput) => {
    const result = await registerCooperativa(input);
    if (result.success) {
      setAccountUser({ ...result.user, role: normalizeUserRole(result.user.role) });
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = () => {
    doLogout();
    setAccountUser(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accountUser,
        loading,
        login,
        loginCreatorAdmin,
        register,
        registerCooperativa: registerCooperativaAccount,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
