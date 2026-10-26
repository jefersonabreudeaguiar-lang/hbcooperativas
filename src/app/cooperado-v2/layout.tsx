import type { Metadata } from "next";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";
import { CooperadoV2LayoutClient } from "@/components/cooperado-v2/CooperadoV2LayoutClient";

export const metadata: Metadata = {
  title: "Cooperado v2 — piloto",
  robots: getPrivateAppRobotsMetadata(),
};

/** Fora de (app)/ — sem CooperativaSyncProvider nem AppData pesado. */
export default function CooperadoV2Layout({ children }: { children: React.ReactNode }) {
  return <CooperadoV2LayoutClient>{children}</CooperadoV2LayoutClient>;
}
