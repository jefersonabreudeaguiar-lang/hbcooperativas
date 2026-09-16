/** Resumo exibido em telas públicas (login/cadastro). */
export const AVISO_ACESSO_AUTOMATIZADO_RESUMO =
  "Conteúdo e dados deste aplicativo são de uso exclusivo de cooperados e equipe autorizada. " +
  "É vedada a cópia, mineração ou indexação automatizada (incluindo ferramentas de IA) sem autorização expressa do proprietário.";

/** Cláusulas incorporadas ao contrato de serviço (responsável). */
export function getClausulasPropriedadeEAcessoAutomatizado(): { titulo: string; itens: string[] } {
  return {
    titulo: "Propriedade intelectual e acesso automatizado",
    itens: [
      "O software, interfaces, textos, relatórios gerados e bases operacionais disponibilizadas no aplicativo são protegidos por direito autoral e demais normas aplicáveis.",
      "É proibida a extração automatizada em massa (scraping, crawlers, bots de inteligência artificial ou equivalentes) de telas autenticadas, APIs ou dados operacionais sem autorização prévia e por escrito do proprietário do app.",
      "Cooperados, mercados parceiros e equipe da cooperativa devem acessar o sistema apenas por meio do aplicativo oficial, com credenciais pessoais, respeitando a confidencialidade dos dados de terceiros.",
      "Violações poderão ensejar bloqueio técnico de acesso, rescisão do contrato de serviço e medidas cabíveis na forma da lei.",
    ],
  };
}
