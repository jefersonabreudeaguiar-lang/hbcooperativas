import { PLATFORM_NAME } from "@/utils/constants";

/** Versão do termo — mercados com versão anterior precisam aceitar novamente. */
export const TERMO_MERCADO_CONTA_COOP_VERSAO = "2026-09-01";

export interface ClausulaTermoMercadoContaCoop {
  titulo: string;
  itens: string[];
}

export function getClausulasTermoMercadoContaCoop(input: {
  nomeMercado: string;
  cnpjMercado: string;
  nomeCooperativa: string;
  cnpjCooperativa: string;
  descontoPercent: number;
}): ClausulaTermoMercadoContaCoop[] {
  const desconto = input.descontoPercent.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return [
    {
      titulo: "1. Objeto e partes",
      itens: [
        `Este Termo de Uso regula a participação de ${input.nomeMercado} (CNPJ ${input.cnpjMercado}) no programa HB Créditos da cooperativa ${input.nomeCooperativa} (CNPJ ${input.cnpjCooperativa}), por meio do ${PLATFORM_NAME}.`,
        "O mercado parceiro autorizado poderá receber pagamentos de cooperados mediante crédito interno da cooperativa (HB Créditos), conforme regras operacionais abaixo.",
      ],
    },
    {
      titulo: "2. Desconto contratual acordado",
      itens: [
        `Foi acordado com a cooperativa um desconto de ${desconto}% sobre o valor de cada venda realizada via HB Créditos neste estabelecimento.`,
        "Esse percentual é definido pela cooperativa no cadastro do mercado e pode ser alterado pela cooperativa mediante comunicação; o valor vigente consta neste termo no momento do aceite.",
        "O desconto integra a política comercial do programa HB Créditos entre cooperativa, mercado e cooperados.",
      ],
    },
    {
      titulo: "3. Valor pago pelo cooperado e valor recebido pelo mercado",
      itens: [
        "Na hora da compra, o cooperado autoriza o pagamento do valor integral da venda (valor bruto informado na cobrança por QR Code).",
        `Sobre esse valor bruto incide o desconto contratual de ${desconto}%.`,
        "O mercado não recebe o valor bruto na liquidação: recebe apenas o valor líquido (bruto menos o desconto acordado).",
        "Exemplo: venda de R$ 100,00 com desconto de 10% — o cooperado paga R$ 100,00; o mercado recebe R$ 90,00 na liquidação mensal.",
      ],
    },
    {
      titulo: "4. Repasse do desconto à cooperativa",
      itens: [
        "A diferença entre o valor bruto pago pelo cooperado e o valor líquido repassado ao mercado corresponde ao desconto contratual.",
        "Esse montante não fica retido pelo mercado: é administrado pela cooperativa no âmbito do programa HB Créditos, conforme regras internas da cooperativa (benefícios aos cooperados, custeio operacional e demais destinações definidas pela cooperativa).",
        "O mercado declara ciência de que o desconto faz parte do acordo comercial com a cooperativa e autoriza o fluxo financeiro descrito neste termo.",
      ],
    },
    {
      titulo: "5. Cobrança, notas fiscais e liquidação",
      itens: [
        "As vendas são registradas por QR Code gerado no painel do mercado; o pagamento só é válido após confirmação eletrônica do cooperado.",
        "Para receber o repasse, o mercado deve anexar e manter regularizadas as notas fiscais das vendas, conforme exigido pela cooperativa na conferência fiscal.",
        "A liquidação mensual é feita pela cooperativa via PIX para a chave cadastrada pelo mercado, após conferência das NFs e fechamento do período.",
        "Valores em liquidação dependem de assinatura/confirmação do mercado quando aplicável.",
      ],
    },
    {
      titulo: "6. Estornos e cancelamentos",
      itens: [
        "Estornos de vendas seguem o fluxo da cooperativa; o mercado deve solicitar estorno com motivo e PIN financeiro quando cabível.",
        "Estornos aprovados revertem recebíveis e podem afetar valores já apurados para liquidação.",
        "É vedado ao mercado prometer ao cooperado condições diferentes das previstas neste termo e nas regras da cooperativa.",
      ],
    },
    {
      titulo: "7. Obrigações do mercado parceiro",
      itens: [
        "Manter dados cadastrais, chave PIX e PIN financeiro atualizados e sob sigilo.",
        "Cobrar apenas valores corretos e compatíveis com a venda efetivamente realizada.",
        "Cumprir prazos de envio e correção de notas fiscais.",
        "Não compartilhar credenciais de acesso ao painel com terceiros não autorizados.",
        "Comunicar à cooperativa irregularidades ou divergências no repasse.",
      ],
    },
    {
      titulo: "8. Suspensão",
      itens: [
        "A cooperativa pode bloquear temporariamente o mercado por descumprimento deste termo, pendências fiscais, fraude ou solicitação do próprio estabelecimento.",
        "Bloqueio não elimina obrigações já constituídas (NFs pendentes, estornos em análise, etc.).",
      ],
    },
    {
      titulo: "9. Aceite eletrônico",
      itens: [
        `Ao aceitar, o mercado declara ter lido e concordado integralmente com este Termo de Uso HB Créditos (versão ${TERMO_MERCADO_CONTA_COOP_VERSAO}).`,
        "O aceite é registrado uma única vez por cadastro de mercado, com data, hora, identificação do usuário e snapshot do desconto vigente.",
        "Nova versão deste termo poderá exigir novo aceite, conforme comunicação da cooperativa ou do operador do aplicativo.",
      ],
    },
  ];
}

export function textoResumoAcordoDescontoMercado(descontoPercent: number): string {
  const desconto = descontoPercent.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `Desconto acordado: ${desconto}%. O cooperado paga o valor integral da compra; você recebe o líquido na liquidação. A diferença do desconto é repassada à cooperativa conforme o programa HB Créditos.`;
}
