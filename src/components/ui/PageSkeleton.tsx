/** Skeleton padrão enquanto AppData ainda não carregou — evita flash branco. */
export function PageSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <div className="h-8 w-56 bg-gray-200 rounded-lg" />
        <div className="h-4 w-72 max-w-full bg-gray-100 rounded" />
      </div>
      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-28 bg-white rounded-xl border border-gray-200" />
          <div className="h-28 bg-white rounded-xl border border-gray-200" />
        </div>
      )}
      <div className="h-40 bg-white rounded-xl border border-gray-200" />
      {!compact && <div className="h-64 bg-white rounded-xl border border-gray-200" />}
    </div>
  );
}
