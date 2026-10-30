"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useLayoutEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <div className="h-14 bg-green-900/90 animate-pulse shrink-0" />
        <div className="flex-1 p-4 space-y-3 max-w-lg mx-auto w-full pt-6">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
          <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
