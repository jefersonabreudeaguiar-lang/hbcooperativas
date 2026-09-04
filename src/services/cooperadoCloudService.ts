import type {
  AppData,
  Cooperado,
  FichaCorrida,
  PagamentoCooperadoRegistro,
} from "@/types";
import { findCooperativaByCnpj, getCooperativaById, normalizeCnpj } from "@/utils/cooperativa";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getData, refreshStoredSession, saveDataSafe } from "@/services/dataStore";
import { fetchCooperativaByCnpjFromCloud, mergeCooperativaIntoData } from "@/services/cooperativaCloudService";
import { mergeAppInstallFields } from "@/services/cooperadoAppInstallService";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  cooperadosUnicosParaCobranca,
  cpfCooperadoDigits,
  mesmoCooperadoCadastro,
  nomeNormalizadoCooperado,
} from "@/utils/cooperadoDedupe";

export {
  cpfCooperadoDigits,
  mesmoCooperadoCadastro,
  cooperadosUnicosParaCobranca,
  deduplicarCooperadosLista,
} from "@/utils/cooperadoDedupe";

export function nomeNormalizado(nome: string): string {
  return nomeNormalizadoCooperado(nome);
}

/** Encontra o cadastro local equivalente (mesmo CPF ou nome). */
export function encontrarCooperadoLocalEquivalente(
  data: AppData,
  cooperativaId: string,
  ref: Pick<Cooperado, "id" | "cpfCnpj" | "nomeCompleto">
): Cooperado | undefined {
  const direct = data.cooperados.find(
    (c) => c.id === ref.id && c.cooperativaId === cooperativaId
  );
  if (direct) return direct;

  return data.cooperados.find(
    (c) => c.cooperativaId === cooperativaId && mesmoCooperadoCadastro(c, ref)
  );
}

export function remapearMensalidadesCooperadoIds(
  data: AppData,
  idRemap: Map<string, string>
): AppData {
  return remapearCooperadoIdsEmData(data, idRemap);
}

function remapCooperadoIdList<T extends { cooperadoId: string }>(
  items: T[],
  idRemap: Map<string, string>,
  touchUpdatedAt?: boolean
): { items: T[]; changed: boolean } {
  let changed = false;
  const out = items.map((item) => {
    const novo = idRemap.get(item.cooperadoId);
    if (!novo || novo === item.cooperadoId) return item;
    changed = true;
    return touchUpdatedAt
      ? ({ ...item, cooperadoId: novo, updatedAt: new Date().toISOString() } as T)
      : ({ ...item, cooperadoId: novo } as T);
  });
  return { items: out, changed };
}

/** Propaga remapeamento cloud→local para lançamentos (preserva dados, só corrige IDs). */
export function remapearCooperadoIdsEmData(data: AppData, idRemap: Map<string, string>): AppData {
  if (idRemap.size === 0) return data;

  let next = data;
  let changed = false;

  const mensalidades = remapCooperadoIdList(data.mensalidades, idRemap, true);
  if (mensalidades.changed) {
    next = { ...next, mensalidades: mensalidades.items };
    changed = true;
  }

  for (const key of [
    "notasPedido",
    "fichaCorrida",
    "pagamentosCooperado",
    "descontos",
    "valoresAvulsosReceber",
    "entregas",
    "cotas",
    "pagamentos",
    "arquivosMensais",
  ] as const) {
    const cur = next[key] as { cooperadoId: string }[];
    const remapped = remapCooperadoIdList(cur, idRemap);
    if (remapped.changed) {
      next = { ...next, [key]: remapped.items };
      changed = true;
    }
  }

  let usersChanged = false;
  const users = next.users.map((u) => {
    if (!u.cooperadoId) return u;
    const novo = idRemap.get(u.cooperadoId);
    if (!novo || novo === u.cooperadoId) return u;
    usersChanged = true;
    return { ...u, cooperadoId: novo };
  });
  if (usersChanged) {
    next = { ...next, users };
    changed = true;
  }

  return changed ? next : data;
}

