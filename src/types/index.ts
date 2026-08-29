// Tipos centrais — plataforma HB Cooperativas

export type UserRole = "admin" | "tesoureiro" | "responsavel" | "cooperado" | "parceiro" | "contador";

/** Total = perfil padrão da função; parcial = só o que estiver em permissoesExtras. */
export type ModoAcesso = "total" | "parcial";

export type CooperativaStatus = "ativa" | "inativa";

export interface MensalidadeConfig {
  valorPadrao: number;
  diaVencimento: number;
  lembreteAtivo: boolean;
  /** Dia do mês em que o aviso começa a aparecer (1–28). */
  diaLembrete?: number;
  lembreteTitulo?: string;
  lembreteTexto?: string;
  /** Cria mensalidades pendentes para todos os cooperados ativos todo mês. */
  gerarAutomaticamente?: boolean;
  /** Meses (YYYY-MM) em que a mensalidade será cobrada/descontada. */
  mesesCobranca?: string[];
  /** ISO — última vez que o responsável salvou esta configuração. */
  configSalvaEm?: string;
  /** Armazenado na nuvem — hash bcrypt da senha exigida no cadastro de cooperados (opcional). */
  senhaCadastroCooperadoHash?: string;
  /** Hash bcrypt da senha da área administrativa (opcional). */
  senhaAreaAdminHash?: string;
}

export interface Cooperativa {
  id: string;
  nome: string;
  cnpj: string;
  endereco?: string;
  telefone?: string;
  responsavel?: string;
  email?: string;
  status: CooperativaStatus;
  mensalidadeConfig?: MensalidadeConfig;
  /** Senha opcional que o cooperado deve informar no auto-cadastro pelo CNPJ (local). */
  senhaCadastroCooperado?: string;
  /** Hash bcrypt da senha de cadastro de cooperados (nuvem). */
  senhaCadastroCooperadoHash?: string;
  /** Hash bcrypt da senha exclusiva da área administrativa (/admin). */
  senhaAreaAdminHash?: string;
  /** Cobrança da plataforma HB (por cooperado cadastrado). */
  cobrancaSaas?: CobrancaSaasCooperativa;
  createdAt: string;
  updatedAt: string;
}

/** Status da assinatura HB no mês corrente do ciclo. */
export type CobrancaSaasStatusMes =
  | "aguardando_primeiro_cooperado"
  | "em_dia"
  | "cobranca_enviada"
  | "aguardando_confirmacao"
  | "aviso_bloqueio"
  | "bloqueado";

export interface CobrancaSaasLancamento {
  id: string;
  /** Identificador do período (ex.: 2026-08-15 — aniversário do 1º cooperado). */
  periodoId: string;
  mesReferencia: string;
  qtdCooperados: number;
  valorUnitario: number;
  valorMinimo: number;
  valorTotal: number;
  status: "pendente" | "enviada" | "aguardando_confirmacao" | "paga" | "cancelada" | "rejeitada";
  criadaEm: string;
  enviadaEm?: string;
  pagaEm?: string;
  informadoPagamentoEm?: string;
  informadoPagamentoPor?: string;
  comprovanteDataUrl?: string;
  confirmadoPor?: string;
  rejeitadoEm?: string;
  motivoRejeicao?: string;
  observacao?: string;
}

export interface CobrancaSaasCooperativa {
  /** ISO — responsável aceitou os termos no cadastro. */
  termosAceitosEm?: string;
  /** ISO — responsável assinou o contrato de serviço vigente. */
  contratoServicoAssinadoEm?: string;
  contratoServicoAssinadoPor?: string;
  contratoServicoVersao?: string;
  /** ISO — data/hora do 1º cooperado no CNPJ (início do ciclo mensal). */
  cicloInicioEm?: string;
  statusMes: CobrancaSaasStatusMes;
  /** Último período pago (periodoId). */
  ultimoPeriodoPago?: string;
  avisoMensagem?: string;
  avisoEm?: string;
  bloqueadoEm?: string;
  bloqueadoPor?: string;
  historico?: CobrancaSaasLancamento[];
}

export type CooperadoStatus = "ativo" | "suspenso" | "desligado";

