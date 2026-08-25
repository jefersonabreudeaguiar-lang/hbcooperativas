import { LabShell } from "@/modules/hb-credit-lab/components/LabShell";

export default function SegurancaPage() {
  return (
    <LabShell title="Segurança da conta" subtitle="Princípios preparados para produção futura." backHref="/lab/conta-coop">
      <ul className="space-y-3 text-sm text-slate-300">
        <li className="rounded-xl border border-white/10 bg-white/5 p-4">
          <strong className="text-white block mb-1">Cliente não é confiável</strong>
          Saldo e pagamentos validados somente no servidor.
        </li>
        <li className="rounded-xl border border-white/10 bg-white/5 p-4">
          <strong className="text-white block mb-1">QR não é a verdade</strong>
          Cobrança validada via Payment Intent + nonce + expiração.
        </li>
        <li className="rounded-xl border border-white/10 bg-white/5 p-4">
          <strong className="text-white block mb-1">Idempotência</strong>
          Chaves evitam double-spend em retentativas.
        </li>
        <li className="rounded-xl border border-white/10 bg-white/5 p-4">
          <strong className="text-white block mb-1">Ledger append-only</strong>
          Lançamentos de crédito/débito auditáveis, sem edição destrutiva.
        </li>
      </ul>
    </LabShell>
  );
}
