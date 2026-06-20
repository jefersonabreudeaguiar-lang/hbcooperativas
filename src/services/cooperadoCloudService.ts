import type { AppData, Cooperado } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getData, saveDataSafe } from "@/services/dataStore";

function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function nomeNormalizado(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
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
      const merged = {
        ...cooperados[index],
        ...cn,
        id,
        cooperativaId: coop.id,
      };
      if (new Date(merged.updatedAt).getTime() >= new Date(cooperados[index].updatedAt).getTime()) {
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

  return changed ? { ...data, cooperados } : data;
}

export async function fetchCooperadosFromCloud(cnpj: string): Promise<Cooperado[]> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return [];

  try {
    const res = await fetch(`/api/cooperados?cnpj=${digits}`, { cache: "no-store" });
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
    await fetch("/api/cooperados", {
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
