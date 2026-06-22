// Tipos centrais — plataforma HB Cooperativas

export type UserRole = "admin" | "tesoureiro" | "responsavel" | "cooperado";

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
  /** Armazenado na nuvem — senha exigida no cadastro de cooperados (opcional). */
  senhaCadastroCooperado?: string;
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
  /** Senha opcional que o cooperado deve informar no auto-cadastro pelo CNPJ. */
  senhaCadastroCooperado?: string;
  createdAt: string;
  updatedAt: string;
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
  produtos: string[];
  observacoes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mensalidade {
  id: string;
  cooperadoId: string;
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
  /** Foto completa está no Supabase (não duplicar no navegador). */
  fotoNaNuvem?: boolean;
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
  mesReferencia: string;
  observacoes?: string;
  /** Nome informado pelo cooperado quando a escola não está no cadastro. */
  escolaAvulsaNome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FichaCorridaDesconto {
  tipo: "cooperativa" | "mensalidade" | "cota" | "manual" | "credito_avulso";
  motivo: string;
  valor: number;
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
  titulo: string;
  descricao: string;
  data: string;
  responsavel: string;
  categoria: ComunicadoCategoria;
  fixado: boolean;
  visivelParaTodos: boolean;
  /** Repete automaticamente todo mês — não precisa publicar de novo. */
  recorrente?: boolean;
  /** Dia do mês (1–28) em que o aviso passa a aparecer. */
  diaDoMes?: number;
  /** Desativar lembrete recorrente sem apagar. */
  ativo?: boolean;
  gruposEspecificos?: UserRole[];
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

export interface AppData {
  cooperativas: Cooperativa[];
  users: User[];
  cooperados: Cooperado[];
  mensalidades: Mensalidade[];
  cotas: Cota[];
  instituicoes: Instituicao[];
  produtosInstituicao: ProdutoInstituicao[];
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
  propriedades: Propriedade[];
  veiculos: Veiculo[];
  fechamentos: FechamentoMensal[];
  auditLog: AuditEntry[];
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
  | "propriedades"
  | "veiculos"
  | "instituicoes"
  | "notas_pedido"
  | "ficha_corrida"
  | "relatorios"
  | "fechamento";

export type Action = "view" | "create" | "edit" | "delete" | "approve" | "export";
