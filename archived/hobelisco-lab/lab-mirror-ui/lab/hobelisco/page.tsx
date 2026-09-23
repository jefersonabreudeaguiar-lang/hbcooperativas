import { notFound } from "next/navigation";
import { runArenaSimulation } from "@lab/hobelisco-hx/arena/SimulationRunner";
import { evaluateHobeliscoLabBoundary } from "@/lib/lab/hobeliscoLabBoundary";
import { isHobeliscoLabEnabledServer } from "@/lib/lab/hobeliscoLabGate";
import { HobeliscoLabView } from "./HobeliscoLabView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "HOBELISCO HX — Laboratório",
  robots: { index: false, follow: false },
};

export default function HobeliscoLabPage() {
  if (!isHobeliscoLabEnabledServer()) {
    notFound();
  }

  const arenaReport = runArenaSimulation();
  const boundary = evaluateHobeliscoLabBoundary();

  return (
    <HobeliscoLabView
      initialSnapshot={arenaReport.snapshot}
      initialArena={arenaReport}
      boundaryBanner={{
        title: boundary.banner.title,
        subtitle: boundary.banner.subtitle,
        variant: boundary.banner.variant,
        deployKind: boundary.deployKind,
      }}
    />
  );
}
