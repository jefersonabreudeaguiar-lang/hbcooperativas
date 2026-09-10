import { notFound } from "next/navigation";
import { runSyncAudit } from "@lab/sync-update/scoreAudit";
import { isSyncLabEnabledServer } from "@/lib/lab/syncLabGate";
import { SyncLabView } from "./SyncLabView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lab Sync — HB Cooperativas",
  robots: { index: false, follow: false },
};

export default function SyncLabPage() {
  if (!isSyncLabEnabledServer()) {
    notFound();
  }

  const report = runSyncAudit();
  return <SyncLabView report={report} />;
}
