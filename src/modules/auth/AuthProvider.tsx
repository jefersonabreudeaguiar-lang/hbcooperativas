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
import { resolveAppHomePath } from "@/lib/product/v2HbOnly";
import { canAccessPainelResponsavelSession } from "@/lib/security/responsavelPanelAccess";
import { resolveExperienceUser, resolveMobileCooperadoId } from "@/lib/mobileExperience";
import { PAINEL_MOBILE_PREF_EVENT, setPreferPainelResponsavelMobile } from "@/lib/mobilePainelPreference";
import { resetCooperadoAposVazamentoPainelGestao } from "@/lib/cooperado/resetCooperadoAposVazamentoPainelGestao";
import {
  ensureCooperadoAppDataEagerWarm,
  isCooperadoInstantResumeEnabled,
} from "@/lib/performance/cooperadoColdStart";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  applyCooperadoMobilePilotPerfDomFlag,
  cooperadoMobilePilotDeferAppDataEagerWarm,
} from "@/lib/cooperado/cooperadoMobilePilotPerf";
import {
  cooperadoMobilePilotInitialAccountUser,
  cooperadoMobilePilotInitialAuthLoading,
} from "@/lib/cooperado/cooperadoMobilePilotAuthBootstrap";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { readCooperadoSessionLite } from "@/lib/cooperado/cooperadoSessionLite";
import { cooperadoGaShouldDeferDataWarmFromGetData } from "@/lib/cooperado/cooperadoGaDataWarmDefer";
import { markCooperadoInicioAberturaQuiescence } from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";
import { armCooperadoGaMobileDataWarmDefer } from "@/lib/cooperado/cooperadoGaDataWarmDefer";
import { cooperadoGaMobileViewportAtivoLite } from "@/lib/cooperado/cooperadoSessionLite";
import { scheduleEmpacotarModeloAparelhoJeferson } from "@/lib/cooperado/cooperadoAparelhoJefersonPacote";
import {
  getSession,
  login as doLogin,
  loginCreatorAdminPortal,
  logoutAndClearSession,
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
import {
  persistirInicioCardValorReceberCooperado,
} from "@/services/cooperadoInicioCardPersistenciaService";
import { markCooperadoPostLoginFinanceSync } from "@/lib/cooperado/cooperadoPostLoginFinanceSync";
import { applyCooperadoForcedProfileCacheRepairIfNeeded } from "@/lib/pwa/cooperadoForcedProfileCacheRepair";
import { repairBrowserProfileIfStale } from "@/lib/pwa/browserProfileRepair";
import {
  ensureCloudSessionReady,
  setActiveCloudProfile,
  userToCloudProfile,
  getLastCloudSyncError,
  fetchCloudSessionProfile,
} from "@/lib/security/clientSession";
import type { RegisterCooperadoInput, RegisterCooperativaInput } from "@/services/dataStore";

interface AuthContextType {
  /** Perfil efetivo na UI — mesmo papel do login, sem troca responsável ↔ cooperado. */
  user: Omit<User, "password"> | null;
  /** Conta real na nuvem (responsável, cooperado, etc.). */
  accountUser: Omit<User, "password"> | null;
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; redirectTo?: string; navigated?: boolean }>;
  loginCreatorAdmin: (email: string, password: string) => Promise<boolean>;
  register: (input: RegisterCooperadoInput) => Promise<{ success: boolean; error?: string }>;
  registerCooperativa: (input: RegisterCooperativaInput) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function enrichAccountSession(
  session: Omit<User, "password">,
  opts?: { skipAppData?: boolean }
): Omit<User, "password"> {
  const mobileCooperadoId = resolveMobileCooperadoId(session);
  const data =
    opts?.skipAppData || cooperadoGaShouldDeferDataWarmFromGetData() || !isAppDataWarm()
      ? null
      : getData();
  return {
    ...session,
    role: resolveAppUserRole(session, data),
    mobileCooperadoId: mobileCooperadoId ?? session.mobileCooperadoId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  /** Igual ao SSR — sessão/localStorage só após hydrate (evita React #418). */
  const [accountUser, setAccountUser] = useState<Omit<User, "password"> | null>(
    cooperadoMobilePilotInitialAccountUser
  );
  const [viewportTick, setViewportTick] = useState(0);
  const [painelPrefTick, setPainelPrefTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [loading, setLoading] = useState(cooperadoMobilePilotInitialAuthLoading);
  const router = useRouter();
  const experienceSigRef = useRef("");
  const appDataWarmRef = useRef(isAppDataWarm());

  const user = useMemo(() => {
    const data =
      cooperadoGaShouldDeferDataWarmFromGetData() || !isAppDataWarm() ? null : getData();
    return resolveExperienceUser(accountUser, data);
  }, [accountUser, viewportTick, dataTick, painelPrefTick]);

  const refresh = useCallback(() => {
    const deferWarm = cooperadoGaShouldDeferDataWarmFromGetData();
    const session = deferWarm ? readCooperadoSessionLite() : getSession();
    if (!session) {
      setAccountUser(null);
      setLoading(false);
      return;
    }
    setAccountUser((prev) => {
      const normalized = enrichAccountSession(session, { skipAppData: deferWarm });
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
    const sessionLite = readCooperadoSessionLite();
    if (sessionLite?.role === "cooperado" && cooperadoGaMobileViewportAtivoLite()) {
      markCooperadoInicioAberturaQuiescence();
      armCooperadoGaMobileDataWarmDefer();
    }
    if (
      isCooperadoInstantResumeEnabled() &&
      !cooperadoGaShouldDeferDataWarmFromGetData()
    ) {
      ensureCooperadoAppDataEagerWarm();
    }
    refresh();
    const session =
      sessionLite ??
      (cooperadoGaShouldDeferDataWarmFromGetData() ? null : getSession());
    const effectiveSession = sessionLite ?? session;
    applyCooperadoMobilePilotPerfDomFlag(effectiveSession);
    if (effectiveSession?.role === "cooperado") {
      if (resetCooperadoAposVazamentoPainelGestao(effectiveSession)) return;
      setPreferPainelResponsavelMobile(false);
    }
  }, [refresh]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname.toLowerCase();
    if (
      path === "/login" ||
      path === "/cadastro" ||
      path === "/esqueci-senha" ||
      path.startsWith("/register")
    ) {
      dismissCooperadoBootShell();
    }
  }, [loading, accountUser?.id]);

  useEffect(() => {
    const warm = () => {
      if (isCooperadoInstantResumeEnabled()) {
        ensureCooperadoAppDataEagerWarm();
      } else {
        preloadAppData();
      }
    };
    if (isCooperadoInstantResumeEnabled()) {
      if (cooperadoGaShouldDeferDataWarmFromGetData()) return;
      const session = readCooperadoSessionLite() ?? getSession();
      if (
        !isAppDataWarm() &&
        !isCooperadoPwaMessengerMode() &&
        !cooperadoMobilePilotDeferAppDataEagerWarm(session)
      ) {
        warm();
      }
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
    setLoading(true);
    const result = await doLogin(email, password);
    if (result) {
      const sessionNow = getSession();
      const safeUserEarly = enrichAccountSession(
        sessionNow ??
          (() => {
            const { password: _, ...u } = result;
            return u;
          })()
      );
      const jwtRoleEarly = normalizeUserRole(sessionNow?.role ?? result.role);
      if (jwtRoleEarly === "cooperado") {
        if (resetCooperadoAposVazamentoPainelGestao(safeUserEarly)) {
          return { ok: true as const, redirectTo: "/dashboard", navigated: true as const };
        }
        setPreferPainelResponsavelMobile(false);
        setAccountUser(safeUserEarly);
        setActiveCloudProfile(userToCloudProfile(safeUserEarly));
        markCooperadoPostLoginFinanceSync();
        void (async () => {
          const cloudProfile = await fetchCloudSessionProfile();
          if (cloudProfile) applyCloudProfileToLocalSession(cloudProfile);
          await ensureCloudSessionReady(userToCloudProfile(getSession() ?? safeUserEarly));
          if (!isCooperadoPwaMessengerMode()) {
            persistirInicioCardValorReceberCooperado(getSession() ?? safeUserEarly);
          }
        })();
        const redirectTo = resolveAppHomePath(jwtRoleEarly, "/dashboard");
        if (typeof window !== "undefined") {
          window.location.assign(redirectTo);
          return { ok: true as const, redirectTo, navigated: true as const };
        }
        setLoading(false);
        return { ok: true as const, redirectTo };
      }
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
      const jwtRole = normalizeUserRole(sessionUser?.role ?? result.role);
      const role = resolveAppUserRole(safeUser, getData());
      const gestaoLogin = jwtRole !== "cooperado" && canAccessPainelResponsavelSession(safeUser);
      if (jwtRole === "cooperado") {
        if (resetCooperadoAposVazamentoPainelGestao(safeUser)) {
          return { ok: true as const, redirectTo: "/dashboard", navigated: true as const };
        }
        setPreferPainelResponsavelMobile(false);
      } else if (gestaoLogin) {
        setPreferPainelResponsavelMobile(true);
      } else {
        setPreferPainelResponsavelMobile(false);
      }
      const sessionReady =
        role === "parceiro" || (await ensureCloudSessionReady(userToCloudProfile(safeUser)));
      if (!sessionReady) {
        await logoutAndClearSession();
        setAccountUser(null);
        setLoading(false);
        return {
          ok: false as const,
          error:
            getLastCloudSyncError() ||
            "Não foi possível abrir sua sessão na nuvem. Aguarde alguns segundos e tente de novo.",
        };
      }
      if (isCooperadoPwaMessengerMode() || isCooperadoMobileGaPromoted(safeUser)) {
        preloadAppData();
      } else if (gestaoLogin) {
        ensureCooperadoAppDataEagerWarm();
        preloadAppData();
      } else {
        await waitForAppDataWarm(4000);
      }
      if (role === "cooperado" && isCooperadoMobileGaPromoted(safeUser)) {
        scheduleEmpacotarModeloAparelhoJeferson(safeUser);
      }
      if (role === "cooperado") {
        markCooperadoPostLoginFinanceSync();
        if (!isCooperadoPwaMessengerMode()) {
          persistirInicioCardValorReceberCooperado(safeUser);
        }
      }
      const redirectTo =
        role === "parceiro" ? "/mercado-parceiro" : resolveAppHomePath(role, "/dashboard");
      if (typeof window !== "undefined") {
        if (
          role === "cooperado" &&
          (await applyCooperadoForcedProfileCacheRepairIfNeeded(safeUser, redirectTo))
        ) {
          return { ok: true as const, redirectTo, navigated: true as const };
        }
        const reloaded =
          role === "cooperado"
            ? false
            : await repairBrowserProfileIfStale({ includeStandalone: true });
        if (reloaded) {
          return { ok: true as const, redirectTo, navigated: true as const };
        }
        window.location.assign(redirectTo);
        return { ok: true as const, redirectTo, navigated: true as const };
      }
      setLoading(false);
      return { ok: true as const, redirectTo };
    }
    setLoading(false);
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

  const logout = async () => {
    setLoading(true);
    setAccountUser(null);
    setPreferPainelResponsavelMobile(false);
    await logoutAndClearSession();
    if (typeof window !== "undefined") {
      window.location.replace("/login");
      return;
    }
    router.replace("/login");
    setLoading(false);
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
