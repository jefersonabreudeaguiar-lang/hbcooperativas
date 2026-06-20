"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/services/dataStore";

/** Redireciona usuários já logados para o painel (sessão persistente). */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    router.replace(session ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
