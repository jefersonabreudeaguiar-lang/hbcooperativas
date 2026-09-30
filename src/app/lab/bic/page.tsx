import { notFound } from "next/navigation";
import { checkBicLabMirrorHealth } from "@/lib/lab/bicLabMirrorConfig";
import { isBicLabPageReachableServer } from "@/lib/lab/bicLabGate";
import { BicLabView } from "./BicLabView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BIC — Laboratório espelho",
  robots: { index: false, follow: false },
};

export default async function BicLabPage() {
  if (!isBicLabPageReachableServer()) {
    notFound();
  }

  const health = await checkBicLabMirrorHealth();
  return <BicLabView health={health} />;
}
