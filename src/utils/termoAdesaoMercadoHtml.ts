import { formatCnpj } from "@/utils/cooperativa";

export function termoAdesaoMercadoHtml(cooperativa: { nome: string; cnpj: string }): string {
  const nome = cooperativa.nome.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const cnpj = formatCnpj(cooperativa.cnpj);
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Termo de adesão do mercado parceiro</title>
<style>
body{font:11pt/1.4 system-ui,sans-serif;color:#172c26;max-width:185mm;margin:10mm auto;padding:0 5mm}
h1{font-size:18pt;margin:0;color:#005843} h2{font-size:12pt;margin:12pt 0 3pt;color:#005843}
p{margin:4pt 0} section{break-inside:avoid} .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:16pt}
@page{size:A4;margin:12mm} @media print{body{margin:0;padding:0}}
</style></head>
<body>
<header><h1>Termo de adesão do mercado parceiro</h1><p>HB Créditos · ${nome} · CNPJ ${cnpj}</p></header>
<p>A ${nome}, inscrita no CNPJ ${cnpj}, com sede em __________________________________________, doravante denominada COOPERATIVA, e o estabelecimento __________________________________________, CNPJ ________________________, neste ato representado por __________________________________________, doravante denominado MERCADO PARCEIRO, celebram este Termo de Adesão.</p>
<section><h2>1. Objeto</h2><p>Formalizar a adesão do MERCADO PARCEIRO ao HB Créditos, plataforma da HB Coop que permite aos cooperados da COOPERATIVA utilizar créditos nos estabelecimentos parceiros.</p></section>
<section><h2>2. Responsabilidades do mercado parceiro</h2><p>2.1. O MERCADO PARCEIRO compromete-se a aceitar os créditos dos cooperados conforme as regras, limites e condições deste termo e da plataforma HB Coop.</p><p>2.2. O fornecimento dos produtos ou serviços mediante crédito depende de validação no sistema.</p><p>2.3. O MERCADO PARCEIRO compromete-se a manter a qualidade dos produtos e serviços e a atender às normas de defesa do consumidor e demais legislações aplicáveis.</p></section>
<section><h2>3. Desconto comercial</h2><p>O MERCADO PARCEIRO concederá à COOPERATIVA desconto de _______% sobre o valor bruto de cada compra realizada por meio do HB Créditos, conforme acordado entre as partes.</p></section>
<section><h2>4. Liquidação e pagamento</h2><p>A COOPERATIVA liquidará os valores devidos ao MERCADO PARCEIRO pelas compras dos cooperados, conforme os prazos e condições do HB Créditos e o cronograma da cooperativa, que pode ser ajustado por acordo entre as partes.</p></section>
<section><h2>5. Vigência</h2><p>O termo tem vigência por prazo indeterminado e pode ser rescindido por qualquer das partes mediante comunicação prévia de 30 dias. Alterações serão formalizadas por termo aditivo.</p></section>
<section><h2>6. Disposições gerais</h2><p>As partes concordam com este termo e com as regras de funcionamento do HB Créditos. Fica eleito o foro da Comarca de ______________________________ para dirimir controvérsias decorrentes deste termo.</p></section>
<section><h2>Proteção de dados</h2><p>As partes tratarão os dados pessoais conforme a Lei nº 13.709/2018 (LGPD), com segurança, confidencialidade e uso restrito às finalidades deste termo e da plataforma HB Créditos.</p></section>
<section><p>Local __________________________, ____ de __________________ de ________.</p>
<div class="assinaturas">
<div><h2>${nome}</h2><p>Nome __________________________</p><p>Cargo __________________________</p><p>CPF ____________________________</p><p>Assinatura ______________________</p></div>
<div><h2>Mercado parceiro</h2><p>Nome __________________________</p><p>Cargo __________________________</p><p>CPF ____________________________</p><p>Assinatura ______________________</p></div>
</div>
<h2>Testemunhas</h2>
<div class="assinaturas"><div><p>1. Nome ________________________</p><p>CPF ____________________________</p></div><div><p>2. Nome ________________________</p><p>CPF ____________________________</p></div></div>
</section>
</body></html>`;
}
