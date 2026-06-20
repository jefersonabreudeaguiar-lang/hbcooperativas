import { cn } from "@/utils/format";

interface BadgeProps {
  status: string;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  paga: "bg-green-100 text-green-800 border-green-200",
  pago: "bg-green-100 text-green-800 border-green-200",
  quitada: "bg-green-100 text-green-800 border-green-200",
  conferido: "bg-blue-100 text-blue-800 border-blue-200",
  entregue: "bg-blue-100 text-blue-800 border-blue-200",
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  em_aberto: "bg-yellow-100 text-yellow-800 border-yellow-200",
  atrasada: "bg-red-100 text-red-800 border-red-200",
  parcelada: "bg-purple-100 text-purple-800 border-purple-200",
  parcial: "bg-orange-100 text-orange-800 border-orange-200",
  cancelado: "bg-gray-100 text-gray-600 border-gray-200",
  ativo: "bg-green-100 text-green-800 border-green-200",
  suspenso: "bg-orange-100 text-orange-800 border-orange-200",
  desligado: "bg-red-100 text-red-800 border-red-200",
  em_dia: "bg-green-100 text-green-800 border-green-200",
  com_debito: "bg-red-100 text-red-800 border-red-200",
  rascunho: "bg-gray-100 text-gray-600 border-gray-200",
  revisado: "bg-blue-100 text-blue-800 border-blue-200",
  aprovado: "bg-green-100 text-green-800 border-green-200",
  bloqueado: "bg-red-100 text-red-800 border-red-200",
  aguardando_confirmacao: "bg-blue-100 text-blue-800 border-blue-200",
  aguardando_analise: "bg-amber-100 text-amber-900 border-amber-300",
  precisa_corrigir: "bg-orange-100 text-orange-900 border-orange-300",
  aprovada: "bg-blue-100 text-blue-800 border-blue-200",
  em_analise: "bg-amber-100 text-amber-900 border-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  paga: "Paga",
  pago: "Pago",
  quitada: "Quitada",
  conferido: "Conferido",
  entregue: "Entregue",
  pendente: "Pendente",
  em_aberto: "Em Aberto",
  atrasada: "Atrasada",
  parcelada: "Parcelada",
  parcial: "Parcial",
  cancelado: "Cancelado",
  ativo: "Ativo",
  suspenso: "Suspenso",
  desligado: "Desligado",
  em_dia: "Em Dia",
  com_debito: "Com Débito",
  rascunho: "Rascunho",
  revisado: "Revisado",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado",
  aguardando_confirmacao: "Aguardando confirmação",
  aguardando_analise: "Em análise",
  precisa_corrigir: "Precisa corrigir",
  aprovada: "Aprovada",
  em_analise: "Em análise",
};

export function StatusBadge({ status, className }: BadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", style, className)}>
      {label}
    </span>
  );
}
