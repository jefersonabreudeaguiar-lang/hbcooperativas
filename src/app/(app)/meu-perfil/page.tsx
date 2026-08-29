"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Building2, Eye, EyeOff, Trash2 } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId, getCooperativaById, formatCnpj } from "@/utils/cooperativa";
import { PageHeader } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, addAuditEntry, syncCooperativaWithCloud, getData } from "@/services/dataStore";
import { fetchCooperativaByCnpjFromCloud } from "@/services/cooperativaCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  pushCooperativaProfileToCloud,
  pushOperacionalToCloud,
} from "@/services/cooperativaSyncCloudService";
import { ensureMensalidadeCooperado, aplicarConfigMensalidadeCooperativa, mergeConfigMensalidadeCooperativa, getConfigMensalidadeCooperativa } from "@/services/mensalidadeService";
import { formatCurrency } from "@/utils/format";
import { isDiretoriaRole } from "@/permissions";
import { EquipeResponsaveisPanel } from "@/components/equipe/EquipeResponsaveisPanel";
import { EquipeContadorPanel } from "@/components/equipe/EquipeContadorPanel";
import { exigeSenhaCadastroCooperado } from "@/utils/cooperativaCadastro";
import type { Cooperativa, MensalidadeConfig } from "@/types";

export default function MeuPerfilPage() {
  const data = useAppData();
  const { user, check } = usePermissions();
  const router = useRouter();
  const [form, setForm] = useState<Partial<Cooperativa>>({});
  const [mensCfg, setMensCfg] = useState<MensalidadeConfig>({
    valorPadrao: 0,
    diaVencimento: 10,
    lembreteAtivo: false,
    diaLembrete: 1,
    gerarAutomaticamente: false,
  });
  const [saved, setSaved] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSynced, setCloudSynced] = useState<boolean | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudJustPublished, setCloudJustPublished] = useState(false);
  const [showSenhaCadastro, setShowSenhaCadastro] = useState(false);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperativa = data && coopId ? getCooperativaById(data, coopId) : undefined;

  useEffect(() => {
    if (user && !isDiretoriaRole(user.role)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (!cooperativa || !data) return;
    setForm({ ...cooperativa });
    const cfg = getConfigMensalidadeCooperativa(data, cooperativa.id);
    setMensCfg({
      valorPadrao: cfg?.valorPadrao ?? 0,
      diaVencimento: cfg?.diaVencimento ?? 10,
      lembreteAtivo: cfg?.lembreteAtivo ?? false,
      diaLembrete: cfg?.diaLembrete ?? 1,
      lembreteTitulo: cfg?.lembreteTitulo ?? "",
      lembreteTexto: cfg?.lembreteTexto ?? "",
      gerarAutomaticamente: cfg?.gerarAutomaticamente ?? false,
      mesesCobranca: cfg?.mesesCobranca ?? [],
    });
  }, [cooperativa, data]);

  useEffect(() => {
    if (!cooperativa) return;
    let cancelled = false;
    (async () => {
      const inCloud = await fetchCooperativaByCnpjFromCloud(cooperativa.cnpj);
      if (cancelled) return;
      if (inCloud) {
        setCloudSynced(true);
        return;
      }
      setCloudSynced(false);
      setCloudSyncing(true);
      const result = await syncCooperativaWithCloud(cooperativa);
      if (cancelled) return;
      setCloudSyncing(false);
      if (result.success) {
        setCloudSynced(true);
        setCloudJustPublished(true);
        setTimeout(() => setCloudJustPublished(false), 5000);
      } else {
        setCloudSyncError(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, [cooperativa]);

  const handlePublishCnpj = async () => {
    if (!cooperativa) return;
    setCloudSyncing(true);
    setCloudSyncError("");
    const result = await syncCooperativaWithCloud(cooperativa);
    setCloudSyncing(false);
    if (result.success) {
      setCloudSynced(true);
      setCloudJustPublished(true);
      setTimeout(() => setCloudJustPublished(false), 5000);
    } else {
      setCloudSyncError(result.error);
    }
  };

  if (!data || !user || !isDiretoriaRole(user.role)) return null;

  if (!cooperativa) {
    return (
      <AlertBanner variant="warning" title="Cooperativa não vinculada">
        Sua conta ainda não está vinculada a uma cooperativa. Entre em contato com o suporte.
      </AlertBanner>
    );
  }

  const canEdit = check("cooperativas", "edit");
  const senhaCadastroAtiva = exigeSenhaCadastroCooperado({
    senhaCadastroCooperado: form.senhaCadastroCooperado ?? cooperativa.senhaCadastroCooperado,
  });

  const pushPerfilParaNuvem = async () => {
    const d = getData();
    const cnpj = await resolveCooperativaCnpj(d, coopId!, user!);
    const coop = d.cooperativas.find((c) => c.id === coopId);
    if (cnpj && coop) {
      await pushCooperativaProfileToCloud(coop);
      await pushOperacionalToCloud(cnpj, d, coopId!, { authoritative: true });
    }
  };

  const handleSave = () => {
    if (!user || !coopId || !form.nome) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = {
        ...d,
        cooperativas: d.cooperativas.map((c) =>
          c.id === coopId
            ? {
                ...c,
                nome: form.nome!,
                endereco: form.endereco ?? "",
                telefone: form.telefone ?? "",
                email: form.email ?? "",
                responsavel: form.responsavel ?? c.responsavel,
                senhaCadastroCooperado: form.senhaCadastroCooperado?.trim() || undefined,
                updatedAt: now,
              }
            : c
        ),
      };
      const cfgPatch = mergeConfigMensalidadeCooperativa(
        d.cooperativas.find((c) => c.id === coopId)?.mensalidadeConfig,
        { ...mensCfg, configSalvaEm: now }
      );
      updated = aplicarConfigMensalidadeCooperativa(updated, coopId, cfgPatch);
      updated = addAuditEntry(updated, {
        entityType: "cooperativa",
        entityId: coopId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Perfil da cooperativa e mensalidade atualizados",
      });
      return updated;
    });
    void pushPerfilParaNuvem();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleRemoverSenhaCadastro = () => {
    if (!user || !coopId || !form.nome) return;
    const now = new Date().toISOString();
    setForm((f) => ({ ...f, senhaCadastroCooperado: undefined }));
    updateData((d) => {
      let updated = {
        ...d,
        cooperativas: d.cooperativas.map((c) =>
          c.id === coopId
            ? {
                ...c,
                senhaCadastroCooperado: undefined,
                updatedAt: now,
              }
            : c
        ),
      };
      updated = addAuditEntry(updated, {
        entityType: "cooperativa",
        entityId: coopId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Senha de acesso ao cadastro removida — cadastro livre pelo CNPJ",
      });
      return updated;
    });
    void pushPerfilParaNuvem();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Perfil da cooperativa"
        subtitle="Dados da sua cooperativa — contratos ficam na aba Contratos"
      />

      {cloudSynced === false && (
        <AlertBanner variant="warning" title="CNPJ ainda não está na nuvem" className="mb-6">
          Os cooperados em outros celulares não conseguem se cadastrar até publicar o CNPJ aqui.
          <Button className="mt-3" size="sm" onClick={handlePublishCnpj} disabled={cloudSyncing}>
            {cloudSyncing ? "Publicando..." : "Publicar CNPJ na nuvem"}
          </Button>
          {cloudSyncError && <p className="text-sm text-red-700 mt-2">{cloudSyncError}</p>}
        </AlertBanner>
      )}
      {cloudJustPublished && (
        <AlertBanner variant="success" title="CNPJ publicado na nuvem!" className="mb-6">
          Cooperados já podem se cadastrar em qualquer dispositivo usando {formatCnpj(cooperativa.cnpj)}.
        </AlertBanner>
      )}

      <Card className="mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
            <Building2 size={24} className="text-green-700" />
          </div>
          <div>
            <p className="font-bold text-lg text-gray-900">{cooperativa.nome}</p>
            <p className="text-sm text-gray-500">CNPJ {formatCnpj(cooperativa.cnpj)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <FormField label="Nome da cooperativa">
            <Input
              value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="CNPJ">
            <Input value={formatCnpj(cooperativa.cnpj)} disabled className="bg-gray-50" />
          </FormField>
          <FormField label="Responsável">
            <Input
              value={form.responsavel ?? ""}
              onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Telefone">
            <Input
              value={form.telefone ?? ""}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="E-mail">
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Endereço">
            <Input
              value={form.endereco ?? ""}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              disabled={!canEdit}
            />
          </FormField>
        </div>

        {canEdit && (
          <Button className="mt-6" onClick={handleSave}>
            <Save size={18} /> {saved ? "Salvo!" : "Salvar alterações"}
          </Button>
        )}
      </Card>

      <Card title="Senha de acesso ao cadastro (CNPJ)" className="mb-6">
        <p className="text-sm text-gray-500 mb-4">
          Opcional: defina uma senha que o cooperado deve informar ao criar a conta informando o CNPJ.
          Não confundir com a senha pessoal de login do cooperado.
        </p>
        {senhaCadastroAtiva ? (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
            Senha de acesso ao cadastro ativa — o cooperado precisa informá-la junto com o CNPJ.
          </p>
        ) : (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
            Sem senha de acesso — qualquer pessoa com o CNPJ pode criar conta no portal.
          </p>
        )}
        <FormField
          label="Senha de acesso ao cadastro"
          hint="Repasse esta senha aos cooperados autorizados. Deixe em branco ou use Remover para cadastro livre."
        >
          <div className="relative">
            <Input
              type={showSenhaCadastro ? "text" : "password"}
              value={form.senhaCadastroCooperado ?? ""}
              onChange={(e) => setForm({ ...form, senhaCadastroCooperado: e.target.value })}
              disabled={!canEdit}
              placeholder="Opcional"
              className="pr-10"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowSenhaCadastro((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showSenhaCadastro ? "Ocultar senha" : "Mostrar senha"}
              >
                {showSenhaCadastro ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
          </div>
        </FormField>
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleSave}>
              <Save size={18} /> {saved ? "Salvo!" : "Salvar senha de acesso"}
            </Button>
            {senhaCadastroAtiva && (
              <Button variant="danger" onClick={handleRemoverSenhaCadastro}>
                <Trash2 size={18} /> Remover senha de acesso
              </Button>
            )}
          </div>
        )}
      </Card>

      {coopId && (
        <EquipeResponsaveisPanel cooperativaId={coopId} cooperativaCnpj={cooperativa.cnpj} />
      )}

      {coopId && <EquipeContadorPanel cooperativaId={coopId} cooperativaCnpj={cooperativa.cnpj} />}

      <Card title="Mensalidade — configuração mensal">
        <p className="text-sm text-gray-500 mb-4">
          O <strong>valor fixo</strong> e os <strong>meses de cobrança</strong> ficam sincronizados com a aba{" "}
          <a href="/mensalidades" className="font-semibold text-green-700 underline">Mensalidades</a>.
          Aqui você ajusta lembretes do mural e geração automática das cobranças.
        </p>
        {(cooperativa.mensalidadeConfig?.valorPadrao ?? 0) > 0 && (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
            Valor fixo em vigor: <strong>{formatCurrency(cooperativa.mensalidadeConfig!.valorPadrao)}</strong>
            {(cooperativa.mensalidadeConfig?.mesesCobranca?.length ?? 0) > 0 && (
              <> · {(cooperativa.mensalidadeConfig!.mesesCobranca ?? []).length} mês(es) marcado(s) em Mensalidades</>
            )}
          </p>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Valor padrão (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={mensCfg.valorPadrao || ""}
                onChange={(e) => setMensCfg({ ...mensCfg, valorPadrao: parseFloat(e.target.value) || 0 })}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Dia do vencimento">
              <Input
                type="number"
                min={1}
                max={28}
                value={mensCfg.diaVencimento}
                onChange={(e) => setMensCfg({ ...mensCfg, diaVencimento: parseInt(e.target.value, 10) || 10 })}
                disabled={!canEdit}
              />
            </FormField>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={mensCfg.lembreteAtivo}
              onChange={(e) => setMensCfg({ ...mensCfg, lembreteAtivo: e.target.checked })}
              disabled={!canEdit}
              className="rounded mt-0.5"
            />
            <span>
              <strong>Mostrar aviso de vencimento todo mês</strong>
              <span className="block text-gray-500 text-xs mt-0.5">Aparece em Avisos e no início do cooperado, sem publicar de novo.</span>
            </span>
          </label>
          {mensCfg.lembreteAtivo && (
            <>
              <FormField label="A partir de qual dia mostrar o aviso?" hint="Ex: dia 1 = cooperado vê o lembrete desde o início do mês">
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={mensCfg.diaLembrete ?? 1}
                  onChange={(e) => setMensCfg({ ...mensCfg, diaLembrete: parseInt(e.target.value, 10) || 1 })}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Título do aviso (opcional)">
                <Input
                  value={mensCfg.lembreteTitulo ?? ""}
                  onChange={(e) => setMensCfg({ ...mensCfg, lembreteTitulo: e.target.value })}
                  placeholder="Vencimento da mensalidade"
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="Texto do aviso (opcional)" hint="Use {valor} e {dia} para preencher automaticamente">
                <Input
                  value={mensCfg.lembreteTexto ?? ""}
                  onChange={(e) => setMensCfg({ ...mensCfg, lembreteTexto: e.target.value })}
                  placeholder="Mensalidade de R$ {valor} vence dia {dia}."
                  disabled={!canEdit}
                />
              </FormField>
            </>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={mensCfg.gerarAutomaticamente ?? false}
              onChange={(e) => setMensCfg({ ...mensCfg, gerarAutomaticamente: e.target.checked })}
              disabled={!canEdit}
              className="rounded mt-0.5"
            />
            <span>
              <strong>Gerar mensalidades do mês automaticamente</strong>
              <span className="block text-gray-500 text-xs mt-0.5">Cria cobrança pendente para cada cooperado ativo — sem lançar manualmente.</span>
            </span>
          </label>
        </div>
        {canEdit && (
          <Button className="mt-6" onClick={handleSave}>
            <Save size={18} /> {saved ? "Salvo!" : "Salvar configuração"}
          </Button>
        )}
      </Card>
    </div>
  );
}
