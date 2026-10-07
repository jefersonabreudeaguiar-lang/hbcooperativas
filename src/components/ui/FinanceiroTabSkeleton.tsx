/** Placeholder da aba Financeiro — evita flash branco enquanto o chunk pesado carrega. */
export function FinanceiroTabSkeleton() {
  return (
    <div className="min-h-[50vh] bg-gray-50 space-y-4" aria-busy="true" aria-label="Carregando financeiro">
      <div className="space-y-2 animate-pulse">
        <div className="h-8 w-40 bg-gray-200 rounded-lg" />
        <div className="h-4 w-64 max-w-full bg-gray-100 rounded" />
      </div>
      <div className="h-32 bg-white rounded-xl border border-green-100 shadow-sm animate-pulse" />
      <div className="h-48 bg-white rounded-xl border border-gray-200 animate-pulse" />
    </div>
  );
}