export function pagamentoCooperadoPertenceCooperado(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (pagamento.cooperadoId === cooperadoId) return true;
  const alvo = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const dono = resolverCooperadoIdCanonico(
    data,
    pagamento.cooperadoId,
    cooperativaId ?? pagamento.cooperativaId
  );
  if (alvo === dono) return true;
  const nomeAlvo = nomeNormalizado(getCooperadoNomeResolvido(data, cooperadoId, cooperativaId));
  const nomeDono = nomeNormalizado(getCooperadoNomeResolvido(data, pagamento.cooperadoId, cooperativaId));
  return nomeAlvo.length > 2 && nomeAlvo === nomeDono;
}

const PENDING_COOPERADO_PUSH_KEY = "coopeagriplla_pending_cooperado_push";

function loadPendingCooperadoPushes(): { cnpj: string; cooperadoId: string; email?: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_COOPERADO_PUSH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { cnpj?: string; cooperadoId?: string; email?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e.cnpj && e.cooperadoId)
      .map((e) => ({
        cnpj: normalizeCnpj(String(e.cnpj)),
        cooperadoId: String(e.cooperadoId),
        email: e.email?.trim().toLowerCase(),
      }));
  } catch {
    return [];
  }
}

function savePendingCooperadoPushes(entries: { cnpj: string; cooperadoId: string; email?: string }[]): void {
  if (typeof window === "undefined") return;
  if (entries.length === 0) localStorage.removeItem(PENDING_COOPERADO_PUSH_KEY);
  else localStorage.setItem(PENDING_COOPERADO_PUSH_KEY, JSON.stringify(entries));
}

export function queueCooperadoPush(cnpj: string, cooperado: Cooperado, email?: string): void {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !cooperado.id) return;
  const entries = loadPendingCooperadoPushes();
  if (entries.some((e) => e.cnpj === digits && e.cooperadoId === cooperado.id)) return;
  savePendingCooperadoPushes([
    ...entries,
    { cnpj: digits, cooperadoId: cooperado.id, email: email?.trim().toLowerCase() },
  ]);
}

export function resolveCooperativaForCloudMerge(
  data: AppData,
  cnpj: string,
  preferredCoopId?: string
) {
  const digits = normalizeCnpj(cnpj);
  const matches = data.cooperativas.filter((c) => {
    const stored = normalizeCnpj(String(c.cnpj ?? ""));
    const ativa = !c.status || c.status === "ativa";
    return stored === digits && ativa;
  });

  if (preferredCoopId) {
    const preferred = getCooperativaById(data, preferredCoopId);
    if (preferred && normalizeCnpj(preferred.cnpj) === digits) return preferred;
  }

  if (matches.length === 0) return findCooperativaByCnpj(data, cnpj);

  return [...matches].sort((a, b) => {
    const countA = data.cooperados.filter((c) => c.cooperativaId === a.id).length;
    const countB = data.cooperados.filter((c) => c.cooperativaId === b.id).length;
    if (countB !== countA) return countB - countA;
    const usersA = data.users.filter((u) => u.cooperativaId === a.id).length;
    const usersB = data.users.filter((u) => u.cooperativaId === b.id).length;
    return usersB - usersA;
  })[0];
}

function alinharCooperadosParaCooperativa(
  data: AppData,
  canonicalCoopId: string,
  duplicateCoopIds: string[]
): AppData {
  const dup = new Set(duplicateCoopIds.filter((id) => id !== canonicalCoopId));
  if (dup.size === 0) return data;

  let changed = false;
  const cooperados = data.cooperados.map((c) => {
    if (!dup.has(c.cooperativaId)) return c;
    changed = true;
    return { ...c, cooperativaId: canonicalCoopId, updatedAt: new Date().toISOString() };
  });

  const users = data.users.map((u) => {
    if (!u.cooperativaId || !dup.has(u.cooperativaId)) return u;
    changed = true;
    return { ...u, cooperativaId: canonicalCoopId };
  });

  if (!changed) return data;
  return { ...data, cooperados, users };
}

