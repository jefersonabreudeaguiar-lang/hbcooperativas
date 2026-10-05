"use client";

import type { AppData, NotaPedido } from "@/types";
import { Button } from "@/components/ui/Button";
import {
  FOTO_ENTREGA_CONFERENCIA_IMG,
  FOTO_ENTREGA_CONFERENCIA_PANEL,
} from "@/components/notas/fotoEntregaDisplay";
import { getCooperadoNomeResolvido } from "@/services/cooperadoCloudService";
import { cn, formatDate } from "@/utils/format";
import { getEscolaNotaLabel } from "@/utils/notaEscolaLabel";
import {
  contarFotosEnviadasNota,
  getFotosExibicaoNota,
  notaTemFotoArmazenadaNaNuvem,
} from "@/utils/fotoEntrega";

export type ConferenciaLancamentoSequencia = {
  url: string;
  displayIdx: number;
  total: number;
};

export type NotasPedidoConferirFotoPainelProps = {
  selectedNota: NotaPedido;
  data: AppData;
  coopId: string | undefined;
  lancamentoSequencia: ConferenciaLancamentoSequencia | null;
  conferenciaFotoIdx: number;
  conferenciaFotoCarregando: boolean;
  conferenciaFotoAtualUrl: string | null;
  conferenciaFotoErro: string;
  conferenciaTransicao: boolean;
  fotosLancadasUi: ReadonlySet<number>;
  onAmpliarFoto: () => void;
  onFotoImgError: (fotoIdx: number) => void;
  onRetryFotoAtual: (fotoIdx: number) => void;
  onRecarregarFotos: () => void;
  onIrParaFoto: (idx: number) => void;
};

