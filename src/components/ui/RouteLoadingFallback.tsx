/** Skeleton leve enquanto code-split de rotas pesadas carrega. */
export function RouteLoadingFallback({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="p-6 lg:p-8 animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 rounded-lg bg-gray-200" />
      <div className="h-4 w-full max-w-md rounded bg-gray-100" />
      <div className="grid gap-3 mt-6">
        <div className="h-24 rounded-xl bg-gray-100" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
      <p className="text-sm text-gray-500 pt-2">{label}</p>
    </div>
  );
}
