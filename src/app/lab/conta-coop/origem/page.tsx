import { LabShell } from "@/modules/hb-credit-lab/components/LabShell";

export default function OrigemSaldoPage() {
  return (
    <LabShell title="Origem do meu saldo" subtitle="Futuro: crédito gerado por entregas conferidas." backHref="/lab/conta-coop">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 space-y-3">
        <p>
          No laboratório, o saldo é <strong className="text-white">fictício (LAB_ONLY)</strong> e não vem da Ficha
          Corrida nem de entregas reais.
        </p>
        <p>
          A interface <code className="text-teal-300">CreditSourceProvider</code> está preparada para, no futuro,
          listar valores elegíveis — sem alterar o cálculo operacional atual.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>Seed inicial: R$ 485,00 (demo)</li>
          <li>Origem futura: vendas/entregas conferidas</li>
          <li>Hoje: nenhuma ligação automática</li>
        </ul>
      </div>
    </LabShell>
  );
}
