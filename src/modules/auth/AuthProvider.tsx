"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import { getSession, login as doLogin, loginCreatorAdminPortal, logout as doLogout, registerCooperado, registerCooperativa, subscribe, ensureCooperativaInCloudForUser } from "@/services/dataStore";
import type { RegisterCooperadoInput, RegisterCooperativaInput } from "@/services/dataStore";

interface AuthContextType {
  user: Omit<User, "password"> | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginCreatorAdmin: (email: string, password: string) => Promise<boolean>;
  register: (input: RegisterCooperadoInput) => Promise<{ success: boolean; error?: string }>;
  registerCooperativa: (input: RegisterCooperativaInput) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "password"> | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(() => {
    const session = getSession();
    setUser((prev) => {
      if (
        prev?.id === session?.id &&
        prev?.email === session?.email &&
        prev?.cooperadoId === session?.cooperadoId &&
        prev?.cooperativaId === session?.cooperativaId
      ) {
        return prev;
      }
      return session;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!user || loading) return;
    ensureCooperativaInCloudForUser(user).catch(() => {});
  }, [user?.id, loading]);

  const login = async (email: string, password: string) => {
    const result = await doLogin(email, password);
    if (result) {
      const { password: _, ...safeUser } = result;
      setUser(safeUser);
      return true;
    }
    return false;
  };

  const loginCreatorAdmin = async (email: string, password: string) => {
    const result = await loginCreatorAdminPortal(email, password);
    if (result) {
      const { password: _, ...safeUser } = result;
      setUser(safeUser);
      return true;
    }
    return false;
  };

  const register = async (input: RegisterCooperadoInput) => {
    const result = await registerCooperado(input);
    if (result.success) {
      setUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const registerCooperativaAccount = async (input: RegisterCooperativaInput) => {
    const result = await registerCooperativa(input);
    if (result.success) {
      setUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = () => {
    doLogout();
    setUser(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginCreatorAdmin, register, registerCooperativa: registerCooperativaAccount, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
