import type { NotaPedido } from "@/types";
import { getData } from "@/services/dataStore";
import { patchNotaPedidoInCloud, resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";

export type ConferenciaPatchCloudUser = Pick<
  import("@/types").User,
  "id" | "name" | "cooperativaCnpj" | "cooperativaId"
>;

export type ConferenciaPatchCloudOpts = {
  coopId: string;
  user: ConferenciaPatchCloudUser;
  nota: NotaPedido;
};

/** PATCH da nota após aprovação ou rejeição na conferência (sem push operacional). */
export async function patchNotaDecisaoConferenciaNaNuvem(
  opts: ConferenciaPatchCloudOpts
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = getData();
  const cnpj = await resolveCooperativaCnpj(d, opts.coopId, opts.user);
  if (!cnpj) {
    return { ok: false, error: "CNPJ da cooperativa não encontrado para sincronizar." };
  }
  const patched = await patchNotaPedidoInCloud(cnpj, opts.nota);
  if (!patched.ok) {
    return { ok: false, error: patched.error ?? "Não foi possível sincronizar a nota na nuvem." };
  }
  return { ok: true };
}
