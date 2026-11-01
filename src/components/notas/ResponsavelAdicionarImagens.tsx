"use client";

import { useRef, useState } from "react";
import type { Cooperado, Instituicao, NotaPedido } from "@/types";
import { usePermissions } from "@/hooks/usePermissions";
import { getData, generateId, updateData, addAuditEntry } from "@/services/dataStore";
import { gerarNumeroNota } from "@/services/notaPedidoService";
import { resolveCooperativaCnpj, finalizeNotaEntregaNaNuvem } from "@/services/notaPedidoCloudService";
import { MAX_FOTOS_POR_SESSAO_ENTREGA } from "@/utils/fotoEntrega";
import { enviarImagensResponsavel, type EnvioImagensResponsavel } from "@/services/responsavelImagensEntregaService";

export default function ResponsavelAdicionarImagens({ coopId, cooperados, instituicoes, onSent }: {
  coopId: string; cooperados: Cooperado[]; instituicoes: Instituicao[]; onSent: (nota: NotaPedido) => void;
}) {
  const { user, check, isCooperado } = usePermissions();
  const [cooperadoId, setCooperadoId] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [dataEntrega, setDataEntrega] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [observacoes, setObservacoes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hasPending, setHasPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const envioRef = useRef<EnvioImagensResponsavel | null>(null);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = busy || hasPending;
  const permit = !isCooperado && check("notas_pedido", "create");

  async function enviar() {
    if (busyRef.current || !permit || !user) return;
    setError("");
    const cooperado = cooperados.find(c => c.id === cooperadoId);
    const inst = instituicoes.find(i => i.id === instituicaoId);
    if (!cooperado || (instituicaoId && !inst) || !files.length || !/^\d{4}-\d{2}-\d{2}$/.test(dataEntrega)) {
      setError("Escolha o cooperado, a data e pelo menos uma imagem."); return;
    }
    busyRef.current = true; setBusy(true);
    try {
      if (!navigator.onLine) throw new Error("Conecte-se à internet para enviar as imagens.");
      if (files.length > MAX_FOTOS_POR_SESSAO_ENTREGA) throw new Error(`Escolha no máximo ${MAX_FOTOS_POR_SESSAO_ENTREGA} imagens por entrega.`);
      const pipeline = await import("@/services/imagePipelineService");
      for (const file of files) {
        const valid = pipeline.validateImageFile(file);
        if (!valid.ok) throw new Error(`${file.name}: ${valid.error ?? "Imagem inválida."}`);
      }
      const data = getData();
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (!cnpj) throw new Error("Não foi possível identificar a cooperativa. Atualize e tente novamente.");
      if (!envioRef.current) {
        const now = new Date().toISOString();
        envioRef.current = { enviadas: 0, nota: {
          id: generateId("np"), cooperativaId: coopId, cooperativaCnpj: cnpj,
          cooperadoId, cooperadoNomeSnapshot: cooperado.nomeCompleto, instituicaoId,
          numeroNota: gerarNumeroNota(data, coopId), dataEntrega, mesReferencia: dataEntrega.slice(0, 7),
          localEntrega: inst?.localEntrega ?? inst?.endereco ?? "", observacoes,
          itens: [], valorBruto: 0, valorDesconto: 0, valorLiquido: 0,
          percentualDescontoCooperativa: data.config.descontoPadraoCooperativa,
          status: "rascunho", createdAt: now, updatedAt: now, fotosEnviadasCount: files.length,
        } };
      }
      setHasPending(true);
      const final = await enviarImagensResponsavel(envioRef.current, files.length, async (index, nota) => {
        setProgress(`Enviando imagem ${index + 1} de ${files.length}…`);
        const processed = await pipeline.processDeliveryImage(files[index]);
        try {
          const result = await pipeline.uploadImageToSupabase({ cnpj, nota, index, totalCount: files.length,
            blob: processed.compressed, mimeType: processed.mimeType, cooperadoNome: cooperado.nomeCompleto });
          if (!result.ok) throw new Error(result.error ?? "Não foi possível enviar a imagem. Tente novamente.");
        } finally { URL.revokeObjectURL(processed.previewUrl); }
      }, async nota => {
        setProgress("Confirmando entrega na fila…");
        const result = await finalizeNotaEntregaNaNuvem(cnpj, nota, cooperado.nomeCompleto);
        if (!result.ok) throw new Error(result.error ?? "Não foi possível confirmar o envio. Tente novamente.");
      }, () => {});
      updateData(d => addAuditEntry({ ...d, notasPedido: [...d.notasPedido.filter(n => n.id !== final.id), final] }, {
        entityType: "nota_pedido", entityId: final.id, action: "criar", userId: user.id, userName: user.name,
        changes: `Responsável enviou ${files.length} imagem(ns) para ${cooperado.nomeCompleto}`,
      }));
      envioRef.current = null; setHasPending(false); setFiles([]); setObservacoes(""); setProgress("");
      if (inputRef.current) inputRef.current.value = "";
      onSent(final);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no envio. Tente novamente."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (!permit) return null;
  return <section className="rounded-xl border bg-white p-5 mb-6 space-y-4" aria-labelledby="adicionar-imagens-titulo">
    <div><h2 id="adicionar-imagens-titulo" className="text-lg font-bold text-gray-900">Adicionar imagens de entrega</h2>
      <p className="text-sm text-gray-600 mt-1">Selecione o cooperado e as imagens da mesma entrega. Depois do envio, confira os itens e valores na fila.</p></div>
    <fieldset disabled={locked} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Cooperado
          <select className="mt-1 w-full rounded-lg border p-3 bg-white" value={cooperadoId} onChange={e => setCooperadoId(e.target.value)}>
            <option value="">Selecione o cooperado</option>{cooperados.map(c => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
          </select></label>
        <label className="text-sm font-medium">Contrato / instituição (opcional)
          <select className="mt-1 w-full rounded-lg border p-3 bg-white" value={instituicaoId} onChange={e => setInstituicaoId(e.target.value)}>
            <option value="">Definir na conferência</option>{instituicoes.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select></label>
        <label className="text-sm font-medium">Data da entrega<input type="date" className="mt-1 w-full rounded-lg border p-3" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} /></label>
      </div>
      <label className="block text-sm font-medium">Imagens da entrega
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" onChange={e => { setFiles(Array.from(e.target.files ?? [])); setError(""); }} />
      </label>
      {files.length > 0 && <ul className="text-sm text-gray-600 max-h-40 overflow-auto">{files.map((f, i) => <li key={`${i}-${f.name}`} className="break-words">{i + 1}. {f.name}</li>)}</ul>}
      <label className="block text-sm font-medium">Observações (opcional)<textarea className="mt-1 w-full rounded-lg border p-3" rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} /></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}{hasPending && " As imagens confirmadas serão reaproveitadas ao tentar novamente."}</p>}
    <p role="status" className="text-sm text-gray-600">{progress}</p>
    <button type="button" disabled={busy || !files.length || !cooperadoId} onClick={() => void enviar()} className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white disabled:opacity-50" aria-busy={busy}>
      {busy ? "Enviando…" : hasPending ? "Tentar envio novamente" : "Enviar para conferir entregas"}
    </button>
  </section>;
}
