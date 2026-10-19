/**
 * Cleones — por que continua em aberto? (read-only)
 * npx tsx scripts/_diag-cleones-duplicata-id-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = "62351750000165";
const ID_STORAGE = "c_1785866278549_z9fa6";
const ID_LOGIN = "c_1785867836463_qsr08";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    realtime: { transport: ws },
  });

  const { fetchNotasFromTable } = await import("../src/lib/supabase/notasStorage.ts");
  const { fetchCooperadosFromStorage } = await import("../src/lib/supabase/cooperadosStorage.ts");
  const table = await fetchNotasFromTable(sb, CNPJ);
  const notas = table.notas;
  const cooperados = await fetchCooperadosFromStorage(sb, CNPJ);
  const cadStorage = cooperados.find((c) => c.id === ID_STORAGE);
  const cadLogin = cooperados.find((c) => c.id === ID_LOGIN);

  const blob = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
  const op = JSON.parse(await (await blob.data!.text()));

  const fichas = (op.fichaCorrida ?? []) as { cooperadoId: string; status: string; valorLiquido: number; mesReferencia: string }[];
  const pag = (op.pagamentosCooperado ?? []) as { cooperadoId: string; status: string; valorLiquido: number; mesReferencia: string }[];

  function sumNotas(id: string) {
    const rows = notas.filter((n) => n.cooperadoId === id);
    const conferida = rows.filter((n) => n.status === "conferida");
    const pago = rows.filter((n) => n.status === "pago");
    const liqConf = conferida.reduce((s, n) => s + Number(n.valorLiquido ?? 0), 0);
    const out2026_10 = conferida.filter((n) => n.mesReferencia === "2026-10");
    return {
      total: rows.length,
      conferida: conferida.length,
      pago: pago.length,
      liqConferida: liqConf,
      out2026_10: {
        count: out2026_10.length,
        liq: out2026_10.reduce((s, n) => s + (n.valorLiquido ?? 0), 0),
      },
    };
  }

  function sliceOp(id: string) {
    const f = fichas.filter((x) => x.cooperadoId === id);
    const p = pag.filter((x) => x.cooperadoId === id);
    const fPend = f.filter((x) => x.status === "pendente");
    return {
      fichas: f.length,
      fichasPendente: fPend.length,
      somaFichaPend: fPend.reduce((s, x) => s + (x.valorLiquido ?? 0), 0),
      pagamentos: p.length,
      pagConfirmado: p.filter((x) => x.status === "confirmado").length,
    };
  }

  const notasNomeCleones = notas.filter((n) =>
    (n.cooperadoNomeSnapshot ?? "").toLowerCase().includes("cleones")
  );
  const porCoopId: Record<string, { total: number; conferida: number; liq: number }> = {};
  for (const n of notasNomeCleones) {
    const k = n.cooperadoId;
    if (!porCoopId[k]) porCoopId[k] = { total: 0, conferida: 0, liq: 0 };
    porCoopId[k].total++;
    if (n.status === "conferida") {
      porCoopId[k].conferida++;
      porCoopId[k].liq += n.valorLiquido ?? 0;
    }
  }

  const out = {
    ids: { cadastroStorage: ID_STORAGE, loginAppUsers: ID_LOGIN },
    cadastro: {
      storage: cadStorage
        ? { nome: cadStorage.nomeCompleto, cpf: cadStorage.cpfCnpj }
        : null,
      loginRow: cadLogin ? { nome: cadLogin.nomeCompleto, cpf: cadLogin.cpfCnpj } : null,
    },
    notasPorCooperadoId: { storageId: sumNotas(ID_STORAGE), loginId: sumNotas(ID_LOGIN) },
    notasComSnapshotCleones: { total: notasNomeCleones.length, porCooperadoId: porCoopId },
    operacionalJson: { storageId: sliceOp(ID_STORAGE), loginId: sliceOp(ID_LOGIN) },
    veredito:
      "Dois IDs para a mesma pessoa: notas/entregas no cadastro (z9fa6) e login no app (qsr08). " +
      "O painel do responsável lista pelo cadastro; PIX/pagamento pode estar no outro ID — " +
      "fica «em aberto» até unificar cooperado_id nas notas ou fundir IDs no storage.",
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
