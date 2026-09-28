import type { Metadata } from "next";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";

export const metadata: Metadata = {
  title: "BIC-D1 — Diagnóstico temporário",
  robots: getPrivateAppRobotsMetadata(),
};

/** Fora de (app)/ — sem CooperativaSyncProvider, CooperadoFinanceiroGate ou AppShell. */
export default function BicD1DiagnosticoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 text-gray-900">{children}</div>;
}
