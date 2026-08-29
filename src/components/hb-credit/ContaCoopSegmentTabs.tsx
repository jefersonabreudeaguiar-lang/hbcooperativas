"use client";

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
}

export function ContaCoopSegmentTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: ContaCoopSegmentTabsProps<T>) {
  return (
    <div className={cn("flex rounded-2xl bg-gray-100 p-1 gap-1", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
            active === tab.id
              ? "bg-white text-green-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
