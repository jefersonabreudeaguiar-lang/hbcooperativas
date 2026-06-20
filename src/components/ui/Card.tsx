import { cn } from "@/utils/format";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "gold";
}

const VARIANT_STYLES = {
  default: "border-l-green-600",
  success: "border-l-green-500",
  warning: "border-l-yellow-500",
  danger: "border-l-red-500",
  gold: "border-l-amber-500",
};

export function StatCard({ title, value, subtitle, icon, variant = "default" }: StatCardProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm p-5 border-l-4", VARIANT_STYLES[variant])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {icon && <div className="text-green-600 opacity-80">{icon}</div>}
      </div>
    </div>
  );
}
