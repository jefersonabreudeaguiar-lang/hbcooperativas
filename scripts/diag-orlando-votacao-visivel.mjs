import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const CNPJ = "62351750000165";
const COOP_ID = "06342dae-8191-4193-94b6-d0be3a82e10b";
const ORLANDO_ID = "c_1782263929381_ncp55";
const PAUTA_ID = "vtp_1788452366259_lp4hv";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: b } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
const op = JSON.parse(await b.text());
const pauta = (op.votacaoPautas ?? []).find((p) => p.id === PAUTA_ID);
const votosOrlando = (op.votacaoVotos ?? []).filter((v) => v.pautaId === PAUTA_ID && v.cooperadoId === ORLANDO_ID);

const reabertoEm = pauta?.votosReabertosEm ? new Date(pauta.votosReabertosEm).getTime() : 0;
const votosValidos = votosOrlando.filter((v) => !reabertoEm || new Date(v.createdAt).getTime() >= reabertoEm);

const { data: user } = await sb
  .from("app_users")
  .select("email,name,role,cooperado_id,active")
  .eq("cooperado_id", ORLANDO_ID)
  .maybeSingle();

console.log(JSON.stringify({
  pauta: {
    status: pauta?.status,
    escopo: pauta?.escopoEleitoral ?? "todos",
    inicioEm: pauta?.inicioEm,
    fimEm: pauta?.fimEm,
    votosReabertosEm: pauta?.votosReabertosEm,
  },
  orlandoAppUser: user,
  votosOrlandoTotal: votosOrlando.length,
  votosOrlandoValidosPosReabertura: votosValidos.length,
  votosOrlandoDetalhe: votosOrlando.map((v) => ({ voto: v.voto, createdAt: v.createdAt })),
  jaVotouNuvem: votosValidos.length > 0,
  pautaNoPeriodo: pauta ? new Date() <= new Date(pauta.fimEm + "T23:59:59") : false,
}, null, 2));
