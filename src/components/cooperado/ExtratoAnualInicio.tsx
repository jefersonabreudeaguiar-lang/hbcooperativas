"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { secureApiFetch } from "@/lib/security/clientSession";
import type { ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { extratosAnuaisHtml } from "@/utils/extratoAnualHtml";

type Pendente = { revisao: string; nomeCooperativa: string; extrato: ExtratoAnualCooperado };

export function ExtratoAnualInicio({ cnpj }: { cnpj: string }) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [aberto, setAberto] = useState("");
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState(false);
  const baixadoRef = useRef("");
  const atual = pendentes[0];

  useEffect(() => {
    const controller = new AbortController();
    if (cnpj) {
      void secureApiFetch(`/api/extratos-anuais?cnpj=${encodeURIComponent(cnpj)}`, { signal: controller.signal, cache: "no-store" })
        .then(async r => {
          if (r.ok) {
            const dados = await r.json();
            if (!controller.signal.aborted) setPendentes(dados.pendentes);
          }
        }).catch(() => {});
    }
    return () => controller.abort();
  }, [cnpj]);

  if (!atual) return null;

  function abrir() {
    const popup = window.open("", "_blank");
    if (!popup) { setErro("Permita a abertura de uma nova janela para visualizar o extrato."); return; }
    popup.document.write(extratosAnuaisHtml([atual.extrato], atual.nomeCooperativa));
    popup.document.close();
    setAberto(atual.revisao);
    setErro("");
  }

  async function baixar() {
    if (baixando || aberto !== atual.revisao) return;
    setBaixando(true);
    setErro("");
    try {
      if (baixadoRef.current !== atual.revisao) {
        const { gerarExtratoAnualPdf } = await import("@/utils/extratoAnualPdf");
        gerarExtratoAnualPdf(atual.extrato, atual.nomeCooperativa).save(`extrato-anual-${atual.extrato.ano}.pdf`);
        baixadoRef.current = atual.revisao;
      }
      const r = await secureApiFetch("/api/extratos-anuais", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj, ano: atual.extrato.ano, revisao: atual.revisao }),
      });
      if (!r.ok) throw new Error("Download iniciado. Não foi possível confirmar na nuvem. Tente confirmar novamente.");
      setPendentes(prev => prev.filter(p => p.revisao !== atual.revisao));
      setAberto("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível baixar o extrato.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Card title={`Seu extrato anual de ${atual.extrato.ano}`}>
      <p className="text-sm text-gray-700">Veja suas entregas e baixe uma cópia. O aviso sai do Início após o download ser confirmado.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={abrir}>Abrir extrato</Button>
        <Button type="button" variant="secondary" disabled={aberto !== atual.revisao || baixando} onClick={() => void baixar()}>
          {baixando ? "Preparando…" : baixadoRef.current === atual.revisao ? "Confirmar download" : "Baixar PDF"}
        </Button>
      </div>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
    </Card>
  );
}
