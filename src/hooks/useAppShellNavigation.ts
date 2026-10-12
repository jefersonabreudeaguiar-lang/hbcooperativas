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
  getMenuItems,
  getMobileNavItems,
  isCooperadoAppUser,
  isHbCreditCooperadoNavEligible,
  isHbCreditParceiroNavEligible,
  isHbCreditStaffNavEligible,
} from "@/permissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolveStaffNavigationUser, shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";
import { isContaCoopUiVisibleForUser } from "@/utils/contaCoopUiVisibility";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";

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
  const subject = user ?? accountUser;
  useEnsureAppDataWarm();
  const dataRevision = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? getDataRevision() : -1),
    () => 0
  );

  const shellCore = useMemo(() => {
    if (!subject) return null;
    if (!isAppDataWarm()) {
      if (!isCooperadoAppUser(subject) && subject.role !== "cooperado") return null;
      const navUser: NavUser = isCooperadoAppUser(subject)
        ? { ...subject, role: "cooperado" as const }
        : subject;
      return {
        navUser,
        cooperadoNome: subject.name ?? "",
        staffPainelUi: false,
        coopId: subject.cooperativaId,
        beforeDataWarm: true,
      };
    }
    const data = getData();
    const navUser = resolveStaffNavigationUser(accountUser, subject, data) ?? subject;
    const cooperadoNome = resolveCooperadoNome(navUser, data);
    const staffPainelUi = Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data));
    const coopId = getUserCooperativaId(navUser, data);
    return { navUser, cooperadoNome, staffPainelUi, coopId, beforeDataWarm: false };
  }, [
    subject?.id,
    subject?.cooperativaId,
    subject?.role,
    subject?.cooperadoId,
    accountUser?.id,
    accountUser?.role,
    dataRevision,
  ]);

  const credit = useHbCreditEnabled(shellCore?.navUser ?? null);

  return useMemo(() => {
    if (!shellCore) return null;
    const { navUser, cooperadoNome, staffPainelUi, coopId, beforeDataWarm } = shellCore;
    if (beforeDataWarm) {
      const menus = getCooperadoShellMenusBeforeDataWarm(navUser);
      return {
        navUser,
        cooperadoNome,
        staffPainelUi,
        coopId,
        contaCoopUiVisible: false,
        moduleNavEligible: false,
        desktopMenu: menus.desktopMenu,
        mobileMenu: menus.mobileMenu,
        drawerMenu: menus.drawerMenu,
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

    const mobileMenu = getMobileNavItems(
      navUser,
      credit.enabled,
      contaCoopUiVisible,
      data,
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
  }, [shellCore, credit.enabled, credit.status, credit.serverConfirmed]);
}