export type PagamentoStatus = "paga" | "pendente" | "atrasada" | "parcelada" | "quitada" | "em_aberto" | "pago" | "parcial";

export type EntregaStatus = "entregue" | "conferido" | "pendente" | "pago" | "cancelado";

export type ComunicadoCategoria = "financeiro" | "reuniao" | "entrega" | "documentacao" | "aviso_geral";

export type InstituicaoTipo = "PNAE" | "prefeitura" | "escola" | "associacao" | "mercado" | "outro";

export type FinanceiroStatus = "em_dia" | "pendente" | "com_debito";

export type FechamentoStatus = "rascunho" | "revisado" | "aprovado" | "bloqueado";

export type AuditAction = "criar" | "editar" | "excluir" | "aprovar" | "bloquear";

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId: string;
  userName: string;
  timestamp: string;
  justification?: string;
  changes?: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  cooperadoId?: string;
  cooperativaId?: string;
  /** CNPJ informado no cadastro — garante envio à nuvem mesmo se ID local divergir. */
  cooperativaCnpj?: string;
  active: boolean;
  /** Cargo/função exibida em relatórios e no perfil (ex.: Presidente, Tesoureiro). */
  funcao?: string;
  /** Conta principal criada no cadastro da cooperativa — pode gerenciar equipe. */
  responsavelPrincipal?: boolean;
  /** total = matriz da função; parcial = só permissoesExtras. */
  modoAcesso?: ModoAcesso;
  /** Acessos liberados quando modoAcesso = parcial. */
  permissoesExtras?: Partial<Record<Resource, Action[]>>;
  /** Restrições sobre a matriz padrão quando modoAcesso = total. */
  permissoesNegadas?: Partial<Record<Resource, Action[]>>;
}

export interface EmissorRelatorio {
  nome: string;
  funcao: string;
  emitidoEm: string;
  assinaturaDataUrl?: string;
}

