import type { AppData } from "@/types";

/** Nome para gestão/Conferir quando o cadastro local ainda não sincronizou (ficha/nota). */
export function resolverNomeCooperadoGestao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string {
  const direct = data.cooperados.find(
    (c) => c.cooperativaId === cooperativaId && c.id === cooperadoId
  );
  if (direct?.nomeCompleto?.trim()) return direct.nomeCompleto.trim();

  for (const f of data.fichaCorrida ?? []) {
    if (f.cooperativaId !== cooperativaId || f.cooperadoId !== cooperadoId) continue;
    if (f.cooperadoNomeSnapshot?.trim()) return f.cooperadoNomeSnapshot.trim();
  }
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== cooperativaId || n.cooperadoId !== cooperadoId) continue;
    if (n.cooperadoNomeSnapshot?.trim()) return n.cooperadoNomeSnapshot.trim();
  }
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== cooperativaId) continue;
    if (n.cooperadoId !== cooperadoId) continue;
    const ficha = (data.fichaCorrida ?? []).find(
      (row) => row.cooperativaId === cooperativaId && row.notaPedidoId === n.id
    );
    if (ficha?.cooperadoNomeSnapshot?.trim()) return ficha.cooperadoNomeSnapshot.trim();
  }
  return "";
}
