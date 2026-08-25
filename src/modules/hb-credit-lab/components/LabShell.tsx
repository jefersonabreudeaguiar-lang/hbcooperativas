import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LabBanner() {
  return (
    <div className="bg-amber-500/15 border-b border-amber-400/30 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-200">
      Laboratório · dados fictícios · sem dinheiro real
    </div>
  );
}

export function LabShell({
  title,
  subtitle,
  backHref,
  children,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <LabBanner />
      <header className="px-5 pt-5 pb-4 border-b border-white/10">
        {backHref && (
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-400 mb-3">
            <ArrowLeft size={16} /> Voltar
          </Link>
        )}
        {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </header>
      <main className="px-5 py-5 pb-10">{children}</main>
    </>
  );
}

export function LabPrimaryButton({
  href,
  onClick,
  children,
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const className =
    "flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3.5 text-base font-semibold text-slate-950 disabled:opacity-50";

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export function LabSecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium"
    >
      {children}
    </Link>
  );
}
