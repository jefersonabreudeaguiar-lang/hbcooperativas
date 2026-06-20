import { cn } from "@/utils/format";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Variant = "info" | "success" | "warning" | "error";

const STYLES: Record<Variant, { box: string; icon: typeof Info }> = {
  info: { box: "bg-blue-50 border-blue-200 text-blue-900", icon: Info },
  success: { box: "bg-green-50 border-green-200 text-green-900", icon: CheckCircle2 },
  warning: { box: "bg-amber-50 border-amber-200 text-amber-900", icon: AlertCircle },
  error: { box: "bg-red-50 border-red-200 text-red-900", icon: AlertCircle },
};

interface AlertBannerProps {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function AlertBanner({ variant = "info", title, children, action, onDismiss, className }: AlertBannerProps) {
  const Icon = STYLES[variant].icon;
  return (
    <div className={cn("p-4 border rounded-xl flex items-start gap-3", STYLES[variant].box, className)}>
      <Icon size={22} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className={cn("font-semibold", children != null && children !== false && "mb-1")}>{title}</p>}
        {children != null && children !== false && (
          <div className="text-sm leading-relaxed">{children}</div>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 p-1 rounded-lg hover:bg-black/5" aria-label="Fechar">
          <X size={18} />
        </button>
      )}
    </div>
  );
}
