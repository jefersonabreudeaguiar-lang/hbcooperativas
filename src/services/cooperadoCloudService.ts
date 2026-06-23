import type { AppData, Cooperado, FichaCorrida } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getData, saveDataSafe } from "@/services/dataStore";
import { secureApiFetch } from "@/lib/security/clientSession";

function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function nomeNormalizado(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cpfCooperadoDigits(cpfCnpj?: string): string {
  return (cpfCnpj ?? "").replace(/\D/g, "");
}

export function mesmoCooperadoCadastro(
  a: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">,
  b: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">
): boolean {
  const cpfA = cpfCooperadoDigits(a.cpfCnpj);
  const cpfB = cpfCooperadoDigits(b.cpfCnpj);
  if (cpfA.length >= 11 && cpfA === cpfB) return true;
  return nomeNormalizado(a.nomeCompleto) === nomeNormalizado(b.nomeCompleto);
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
  if (idRemap.size === 0) return data;
  let changed = false;
  const mensalidades = data.mensalidades.map((m) => {
    const novo = idRemap.get(m.cooperadoId);
    if (!novo || novo === m.cooperadoId) return m;
    changed = true;
    return { ...m, cooperadoId: novo, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...data, mensalidades } : data;
}

export function mergeCloudCooperadosIntoData(
  data: AppData,
  cloudCooperados: Cooperado[],
  cnpj: string
): AppData {
  if (cloudCooperados.length === 0) return data;

  const digits = normalizeCnpj(cnpj);
  const coop = data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === digits);
  if (!coop) return data;

  let cooperados = [...data.cooperados];
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
      cn.cpfCnpj && cpfDigits(cn.cpfCnpj)
        ? cooperados.findIndex(
            (c) =>
              c.cooperativaId === coop.id &&
              cpfDigits(c.cpfCnpj) === cpfDigits(cn.cpfCnpj)
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

      const merged: Cooperado = {
        ...local,
        ...cn,
        id,
        cooperativaId: coop.id,
        chavePix,
        pixValido,
        pixInvalidoMotivo,
        updatedAt: cloudMaisRecente ? cn.updatedAt : local.updatedAt,
      };

      if (cloudMaisRecente || merged.chavePix !== local.chavePix || merged.pixValido !== local.pixValido) {
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

  if (!changed && idRemap.size === 0) return data;

  let next: AppData = changed ? { ...data, cooperados } : data;
  if (idRemap.size > 0) {
    next = remapearMensalidadesCooperadoIds(next, idRemap);
  }
  return next;
}

export async function fetchCooperadosFromCloud(cnpj: string): Promise<Cooperado[]> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return [];

  try {
    const res = await secureApiFetch(`/api/cooperados?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    return (json.cooperados ?? []) as Cooperado[];
  } catch {
    return [];
  }
}

export async function pushCooperadoToCloud(
  cnpj: string,
  cooperado: Cooperado,
  email?: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  try {
    await secureApiFetch("/api/cooperados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, cooperado, email }),
    });
  } catch {
    /* offline */
  }
}

export async function syncCooperadosFromCloud(cnpj: string): Promise<number> {
  const cloudCooperados = await fetchCooperadosFromCloud(cnpj);
  if (cloudCooperados.length === 0) return 0;
  const current = getData();
  const merged = mergeCloudCooperadosIntoData(current, cloudCooperados, cnpj);
  if (merged === current) return cloudCooperados.length;
  saveDataSafe(merged);
  return cloudCooperados.length;
}

/** Lista cooperados da cooperativa para selects (cadastrados localmente + nuvem + envios). */
export function listCooperadosDaCooperativa(data: AppData, cooperativaId?: string): Cooperado[] {
  if (!cooperativaId) return [];

  const base = data.cooperados
    .filter((c) => c.cooperativaId === cooperativaId && c.status !== "desligado");

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
  if (nota) {
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
  nota: { cooperadoId: string; cooperadoNomeSnapshot?: string },
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
  return nomeAlvo.length > 1 && nomeAlvo === nomeDono;
}
