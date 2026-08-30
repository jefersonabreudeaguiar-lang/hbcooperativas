import type { AppData } from "@/types";
import { CLAUSULAS_ATA_DELIBERATIVA, VOTACAO_DELIBERATIVA_PLATAFORMA } from "@/config/votacaoDeliberativa";
import {
  formatHorarioReuniao,
  formatReuniaoWhatsapp,
  getResumoPauta,
  labelVoto,
} from "@/services/votacaoService";
import { formatCnpj, getCooperativaById } from "@/utils/cooperativa";
import { formatDate, formatDateTime } from "@/utils/format";
import { baixarHtmlComoPdf } from "@/utils/downloadPdf";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ATA_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; max-width: 820px; margin: 0 auto; color: #111; padding: 32px 24px; line-height: 1.5; }
  h1 { font-family: system-ui, sans-serif; font-size: 1.35rem; text-align: center; color: #14532d; margin: 0 0 8px; letter-spacing: 0.02em; }
  .subtitulo { text-align: center; font-size: 14px; color: #374151; margin-bottom: 24px; }
  .meta { font-family: system-ui, sans-serif; font-size: 13px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
  .meta p { margin: 4px 0; }
  h2 { font-family: system-ui, sans-serif; font-size: 0.95rem; color: #14532d; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .pauta { font-size: 1.05rem; font-weight: 600; margin: 8px 0 16px; }
  .obs { font-family: system-ui, sans-serif; font-size: 13px; background: #fafafa; border-left: 4px solid #6366f1; padding: 12px 14px; margin: 12px 0; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 12px; margin: 12px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: middle; }
  th { background: #14532d; color: #fff; }
  tr:nth-child(even) td { background: #f9fafb; }
  .assinatura-img { max-width: 120px; max-height: 48px; display: block; }
  .resumo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
  .resumo-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; background: #fafafa; }
  .resumo-card .label { font-family: system-ui, sans-serif; font-size: 10px; text-transform: uppercase; color: #6b7280; }
  .resumo-card .value { font-family: system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; color: #14532d; margin-top: 4px; }
  .juridico { font-family: system-ui, sans-serif; font-size: 12px; color: #374151; margin: 16px 0; }
  .juridico ol { padding-left: 20px; }
  .juridico li { margin-bottom: 8px; }
  .assinaturas-finais { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-family: system-ui, sans-serif; font-size: 13px; }
  .linha-ass { border-top: 1px solid #111; padding-top: 6px; margin-top: 48px; }
  .footer { margin-top: 32px; font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
`;

export function gerarAtaDeliberacaoVotacaoHtml(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): string {
  const resumo = getResumoPauta(data, pautaId, cooperativaId);
  const { pauta } = resumo;
  const coop = getCooperativaById(data, cooperativaId);
  const geradoEm = formatDateTime(new Date().toISOString());
  const reuniao = formatReuniaoWhatsapp(pauta);
  const horario = formatHorarioReuniao(pauta);

  const linhasVotos = resumo.votos
    .map((v) => {
      const assinatura = v.assinaturaDataUrl
        ? `<img src="${v.assinaturaDataUrl}" alt="Assinatura" class="assinatura-img" />`
        : "—";
      return `<tr>
        <td>${escapeHtml(v.cooperadoNome)}</td>
        <td><strong>${escapeHtml(labelVoto(v.voto))}</strong></td>
        <td>${escapeHtml(formatDateTime(v.createdAt))}</td>
        <td>${assinatura}</td>
      </tr>`;
    })
    .join("");

  const clausulas = CLAUSULAS_ATA_DELIBERATIVA.map((c) => `<li>${escapeHtml(c)}</li>`).join("");

  const observacaoHtml = pauta.observacao?.trim()
    ? `<h2>Observações da diretoria</h2><div class="obs">${escapeHtml(pauta.observacao.trim())}</div>`
    : "";

  const reuniaoHtml =
    reuniao || horario
      ? `<h2>Reunião online</h2>
         <div class="meta">
           ${reuniao ? `<p><strong>WhatsApp / link:</strong> ${escapeHtml(reuniao)}</p>` : ""}
           ${horario ? `<p><strong>Horário previsto:</strong> ${escapeHtml(horario)}</p>` : ""}
           <p><strong>Deliberação:</strong> votação registrada pelo aplicativo ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}.</p>
         </div>`
      : `<p class="juridico">Deliberação realizada exclusivamente pelo aplicativo ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}, no período indicado abaixo.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Ata de Deliberação — ${escapeHtml(pauta.texto.slice(0, 60))}</title>
  <style>${ATA_STYLES}</style>
</head>
<body>
  <h1>ATA DE DELIBERAÇÃO — VOTAÇÃO ELETRÔNICA</h1>
  <p class="subtitulo">Registro consolidado para arquivo da cooperativa</p>

  <div class="meta">
    <p><strong>Cooperativa:</strong> ${escapeHtml(coop?.nome ?? "—")}</p>
    ${coop?.cnpj ? `<p><strong>CNPJ:</strong> ${escapeHtml(formatCnpj(coop.cnpj))}</p>` : ""}
    <p><strong>Período de votação:</strong> ${escapeHtml(formatDate(pauta.inicioEm))} a ${escapeHtml(formatDate(pauta.fimEm))}</p>
    <p><strong>Identificador da pauta:</strong> ${escapeHtml(pauta.id)}</p>
    ${pauta.criadoPorNome ? `<p><strong>Responsável pela pauta:</strong> ${escapeHtml(pauta.criadoPorNome)}</p>` : ""}
  </div>

  <h2>Objeto da deliberação</h2>
  <p class="pauta">${escapeHtml(pauta.texto)}</p>

  ${observacaoHtml}
  ${reuniaoHtml}

  <h2>Resultado apurado</h2>
  <div class="resumo-grid">
    <div class="resumo-card"><div class="label">SIM</div><div class="value">${resumo.pctSim.toLocaleString("pt-BR")}% (${resumo.votosSim})</div></div>
    <div class="resumo-card"><div class="label">NÃO</div><div class="value">${resumo.pctNao.toLocaleString("pt-BR")}% (${resumo.votosNao})</div></div>
    <div class="resumo-card"><div class="label">Abstenção</div><div class="value">${resumo.pctAbstencao.toLocaleString("pt-BR")}% (${resumo.votosAbstencao})</div></div>
  </div>
  <p class="juridico">Participação: ${resumo.totalVotos} voto(s) registrado(s) com assinatura de ${resumo.totalElegiveis} cooperado(s) elegível(is).</p>

  <h2>Relação nominal de votos e assinaturas</h2>
  <table>
    <thead>
      <tr><th>Cooperado</th><th>Voto</th><th>Data e hora</th><th>Assinatura</th></tr>
    </thead>
    <tbody>${linhasVotos || `<tr><td colspan="4">Nenhum voto registrado.</td></tr>`}</tbody>
  </table>

  <h2>Disposições sobre registro eletrônico</h2>
  <div class="juridico"><ol>${clausulas}</ol></div>

  <div class="assinaturas-finais">
    <div>
      <div class="linha-ass">Presidente / Responsável</div>
      <p>Nome: _________________________________</p>
    </div>
    <div>
      <div class="linha-ass">Secretário(a)</div>
      <p>Nome: _________________________________</p>
    </div>
  </div>

  <div class="footer">
    Documento gerado em ${escapeHtml(geradoEm)} · ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)} · Pauta ${escapeHtml(pauta.id)}
  </div>
</body>
</html>`;
}

export async function baixarAtaDeliberacaoVotacaoPdf(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): Promise<void> {
  const resumo = getResumoPauta(data, pautaId, cooperativaId);
  const slug = resumo.pauta.texto
    .slice(0, 40)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const html = gerarAtaDeliberacaoVotacaoHtml(data, pautaId, cooperativaId);
  await baixarHtmlComoPdf(html, `ata-deliberacao-${slug || pautaId}.pdf`);
}
