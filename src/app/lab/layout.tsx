import { notFound } from "next/navigation";
import { isHbCreditLabEnabledServer } from "@/modules/hb-credit-lab/config";

export default function LabRootLayout({ children }: { children: React.ReactNode }) {
  if (!isHbCreditLabEnabledServer()) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-[#0b1220] text-white">
      <div className="mx-auto min-h-dvh w-full max-w-md border-x border-white/10 bg-[#0f172a] shadow-2xl">
        {children}
      </div>
    </div>
  );
}
