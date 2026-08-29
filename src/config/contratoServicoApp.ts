import { PLATFORM_NAME } from "@/utils/constants";

/** Versão do contrato — cooperativas com versão anterior precisam assinar de novo. */
export const CONTRATO_SERVICO_VERSAO = "2026-03-29";

/** Vigência a partir desta data (contrato disponível no app). */
export const CONTRATO_SERVICO_VIGENCIA_INICIO = "2026-03-29";

export const PROPRIETARIO_APP = {
  nome: "Proprietário HB Cooperativas",
  cpf: "01441712283",
  cpfFormatado: "014.417.122-83",
  /** Chave PIX (CPF) do proprietário do aplicativo. */
  pixChave: "01441712283",
  pixNome: "HB COOPERATIVAS",
  emailSuporte: "suporte@hbcooperativas.com.br",
} as const;

export interface ClausulaContratoServico {
  titulo: string;
  itens: string[];
}

export function getClausulasContratoServicoApp(): ClausulaContratoServico[] {
  return [
    {
      titulo: "1. Partes e natureza do contrato",
      itens: [
        `CONTRATANTE: a cooperativa cadastrada neste aplicativo, representada pelo responsável que assina eletronicamente.`,
        `CONTRATADO (PRESTADOR): ${PROPRIETARIO_APP.nome}, pessoa física, inscrito no CPF ${PROPRIETARIO_APP.cpfFormatado}, proprietário e mantenedor do software ${PLATFORM_NAME}.`,
        `Este contrato é de prestação de serviços de software (SaaS). O prestador é pessoa física — o pagamento será direcionado ao CPF ${PROPRIETARIO_APP.cpfFormatado} via PIX ou boleto indicado na cobrança mensal.`,
      ],
    },
    {
      titulo: "2. Objeto",
      itens: [
        `Licença de uso do ${PLATFORM_NAME} para gestão operacional da cooperativa: entregas, ficha corrida, pagamentos, mensalidades, relatórios e demais módulos habilitados.`,
        "O serviço é disponibilizado na modalidade nuvem, com dados operacionais sincronizados conforme a configuração da cooperativa.",
      ],
    },
    {
      titulo: "3. Preço e forma de cobrança",
      itens: [
        `Valor: R$ 9,90 por cooperado ativo cadastrado no ciclo mensal, com mínimo de R$ 149,00 por cooperativa/mês.`,
        "Contam-se todos os cooperados com status diferente de desligado no momento da apuração do ciclo.",
        "O ciclo mensal inicia na data de cadastro do primeiro cooperado no CNPJ da cooperativa e renova-se a cada mês nessa mesma data (aniversário do ciclo).",
        "A cobrança aparecerá no painel do responsável com PIX (chave CPF do proprietário) e referência para boleto bancário.",
      ],
    },
    {
      titulo: "4. Pagamento e confirmação",
      itens: [
        "Após realizar o PIX ou pagar o boleto, o responsável deve clicar em “Pagamento informado” no aplicativo.",
        "O pagamento só será considerado quitado após confirmação expressa do proprietário do app no painel administrativo.",
        "Enquanto aguarda confirmação, a mensalidade constará como pendente de validação.",
      ],
    },
    {
      titulo: "5. Inadimplência e suspensão",
      itens: [
        "O não pagamento na data de vencimento do ciclo enseja aviso de pendência no painel da cooperativa.",
        "Persistindo o atraso, o aplicativo poderá exibir aviso de suspensão e, em caso extremo, bloqueio temporário de funcionalidades até a regularização.",
        "A suspensão não exclui a dívida nem impede o acordo posterior de quitação.",
      ],
    },
    {
      titulo: "6. Obrigações da cooperativa (CONTRATANTE)",
      itens: [
        "Manter dados cadastrais e de contato atualizados.",
        "Utilizar o sistema de boa-fé, com usuários autorizados e senhas protegidas.",
        "Pagar pontualmente a mensalidade conforme apurada no painel.",
        "Informar pagamentos apenas após efetiva transferência ou quitação do boleto.",
        "Responsabilizar-se pelos lançamentos operacionais feitos por sua equipe no app.",
      ],
    },
    {
      titulo: "7. Obrigações do proprietário (CONTRATADO)",
      itens: [
        "Manter o aplicativo disponível, salvo manutenções programadas ou caso fortuito.",
        "Prestar suporte razoável para dúvidas de uso e confirmação de pagamentos.",
        "Confirmar ou recusar pagamentos informados, com registro no histórico da cobrança.",
        "Comunicar alterações relevantes de preço ou termos com antecedência razoável (nova versão de contrato).",
      ],
    },
    {
      titulo: "8. Direitos da cooperativa",
      itens: [
        "Acesso ao software contratado enquanto em dia ou em tolerância informada.",
        "Exportação de relatórios e dados operacionais disponíveis no app.",
        "Cancelamento do serviço mediante comunicação — permanecem devidas parcelas vencidas.",
      ],
    },
    {
      titulo: "9. Limitações",
      itens: [
        "O app auxilia a gestão operacional; não substitui contabilidade formal, obrigações fiscais ou assessoria jurídica.",
        "Indisponibilidades pontuais de internet ou de terceiros (bancos, Supabase, etc.) não geram automaticamente crédito, salvo acordo.",
      ],
    },
    {
      titulo: "10. Aceite",
      itens: [
        `Ao assinar eletronicamente, a cooperativa declara ter lido e concordado com este contrato (versão ${CONTRATO_SERVICO_VERSAO}), vigente a partir de ${CONTRATO_SERVICO_VIGENCIA_INICIO.split("-").reverse().join("/")}.`,
        "O aceite fica registrado com data, hora e identificação do responsável signatário.",
      ],
    },
  ];
}

/** Referência legível para boleto (sem integração bancária). */
export function gerarReferenciaBoletoSaas(cnpj: string, periodoId: string, valorTotal: number): string {
  const digits = cnpj.replace(/\D/g, "").slice(0, 8);
  const valorCentavos = Math.round(valorTotal * 100);
  return `HB-${digits}-${periodoId.replace(/-/g, "")}-${valorCentavos}`;
}
