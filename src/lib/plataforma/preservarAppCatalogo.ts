/**
 * Catálogo travado do passo 0 — anti-retrocesso.
 * Não importar em UI. Só gate, CI e documentação.
 *
 * Subir uma versão de contrato exige ordem explícita e atualizar
 * PRESERVAR_APP_CONTRATOS_TRAVADOS no mesmo commit.
 */
import { COOPERADO_ABERTURA_INSTANTANEA_VERSION } from "../cooperado/cooperadoAberturaInstantanea";
import { COOPERADO_FOTOS_FICHA_CONTRATO_VERSION } from "../cooperado/cooperadoFotosFichaContrato";
import { COOPERADO_TROCA_ABAS_RAPIDA_VERSION } from "../cooperado/cooperadoTrocaAbasRapida";
import { RESPONSAVEL_CONFERIR_CORRECOES_CONTRATO_VERSION } from "../responsavel/responsavelConferirCorrecoesContrato";
import { RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION } from "../responsavel/responsavelConferirEntregasContrato";
import { RESPONSAVEL_PAGAR_COOPERADOS_CONTRATO_VERSION } from "../responsavel/responsavelPagarCooperadosContrato";
import { RESPONSAVEL_PAINEL_CONTRATO_VERSION } from "../responsavel/responsavelPainelContrato";

export const PRESERVAR_APP_GATE_VERSION = 1;

/** Versões que o campo já usa. Drift = regressão ou bump sem ordem. */
export const PRESERVAR_APP_CONTRATOS_TRAVADOS = {
  conferirEntregas: 2,
  pagarCooperados: 1,
  conferirCorrecoes: 1,
  painelResponsavel: 3,
  fotosFicha: 2,
  aberturaInstantanea: 1,
  trocaAbas: 1,
} as const;

export const PRESERVAR_APP_STAFF_LKG_PREFIX = "hb-staff-gestao-lkg-v1";
export const PRESERVAR_APP_STAFF_LKG_POR_CNPJ = true;

/** Blob global — débito do passo 1. Não corrigir no passo 0. */
export const PRESERVAR_APP_DEBITO_BLOB_GLOBAL = "coopeagriplla_data";

export const PRESERVAR_APP_TESTES_CONTRATO = [
  "scripts/test-responsavel-conferir-entregas-contrato.ts",
  "scripts/test-responsavel-pagar-cooperados-contrato.ts",
  "scripts/test-responsavel-conferir-correcoes-contrato.ts",
  "scripts/test-cooperado-fotos-ficha-contrato.ts",
  "scripts/test-cooperado-abertura-instantanea.ts",
  "scripts/test-cooperado-troca-abas-rapida.ts",
  "scripts/test-staff-gestao-lkg-por-cnpj.ts",
  "scripts/test-staff-gestao-persist-por-cnpj.ts",
  "scripts/test-staff-gestao-tenant-switch.ts",
] as const;

export type RaioExplosaoHb = "docs" | "tenant-gestao" | "responsavel" | "cooperado-GA";

const NORM_SEP = /\\/g;

function norm(path: string): string {
  return path.replace(NORM_SEP, "/");
}

function bate(path: string, hint: string): boolean {
  return path.includes(hint);
}

/**
 * Classifica paths de um diff. `docs` nunca conta como mistura de produto.
 * Não usar em runtime de tela.
 */
export function raioExplosaoDoDiff(paths: readonly string[]): Set<RaioExplosaoHb> {
  const raios = new Set<RaioExplosaoHb>();
  for (const raw of paths) {
    const p = norm(raw);

    if (
      bate(p, "docs/") ||
      bate(p, ".cursor/") ||
      bate(p, ".github/") ||
      bate(p, "src/lib/plataforma/") ||
      bate(p, "scripts/test-preservar-app-gate.ts") ||
      bate(p, "scripts/run-release-verify.ts") ||
      p === "package.json" ||
      p.endsWith("plataforma-preservar-app.mdc") ||
      p.endsWith("filosofia-hb-unico.mdc") ||
      p.endsWith("FILOSOFIA-HB-UNICO.md") ||
      p.endsWith("OPERACAO-HB-PLATAFORMA.md")
    ) {
      raios.add("docs");
    }

    if (bate(p, "src/lib/staff/") || bate(p, "scripts/test-staff-gestao")) {
      raios.add("tenant-gestao");
    }

    const notasStaff =
      bate(p, "notas-pedido/staff") ||
      bate(p, "NotasPedidoStaff") ||
      bate(p, "src/lib/responsavel/") ||
      bate(p, "src/services/responsavel") ||
      bate(p, "src/utils/filaConferencia");
    const notasPedido = bate(p, "src/app/(app)/notas-pedido") || bate(p, "src/app/(app)/ficha-corrida");
    if (notasStaff || notasPedido) {
      raios.add("responsavel");
    }
    if (notasPedido && !notasStaff) {
      raios.add("cooperado-GA");
    }

    if (
      bate(p, "src/lib/cooperado/") ||
      bate(p, "src/components/cooperado/") ||
      bate(p, "src/hooks/useCooperado") ||
      bate(p, "src/app/(app)/dashboard/") ||
      bate(p, "src/lib/pwa/") ||
      bate(p, "src/lib/performance/") ||
      bate(p, "src/lib/appBuildVersion.ts") ||
      bate(p, "public/sw.js") ||
      bate(p, "src/lib/cooperadoInicio")
    ) {
      raios.add("cooperado-GA");
    }
  }
  return raios;
}

export function misturaRaiosDeProduto(raios: Iterable<RaioExplosaoHb>): boolean {
  const produto = new Set<RaioExplosaoHb>();
  for (const r of raios) {
    if (r !== "docs") produto.add(r);
  }
  return produto.size > 1;
}

export type DriftContratoTravado = {
  id: keyof typeof PRESERVAR_APP_CONTRATOS_TRAVADOS;
  live: number;
  travado: number;
};

export function listarDriftContratosTravados(): DriftContratoTravado[] {
  const pares: DriftContratoTravado[] = [
    {
      id: "conferirEntregas",
      live: RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.conferirEntregas,
    },
    {
      id: "pagarCooperados",
      live: RESPONSAVEL_PAGAR_COOPERADOS_CONTRATO_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.pagarCooperados,
    },
    {
      id: "conferirCorrecoes",
      live: RESPONSAVEL_CONFERIR_CORRECOES_CONTRATO_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.conferirCorrecoes,
    },
    {
      id: "painelResponsavel",
      live: RESPONSAVEL_PAINEL_CONTRATO_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.painelResponsavel,
    },
    {
      id: "fotosFicha",
      live: COOPERADO_FOTOS_FICHA_CONTRATO_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.fotosFicha,
    },
    {
      id: "aberturaInstantanea",
      live: COOPERADO_ABERTURA_INSTANTANEA_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.aberturaInstantanea,
    },
    {
      id: "trocaAbas",
      live: COOPERADO_TROCA_ABAS_RAPIDA_VERSION,
      travado: PRESERVAR_APP_CONTRATOS_TRAVADOS.trocaAbas,
    },
  ];
  return pares.filter((p) => p.live !== p.travado);
}
