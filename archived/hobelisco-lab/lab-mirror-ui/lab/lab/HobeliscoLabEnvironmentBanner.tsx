"use client";

import { AlertTriangle, FlaskConical, ShieldCheck } from "lucide-react";

export interface HobeliscoLabBannerProps {
  title: string;
  subtitle: string;
  variant: "production-safe" | "lab-active" | "danger";
  deployKind?: string;
}

export function HobeliscoLabEnvironmentBanner({
  title,
  subtitle,
  variant,
  deployKind,
}: HobeliscoLabBannerProps) {
  const styles =
    variant === "danger"
      ? "border-red-500/40 bg-red-950/80 text-red-100"
      : variant === "lab-active"
        ? "border-cyan-500/40 bg-cyan-950/60 text-cyan-50"
        : "border-emerald-500/30 bg-emerald-950/50 text-emerald-50";

  const Icon =
    variant === "danger" ? AlertTriangle : variant === "lab-active" ? FlaskConical : ShieldCheck;

  return (
    <div className={`relative z-30 border-b px-4 py-3 ${styles}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <Icon size={18} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-wide">{title}</p>
          <p className="text-xs opacity-90">{subtitle}</p>
        </div>
        {deployKind && (
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wider opacity-80">
            {deployKind}
          </span>
        )}
      </div>
    </div>
  );
}
