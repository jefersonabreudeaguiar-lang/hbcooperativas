import type { AppData, Cooperado } from "@/types";
import { CLAUSULAS_ATA_DELIBERATIVA, VOTACAO_DELIBERATIVA_PLATAFORMA } from "@/config/votacaoDeliberativa";
import type { ResumoVotacaoPauta, VotoCooperadoLinha } from "@/services/votacaoService";
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

function formatCpfCnpj(valor?: string): string {
  const digits = (valor ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return valor ?? "—";
}

function formatTelefone(valor?: string): string {
  const digits = (valor ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return valor?.trim() || "—";
}

function protocoloDocumento(pautaId: string, geradoEm: string): string {
  const stamp = geradoEm.replace(/\D/g, "").slice(0, 14);
  return `ATA-${pautaId.replace(/^vtp_/, "").slice(0, 12).toUpperCase()}-${stamp}`;
}

function classeVoto(voto: VotoCooperadoLinha["voto"]): string {
  if (voto === "sim") return "badge-sim";
  if (voto === "nao") return "badge-nao";
  return "badge-abst";
}

function findCooperado(data: AppData, cooperadoId: string, cooperativaId: string): Cooperado | undefined {
  return data.cooperados.find((c) => c.id === cooperadoId && c.cooperativaId === cooperativaId);
}

function labelStatusCooperado(status?: Cooperado["status"]): string {
  switch (status) {
    case "ativo":
      return "Ativo";
    case "suspenso":
      return "Suspenso";
    case "desligado":
      return "Desligado";
    default:
      return "—";
  }
}

const ATA_STYLES = `
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    max-width: 210mm;
    margin: 0 auto;
    color: #0f172a;
    padding: 0;
    line-height: 1.55;
    font-size: 11pt;
    background: #fff;
  }
  .doc-shell { padding: 8mm 10mm 12mm; }
  .doc-header {
    border: 2px solid #14532d;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 22px;
  }
  .doc-header-top {
    background: linear-gradient(135deg, #14532d 0%, #166534 55%, #15803d 100%);
    color: #fff;
    padding: 18px 22px 14px;
    text-align: center;
  }
  .doc-header-top .coop-nome {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    margin: 0;
    text-transform: uppercase;
  }
  .doc-header-top .coop-sub {
    font-family: system-ui, sans-serif;
    font-size: 0.72rem;
    opacity: 0.92;
    margin-top: 6px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .doc-header-body {
    font-family: system-ui, sans-serif;
    font-size: 0.78rem;
    padding: 12px 18px;
    background: #f8fafc;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 18px;
    color: #334155;
  }
  .doc-header-body span strong { color: #14532d; }
  .doc-title-block {
    text-align: center;
    margin: 24px 0 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #cbd5e1;
  }
  .doc-title-block h1 {
    font-family: system-ui, sans-serif;
    font-size: 1.15rem;
    color: #14532d;
    margin: 0 0 6px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .doc-title-block .protocolo {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #64748b;
    letter-spacing: 0.04em;
  }
  .doc-title-block .gerado {
    font-family: system-ui, sans-serif;
    font-size: 0.75rem;
    color: #475569;
    margin-top: 8px;
  }
  h2 {
    font-family: system-ui, sans-serif;
    font-size: 0.82rem;
    color: #14532d;
    margin: 26px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #dcfce7;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    page-break-after: avoid;
  }
  h3 {
    font-family: system-ui, sans-serif;
    font-size: 0.78rem;
    color: #334155;
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .lead {
    font-family: system-ui, sans-serif;
    font-size: 0.88rem;
    color: #334155;
    text-align: justify;
    margin: 0 0 18px;
    line-height: 1.65;
  }
  .box {
    font-family: system-ui, sans-serif;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 14px 16px;
    margin: 12px 0 18px;
    background: #fafafa;
  }
  .box-green { background: #f0fdf4; border-color: #bbf7d0; }
  .box-indigo { background: #eef2ff; border-color: #c7d2fe; }
  .box-amber { background: #fffbeb; border-color: #fde68a; }
  .box p { margin: 5px 0; font-size: 0.82rem; color: #334155; }
  .box .destaque { font-size: 0.95rem; font-weight: 700; color: #14532d; line-height: 1.45; }
  .obs { white-space: pre-wrap; }
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 16px 0 20px;
  }
  .metric {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 10px;
    text-align: center;
    background: #fff;
  }
  .metric .label {
    font-family: system-ui, sans-serif;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    font-weight: 700;
  }
  .metric .value {
    font-family: system-ui, sans-serif;
    font-size: 1.35rem;
    font-weight: 800;
    margin-top: 4px;
    color: #14532d;
  }
  .metric .sub {
    font-family: system-ui, sans-serif;
    font-size: 0.68rem;
    color: #64748b;
    margin-top: 2px;
  }
  .metric-sim { border-top: 4px solid #16a34a; }
  .metric-nao { border-top: 4px solid #dc2626; }
  .metric-abst { border-top: 4px solid #64748b; }
  .metric-part { border-top: 4px solid #2563eb; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: system-ui, sans-serif;
    font-size: 0.74rem;
    margin: 10px 0 18px;
  }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #14532d; color: #fff; font-weight: 700; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .badge-sim { background: #dcfce7; color: #166534; }
  .badge-nao { background: #fee2e2; color: #991b1b; }
  .badge-abst { background: #f1f5f9; color: #475569; }
  .assinatura-card {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    margin: 0 0 16px;
    overflow: hidden;
    page-break-inside: avoid;
    background: #fff;
  }
  .assinatura-card-head {
    background: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .assinatura-card-head .num {
    font-family: ui-monospace, monospace;
    font-size: 0.68rem;
    color: #64748b;
    font-weight: 700;
  }
  .assinatura-card-body {
    padding: 14px 16px;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 16px;
  }
  .dados-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 14px;
    font-family: system-ui, sans-serif;
    font-size: 0.74rem;
  }
  .dados-grid .campo .rotulo {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    font-weight: 700;
  }
  .dados-grid .campo .valor { color: #0f172a; margin-top: 2px; font-weight: 600; }
  .dados-grid .campo.full { grid-column: 1 / -1; }
  .assinatura-box {
    border: 2px dashed #94a3b8;
    border-radius: 6px;
    background: #fafafa;
    min-height: 88px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }
  .assinatura-box img {
    max-width: 100%;
    max-height: 72px;
    object-fit: contain;
  }
  .assinatura-box .legenda {
    font-family: system-ui, sans-serif;
    font-size: 0.62rem;
    color: #64748b;
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .anexo-break { page-break-before: always; padding-top: 8mm; }
  .juridico {
    font-family: system-ui, sans-serif;
    font-size: 0.78rem;
    color: #334155;
    line-height: 1.6;
  }
  .juridico ol { padding-left: 18px; margin: 8px 0; }
  .juridico li { margin-bottom: 8px; }
  .dirigentes {
    margin-top: 36px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    page-break-inside: avoid;
  }
  .dirigente {
    font-family: system-ui, sans-serif;
    font-size: 0.78rem;
    text-align: center;
  }
  .dirigente .linha {
    border-top: 1px solid #0f172a;
    padding-top: 8px;
    margin-top: 56px;
    font-weight: 700;
    color: #0f172a;
  }
  .dirigente .hint { color: #64748b; font-size: 0.68rem; margin-top: 4px; }
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-family: system-ui, sans-serif;
    font-size: 0.65rem;
    color: #64748b;
    text-align: center;
    line-height: 1.5;
  }
  .pendentes-list { margin: 0; padding-left: 18px; font-size: 0.78rem; color: #475569; }
  @media print {
    body { margin: 0; }
    .doc-shell { padding: 0; }
    .assinatura-card { break-inside: avoid; }
  }
`;

function renderCooperativaHeader(coop: ReturnType<typeof getCooperativaById>, protocolo: string): string {
  const nome = coop?.nome ?? "Cooperativa";
  return `
    <div class="doc-header">
      <div class="doc-header-top">
        <p class="coop-nome">${escapeHtml(nome)}</p>
        <p class="coop-sub">Ata de deliberação · votação eletrônica</p>
      </div>
      <div class="doc-header-body">
        ${coop?.cnpj ? `<span><strong>CNPJ:</strong> ${escapeHtml(formatCnpj(coop.cnpj))}</span>` : "<span></span>"}
        <span><strong>Protocolo:</strong> ${escapeHtml(protocolo)}</span>
        ${coop?.endereco ? `<span class="full" style="grid-column:1/-1"><strong>Endereço:</strong> ${escapeHtml(coop.endereco)}</span>` : ""}
        ${coop?.telefone ? `<span><strong>Telefone:</strong> ${escapeHtml(coop.telefone)}</span>` : "<span></span>"}
        ${coop?.email ? `<span><strong>E-mail:</strong> ${escapeHtml(coop.email)}</span>` : ""}
        ${coop?.responsavel ? `<span><strong>Responsável:</strong> ${escapeHtml(coop.responsavel)}</span>` : ""}
      </div>
    </div>`;
}

function renderAssinaturaCard(
  data: AppData,
  cooperativaId: string,
  voto: VotoCooperadoLinha,
  indice: number
): string {
  const coop = findCooperado(data, voto.cooperadoId, cooperativaId);
  const assinatura = voto.assinaturaDataUrl
    ? `<img src="${voto.assinaturaDataUrl}" alt="Assinatura de ${escapeHtml(voto.cooperadoNome)}" />`
    : `<span style="color:#94a3b8;font-size:0.75rem">Sem imagem arquivada</span>`;

  return `
    <article class="assinatura-card">
      <div class="assinatura-card-head">
        <strong>${escapeHtml(voto.cooperadoNome)}</strong>
        <span class="num">REGISTRO ${String(indice).padStart(3, "0")} · ${escapeHtml(voto.id)}</span>
      </div>
      <div class="assinatura-card-body">
        <div class="dados-grid">
          <div class="campo full">
            <div class="rotulo">Nome completo</div>
            <div class="valor">${escapeHtml(voto.cooperadoNome)}</div>
          </div>
          <div class="campo">
            <div class="rotulo">CPF / CNPJ</div>
            <div class="valor">${escapeHtml(formatCpfCnpj(coop?.cpfCnpj))}</div>
          </div>
          <div class="campo">
            <div class="rotulo">Telefone</div>
            <div class="valor">${escapeHtml(formatTelefone(coop?.telefone))}</div>
          </div>
          <div class="campo">
            <div class="rotulo">Comunidade / localidade</div>
            <div class="valor">${escapeHtml(coop?.comunidade?.trim() || "—")}</div>
          </div>
          <div class="campo">
            <div class="rotulo">Voto registrado</div>
            <div class="valor"><span class="badge ${classeVoto(voto.voto)}">${escapeHtml(labelVoto(voto.voto))}</span></div>
          </div>
          <div class="campo">
            <div class="rotulo">Data e hora do registro</div>
            <div class="valor">${escapeHtml(formatDateTime(voto.createdAt))}</div>
          </div>
          <div class="campo">
            <div class="rotulo">Identificador interno</div>
            <div class="valor" style="font-family:ui-monospace,monospace;font-size:0.68rem">${escapeHtml(voto.cooperadoId)}</div>
          </div>
          <div class="campo">
            <div class="rotulo">Situação cadastral</div>
            <div class="valor">${escapeHtml(labelStatusCooperado(coop?.status))}</div>
          </div>
        </div>
        <div class="assinatura-box">
          ${assinatura}
          <div class="legenda">Assinatura manuscrita digital do cooperado</div>
        </div>
      </div>
    </article>`;
}

function renderResultadoTexto(resumo: ResumoVotacaoPauta): string {
  const { votosSim, votosNao, votosAbstencao, totalVotos, pctSim, pctNao } = resumo;
  if (totalVotos === 0) {
    return "Não houve votos registrados com assinatura no período da consulta.";
  }
  const maioria = votosSim > votosNao ? "favorável (SIM)" : votosNao > votosSim ? "contrária (NÃO)" : "empatada";
  return `Apurados ${totalVotos} voto(s) com assinatura: ${votosSim} SIM (${pctSim.toLocaleString("pt-BR")}%), ${votosNao} NÃO (${pctNao.toLocaleString("pt-BR")}%) e ${votosAbstencao} abstenção(ões). A tendência majoritária registrada foi ${maioria}, conforme quadro resumo e registros individuais abaixo.`;
}

export function gerarAtaDeliberacaoVotacaoHtml(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): string {
  const resumo = getResumoPauta(data, pautaId, cooperativaId);
  const { pauta } = resumo;
  const coop = getCooperativaById(data, cooperativaId);
  const geradoEmIso = new Date().toISOString();
  const geradoEm = formatDateTime(geradoEmIso);
  const protocolo = protocoloDocumento(pauta.id, geradoEm);
  const reuniao = formatReuniaoWhatsapp(pauta);
  const horario = formatHorarioReuniao(pauta);
  const pctParticipacao =
    resumo.totalElegiveis > 0
      ? Math.round((resumo.totalVotos / resumo.totalElegiveis) * 1000) / 10
      : 0;

  const linhasResumo = resumo.votos
    .map(
      (v, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(v.cooperadoNome)}</td>
        <td>${escapeHtml(formatCpfCnpj(findCooperado(data, v.cooperadoId, cooperativaId)?.cpfCnpj))}</td>
        <td><span class="badge ${classeVoto(v.voto)}">${escapeHtml(labelVoto(v.voto))}</span></td>
        <td>${escapeHtml(formatDateTime(v.createdAt))}</td>
        <td>${v.assinaturaDataUrl ? "Sim" : "Não"}</td>
      </tr>`
    )
    .join("");

  const cartoesAssinatura = resumo.votos
    .map((v, i) => renderAssinaturaCard(data, cooperativaId, v, i + 1))
    .join("");

  const pendentesHtml =
    resumo.pendentes.length > 0
      ? `<h2>Cooperados elegíveis sem voto registrado</h2>
         <div class="box box-amber">
           <p><strong>${resumo.pendentes.length}</strong> cooperado(s) não registraram voto com assinatura nesta pauta:</p>
           <ul class="pendentes-list">${resumo.pendentes.map((p) => `<li>${escapeHtml(p.nome)}</li>`).join("")}</ul>
         </div>`
      : "";

  const clausulas = CLAUSULAS_ATA_DELIBERATIVA.map((c) => `<li>${escapeHtml(c)}</li>`).join("");

  const observacaoHtml = pauta.observacao?.trim()
    ? `<div class="box box-indigo">
         <p><strong>Observações da diretoria</strong></p>
         <p class="obs">${escapeHtml(pauta.observacao.trim())}</p>
       </div>`
    : "";

  const reuniaoHtml =
    reuniao || horario
      ? `<div class="box box-indigo">
           ${reuniao ? `<p><strong>Reunião online (WhatsApp):</strong> ${escapeHtml(reuniao)}</p>` : ""}
           ${horario ? `<p><strong>Horário previsto:</strong> ${escapeHtml(horario)}</p>` : ""}
           <p><strong>Forma de deliberação:</strong> votação eletrônica registrada no aplicativo ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}, com autenticação individual e assinatura manuscrita digital.</p>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(protocolo)} — Ata de Deliberação</title>
  <style>${ATA_STYLES}</style>
</head>
<body>
  <div class="doc-shell">
    ${renderCooperativaHeader(coop, protocolo)}

    <div class="doc-title-block">
      <h1>Ata de registro de deliberação cooperativa</h1>
      <p class="protocolo">${escapeHtml(protocolo)}</p>
      <p class="gerado">Documento emitido em ${escapeHtml(geradoEm)} · Plataforma ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}</p>
    </div>

    <p class="lead">
      Aos ${escapeHtml(formatDate(pauta.fimEm))}, encerrado o prazo de votação eletrônica aberto em
      ${escapeHtml(formatDate(pauta.inicioEm))}, a <strong>${escapeHtml(coop?.nome ?? "cooperativa")}</strong>
      consolida nesta ata o registro formal da consulta/deliberação abaixo identificada, com apuração nominal,
      data e hora de cada voto e respectivas assinaturas manuscritas digitais dos cooperados participantes.
    </p>

    <h2>I — Objeto da deliberação</h2>
    <div class="box box-green">
      <p class="destaque">${escapeHtml(pauta.texto)}</p>
      <p><strong>Período de votação:</strong> ${escapeHtml(formatDate(pauta.inicioEm))} a ${escapeHtml(formatDate(pauta.fimEm))}</p>
      <p><strong>Identificador da pauta:</strong> ${escapeHtml(pauta.id)}</p>
      ${pauta.criadoPorNome ? `<p><strong>Elaborada por:</strong> ${escapeHtml(pauta.criadoPorNome)}</p>` : ""}
      ${pauta.abertaEm ? `<p><strong>Enquete aberta em:</strong> ${escapeHtml(formatDateTime(pauta.abertaEm))}</p>` : ""}
      ${pauta.resultadoPublicadoEm ? `<p><strong>Resultado publicado em:</strong> ${escapeHtml(formatDateTime(pauta.resultadoPublicadoEm))}</p>` : ""}
    </div>

    ${observacaoHtml}
    ${reuniaoHtml}

    <h2>II — Apuração do resultado</h2>
    <div class="metrics">
      <div class="metric metric-sim">
        <div class="label">Sim</div>
        <div class="value">${resumo.votosSim}</div>
        <div class="sub">${resumo.pctSim.toLocaleString("pt-BR")}% dos votos</div>
      </div>
      <div class="metric metric-nao">
        <div class="label">Não</div>
        <div class="value">${resumo.votosNao}</div>
        <div class="sub">${resumo.pctNao.toLocaleString("pt-BR")}% dos votos</div>
      </div>
      <div class="metric metric-abst">
        <div class="label">Abstenção</div>
        <div class="value">${resumo.votosAbstencao}</div>
        <div class="sub">${resumo.pctAbstencao.toLocaleString("pt-BR")}% dos votos</div>
      </div>
      <div class="metric metric-part">
        <div class="label">Participação</div>
        <div class="value">${resumo.totalVotos}/${resumo.totalElegiveis}</div>
        <div class="sub">${pctParticipacao.toLocaleString("pt-BR")}% dos elegíveis</div>
      </div>
    </div>

    <p class="lead">${escapeHtml(renderResultadoTexto(resumo))}</p>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cooperado</th>
          <th>CPF/CNPJ</th>
          <th>Voto</th>
          <th>Registrado em</th>
          <th>Assinatura</th>
        </tr>
      </thead>
      <tbody>${linhasResumo || `<tr><td colspan="6">Nenhum voto registrado.</td></tr>`}</tbody>
    </table>

    ${pendentesHtml}

    <div class="anexo-break">
      <h2>III — Anexo: registro individual de votos e assinaturas</h2>
      <p class="lead">
        Segue relação detalhada de cada cooperado que participou da votação, com dados cadastrais,
        opção registrada, carimbo de data/hora e reprodução fiel da assinatura manuscrita digital
        capturada no aplicativo no momento do voto.
      </p>
      ${cartoesAssinatura || `<div class="box"><p>Nenhum registro individual disponível.</p></div>`}
    </div>

    <h2>IV — Disposições sobre o registro eletrônico</h2>
    <div class="juridico"><ol>${clausulas}</ol></div>

    <h2>V — Encerramento</h2>
    <p class="lead">
      E, para constar, foi gerada a presente ata em meio eletrônico, com validade de registro interno
      da cooperativa, devendo ser arquivada junto à documentação da entidade e, quando aplicável,
      ratificada conforme estatuto social e orientação jurídica.
    </p>

    <div class="dirigentes">
      <div class="dirigente">
        <div class="linha">Presidente / Responsável legal</div>
        <div class="hint">Nome completo e rubrica</div>
      </div>
      <div class="dirigente">
        <div class="linha">Secretário(a) / Responsável pelo registro</div>
        <div class="hint">Nome completo e rubrica</div>
      </div>
    </div>

    <div class="footer">
      ${escapeHtml(protocolo)} · Pauta ${escapeHtml(pauta.id)} · ${resumo.totalVotos} registro(s) com assinatura<br/>
      Emitido em ${escapeHtml(geradoEm)} · ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)} · Documento gerado automaticamente pelo sistema da cooperativa
    </div>
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
  const protocolo = protocoloDocumento(resumo.pauta.id, formatDateTime(new Date().toISOString()));
  const slug = resumo.pauta.texto
    .slice(0, 32)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  const html = gerarAtaDeliberacaoVotacaoHtml(data, pautaId, cooperativaId);
  await baixarHtmlComoPdf(html, `${protocolo}-${slug || "deliberacao"}.pdf`);
}
