"use client";

interface AdminSectionHeaderProps {
  title: string;
  description: string;
  updatedAt?: string;
}

export function AdminSectionHeader({ title, description, updatedAt }: AdminSectionHeaderProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">{description}</p>
      {updatedAt && <p className="mt-2 text-xs text-slate-400">Atualizado em {updatedAt}</p>}
    </div>
  );
}
