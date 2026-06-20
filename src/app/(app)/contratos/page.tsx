"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Plus, ChevronDown, ChevronUp, Package, Building2, Trash2 } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, Modal } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Form";
import { updateData, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushContratosToCloud, syncAllCooperativaFromCloud } from "@/services/cooperativaSyncCloudService";
import { formatCurrency } from "@/utils/format";
import { UNIDADES_MEDIDA, type ProdutoUnidade } from "@/utils/unidades";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import type { Instituicao, InstituicaoTipo, ProdutoInstituicao } from "@/types";
import { CONTRATO_PNAE_PADRAO_NOME } from "@/utils/contratosEntrega";

export default function ContratosPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const [novaInstModal, setNovaInstModal] = useState(false);
  const [nomeInst, setNomeInst] = useState("");
  const [tipoInst, setTipoInst] = useState<InstituicaoTipo>("PNAE");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemForms, setItemForms] = useState<Record<string, { nome: string; unidade: ProdutoUnidade; preco: string }>>({});
  const listasItensRef = useRef<Record<string, HTMLDivElement | null>>({});
  const nomeItemInputRef = useRef<Record<string, HTMLInputElement | null>>({});
  const itensCountRef = useRef(0);

  const instituicoes = useMemo(() => {
    if (!data) return [];
    return data.instituicoes.filter((i) => !coopId || i.cooperativaId === coopId);
  }, [data, coopId]);

  const produtosPorInst = useMemo(() => {
    if (!data) return new Map<string, ProdutoInstituicao[]>();
    const map = new Map<string, ProdutoInstituicao[]>();
    for (const inst of instituicoes) {
      map.set(
        inst.id,
        sortPorOrdemLancamento(
          data.produtosInstituicao.filter((p) => p.instituicaoId === inst.id && p.ativo)
        )
      );
    }
    return map;
  }, [data, instituicoes]);

  useEffect(() => {
    if (!expandedId) return;
    const count = produtosPorInst.get(expandedId)?.length ?? 0;
    if (count > itensCountRef.current) {
      requestAnimationFrame(() => {
        const lista = listasItensRef.current[expandedId];
        if (lista) lista.scrollTop = lista.scrollHeight;
      });
    }
    itensCountRef.current = count;
  }, [expandedId, produtosPorInst]);

  const getItemForm = (instId: string) =>
    itemForms[instId] ?? { nome: "", unidade: "kg" as ProdutoUnidade, preco: "" };

  const setItemForm = (instId: string, patch: Partial<{ nome: string; unidade: ProdutoUnidade; preco: string }>) => {
    setItemForms((prev) => ({ ...prev, [instId]: { ...getItemForm(instId), ...patch } }));
  };

  useEffect(() => {
    if (!data || !coopId || !user) return;
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (cnpj) await syncAllCooperativaFromCloud(cnpj);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId, user?.id]);

  const pushContratos = () => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushContratosToCloud(cnpj, d, coopId);
    })();
  };

  const handleNovaInstituicao = () => {
    if (!nomeInst.trim() || !user || !coopId) return;
    const now = new Date().toISOString();
    updateData((d) => {
      const newI: Instituicao = {
        id: generateId("i"),
        cooperativaId: coopId,
        nome: nomeInst.trim(),
        tipo: tipoInst,
        cnpj: "",
        responsavel: "",
        telefone: "",
        endereco: "",
        localEntrega: nomeInst.trim(),
        totalComprado: 0,
        createdAt: now,
        updatedAt: now,
      };
      return addAuditEntry(
        { ...d, instituicoes: [...d.instituicoes, newI] },
        { entityType: "instituicao", entityId: newI.id, action: "criar", userId: user.id, userName: user.name }
      );
    });
    setNomeInst("");
    setTipoInst("PNAE");
    setNovaInstModal(false);
    setExpandedId(null);
    pushContratos();
  };

  const handleAddItem = (inst: Instituicao) => {
    if (!user || !coopId) return;
    const form = getItemForm(inst.id);
    const preco = parseFloat(form.preco.replace(",", "."));
    if (!form.nome.trim() || !preco || preco <= 0) return;

    const now = new Date().toISOString();
    updateData((d) => ({
      ...d,
      produtosInstituicao: [
        ...d.produtosInstituicao,
        {
          id: generateId("pi"),
          cooperativaId: coopId,
          instituicaoId: inst.id,
          nome: form.nome.trim(),
          unidade: form.unidade,
          precoUnitario: preco,
          ativo: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
    setItemForm(inst.id, { nome: "", unidade: "kg", preco: "" });
    requestAnimationFrame(() => nomeItemInputRef.current[inst.id]?.focus());
    pushContratos();
  };

  const handleRemoveItem = (p: ProdutoInstituicao) => {
    if (!user || !confirm(`Remover "${p.nome}"?`)) return;
    updateData((d) => ({
      ...d,
      produtosInstituicao: d.produtosInstituicao.map((x) =>
        x.id === p.id ? { ...x, ativo: false, updatedAt: new Date().toISOString() } : x
      ),
    }));
    pushContratos();
  };

  if (!data) return null;

  const semItens = instituicoes.filter((i) => (produtosPorInst.get(i.id)?.length ?? 0) === 0);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Contratos"
        subtitle="Cadastre as instituições e os itens com preço de cada contrato"
        action={
          check("instituicoes", "create") && (
            <Button onClick={() => setNovaInstModal(true)}>
              <Plus size={18} /> Nova instituição
            </Button>
          )
        }
      />

      {semItens.length > 0 && (
        <AlertBanner variant="warning" title="Contratos incompletos" className="mb-4">
          {semItens.length} instituição(ões) ainda sem itens. Toque em cada uma e cadastre produto e preço.
        </AlertBanner>
      )}

      {instituicoes.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-2xl">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">Nenhuma instituição cadastrada</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">Comece cadastrando escolas ou compradores do contrato.</p>
          {check("instituicoes", "create") && (
            <Button onClick={() => { setTipoInst("PNAE"); setNomeInst(CONTRATO_PNAE_PADRAO_NOME); setNovaInstModal(true); }}>
              <Plus size={18} /> Novo contrato
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {instituicoes.map((inst) => {
            const itens = produtosPorInst.get(inst.id) ?? [];
            const open = expandedId === inst.id;
            const form = getItemForm(inst.id);

            return (
              <div key={inst.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(open ? null : inst.id);
                    if (!open) itensCountRef.current = itens.length;
                  }}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                    <Building2 size={20} className="text-green-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{inst.nome}</p>
                    <p className="text-xs text-gray-500">{itens.length} item(ns) cadastrado(s)</p>
                  </div>
                  {open ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                </button>

                {open && (
                  <div className="border-t border-gray-100 flex flex-col">
                    <div
                      ref={(el) => { listasItensRef.current[inst.id] = el; }}
                      className="max-h-52 sm:max-h-64 overflow-y-auto px-4 overscroll-contain scroll-smooth"
                    >
                      {itens.length > 0 ? (
                        <ul className="divide-y divide-gray-100 py-2">
                          {itens.map((p) => (
                            <li key={p.id} className="flex items-center justify-between py-3 gap-2">
                              <div>
                                <p className="font-medium text-gray-900">{p.nome}</p>
                                <p className="text-sm text-gray-500">
                                  {formatCurrency(p.precoUnitario)} / {p.unidade}
                                </p>
                              </div>
                              {check("instituicoes", "delete") && (
                                <button type="button" onClick={() => handleRemoveItem(p)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 my-3">Nenhum item ainda. Use o formulário abaixo.</p>
                      )}
                    </div>

                    {check("instituicoes", "create") && (
                      <div className="sticky bottom-0 z-10 shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-4 space-y-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
                        <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <Package size={16} /> Adicionar item
                        </p>
                        <FormField label="Nome do produto" required>
                          <Input
                            ref={(el) => { nomeItemInputRef.current[inst.id] = el; }}
                            value={form.nome}
                            onChange={(e) => setItemForm(inst.id, { nome: e.target.value })}
                            placeholder="Ex: Mandioca, Feijão..."
                          />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField label="Medida" required>
                            <Select
                              value={form.unidade}
                              onChange={(e) => setItemForm(inst.id, { unidade: e.target.value as ProdutoUnidade })}
                            >
                              {UNIDADES_MEDIDA.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </Select>
                          </FormField>
                          <FormField label="Preço" required>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={form.preco}
                              onChange={(e) => setItemForm(inst.id, { preco: e.target.value })}
                              placeholder="0,00"
                            />
                          </FormField>
                        </div>
                        <Button className="w-full" onClick={() => handleAddItem(inst)}>
                          <Plus size={16} /> Adicionar item
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={novaInstModal} onClose={() => setNovaInstModal(false)} title="Novo contrato" size="sm">
        <div className="space-y-4">
          <FormField label="Tipo de contrato" required>
            <Select
              value={tipoInst}
              onChange={(e) => {
                const t = e.target.value as InstituicaoTipo;
                setTipoInst(t);
                if (t === "PNAE" && !nomeInst.trim()) {
                  setNomeInst(CONTRATO_PNAE_PADRAO_NOME);
                }
              }}
            >
              <option value="PNAE">PNAE — Merenda escolar</option>
              <option value="escola">Escola</option>
              <option value="prefeitura">Prefeitura</option>
              <option value="associacao">Associação</option>
              <option value="mercado">Mercado</option>
              <option value="outro">Outro</option>
            </Select>
          </FormField>
          <FormField label="Nome do contrato" required hint="Ex: PNAE - MERENDA ESCOLAR, EMEF Prof. Maria Silva...">
            <Input
              value={nomeInst}
              onChange={(e) => setNomeInst(e.target.value)}
              placeholder={tipoInst === "PNAE" ? CONTRATO_PNAE_PADRAO_NOME : "Nome do contrato"}
              autoFocus
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setNovaInstModal(false)}>Cancelar</Button>
          <Button onClick={handleNovaInstituicao} disabled={!nomeInst.trim()}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
