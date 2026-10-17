"use client";

import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import type { Resource, User } from "@/types";
import { useAuth } from "@/modules/auth/AuthProvider";

type NavUser = Omit<User, "password">;
import { useEnsureAppDataWarm } from "@/hooks/useEnsureAppDataWarm";
import { getData, getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import {
  getCooperadoDrawerMenuItems,
  getCooperadoShellMenusBeforeDataWarm,
  getStaffShellMenusBeforeDataWarm,
  getMenuItems,
  getMobileNavItems,
  isCooperadoAppUser,
  isHbCreditCooperadoNavEligible,
  isHbCreditParceiroNavEligible,
  isHbCreditStaffNavEligible,
} from "@/permissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  resolveStaffNavigationUser,
  shouldRenderStaffPainelUi,
  shouldRenderStaffPainelUiSession,
} from "@/lib/staffNavigationUser";
import {
  shouldPrioritizeStaffColdShell,
  staffShellMenusBeforeDataWarm,
} from "@/lib/responsavel/responsavelPainelContrato";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { isContaCoopUiVisibleForUser } from "@/utils/contaCoopUiVisibility";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { cooperadoPilotMobileBottomNavItems } from "@/lib/cooperado/cooperadoMobilePilotBottomNav";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import { usePainelResponsavelMobilePref } from "@/hooks/usePainelResponsavelMobilePref";

export type AppShellMenuItem = { href: string; label: string; resource: Resource };

export type AppShellNavigation = {
  navUser: NavUser;
  cooperadoNome: string;
  staffPainelUi: boolean;
  coopId: string | undefined;
  contaCoopUiVisible: boolean;
  moduleNavEligible: boolean;
  desktopMenu: AppShellMenuItem[];
  mobileMenu: AppShellMenuItem[];
  drawerMenu: AppShellMenuItem[];
};

function resolveCooperadoNome(navUser: NavUser, data: ReturnType<typeof getData>): string {
  if (navUser.cooperadoId) {
    return data.cooperados.find((c) => c.id === navUser.cooperadoId)?.nomeCompleto ?? navUser.name ?? "";
  }
  return navUser.name ?? "";
}

function hbModuleNavEligible(
  navUser: NavUser,
  credit: ReturnType<typeof useHbCreditEnabled>
): boolean {
  return (
    isHbCreditCooperadoNavEligible(navUser, credit.status, credit.serverConfirmed) ||
    isHbCreditStaffNavEligible(navUser, credit.status, credit.serverConfirmed) ||
    isHbCreditParceiroNavEligible(navUser, credit.status, credit.serverConfirmed)
  );
}

/**
 * HX 8.1 — menu e identidade do shell em um selector + memos (evita useAppData no layout).
 */
