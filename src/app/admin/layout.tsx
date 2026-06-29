import { CooperativaSyncProvider } from "@/components/sync/CooperativaSyncProvider";

/** /admin fora do app principal — sem menu lateral nem ProtectedRoute do (app). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <CooperativaSyncProvider>{children}</CooperativaSyncProvider>;
}
