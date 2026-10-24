"use client";

import { startTransition } from "react";
import { cn } from "@/utils/format";

interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface ContaCoopSegmentTabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
  /** Estilo premium cooperado (HB Créditos). */
  variant?: "default" | "cooperado" | "cooperado-dark";
  /** Muitas abas no responsável — rolagem horizontal em vez de quebrar layout. */
  scrollable?: boolean;
}

export function ContaCoopSegmentTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  variant = "default",
  scrollable = false,
}: ContaCoopSegmentTabsProps<T>) {
  const cooperado = variant === "cooperado" || variant === "cooperado-dark";
  const cooperadoDark = variant === "cooperado-dark";
  return (
    <div
      className={cn(
        scrollable && "overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]",
        className
      )}
    >
      <div
        className={cn(
          "flex rounded-2xl p-1 gap-1",
          scrollable && "min-w-max w-max max-w-none",
          !scrollable && "w-full",
          cooperadoDark ? "bg-white/5 ring-1 ring-white/10" : cooperado ? "bg-emerald-900/[0.06]" : "bg-gray-100"
        )}
        role="tablist"
      >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => startTransition(() => onChange(tab.id))}
          className={cn(
            scrollable ? "shrink-0 min-w-[5.5rem] px-4" : "flex-1",
            "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
            active === tab.id
              ? cooperadoDark
                ? "bg-emerald-500 text-white shadow-sm"
                : cooperado
                  ? "bg-white text-emerald-900 shadow-sm"
                  : "bg-white text-green-900 shadow-sm"
              : cooperadoDark
                ? "text-slate-300 hover:text-white"
                : "text-gray-600 hover:text-gray-900"
          )}
        >
          {tab.label}
        </button>
      ))}
      </div>
    </div>
  );
}