export function mergeCloudCooperadosIntoData(
  data: AppData,
  cloudCooperados: Cooperado[],
  cnpj: string,
  preferredCoopId?: string
): AppData {
  if (cloudCooperados.length === 0) return data;

  const digits = normalizeCnpj(cnpj);
  let coop = resolveCooperativaForCloudMerge(data, digits, preferredCoopId);

  if (!coop) {
    return data;
  }

  const duplicateIds = data.cooperativas
    .filter((c) => normalizeCnpj(String(c.cnpj ?? "")) === digits)
    .map((c) => c.id);
  let base = alinharCooperadosParaCooperativa(data, coop.id, duplicateIds);
  coop = resolveCooperativaForCloudMerge(base, digits, preferredCoopId) ?? coop;

  let cooperados = [...base.cooperados];
  let changed = false;
  const idRemap = new Map<string, string>();

  for (const raw of cloudCooperados) {
    const cn: Cooperado = {
      ...raw,
      cooperativaId: coop.id,
      nomeCompleto: raw.nomeCompleto.trim(),
    };

    const idxId = cooperados.findIndex((c) => c.id === cn.id);
    const idxCpf =
      cn.cpfCnpj && cpfCooperadoDigits(cn.cpfCnpj)
        ? cooperados.findIndex(
            (c) =>
              c.cooperativaId === coop.id &&
              cpfCooperadoDigits(c.cpfCnpj) === cpfCooperadoDigits(cn.cpfCnpj)
          )
        : -1;
    const idxNome = cooperados.findIndex(
      (c) =>
        c.cooperativaId === coop.id &&
        nomeNormalizado(c.nomeCompleto) === nomeNormalizado(cn.nomeCompleto)
    );

    const apply = (index: number, keepId: boolean) => {
      const id = keepId ? cooperados[index].id : cn.id;
      if (keepId && cn.id !== id) idRemap.set(cn.id, id);
      const local = cooperados[index];
      const localTime = new Date(local.updatedAt).getTime();
      const cloudTime = new Date(cn.updatedAt).getTime();
      const cloudMaisRecente = cloudTime >= localTime;
      const localPix = local.chavePix?.trim() ?? "";
      const cloudPix = cn.chavePix?.trim() ?? "";

      let chavePix = cloudMaisRecente ? cloudPix || localPix : localPix || cloudPix;
      let pixValido = cloudMaisRecente ? cn.pixValido ?? local.pixValido : local.pixValido ?? cn.pixValido;
      let pixInvalidoMotivo = cloudMaisRecente ? cn.pixInvalidoMotivo ?? local.pixInvalidoMotivo : local.pixInvalidoMotivo ?? cn.pixInvalidoMotivo;

      if (chavePix) {
        pixValido = pixValido ?? true;
        if (pixValido) pixInvalidoMotivo = undefined;
      }

      const installFields = mergeAppInstallFields(local, cn);

      const merged: Cooperado = {
        ...local,
        ...cn,
        id,
        cooperativaId: coop.id,
        chavePix,
        pixValido,
        pixInvalidoMotivo,
        ...installFields,
        membroDiretoria: cloudMaisRecente
          ? Boolean(cn.membroDiretoria ?? local.membroDiretoria)
          : Boolean(local.membroDiretoria ?? cn.membroDiretoria),
        avulso: cloudMaisRecente ? Boolean(cn.avulso) : Boolean(local.avulso),
        updatedAt: cloudMaisRecente ? cn.updatedAt : local.updatedAt,
      };

      const installMudou =
        merged.appInstaladoEm !== local.appInstaladoEm ||
        merged.ultimoAcessoEm !== local.ultimoAcessoEm ||
        merged.ultimoAcessoModo !== local.ultimoAcessoModo ||
        merged.aberturasAppTotal !== local.aberturasAppTotal;

      if (
        cloudMaisRecente ||
        merged.chavePix !== local.chavePix ||
        merged.pixValido !== local.pixValido ||
        merged.membroDiretoria !== local.membroDiretoria ||
        merged.avulso !== local.avulso ||
        installMudou
      ) {
        cooperados[index] = merged;
        changed = true;
      }
    };

    if (idxId >= 0) {
      apply(idxId, false);
    } else if (idxCpf >= 0) {
      apply(idxCpf, true);
    } else if (idxNome >= 0) {
      apply(idxNome, true);
    } else {
      cooperados.push({ ...cn, cooperativaId: coop.id });
      changed = true;
    }
  }

  if (!changed && idRemap.size === 0) return base;

  let next: AppData = changed ? { ...base, cooperados } : base;
  if (idRemap.size > 0) {
    next = remapearCooperadoIdsEmData(next, idRemap);
  }
  return next;
}

