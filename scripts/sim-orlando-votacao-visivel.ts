/** Simula visibilidade da votação para Orlando (voto local fantasma). */
import type { AppData, VotacaoPauta, VotacaoVoto } from "../src/types";
import { listPautasAbertasCooperado, cooperadoJaVotou } from "../src/services/votacaoService";

const COOP_ID = "06342dae-8191-4193-94b6-d0be3a82e10b";
const ORLANDO_ID = "c_1782263929381_ncp55";
const PAUTA_ID = "vtp_1788452366259_lp4hv";

const pauta: VotacaoPauta = {
  id: PAUTA_ID,
  cooperativaId: COOP_ID,
  texto: "teste",
  inicioEm: "2026-09-03",
  fimEm: "2026-09-04",
  status: "aberta",
  votosReabertosEm: "2026-09-03T17:10:40.828Z",
  createdAt: "2026-09-03T12:00:00.000Z",
  updatedAt: "2026-09-03T17:10:40.828Z",
};

const votoLocalFantasma: VotacaoVoto = {
  id: "vtv_local_orphan",
  pautaId: PAUTA_ID,
  cooperativaId: COOP_ID,
  cooperadoId: ORLANDO_ID,
  cooperadoNome: "Orlando Fetisch",
  voto: "sim",
  assinaturaDataUrl: "data:image/png;base64,x",
  createdAt: "2026-09-03T17:20:00.000Z",
};

function baseData(votos: VotacaoVoto[]): AppData {
  return {
    cooperativas: [],
    cooperados: [
      {
        id: ORLANDO_ID,
        cooperativaId: COOP_ID,
        nomeCompleto: "Orlando Fetisch",
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
        observacoes: "",
        createdAt: "",
        updatedAt: "",
      },
    ],
    notasPedido: [],
    instituicoes: [],
    produtosInstituicao: [],
    contratos: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    fichaCorrida: [],
    votacaoPautas: [pauta],
    votacaoVotos: votos,
    instituicoesExcluidas: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    auditLog: [],
    config: {},
  };
}

const comFantasma = baseData([votoLocalFantasma]);
const confirmado = baseData([{ ...votoLocalFantasma, confirmadoNuvem: true }]);

console.log("Fantasma local -> jaVotou:", cooperadoJaVotou(comFantasma, PAUTA_ID, ORLANDO_ID, COOP_ID));
console.log("Fantasma local -> visível:", listPautasAbertasCooperado(comFantasma, COOP_ID, ORLANDO_ID).length === 1);
console.log("Confirmado nuvem -> jaVotou:", cooperadoJaVotou(confirmado, PAUTA_ID, ORLANDO_ID, COOP_ID));
console.log("Confirmado nuvem -> visível:", listPautasAbertasCooperado(confirmado, COOP_ID, ORLANDO_ID).length === 0);
