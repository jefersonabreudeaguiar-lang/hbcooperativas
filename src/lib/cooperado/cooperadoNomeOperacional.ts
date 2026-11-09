import type { AppData } from "@/types";
import { nomeCooperadoSnapshotUtilizavel as nomeValido } from "@/lib/cooperado/nomeCooperadoValido";

/** Nome para gestão/Conferir quando o cadastro local ainda não sincronizou (ficha/nota). */
export function resolverNomeCooperadoGestao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string {
  const direct = data.cooperados.find(
    (c) => c.cooperativaId === cooperativaId && c.id === cooperadoId
  );
  if (nomeValido(direct?.nomeCompleto)) return nomeValido(direct?.nomeCompleto)!;

  for (const f of data.fichaCorrida ?? []) {
    if (f.cooperativaId !== cooperativaId || f.cooperadoId !== cooperadoId) continue;
    if (nomeValido(f.cooperadoNomeSnapshot)) return nomeValido(f.cooperadoNomeSnapshot)!;
  }
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== cooperativaId || n.cooperadoId !== cooperadoId) continue;
    if (nomeValido(n.cooperadoNomeSnapshot)) return nomeValido(n.cooperadoNomeSnapshot)!;
  }
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== cooperativaId) continue;
    if (n.cooperadoId !== cooperadoId) continue;
    const ficha = (data.fichaCorrida ?? []).find(
      (row) => row.cooperativaId === cooperativaId && row.notaPedidoId === n.id
    );
    if (nomeValido(ficha?.cooperadoNomeSnapshot)) return nomeValido(ficha?.cooperadoNomeSnapshot)!;
  }
  return "";
}
