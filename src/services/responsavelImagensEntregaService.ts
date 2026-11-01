import type { NotaPedido } from "@/types";

export interface EnvioImagensResponsavel {
  nota: NotaPedido;
  enviadas: number;
}

/** Retoma o mesmo envio após falha; só publica depois de todas as imagens confirmadas. */
export async function enviarImagensResponsavel(
  envio: EnvioImagensResponsavel,
  total: number,
  upload: (index: number, nota: NotaPedido) => Promise<void>,
  publicar: (nota: NotaPedido) => Promise<void>,
  progresso: (enviadas: number) => void,
): Promise<NotaPedido> {
  if (!Number.isInteger(total) || total < 1) throw new Error("Adicione pelo menos uma imagem.");
  while (envio.enviadas < total) {
    await upload(envio.enviadas, { ...envio.nota, status: "rascunho" });
    envio.enviadas += 1;
    progresso(envio.enviadas);
  }
  const final: NotaPedido = {
    ...envio.nota, status: "aguardando_conferencia", fotosEnviadasCount: total,
    fotoNaNuvem: true, fotoEnviadaEm: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await publicar(final);
  return final;
}
