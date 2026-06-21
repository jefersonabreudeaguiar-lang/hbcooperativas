import type { AppData } from "@/types";

/** Dados iniciais vazios — só aparece o que for cadastrado de verdade. */
export const emptyInitialData: AppData = {
  config: {
    descontoPadraoCooperativa: 5,
  },
  cooperativas: [],
  users: [],
  cooperados: [],
  instituicoes: [],
  produtosInstituicao: [],
  notasPedido: [],
  fichaCorrida: [],
  pagamentosCooperado: [],
  arquivosMensais: [],
  mensalidades: [],
  cotas: [],
  entregas: [],
  descontos: [],
  pagamentos: [],
  financeiro: [],
  comunicados: [],
  propriedades: [],
  veiculos: [],
  fechamentos: [],
  auditLog: [],
};

/** IDs e e-mails do conjunto de demonstração antigo — removidos na migração. */
export const DEMO_ENTITY_IDS = new Set([
  "coop1", "u1", "u2", "u3", "u4", "u5", "u6",
  "c1", "c2", "c3", "c4", "c5",
  "i1", "i2", "i3",
  "pi1", "pi2", "pi3", "pi4", "pi5", "pi6", "pi7", "pi8",
  "m1", "m2", "m3", "m4", "m5", "m6", "m7",
  "ct1", "ct2", "ct3", "ct4",
  "e1", "e2", "e3", "e4", "e5",
  "d1", "d2", "d3",
  "p1", "p2", "p3", "p4", "p5",
  "f1", "f2",
  "cm1", "cm2", "cm3", "cm4",
  "pr1", "pr2", "pr3",
  "v1", "v2", "v3",
  "fc1", "fc2",
  "a1", "a2", "a3",
]);

export const DEMO_EMAILS = new Set([
  "admin@hbcooperativa.org.br",
  "tesoureiro@hbcooperativa.org.br",
  "responsavel@hbcooperativa.org.br",
  "presidente@hbcooperativa.org.br",
  "jose.silva@email.com",
  "ana.santos@email.com",
  "pedro.oliveira@email.com",
]);

export const DEMO_CNPJ = "12345678000190";
