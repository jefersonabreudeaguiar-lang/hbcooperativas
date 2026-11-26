import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { guardCooperativaApi, requireCooperativaAccess } from "@/lib/security/apiGuard";
import { canSessionPerform } from "@/lib/security/serverPermissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchContratosSync, fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "@/lib/supabase/notasStorage";
import { montarExtratosAnuais, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { normalizeCnpj } from "@/utils/cooperativa";
import { dataIsoCooperativa } from "@/utils/format";

const BUCKET = "hb-cooperativa-sync";
type Edicao = { revisao: string; nomeCooperativa: string; extratos: ExtratoAnualCooperado[] };
const falha = (mensagem: string, status: number) => NextResponse.json({ error: mensagem }, { status });
const caminhoEdicao = (cnpj: string, ano: number) => `${cnpj}/extratos-anuais/${ano}.json`;
const chaveMembro = (id: string) => createHash("sha256").update(id).digest("hex");
const respostaPrivada = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const ano = Number(body?.ano);
  const hoje = dataIsoCooperativa();
  const anoAtual = Number(hoje.slice(0, 4));
  if (cnpj.length !== 14 || !Number.isInteger(ano) || ano < 2000 || ano > anoAtual) {
    return falha("Cooperativa ou ano inválido.", 400);
  }
  const guard = await guardCooperativaApi(request, cnpj, { requireManagement: true, write: true, checkSaas: true });
  if (!guard.ok) return guard.response;
  if (!guard.session || !["admin", "responsavel", "tesoureiro"].includes(guard.session.role) ||
      !canSessionPerform(guard.session, "relatorios", "export")) return falha("Acesso restrito à gestão com permissão de exportar.", 403);
  const acesso = requireCooperativaAccess(guard.session, cnpj, true, request);
  if (acesso) return acesso;

  const supabase = getSupabaseAdmin();
  if (!supabase) return falha("Nuvem indisponível.", 503);
  try {
    const [cooperados, contratos, operacional, tabela, arquivos, coop] = await Promise.all([
      fetchCooperadosFromStorage(supabase, cnpj, { complete: true }),
      fetchContratosSync(supabase, cnpj),
      fetchOperacionalSync(supabase, cnpj),
      fetchNotasFromTable(supabase, cnpj, undefined, true),
      fetchNotasFromStorage(supabase, cnpj, true),
      supabase.from("cooperativas").select("nome").eq("cnpj", cnpj).maybeSingle(),
    ]);
    if (!operacional || !cooperados.length || coop.error || !coop.data?.nome) {
      return falha("Não foi possível confirmar os cadastros e os dados da cooperativa.", 409);
    }
    const excluidas = new Set((operacional.notasPedidoExcluidas ?? []).map((n) => n.id));
    const notas = mergeNotasSources(tabela.notas, arquivos).filter(n => !excluidas.has(n.id));
    const extratos = montarExtratosAnuais(cooperados.filter(c => c.status !== "desligado"),
      notas, contratos?.instituicoes ?? [], ano, ano === anoAtual ? hoje : `${ano}-12-31`);
    if (!extratos.length || !extratos.some(e => e.entregas.length)) return falha("Nenhuma entrega disponível para publicar neste ano.", 409);
    const nomeCooperativa = String(coop.data.nome);
    const revisao = createHash("sha256").update(JSON.stringify({ nomeCooperativa, extratos })).digest("hex");
    const edicao: Edicao = { revisao, nomeCooperativa, extratos };
    const { error } = await supabase.storage.from(BUCKET).upload(caminhoEdicao(cnpj, ano), JSON.stringify(edicao),
      { upsert: true, contentType: "application/json", cacheControl: "0" });
    if (error) return falha("A nuvem não confirmou a publicação dos extratos.", 503);
    return respostaPrivada({ publicados: extratos.length });
  } catch {
    return falha("Não foi possível conferir todos os dados necessários para publicar os extratos.", 503);
  }
}

export async function GET(request: Request) {
  const cnpj = normalizeCnpj(new URL(request.url).searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) return falha("Cooperativa inválida.", 400);
  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;
  const id = guard.session?.cooperadoId;
  if (!id || guard.session?.role !== "cooperado") return falha("Acesso restrito ao próprio cooperado.", 403);
  const acesso = requireCooperativaAccess(guard.session, cnpj, true, request);
  if (acesso) return acesso;
  const supabase = getSupabaseAdmin();
  if (!supabase) return falha("Nuvem indisponível.", 503);
  const bucket = supabase.storage.from(BUCKET);
  const [edicoes, baixados] = await Promise.all([
    bucket.list(`${cnpj}/extratos-anuais`, { limit: 100, sortBy: { column: "name", order: "desc" } }),
    bucket.list(`${cnpj}/extratos-baixados/${chaveMembro(id)}`, { limit: 100 }),
  ]);
  if (edicoes.error || baixados.error) return falha("Não foi possível consultar os extratos.", 503);
  const recibos = new Set(baixados.data.map(b => b.name));
  try {
    const pendentes = await Promise.all(edicoes.data.filter(f => /^20\d{2}\.json$/.test(f.name)).map(async f => {
      const arquivo = await bucket.download(`${cnpj}/extratos-anuais/${f.name}`);
      if (arquivo.error) throw arquivo.error;
      const edicao = JSON.parse(await arquivo.data.text()) as Edicao;
      const extrato = edicao.extratos.find(e => e.cooperadoId === id);
      if (!extrato || recibos.has(`${extrato.ano}-${edicao.revisao}.json`)) return null;
      return { revisao: edicao.revisao, nomeCooperativa: edicao.nomeCooperativa, extrato };
    }));
    return respostaPrivada({ pendentes: pendentes.filter(Boolean) });
  } catch {
    return falha("Não foi possível ler os extratos publicados.", 503);
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const ano = Number(body?.ano);
  const revisao = String(body?.revisao ?? "");
  if (cnpj.length !== 14 || !Number.isInteger(ano) || ano < 2000 || ano > 2099 || !/^[a-f0-9]{64}$/.test(revisao)) {
    return falha("Extrato inválido.", 400);
  }
  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;
  const id = guard.session?.cooperadoId;
  if (!id || guard.session?.role !== "cooperado") return falha("Acesso restrito ao próprio cooperado.", 403);
  const acesso = requireCooperativaAccess(guard.session, cnpj, true, request);
  if (acesso) return acesso;
  const supabase = getSupabaseAdmin();
  if (!supabase) return falha("Nuvem indisponível.", 503);
  const bucket = supabase.storage.from(BUCKET);
  const arquivo = await bucket.download(caminhoEdicao(cnpj, ano));
  if (arquivo.error) return falha("Extrato indisponível.", 404);
  const edicao = JSON.parse(await arquivo.data.text()) as Edicao;
  if (edicao.revisao !== revisao || !edicao.extratos.some(e => e.cooperadoId === id)) {
    return falha("O extrato mudou ou já não está disponível.", 409);
  }
  const { error } = await bucket.upload(`${cnpj}/extratos-baixados/${chaveMembro(id)}/${ano}-${revisao}.json`, "{}",
    { upsert: true, contentType: "application/json", cacheControl: "0" });
  return error ? falha("Não foi possível registrar o download.", 503) : respostaPrivada({ ok: true });
}