export function NotasPedidoConferirFotoPainel({
  selectedNota,
  data,
  coopId,
  lancamentoSequencia,
  conferenciaFotoIdx,
  conferenciaFotoCarregando,
  conferenciaFotoAtualUrl,
  conferenciaFotoErro,
  conferenciaTransicao,
  fotosLancadasUi,
  onAmpliarFoto,
  onFotoImgError,
  onRetryFotoAtual,
  onRecarregarFotos,
  onIrParaFoto,
}: NotasPedidoConferirFotoPainelProps) {
  const totalFotosNav = contarFotosEnviadasNota(selectedNota);
  const idxNav = Math.min(conferenciaFotoIdx, Math.max(0, totalFotosNav - 1));

  return (
    <div className="flex flex-col w-full lg:w-[48%] xl:w-1/2 bg-gray-900 shrink-0 lg:h-full lg:min-h-0 min-h-0 border-b border-gray-800 lg:border-b-0">
      <div className={cn("flex flex-col min-h-0", FOTO_ENTREGA_CONFERENCIA_PANEL)}>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex items-center justify-center p-2 sm:p-3">
          {(() => {
            if (lancamentoSequencia) {
              const { url, displayIdx, total } = lancamentoSequencia;
              return (
                <div className="w-full h-full flex flex-col items-center justify-center text-center min-h-0">
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                    <div className="inline-block max-w-full max-h-full rounded-xl border-2 border-green-400/40 bg-white/5 p-1.5 shadow-lg ring-4 ring-green-500/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Lançada ${displayIdx + 1} de ${total}`}
                        className={FOTO_ENTREGA_CONFERENCIA_IMG}
                      />
                    </div>
                  </div>
                  <p className="shrink-0 text-green-400 font-semibold text-sm mt-2 px-2">
                    Foto {displayIdx + 1} de {total} · Lançada na ficha ✓
                  </p>
                  <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 py-2 px-2">
                    {Array.from({ length: total }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-full border",
                          i <= displayIdx
                            ? "bg-green-500/20 border-green-400 text-green-200"
                            : "bg-white/10 border-white/20 text-white/50"
                        )}
                      >
                        Foto {i + 1}
                        {i <= displayIdx ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            }

            const totalFotos = contarFotosEnviadasNota(selectedNota);
            const idx = Math.min(conferenciaFotoIdx, Math.max(0, totalFotos - 1));
            if (totalFotos > 0) {
              return conferenciaFotoCarregando && !conferenciaFotoAtualUrl ? (
                <p className="text-white/70 text-sm text-center">Carregando foto…</p>
              ) : conferenciaFotoAtualUrl ? (
                <div className="inline-block max-w-full rounded-xl border-2 border-white/25 bg-white/5 p-1.5 shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <button
                    type="button"
                    className="block max-w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 rounded-lg"
                    onClick={onAmpliarFoto}
                    title="Toque para ver a foto em tela cheia"
                  >
                    <img
                      src={conferenciaFotoAtualUrl}
                      alt={`Pedido ${idx + 1} de ${totalFotos}`}
                      className={FOTO_ENTREGA_CONFERENCIA_IMG}
                      onError={() => onFotoImgError(idx)}
                    />
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-white/60">
                    Toque na foto para ampliar · imagem inteira visível
                  </p>
                </div>
              ) : (
                <div className="text-center py-6 px-4 space-y-3 max-w-md mx-auto">
                  <p className="text-amber-200 text-sm">
                    {conferenciaFotoErro || "Foto ainda não carregou. Aguarde ou tente de novo."}
                  </p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onRetryFotoAtual(idx)}>
                    Tentar de novo
                  </Button>
                </div>
              );
            }
            if (conferenciaFotoErro) {
              return (
                <div className="text-center py-12 px-4 space-y-3">
                  <p className="text-red-300 text-sm">{conferenciaFotoErro}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={onRecarregarFotos}>
                    Tentar carregar de novo
                  </Button>
                </div>
              );
            }
            if (conferenciaTransicao) {
              return <p className="text-gray-400 text-center py-12">Carregando fotos da nuvem...</p>;
            }
            if (notaTemFotoArmazenadaNaNuvem(selectedNota) && contarFotosEnviadasNota(selectedNota) > 0) {
              return (
                <div className="text-center py-12 px-4 space-y-3">
                  <p className="text-red-300 text-sm">
                    Fotos na nuvem, mas não carregaram neste aparelho. Verifique a conexão.
                  </p>
                  <Button type="button" variant="secondary" size="sm" onClick={onRecarregarFotos}>
                    Tentar carregar de novo
                  </Button>
                </div>
              );
            }
            return <p className="text-gray-400 text-center py-12">Sem foto</p>;
          })()}
        </div>
        {totalFotosNav > 1 ? (
          <div className="shrink-0 border-t border-white/10 px-2 py-2 space-y-2 bg-gray-900/95">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {Array.from({ length: totalFotosNav }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onIrParaFoto(i)}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                    i === idxNav
                      ? "border-green-400 bg-green-500/20 text-green-100"
                      : fotosLancadasUi.has(i)
                        ? "border-green-600/60 bg-green-900/30 text-green-200"
                        : "border-white/20 text-white/70 hover:border-white/40"
                  )}
                >
                  Foto {i + 1}
                  {fotosLancadasUi.has(i) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 text-white/90 text-sm">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={idxNav <= 0}
                onClick={() => onIrParaFoto(idxNav - 1)}
              >
                Anterior
              </Button>
              <span className="font-medium tabular-nums">
                Foto {idxNav + 1} de {totalFotosNav}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={idxNav >= totalFotosNav - 1}
                onClick={() => onIrParaFoto(idxNav + 1)}
              >
                Próxima foto
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 px-4 py-3 bg-black/40 text-white text-sm space-y-0.5">
        <p>
          <strong>{getCooperadoNomeResolvido(data, selectedNota.cooperadoId, coopId)}</strong> ·{" "}
          {formatDate(selectedNota.dataEntrega)}
        </p>
        <p className="text-white/80">
          {getEscolaNotaLabel(selectedNota, data.instituicoes)} · {selectedNota.numeroNota}
          {getFotosExibicaoNota(selectedNota).length > 1
            ? ` · ${getFotosExibicaoNota(selectedNota).length} fotos`
            : ""}
        </p>
      </div>
    </div>
  );
}
