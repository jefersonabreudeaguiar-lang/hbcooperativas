/**
 * BIC LAB — relatórios, fechamento e leituras gestão/admin (hub único).
 */
export {
  getRelatorioResumoFinanceiro,
  getRelatorioEntregasPorInstituicao,
  getRelatorioEntregasPorItensPeriodoReport,
  getRelatorioPNAE,
  getRelatorioPagarCooperadoEmAbertoReport,
  getRelatorioResumoFinanceiroEmAbertoReport,
  getRelatorioMensalidadesEmAbertoConsolidadoReport,
  getTotalValoresAPagarEmAberto,
  listMesesComLancamentos,
  listarMesesComDebitoCooperativa,
  exportToCSV,
  downloadCSV,
  getRelatorioSobrasPerdas,
  getRelatorioAtingimentoCronograma,
  calcularFechamentoMensal,
  getCooperadoStats,
  getAdminStats,
  getFinanceiroResumoCooperado,
} from "@/services/dashboardService";

export {
  calcularFechamentoMensalLive,
  flattenLinhasPagarCooperadoEmAberto,
} from "@/services/relatorioService";