export function useAppShellNavigation(): AppShellNavigation | null {
  const { user, accountUser } = useAuth();
  const experienceUser = user ?? accountUser;
  const coldData = isAppDataWarm() ? getData() : null;
  const preferPainel = usePainelResponsavelMobilePref();
  const mobile = isMobileCooperativaApp();
  const identidade = evaluateResponsavelIdentidade({
    accountUser: accountUser ?? user,
    experienceUser,
    data: coldData,
    dataReady: isAppDataWarm(),
    mobile,
    preferPainelResponsavel: preferPainel,
  });
  const mobileCooperadoShell = identidade.modo === "cooperado";
  const subject = experienceUser;
  useEnsureAppDataWarm();
  const dataRevision = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? getDataRevision() : -1),
    () => 0
  );

  const shellCore = useMemo(() => {
    const gestao = identidade.staffPainelUi ? accountUser ?? user : null;
    const effectiveSubject = subject ?? gestao;
    if (!effectiveSubject) return null;
    const cold = isAppDataWarm() ? getData() : null;
    if (!isAppDataWarm()) {
      const staffPainelUi = Boolean(
        gestao && shouldRenderStaffPainelUiSession(gestao, cold)
      );
      if (shouldPrioritizeStaffColdShell(gestao, false, cold)) {
        const navUser: NavUser = gestao!;
        const staffMenus = staffShellMenusBeforeDataWarm(navUser);
        return {
          navUser,
          cooperadoNome: navUser.name ?? "",
          staffPainelUi: true,
          coopId: navUser.cooperativaId,
          beforeDataWarm: true,
          coldStaffMenus: staffMenus,
        };
      }
      const isCooperadoShell =
        isCooperadoAppUser(effectiveSubject) || effectiveSubject.role === "cooperado";
      const navUser: NavUser = isCooperadoShell
        ? { ...effectiveSubject, role: "cooperado" as const }
        : effectiveSubject;
      return {
        navUser,
        cooperadoNome: effectiveSubject.name ?? "",
        staffPainelUi,
        coopId: effectiveSubject.cooperativaId,
        beforeDataWarm: true,
      };
    }
    const data = getData();
    const navUser = resolveStaffNavigationUser(gestao, effectiveSubject, data) ?? effectiveSubject;
    const cooperadoNome = resolveCooperadoNome(navUser, data);
    const staffPainelUi =
      !mobileCooperadoShell &&
      Boolean(gestao && shouldRenderStaffPainelUi(gestao, data));
    const coopId = getUserCooperativaId(navUser, data);
    return { navUser, cooperadoNome, staffPainelUi, coopId, beforeDataWarm: false };
  }, [
    subject?.id,
    subject?.cooperativaId,
    subject?.role,
    subject?.cooperadoId,
    accountUser?.id,
    accountUser?.role,
    user?.id,
    user?.role,
    identidade.staffPainelUi,
    identidade.modo,
    preferPainel,
    mobile,
    dataRevision,
  ]);

  const credit = useHbCreditEnabled(shellCore?.navUser ?? null);

  return useMemo(() => {
    if (!shellCore) return null;
    try {
    const { navUser, cooperadoNome, staffPainelUi, coopId, beforeDataWarm } = shellCore;
    if (beforeDataWarm) {
      const coldStaff =
        "coldStaffMenus" in shellCore && shellCore.coldStaffMenus
          ? shellCore.coldStaffMenus
          : null;
      if (coldStaff) {
        return {
          navUser,
          cooperadoNome,
          staffPainelUi,
          coopId,
          contaCoopUiVisible: false,
          moduleNavEligible: false,
          desktopMenu: coldStaff.desktopMenu,
          mobileMenu: coldStaff.mobileMenu,
          drawerMenu: coldStaff.drawerMenu,
        };
      }
      const cooperadoShell =
        isCooperadoAppUser(navUser) || navUser.role === "cooperado";
      if (cooperadoShell) {
        const menus = getCooperadoShellMenusBeforeDataWarm(navUser);
        const hbWarmShell =
          isCooperadoAppUser(navUser) &&
          isContaCoopUiVisibleForUser(navUser) &&
          Boolean(navUser.cooperadoId?.trim());
        return {
          navUser,
          cooperadoNome,
          staffPainelUi,
          coopId,
          contaCoopUiVisible: hbWarmShell,
          moduleNavEligible: hbWarmShell,
          desktopMenu: menus.desktopMenu,
          mobileMenu: cooperadoPilotMobileBottomNavItems(menus.mobileMenu, navUser, hbWarmShell),
          drawerMenu: menus.drawerMenu,
        };
      }
      const staffMenus = getStaffShellMenusBeforeDataWarm(navUser);
      return {
        navUser,
        cooperadoNome,
        staffPainelUi,
        coopId,
        contaCoopUiVisible: false,
        moduleNavEligible: false,
        desktopMenu: staffMenus.desktopMenu,
        mobileMenu: staffMenus.mobileMenu,
        drawerMenu: staffMenus.drawerMenu,
      };
    }
    const data = getData();
    const moduleNavEligible = hbModuleNavEligible(navUser, credit);
    const contaCoopUiVisible = isContaCoopUiVisibleForUser(navUser, cooperadoNome || undefined);

    const desktopMenu = getMenuItems(
      navUser,
      credit.enabled,
      contaCoopUiVisible,
      data,
      moduleNavEligible
    );

    const mobileMenu = cooperadoPilotMobileBottomNavItems(
      getMobileNavItems(navUser, credit.enabled, contaCoopUiVisible, data, moduleNavEligible),
      navUser,
      moduleNavEligible
    );

    const drawerMenu = getCooperadoDrawerMenuItems(
      navUser,
      credit.enabled,
      contaCoopUiVisible,
      data,
      moduleNavEligible
    );

    return {
      navUser,
      cooperadoNome,
      staffPainelUi,
      coopId,
      contaCoopUiVisible,
      moduleNavEligible,
      desktopMenu,
      mobileMenu,
      drawerMenu,
    };
    } catch {
      const { navUser, cooperadoNome, staffPainelUi, coopId } = shellCore;
      const fallback = staffPainelUi
        ? getStaffShellMenusBeforeDataWarm(navUser)
        : getCooperadoShellMenusBeforeDataWarm(navUser);
      return {
        navUser,
        cooperadoNome,
        staffPainelUi,
        coopId,
        contaCoopUiVisible: false,
        moduleNavEligible: false,
        desktopMenu: fallback.desktopMenu,
        mobileMenu: fallback.mobileMenu,
        drawerMenu: fallback.drawerMenu,
      };
    }
  }, [shellCore, credit.enabled, credit.status, credit.serverConfirmed]);
}
