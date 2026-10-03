"use client";

import { createContext, useContext } from "react";
import { useAppShellNavigation, type AppShellNavigation } from "@/hooks/useAppShellNavigation";

const AppShellNavigationContext = createContext<AppShellNavigation | null>(null);

export function AppShellNavigationProvider({ children }: { children: React.ReactNode }) {
  const value = useAppShellNavigation();
  return <AppShellNavigationContext.Provider value={value}>{children}</AppShellNavigationContext.Provider>;
}

export function useAppShellNavigationContext(): AppShellNavigation | null {
  return useContext(AppShellNavigationContext);
}
