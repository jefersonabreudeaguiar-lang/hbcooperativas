"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, UserCircle, Pencil, Download, Smartphone, PenLine } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { formatCPFCNPJ, formatPhone, formatMesReferencia, getCurrentMesReferencia, formatDate } from "@/utils/format";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { pushCooperadoToCloud, syncCooperadosFromCloud } from "@/services/cooperadoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getStatusCotaCooperado, setCotaIngressoCooperado } from "@/services/notaPedidoService";
import { sincronizarCicloCobrancaSaas } from "@/services/cobrancaSaasService";
import {
  cooperadoTemAppInstalado,
  resumoInstalacaoApp,
} from "@/services/cooperadoAppInstallService";
import { resumoAssinaturaCadastroApp } from "@/services/cooperadoAssinaturaService";
import type { Cooperado, CooperadoStatus } from "@/types";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function CooperadosPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [appFilter, setAppFilter] = useState<"" | "sem_app" | "com_app">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cooperado | null>(null);
  const [form, setForm] = useState<Partial<Cooperado>>({});

  const mesAtual = getCurrentMesReferencia();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const instalacao = useMemo(() => {
    if (!data || !coopId) return null;
    return resumoInstalacaoApp(data, coopId);
  }, [data, coopId]);

  const assinatura = useMemo(() => {
    if (!data || !coopId) return null;
    return resumoAssinaturaCadastroApp(data, coopId);
  }, [data, coopId]);

  const cooperados = useMemo(() => {
    if (!data || !user) return [];
    const cid = getUserCooperativaId(user, data);
    return data.cooperados.filter((c) => {
      if (cid && c.cooperativaId !== cid) return false;
      const matchSearch = !search || c.nomeCompleto.toLowerCase().includes(search.toLowerCase()) || c.cpfCnpj.includes(search);
      const matchStatus = !statusFilter || c.status === statusFilter;
      if (appFilter === "sem_app") {
        if (c.avulso || c.status !== "ativo" || cooperadoTemAppInstalado(c)) return false;
      }
      if (appFilter === "com_app") {
        if (c.avulso || c.status !== "ativo" || !cooperadoTemAppInstalado(c)) return false;
      }
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter, appFilter, user]);

  useEffect(() => {
    if (!user) return;
    const d = getData();
    const coopId = getUserCooperativaId(user, d);
    const coop = d.cooperativas.find((c) => c.id === coopId);
    const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
    if (cnpj.length === 14 && coopId) void syncCooperadosFromCloud(cnpj, coopId);
  }, [user?.id]);

  const openNew = () => {
    setEditing(null);
    const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
    setForm({ status: "ativo", produtos: [], cooperativaId: coopId, avulso: false, membroDiretoria: false });
    setModalOpen(true);
  };

  const openEdit = (c: Cooperado) => {
    setEditing(c);
    setForm({ ...c, produtos: c.produtos });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nomeCompleto || !user) return;
    if (!form.avulso && !form.cpfCnpj) return;
    const now = new Date().toISOString();
    const produtos = typeof form.produtos === "string" ? (form.produtos as string).split(",").map((p) => p.trim()) : form.produtos ?? [];
    const membroDiretoria = Boolean(form.membroDiretoria);
    let savedCooperado: Cooperado | null = null;

    updateData((d) => {
      let updated = { ...d };
      if (editing) {
        const chavePix = (form.chavePix ?? "").trim();
        savedCooperado = {
          ...editing,
          ...form,
          produtos,
          chavePix,
          membroDiretoria,
          avulso: form.avulso ?? false,
          pixValido: chavePix ? true : false,
          pixInvalidoMotivo: chavePix ? undefined : editing.pixInvalidoMotivo,
          updatedAt: now,
        } as Cooperado;
        updated.cooperados = d.cooperados.map((c) =>
          c.id === editing.id ? savedCooperado! : c
        );
        updated = addAuditEntry(updated, { entityType: "cooperado", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const coopId = form.cooperativaId ?? getUserCooperativaId(user, d);
        if (!coopId) return d;
        const chavePix = (form.chavePix ?? "").trim();
        savedCooperado = {
          id: generateId("c"),
          cooperativaId: coopId,
          nomeCompleto: form.nomeCompleto!,
          cpfCnpj: form.cpfCnpj ?? "",
          telefone: form.telefone ?? "",
          endereco: form.endereco ?? "",
          comunidade: form.comunidade ?? "",
          cafDap: form.cafDap ?? "",
          chavePix,
          pixValido: Boolean(chavePix),
          banco: form.banco ?? "",
          agencia: form.agencia ?? "",
          conta: form.conta ?? "",
          status: (form.status as CooperadoStatus) ?? "ativo",
          avulso: form.avulso ?? false,
          membroDiretoria,
          produtos,
          observacoes: form.observacoes ?? "",
          createdAt: now,
          updatedAt: now,
        };
        updated.cooperados = [...d.cooperados, savedCooperado];
        updated = addAuditEntry(updated, { entityType: "cooperado", entityId: savedCooperado.id, action: "criar", userId: user.id, userName: user.name });
        updated = sincronizarCicloCobrancaSaas(updated, coopId);
      }
      return updated;
    });

    if (savedCooperado && user) {
      const d = getData();
      const coopId = getUserCooperativaId(user, d);
      const coop = d.cooperativas.find((c) => c.id === coopId);
      const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
      if (cnpj.length === 14) {
        const push = await pushCooperadoToCloud(cnpj, savedCooperado);
        if (!push.ok) {
          window.alert(push.error ?? "Salvo no aparelho, mas não foi possível sincronizar na nuvem.");
        }
      }
    }

    setModalOpen(false);
  };

  const handleCota = (c: Cooperado, paga: boolean) => {
    if (!user) return;
    updateData((d) => {
      const next = setCotaIngressoCooperado(d, c.id, c.cooperativaId, mesAtual, paga);
      return addAuditEntry(next, {
        entityType: "cooperado",
        entityId: c.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: `Cota de ingresso · ${formatMesReferencia(mesAtual)} · ${paga ? "paga" : "não paga"}`,
      });
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, c.cooperativaId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, c.cooperativaId, { authoritative: true });
    })();
  };

  if (!data) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Cooperados"
        subtitle="Todos os cooperados cadastrados no CNPJ da cooperativa — abra a ficha para ver entregas e lançamentos"
        action={check("cooperados", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Novo Cooperado</Button>
        )}
      />

      {instalacao && (
        <Card className="mb-6 border-2 border-green-200 bg-gradient-to-r from-green-50 to-white">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-700 text-white shrink-0">
              <Smartphone size={24} />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h2 className="font-bold text-gray-900">App no celular</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Quem já instalou o HB Cooperativas na tela inicial (Android ou iPhone).
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-white border border-gray-200 px-3 py-2">
                  <p className="text-xs text-gray-500">Com app</p>
                  <p className="text-xl font-bold text-green-800">{instalacao.comApp}</p>
                </div>
                <div className="rounded-xl bg-white border border-amber-200 px-3 py-2">
                  <p className="text-xs text-gray-500">Sem app</p>
                  <p className="text-xl font-bold text-amber-800">{instalacao.semApp}</p>
                </div>
                <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-500">Elegíveis (ativos)</p>
                  <p className="text-xl font-bold text-gray-900">{instalacao.elegiveis}</p>
                </div>
              </div>

              {instalacao.semApp > 0 ? (
                <AlertBanner variant="warning" title={`${instalacao.semApp} cooperado(s) ainda sem o app`}>
                  <p className="mb-2">
                    Peça para abrir o site no celular e usar <strong>Baixar aplicativo</strong>. Quem já
                    instalou e abrir o app passa a aparecer como “Com app”.
                  </p>
                  <ul className="text-sm space-y-1 max-h-40 overflow-y-auto mb-3">
                    {instalacao.listaSemApp.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-gray-900">{c.nomeCompleto}</span>
                        {c.telefone ? (
                          <span className="text-gray-500">{formatPhone(c.telefone)}</span>
                        ) : (
                          <span className="text-gray-400">sem telefone</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setAppFilter("sem_app")}>
                      Ver só sem app
                    </Button>
                    <Link href="/baixar-app">
                      <Button size="sm">
                        <Download size={16} /> Abrir página de download
                      </Button>
                    </Link>
                  </div>
                </AlertBanner>
              ) : (
                <AlertBanner variant="success" title="Todos com o app">
                  Os cooperados ativos (exceto avulsos) já abriram o aplicativo instalado pelo menos uma vez.
                </AlertBanner>
              )}

              <p className="text-xs text-gray-500">
                Avulsos ({instalacao.avulsos}) não entram nesta conta — não usam o app.
              </p>
            </div>
          </div>
        </Card>
      )}

      {assinatura && assinatura.comApp > 0 && (
        <Card className="mb-6 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
              <PenLine size={24} />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h2 className="font-bold text-gray-900">Assinatura no app</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Cooperados que já aderiram ao aplicativo e cadastraram a firma manuscrita.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-white border border-gray-200 px-3 py-2">
                  <p className="text-xs text-gray-500">Com app</p>
                  <p className="text-xl font-bold text-indigo-800">{assinatura.comApp}</p>
                </div>
                <div className="rounded-xl bg-white border border-green-200 px-3 py-2">
                  <p className="text-xs text-gray-500">Assinatura ok</p>
                  <p className="text-xl font-bold text-green-800">{assinatura.comAssinatura}</p>
                </div>
                <div className="rounded-xl bg-white border border-amber-200 px-3 py-2 col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-500">Falta enviar</p>
                  <p className="text-xl font-bold text-amber-800">{assinatura.semAssinatura}</p>
                </div>
              </div>

              {assinatura.semAssinatura > 0 ? (
                <AlertBanner variant="warning" title={`${assinatura.semAssinatura} cooperado(s) sem assinatura cadastrada`}>
                  <p className="mb-2">
                    Peça para abrir <strong>Meu cadastro</strong> no app, fotografar a assinatura no papel e
                    confirmar. Quem já aderiu ao app deve completar este passo para votações e recibos.
                  </p>
                  <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                    {assinatura.listaSemAssinatura.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-gray-900">{c.nomeCompleto}</span>
                        {c.telefone ? (
                          <span className="text-gray-500">{formatPhone(c.telefone)}</span>
                        ) : (
                          <span className="text-gray-400">sem telefone</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </AlertBanner>
              ) : (
                <AlertBanner variant="success" title="Todos com assinatura">
                  Quem aderiu ao app já cadastrou a assinatura manuscrita.
                </AlertBanner>
              )}
            </div>
          </div>
        </Card>
      )}

      <FilterBar>
        <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="suspenso">Suspenso</option>
          <option value="desligado">Desligado</option>
        </Select>
        <Select value={appFilter} onChange={(e) => setAppFilter(e.target.value as "" | "sem_app" | "com_app")} className="max-w-[200px]">
          <option value="">App: todos</option>
          <option value="sem_app">Sem app no celular</option>
          <option value="com_app">Com app instalado</option>
        </Select>
      </FilterBar>

      <DataTable
        data={cooperados}
        keyField="id"
        columns={[
          { key: "nomeCompleto", label: "Nome", render: (c) => (
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span>
                {c.nomeCompleto}
                {c.avulso ? <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Avulso</span> : null}
                {c.membroDiretoria ? <span className="ml-2 text-xs font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">Diretoria</span> : null}
                {!c.avulso && c.status === "ativo" && (
                  cooperadoTemAppInstalado(c) ? (
                    <span className="ml-2 text-xs font-medium text-green-800 bg-green-100 px-1.5 py-0.5 rounded">App OK</span>
                  ) : (
                    <span className="ml-2 text-xs font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Sem app</span>
                  )
                )}
              </span>
              {check("cooperados", "edit") && (
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="text-gray-400 hover:text-green-700 p-1 rounded"
                  aria-label="Editar cooperado"
                >
                  <Pencil size={14} />
                </button>
              )}
            </span>
          ) },
          { key: "cpfCnpj", label: "CPF/CNPJ", render: (c) => (c.cpfCnpj ? formatCPFCNPJ(c.cpfCnpj) : "—") },
          { key: "comunidade", label: "Comunidade" },
          { key: "telefone", label: "Telefone", render: (c) => formatPhone(c.telefone) },
          {
            key: "app",
            label: "App",
            render: (c) => {
              if (c.avulso) return <span className="text-xs text-gray-400">Avulso</span>;
              if (cooperadoTemAppInstalado(c)) {
                return (
                  <span className="text-xs text-green-800">
                    Instalado
                    {c.appInstaladoEm ? (
                      <span className="block text-gray-500">{formatDate(c.appInstaladoEm.split("T")[0])}</span>
                    ) : null}
                  </span>
                );
              }
              return <span className="text-xs font-medium text-amber-800">Não instalou</span>;
            },
          },
          { key: "pix", label: "PIX", render: (c) => c.chavePix || "—" },
          { key: "produtos", label: "Produtos", render: (c) => c.produtos.join(", ") },
          { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
          {
            key: "cota",
            label: "Cota",
            render: (c) => {
              const status = getStatusCotaCooperado(data, c.id, mesAtual);
              const paga = status === "paga";
              return (
                <div className="space-y-2 min-w-[140px]">
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                      paga ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {paga ? "Paga" : "Não paga"}
                  </span>
                  {check("cooperados", "edit") && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={paga ? "primary" : "secondary"}
                        className="px-2 text-xs"
                        onClick={() => handleCota(c, true)}
                      >
                        Paga
                      </Button>
                      <Button
                        size="sm"
                        variant={!paga ? "primary" : "secondary"}
                        className="px-2 text-xs"
                        onClick={() => handleCota(c, false)}
                      >
                        Não paga
                      </Button>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400">{formatMesReferencia(mesAtual)}</p>
                </div>
              );
            },
          },
          {
            key: "ficha",
            label: "Ficha",
            render: (c) => (
              <Link href={`/cooperados/${c.id}`} className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium">
                <UserCircle size={16} /> Ver ficha
              </Link>
            ),
          },
          {
            key: "venda",
            label: "Lançar",
            render: (c) =>
              check("notas_pedido", "create") ? (
                <Link href={`/notas-pedido?cooperado=${c.id}&lancar=1`} className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium">
                  <ShoppingCart size={16} /> Lançar nota
                </Link>
              ) : null,
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Cooperado" : "Novo Cooperado"} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Nome Completo" required><Input value={form.nomeCompleto ?? ""} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} /></FormField>
          <FormField label="CPF ou CNPJ" required={!form.avulso} hint={form.avulso ? "Opcional para cooperado avulso" : undefined}>
            <Input value={form.cpfCnpj ?? ""} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} />
          </FormField>
          <FormField label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></FormField>
          <FormField label="Comunidade"><Input value={form.comunidade ?? ""} onChange={(e) => setForm({ ...form, comunidade: e.target.value })} /></FormField>
          <FormField label="Endereço"><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></FormField>
          <FormField label="CAF/DAP"><Input value={form.cafDap ?? ""} onChange={(e) => setForm({ ...form, cafDap: e.target.value })} /></FormField>
          <FormField label="Chave PIX"><Input value={form.chavePix ?? ""} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} /></FormField>
          <FormField label="Banco"><Input value={form.banco ?? ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></FormField>
          <FormField label="Agência"><Input value={form.agencia ?? ""} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></FormField>
          <FormField label="Conta"><Input value={form.conta ?? ""} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></FormField>
          <FormField label="Status">
            <Select value={form.status ?? "ativo"} onChange={(e) => setForm({ ...form, status: e.target.value as CooperadoStatus })}>
              <option value="ativo">Ativo</option>
              <option value="suspenso">Suspenso</option>
              <option value="desligado">Desligado</option>
            </Select>
          </FormField>
          <FormField label="Produtos (separados por vírgula)"><Input value={Array.isArray(form.produtos) ? form.produtos.join(", ") : ""} onChange={(e) => setForm({ ...form, produtos: e.target.value.split(",").map((p) => p.trim()) })} /></FormField>
          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.membroDiretoria ?? false}
                onChange={(e) => setForm({ ...form, membroDiretoria: e.target.checked })}
                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Membro da diretoria</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Participa de votações restritas à diretoria e recebe avisos exclusivos enviados pela cooperativa.
                </span>
              </span>
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.avulso ?? false}
                onChange={(e) => setForm({ ...form, avulso: e.target.checked })}
                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Cooperado avulso</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Não usa o app. A cooperativa lança as entregas direto, sem foto de nota.
                </span>
              </span>
            </label>
          </div>
          <div className="md:col-span-2">
            <FormField label="Observações"><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></FormField>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={() => void handleSave()}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