export interface Cooperado {
  id: string;
  cooperativaId: string;
  nomeCompleto: string;
  cpfCnpj: string;
  telefone: string;
  endereco: string;
  comunidade: string;
  cafDap: string;
  chavePix: string;
  pixValido?: boolean;
  pixInvalidoMotivo?: string;
  banco: string;
  agencia: string;
  conta: string;
  status: CooperadoStatus;
  /** Entregas lançadas pela cooperativa, sem app/foto de nota. */
  avulso?: boolean;
  /** Cooperado integrante da diretoria — recebe avisos exclusivos. */
  membroDiretoria?: boolean;
  /**
   * Quando o cooperado abriu o app instalado (PWA / tela inicial) pela primeira vez.
   * Ausente = ainda não detectamos o app no celular.
   */
  appInstaladoEm?: string;
  /** Último acesso ao sistema (app ou navegador). */
  ultimoAcessoEm?: string;
  /** Como foi o último acesso detectado. */
  ultimoAcessoModo?: "app" | "navegador";
  produtos: string[];
  observacoes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mensalidade {
  id: string;
  cooperadoId: string;
  /** CPF/nome no momento da cobrança — permite sync quando o id difere entre aparelhos. */
  cooperadoNomeSnapshot?: string;
  cooperadoCpfSnapshot?: string;
  mesReferencia: string;
  valor: number;
  vencimento: string;
  status: "paga" | "pendente" | "atrasada" | "parcelada" | "aguardando_confirmacao";
  dataPagamento?: string;
  formaPagamento?: string;
  observacao?: string;
  comprovante?: string;
  /** Cooperado informou que pagou — aguarda confirmação da diretoria. */
  informadoPagamentoEm?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CotaPagamento {
  id: string;
  data: string;
  valor: number;
  formaPagamento: string;
}

export interface Cota {
  id: string;
  cooperadoId: string;
  tipo: string;
  valorTotal: number;
  quantidadeParcelas: number;
  valorParcela: number;
  parcelasPagas: number;
  parcelasPendentes: number;
  vencimento: string;
  status: "quitada" | "em_aberto" | "parcelada" | "atrasada";
  historicoPagamentos: CotaPagamento[];
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotaPedidoStatus =
  | "rascunho"
  | "entregue"
  | "aguardando_conferencia"
  | "conferida"
  | "rejeitada"
  | "pago"
  | "cancelado";

export interface ProdutoInstituicao {
  id: string;
  cooperativaId: string;
  instituicaoId: string;
  nome: string;
  unidade: string;
  precoUnitario: number;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotaPedidoItem {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  valorBruto: number;
}

export type NotaPedidoFotoStatus = "local_pending" | "uploading" | "uploaded" | "failed";

/** Metadados leves de foto — imagem fica no Supabase Storage, não no localStorage. */
export interface NotaPedidoFoto {
  id: string;
  storagePath?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  status: NotaPedidoFotoStatus;
  createdAt: string;
  index?: number;
}

export interface NotaPedido {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  instituicaoId: string;
  numeroNota: string;
  dataEntrega: string;
  localEntrega: string;
  itens: NotaPedidoItem[];
  valorBruto: number;
  percentualDescontoCooperativa: number;
  valorDesconto: number;
  valorLiquido: number;
  status: NotaPedidoStatus;
  assinaturaRecebedor?: string;
  dataAssinatura?: string;
  fotoPedido?: string;
  /** Todas as fotos de um único envio (uma entrega). */
  fotosPedido?: string[];
  /** Miniatura leve — lista no aparelho do cooperado após envio à nuvem. */
  fotoPedidoMiniatura?: string;
  fotosPedidoMiniaturas?: string[];
  /** Metadados leves das fotos (Storage) — preferir em novos envios. */
  fotosMeta?: NotaPedidoFoto[];
  /** Foto completa está no Supabase (não duplicar no navegador). */
  fotoNaNuvem?: boolean;
  /** Quantidade de fotos no envio — usado para reenviar se a nuvem perdeu alguma. */
  fotosEnviadasCount?: number;
  /** CNPJ da cooperativa — identifica entregas entre aparelhos diferentes. */
  cooperativaCnpj?: string;
  /** Nome do cooperado no envio — ajuda o responsável a vincular a ficha. */
  cooperadoNomeSnapshot?: string;
  fotoEnviadaEm?: string;
  /** Lançada pela cooperativa, sem foto de nota (cooperado avulso). */
  lancamentoDireto?: boolean;
  conferidaPor?: string;
  dataConferencia?: string;
  rejeitadaPor?: string;
  dataRejeicao?: string;
  motivoRejeicao?: string;
  reenviadaEm?: string;
  /** Marca re-lançamento pelo responsável — evita que sync restaure conferida obsoleta na nuvem. */
  relancadaEm?: string;
  mesReferencia: string;
  observacoes?: string;
  /** Nome informado pelo cooperado quando a escola não está no cadastro. */
  escolaAvulsaNome?: string;
  /** Divisão do valor da entrega entre vários cooperados. */
  divisaoEntrega?: DivisaoEntregaNota;
  createdAt: string;
  updatedAt: string;
}

export interface FichaCorridaDesconto {
  tipo: "cooperativa" | "mensalidade" | "cota" | "manual" | "credito_avulso" | "conta_coop";
  motivo: string;
  valor: number;
}

/** Participante na divisão de uma entrega entre cooperados. */
export interface DivisaoEntregaParticipante {
  cooperadoId: string;
  cooperadoNome: string;
}

/** Registro de divisão do valor de uma entrega entre cooperados. */
export interface DivisaoEntregaNota {
  cooperadoOrigemId: string;
  cooperadoOrigemNome: string;
  participantes: DivisaoEntregaParticipante[];
  divididoEm: string;
}

/** Valor extra a receber, lançado pela cooperativa para cooperado específico. */
export interface ValorAvulsoReceber {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  mesReferencia: string;
  motivo: string;
  valor: number;
  status: "pendente" | "pago";
  responsavel: string;
  dataLancamento: string;
  dataPagamento?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FichaCorrida {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  /** Nome no momento do lançamento — evita “Desconhecido” entre aparelhos. */
  cooperadoNomeSnapshot?: string;
  notaPedidoId: string;
  descricao: string;
  valorBruto: number;
  descontos: number;
  valorLiquido: number;
  saldoAcumulado: number;
  mesReferencia: string;
  status: "pendente" | "pago";
  dataLancamento: string;
  dataPagamentoPrevista?: string;
  responsavelConferencia?: string;
  itens?: NotaPedidoItem[];
  percentualDescontoCooperativa?: number;
  descontosDetalhe?: FichaCorridaDesconto[];
  divisaoEntrega?: DivisaoEntregaNota;
  createdAt: string;
}

/** Pagamento mensal registrado pela diretoria — aguarda confirmação do cooperado. */
export interface PagamentoCooperadoRegistro {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  mesReferencia: string;
  valorBruto: number;
  descontoCooperativa: number;
  descontosExtras: FichaCorridaDesconto[];
  valorLiquido: number;
  fichaIds: string[];
  notaPedidoIds: string[];
  status: "aguardando_confirmacao" | "confirmado";
  pagoPor: string;
  pagoEm: string;
  assinaturaCooperado?: string;
  assinadoEm?: string;
  reciboHtml?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Mensalidade e desconto avulso do mês — único por cooperativa, vale para todos os cooperados. */
export interface AjustesFichaMesCooperativa {
  id: string;
  cooperativaId: string;
  mesReferencia: string;
  mensalidadeFixa: number;
  descontoAvulso: number;
  descontoAvulsoMotivo?: string;
  updatedAt: string;
}

/** Pasta mensal por cooperado — fotos e recibos arquivados. */
export interface ArquivoMensalCooperado {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  mesReferencia: string;
  notaPedidoIds: string[];
  pagamentoIds: string[];
  /** Mensalidade fixa descontada neste mês (padrão da cooperativa se omitido). */
  mensalidadeFixa?: number;
  descontoAvulso?: number;
  descontoAvulsoMotivo?: string;
  /** Responsável confirma pagamento da cota de ingresso. */
  cotaIngressoPaga?: boolean;
  updatedAt: string;
}

export interface Instituicao {
  id: string;
  cooperativaId: string;
  nome: string;
  tipo: InstituicaoTipo;
  cnpj: string;
  responsavel: string;
  telefone: string;
  endereco: string;
  localEntrega?: string;
  totalComprado: number;
  createdAt: string;
  updatedAt: string;
}

/** Item previsto no cronograma mensal do contrato. */
export interface CronogramaContratoItem {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidadePrevista: number;
  valorPrevisto: number;
}

/** Cronograma mensal recebido da contratante — define metas de entrega do mês. */
export interface CronogramaContratoMensal {
  id: string;
  cooperativaId: string;
  instituicaoId: string;
  mesReferencia: string;
  /** Anotação / referência do cronograma recebido no mês. */
  anotacaoMes?: string;
  fotos?: string[];
  fotosMiniaturas?: string[];
  itens: CronogramaContratoItem[];
  valorLimiteEntrega: number;
  lancadoPor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Entrega {
  id: string;
  instituicaoId: string;
  cooperadoId: string;
  produto: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorBruto: number;
  percentualDescontoCooperativa: number;
  valorDescontoCooperativa: number;
  descontosAdicionais: number;
  valorLiquido: number;
  dataEntrega: string;
  localEntrega: string;
  status: EntregaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Desconto {
  id: string;
  cooperadoId: string;
  entregaId?: string;
  tipo: "cooperativa_padrao" | "mensalidade_aberta" | "cota_aberta" | "manual";
  motivo: string;
  data: string;
  responsavel: string;
  valorBruto: number;
  valorDescontado: number;
  valorLiquido: number;
  createdAt: string;
}

export interface Pagamento {
  id: string;
  cooperadoId: string;
  entregaId: string;
  valorBruto: number;
  descontos: number;
  valorLiquido: number;
  status: "pendente" | "pago" | "parcial";
  dataPrevista: string;
  dataEfetiva?: string;
  formaPagamento?: string;
  comprovante?: string;
  observacao?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceiroMensal {
  id: string;
  mesReferencia: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  mensalidadesRecebidas: number;
  cotasRecebidas: number;
  descontosRecebidos: number;
  pagamentosRealizados: number;
  valoresPendentes: number;
  observacoes: string;
  dataAtualizacao: string;
  responsavel: string;
  status: FechamentoStatus;
}

export interface Comunicado {
  id: string;
  cooperativaId?: string;
  /** Quando definido, só este cooperado vê o aviso. */
  cooperadoId?: string;
  /** Assunto do recado (exibido no mural). */
  assunto?: string;
  titulo: string;
  descricao: string;
  /** Áudio gravado pelo responsável (data URL webm). */
  audioDataUrl?: string;
  data: string;
  responsavel: string;
  categoria: ComunicadoCategoria;
  fixado: boolean;
  visivelParaTodos: boolean;
  /** Só cooperados marcados como diretoria veem este aviso. */
  somenteDiretoria?: boolean;
  /** Repete automaticamente todo mês — não precisa publicar de novo. */
  recorrente?: boolean;
  /** Dia do mês (1–28) em que o aviso passa a aparecer. */
  diaDoMes?: number;
  /** Desativar lembrete recorrente sem apagar. */
  ativo?: boolean;
  gruposEspecificos?: UserRole[];
  createdAt: string;
}

export interface Reclamacao {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  /** Item ou produto relacionado à reclamação. */
  item: string;
  /** Data do fato (YYYY-MM-DD). */
  data: string;
  descricao: string;
  registradoPor?: string;
  registradoPorNome?: string;
  createdAt: string;
  updatedAt: string;
}

export type VotacaoPautaStatus = "rascunho" | "aberta" | "encerrada" | "resultado_publicado";

/** Pauta de votação assemblear / enquete da cooperativa. */
export interface VotacaoPauta {
  id: string;
  cooperativaId: string;
  /** Texto da pauta — o que será votado. */
  texto: string;
  /** Início da votação (YYYY-MM-DD). */
  inicioEm: string;
  /** Fim da votação (YYYY-MM-DD). */
  fimEm: string;
  status: VotacaoPautaStatus;
  /** Quando a enquete foi lançada aos cooperados. */
  abertaEm?: string;
  /** Quando o responsável publicou o resultado no mural (24 h). */
  resultadoPublicadoEm?: string;
  criadoPorUserId?: string;
  criadoPorNome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VotacaoVoto {
  id: string;
  pautaId: string;
  cooperativaId: string;
  cooperadoId: string;
  cooperadoNome: string;
  voto: "sim" | "nao";
  createdAt: string;
}

export interface Propriedade {
  id: string;
  cooperadoId: string;
  nome: string;
  localizacao: string;
  areaAproximada: string;
  produtosProduzidos: string[];
  documentos?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Veiculo {
  id: string;
  cooperadoId: string;
  tipo: string;
  modelo: string;
  placa: string;
  usadoParaEntrega: boolean;
  documentacao?: string;
  validade?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FechamentoMensal {
  id: string;
  mesReferencia: string;
  status: FechamentoStatus;
  totalVendas: number;
  totalPagamentos: number;
  totalMensalidades: number;
  totalCotas: number;
  totalDescontos: number;
  saldoCooperativa: number;
  revisadoPor?: string;
  aprovadoPor?: string;
  dataRevisao?: string;
  dataAprovacao?: string;
  observacoes?: string;
  bloqueado: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LivroCaixaTipo = "credito" | "debito";

export type LivroCaixaOrigem =
  | "manual"
  | "mensalidade"
  | "pagamento_cooperado"
  | "credito_avulso"
  | "debito_avulso"
  | "pnae"
  | "prestacao_contas"
  | "outro";

export interface LivroCaixaLancamento {
  id: string;
  cooperativaId: string;
  data: string;
  mesReferencia: string;
  tipo: LivroCaixaTipo;
  valor: number;
  historico: string;
  origem: LivroCaixaOrigem;
  /** Evita duplicar lançamento automático. */
  origemId?: string;
  categoria?: string;
  responsavel?: string;
  createdAt: string;
  updatedAt: string;
}

export type TipoRepassePrestacao = "despesa" | "emprestimo" | "ajuda_custo" | "diversos";

export type PrestacaoContasStatus = "pendente" | "em_conferencia" | "conferida" | "parcial";

export interface PrestacaoContasNota {
  id: string;
  fotoDataUrl?: string;
  fotoMiniatura?: string;
  valorNota?: number;
  dataNota?: string;
  localDespesa?: string;
  conferido: boolean;
  conferidoEm?: string;
  enviadoEm: string;
}

export interface PrestacaoContas {
  id: string;
  cooperativaId: string;
  cooperadoId: string;
  cooperadoNomeSnapshot?: string;
  tipoRepasse: TipoRepassePrestacao;
  historico: string;
  valorRepasse: number;
  valorConferido: number;
  status: PrestacaoContasStatus;
  notas: PrestacaoContasNota[];
  enviadoEm?: string;
  responsavelId?: string;
  responsavelNome?: string;
  createdAt: string;
  updatedAt: string;
}

/** Registro de exclusão — impede que a sincronização traga a prestação de volta. */
export interface PrestacaoContasExcluida {
  id: string;
  cooperativaId: string;
  deletedAt: string;
}

/** Registro de exclusão — impede que a sincronização traga o contrato de volta. */
export interface InstituicaoExcluida {
  id: string;
  cooperativaId: string;
  deletedAt: string;
}

export interface ParecerContabilMensal {
  id: string;
  cooperativaId: string;
  mesReferencia: string;
  texto: string;
  contadorNome: string;
  contadorFuncao: string;
  assinaturaDataUrl?: string;
  emitidoEm: string;
  emitidoPorUserId: string;
  updatedAt: string;
}

/** Registro congelado no momento da aprovação do fechamento — imutável após captura. */
export interface FechamentoSnapshot {
  id: string;
  cooperativaId: string;
  mesReferencia: string;
  fechamentoId: string;
  capturedAt: string;
  capturedByUserId: string;
  capturedByName: string;
  contentHash: string;
  payloadJson: string;
}

export interface AppData {
  cooperativas: Cooperativa[];
  users: User[];
  cooperados: Cooperado[];
  mensalidades: Mensalidade[];
  cotas: Cota[];
  instituicoes: Instituicao[];
  produtosInstituicao: ProdutoInstituicao[];
  cronogramasContrato?: CronogramaContratoMensal[];
  notasPedido: NotaPedido[];
  fichaCorrida: FichaCorrida[];
  pagamentosCooperado: PagamentoCooperadoRegistro[];
  arquivosMensais: ArquivoMensalCooperado[];
  ajustesFichaMes: AjustesFichaMesCooperativa[];
  entregas: Entrega[];
  descontos: Desconto[];
  valoresAvulsosReceber: ValorAvulsoReceber[];
  pagamentos: Pagamento[];
  financeiro: FinanceiroMensal[];
  comunicados: Comunicado[];
  reclamacoes: Reclamacao[];
  votacaoPautas: VotacaoPauta[];
  votacaoVotos: VotacaoVoto[];
  propriedades: Propriedade[];
  veiculos: Veiculo[];
  fechamentos: FechamentoMensal[];
  livroCaixa: LivroCaixaLancamento[];
  prestacoesContas: PrestacaoContas[];
  prestacoesContasExcluidas?: PrestacaoContasExcluida[];
  instituicoesExcluidas?: InstituicaoExcluida[];
  auditLog: AuditEntry[];
  pareceresContabeis?: ParecerContabilMensal[];
  fechamentoSnapshots?: FechamentoSnapshot[];
  config: {
    descontoPadraoCooperativa: number;
  };
}

export type Resource =
  | "dashboard"
  | "cooperativas"
  | "cooperados"
  | "mensalidades"
  | "cotas"
  | "entregas"
  | "pagamentos"
  | "descontos"
  | "financeiro"
  | "comunicados"
  | "reclamacoes"
  | "votacoes"
  | "propriedades"
  | "veiculos"
  | "instituicoes"
  | "notas_pedido"
  | "ficha_corrida"
  | "relatorios"
  | "fechamento"
  | "livro_caixa"
  | "prestacao_contas"
  | "conta_coop"
  | "contador";

export type Action = "view" | "create" | "edit" | "delete" | "approve" | "export";
