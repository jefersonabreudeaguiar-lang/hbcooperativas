import type { Metadata } from "next";
import { CooperativaSyncProvider } from "@/components/sync/CooperativaSyncProvider";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";

export const metadata: Metadata = {
  robots: getPrivateAppRobotsMetadata(),
};

/** /admin fora do app principal — sem menu lateral nem ProtectedRoute do (app). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <CooperativaSyncProvider>{children}</CooperativaSyncProvider>;
}