export async function fetchCooperadosFromCloud(
  cnpj: string
): Promise<{ ok: boolean; cooperados: Cooperado[] }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return { ok: false, cooperados: [] };

  try {
    const res = await secureApiFetch(`/api/cooperados?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return { ok: false, cooperados: [] };
    const json = await res.json().catch(() => ({}));
    return { ok: true, cooperados: (json.cooperados ?? []) as Cooperado[] };
  } catch {
    return { ok: false, cooperados: [] };
  }
}

export async function pushCooperadoToCloud(
  cnpj: string,
  cooperado: Cooperado,
  email?: string
): Promise<{ ok: boolean; error?: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return { ok: false, error: "CNPJ da cooperativa inválido." };
  }

  try {
    const res = await secureApiFetch("/api/cooperados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, cooperado, email }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) {
      return {
        ok: false,
        error: (json.error as string) ?? "Nuvem indisponível.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: (json.error as string) ?? "Erro ao publicar cooperado na nuvem.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com o servidor." };
  }
}

export async function flushPendingCooperadoPushes(cnpj?: string): Promise<void> {
  const digits = cnpj ? normalizeCnpj(cnpj) : "";
  const all = loadPendingCooperadoPushes();
  let entries = all;
  if (digits.length === 14) {
    entries = all.filter((e) => e.cnpj === digits);
  }
  if (entries.length === 0) return;

  const data = getData();
  const remaining: typeof entries = [];

  for (const entry of entries) {
    const cooperado = data.cooperados.find((c) => c.id === entry.cooperadoId);
    if (!cooperado) {
      continue;
    }
    const result = await pushCooperadoToCloud(entry.cnpj, cooperado, entry.email);
    if (!result.ok) remaining.push(entry);
  }

  const other = digits.length === 14 ? all.filter((e) => e.cnpj !== digits) : [];
  savePendingCooperadoPushes([...other, ...remaining]);
}

export async function ensureCooperativaLocalForCnpj(cnpj: string): Promise<string | undefined> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return undefined;

  const current = getData();
  const existing = resolveCooperativaForCloudMerge(current, digits);
  if (existing) return existing.id;

  const cloud = await fetchCooperativaByCnpjFromCloud(digits);
  if (!cloud) return undefined;

  const merged = {
    ...current,
    cooperativas: mergeCooperativaIntoData(current.cooperativas, cloud),
  };
  saveDataSafe(merged);
  return resolveCooperativaForCloudMerge(merged, digits)?.id;
}

export async function syncCooperadosFromCloud(cnpj: string, preferredCoopId?: string): Promise<number> {
  await flushPendingCooperadoPushes(cnpj);
  const coopId = preferredCoopId ?? (await ensureCooperativaLocalForCnpj(cnpj));
  const { ok, cooperados: cloudCooperados } = await fetchCooperadosFromCloud(cnpj);
  if (!ok) return 0;
  if (cloudCooperados.length === 0) return 0;
  const current = getData();
  const merged = mergeCloudCooperadosIntoData(current, cloudCooperados, cnpj, coopId);
  if (merged === current) return cloudCooperados.length;
  saveDataSafe(merged);
  refreshStoredSession();
  return cloudCooperados.length;
}

/** Lista cooperados da cooperativa para selects (cadastrados localmente + nuvem + envios). */
export function listCooperadosDaCooperativa(data: AppData, cooperativaId?: string): Cooperado[] {
  if (!cooperativaId) return [];

  const base = cooperadosUnicosParaCobranca(
    data.cooperados.filter((c) => c.cooperativaId === cooperativaId)
  );

  const ids = new Set(base.map((c) => c.id));
  const nomes = new Set(base.map((c) => nomeNormalizado(c.nomeCompleto)));
  const extras: Cooperado[] = [];

  for (const nota of data.notasPedido) {
    if (!notaPertenceCooperativa(data, nota, cooperativaId)) continue;
    const nome = nota.cooperadoNomeSnapshot?.trim();
    const nomeKey = nome ? nomeNormalizado(nome) : "";
    if (ids.has(nota.cooperadoId)) continue;
    if (nomeKey && nomes.has(nomeKey)) continue;

    const stub: Cooperado = {
      id: nota.cooperadoId,
      cooperativaId: cooperativaId,
      nomeCompleto: nome || "Cooperado",
      cpfCnpj: "",
      telefone: "",
      endereco: "",
      comunidade: "",
      cafDap: "",
      chavePix: "",
      banco: "",
      agencia: "",
      conta: "",
      status: "ativo",
      produtos: [],
      observacoes: "Vinculado por envio de entrega.",
      createdAt: nota.createdAt,
      updatedAt: nota.updatedAt,
    };
    extras.push(stub);
    ids.add(stub.id);
    if (nomeKey) nomes.add(nomeKey);
  }

  return [...base, ...extras].sort((a, b) =>
    a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")
  );
}

/** Retorna o cadastro do cooperado com PIX (unifica IDs entre aparelhos). */
export function resolverCooperadoParaPagamento(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): Cooperado | undefined {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const candidatos = data.cooperados.filter(
    (c) =>
      (!cooperativaId || c.cooperativaId === cooperativaId) &&
      (c.id === canonico ||
        c.id === cooperadoId ||
        resolverCooperadoIdCanonico(data, c.id, cooperativaId) === canonico)
  );

  const comPix = candidatos.find((c) => c.chavePix?.trim());
  if (comPix) return comPix;

  return candidatos.find((c) => c.id === canonico) ?? candidatos[0];
}

/** Unifica ID local quando o cooperado veio de outro aparelho (nome/CPF). */
export function resolverCooperadoIdCanonico(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  nomeFallback?: string
): string {
  const direct = data.cooperados.find(
    (c) => c.id === cooperadoId && (!cooperativaId || c.cooperativaId === cooperativaId)
  );
  if (direct) return direct.id;

  const nome = nomeFallback?.trim().toLowerCase();
  if (nome && cooperativaId) {
    const byName = data.cooperados.find(
      (c) =>
        c.cooperativaId === cooperativaId &&
        nomeNormalizado(c.nomeCompleto) === nomeNormalizado(nomeFallback!)
    );
    if (byName) return byName.id;
  }

  const nota = data.notasPedido.find(
    (n) =>
      n.cooperadoId === cooperadoId &&
      n.cooperadoNomeSnapshot?.trim() &&
      (!cooperativaId || notaPertenceCooperativa(data, n, cooperativaId))
  );
  if (nota?.cooperadoNomeSnapshot && cooperativaId) {
    const bySnapshot = data.cooperados.find(
      (c) =>
        c.cooperativaId === cooperativaId &&
        nomeNormalizado(c.nomeCompleto) === nomeNormalizado(nota.cooperadoNomeSnapshot!)
    );
    if (bySnapshot) return bySnapshot.id;
  }

  return cooperadoId;
}

export function getCooperadoNomeResolvido(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const coop = data.cooperados.find((c) => c.id === canonico);
  if (coop?.nomeCompleto?.trim()) return coop.nomeCompleto;

  const ficha = data.fichaCorrida.find((f) => f.cooperadoId === cooperadoId);
  if (ficha?.cooperadoNomeSnapshot?.trim()) return ficha.cooperadoNomeSnapshot.trim();

  const nota = data.notasPedido.find((n) => n.cooperadoId === cooperadoId);
  if (nota?.cooperadoNomeSnapshot?.trim()) return nota.cooperadoNomeSnapshot.trim();

  return "Desconhecido";
}

/** Cooperados com lançamentos na ficha no mês (+ cadastro local/nuvem). */
export function listCooperadosComFichaNoMes(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string
): Cooperado[] {
  const ids = new Set(
    data.fichaCorrida
      .filter((f) => f.cooperativaId === cooperativaId && f.mesReferencia === mesReferencia)
      .map((f) => f.cooperadoId)
  );
  const base = listCooperadosDaCooperativa(data, cooperativaId);
  const byId = new Map(base.map((c) => [c.id, c]));
  const result: Cooperado[] = [];

  for (const id of ids) {
    if (byId.has(id)) {
      result.push(byId.get(id)!);
      continue;
    }
    const nome = getCooperadoNomeResolvido(data, id, cooperativaId);
    result.push({
      id,
      cooperativaId,
      nomeCompleto: nome,
      cpfCnpj: "",
      telefone: "",
      endereco: "",
      comunidade: "",
      cafDap: "",
      chavePix: "",
      banco: "",
      agencia: "",
      conta: "",
      status: "ativo",
      produtos: [],
      observacoes: "Vinculado pela ficha corrida.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return result.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}

/** Verifica se um lançamento da ficha pertence ao cooperado (mesmo com IDs diferentes entre aparelhos). */
export function fichaPertenceCooperado(
  data: AppData,
  ficha: FichaCorrida,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (!cooperadoId) return false;
  if (ficha.cooperadoId === cooperadoId) return true;

  const alvo = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const dono = resolverCooperadoIdCanonico(
    data,
    ficha.cooperadoId,
    cooperativaId,
    ficha.cooperadoNomeSnapshot
  );
  if (alvo === dono) return true;

  const nomeAlvo = nomeNormalizado(getCooperadoNomeResolvido(data, cooperadoId, cooperativaId));
  const nomeDono = nomeNormalizado(
    ficha.cooperadoNomeSnapshot?.trim() || getCooperadoNomeResolvido(data, ficha.cooperadoId, cooperativaId)
  );
  if (nomeAlvo.length > 1 && nomeAlvo === nomeDono) return true;

  const nota = data.notasPedido.find((n) => n.id === ficha.notaPedidoId);
  if (nota && (nota.divisaoEntrega?.participantes.length ?? 0) <= 1) {
    if (nota.cooperadoId === cooperadoId) return true;
    const notaDono = resolverCooperadoIdCanonico(
      data,
      nota.cooperadoId,
      cooperativaId,
      nota.cooperadoNomeSnapshot
    );
    if (notaDono === alvo) return true;
  }

  return false;
}

export function notaPertenceCooperado(
  data: AppData,
  nota: {
    cooperadoId: string;
    cooperadoNomeSnapshot?: string;
    divisaoEntrega?: { participantes: { cooperadoId: string; cooperadoNome: string }[] };
  },
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (nota.cooperadoId === cooperadoId) return true;
  const alvo = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const dono = resolverCooperadoIdCanonico(data, nota.cooperadoId, cooperativaId, nota.cooperadoNomeSnapshot);
  if (alvo === dono) return true;
  const nomeAlvo = nomeNormalizado(getCooperadoNomeResolvido(data, cooperadoId, cooperativaId));
  const nomeDono = nomeNormalizado(
    nota.cooperadoNomeSnapshot?.trim() || getCooperadoNomeResolvido(data, nota.cooperadoId, cooperativaId)
  );
  if (nomeAlvo.length > 1 && nomeAlvo === nomeDono) return true;

  const participantes = nota.divisaoEntrega?.participantes ?? [];
  if (participantes.length <= 1) return false;
  return participantes.some((p) => {
    if (p.cooperadoId === cooperadoId) return true;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId, p.cooperadoNome);
    if (pCanon === alvo) return true;
    const nomePart = nomeNormalizado(
      p.cooperadoNome?.trim() || getCooperadoNomeResolvido(data, p.cooperadoId, cooperativaId)
    );
    return nomeAlvo.length > 1 && nomeAlvo === nomePart;
  });
}
