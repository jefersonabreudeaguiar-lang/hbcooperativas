import type { AppData, Cooperado } from "@/types";
import {
  CLAUSULAS_ATA_DELIBERATIVA,
  FUNDAMENTO_LEGAL_ATA,
  VOTACAO_DELIBERATIVA_PLATAFORMA,
} from "@/config/votacaoDeliberativa";
import type { ResumoVotacaoPauta, VotoCooperadoLinha } from "@/services/votacaoService";
import {
  formatHorarioReuniao,
  formatReuniaoWhatsapp,
  getEscopoEleitoralPauta,
  getResumoPauta,
  labelEscopoEleitoral,
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

function formatDataPorExtenso(isoDate: string): string {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function protocoloDocumento(pautaId: string, geradoEm: string): string {
  const stamp = geradoEm.replace(/\D/g, "").slice(0, 14);
  return `ATA-${pautaId.replace(/^vtp_/, "").slice(0, 12).toUpperCase()}-${stamp}`;
}

function classeVoto(voto: VotoCooperadoLinha["voto"]): string {
  if (voto === "sim") return "voto-sim";
  if (voto === "nao") return "voto-nao";
  return "voto-abst";
}

function findCooperado(data: AppData, cooperadoId: string, cooperativaId: string): Cooperado | undefined {
  return data.cooperados.find((c) => c.id === cooperadoId && c.cooperativaId === cooperativaId);
}

function renderAssinaturaMini(dataUrl?: string | null): string {
  if (!dataUrl) return `<span class="sem-assinatura">—</span>`;
  return `<img src="${dataUrl}" alt="Assinatura" class="sig-mini" />`;
}

const ATA_STYLES = `
  @page { margin: 18mm 15mm 20mm; size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, Georgia, serif;
    max-width: 180mm;
    margin: 0 auto;
    color: #111;
    padding: 0;
    line-height: 1.45;
    font-size: 11pt;
    background: #fff;
  }
  .doc-shell { padding: 0; }
  .letterhead {
    text-align: center;
    border-bottom: 2px solid #111;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  .letterhead .coop-nome {
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 4px;
  }
  .letterhead .coop-meta {
    font-size: 9pt;
    color: #333;
    line-height: 1.5;
  }
  .doc-title {
    text-align: center;
    margin: 16px 0 20px;
  }
  .doc-title h1 {
    font-size: 12pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 6px;
  }
  .doc-title .sub {
    font-size: 9pt;
    color: #444;
    margin: 2px 0;
  }
  .paragrafo {
    text-align: justify;
    text-indent: 12mm;
    margin: 0 0 10px;
    font-size: 11pt;
  }
  .paragrafo.sem-indent { text-indent: 0; }
  .secao {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 20px 0 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid #999;
    page-break-after: avoid;
  }
  .quadro {
    border: 1px solid #bbb;
    padding: 10px 12px;
    margin: 10px 0 14px;
    background: #fafafa;
    font-size: 10pt;
  }
  .quadro .objeto {
    font-weight: 700;
    margin-bottom: 8px;
    line-height: 1.4;
  }
  .quadro p { margin: 4px 0; font-size: 10pt; }
  .quadro .rotulo { font-weight: 700; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin: 10px 0 14px;
  }
  th, td {
    border: 1px solid #999;
    padding: 5px 6px;
    text-align: left;
    vertical-align: middle;
  }
  th {
    background: #eee;
    font-weight: 700;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .col-num { width: 6%; text-align: center; }
  .col-voto { width: 10%; text-align: center; }
  .col-data { width: 16%; white-space: nowrap; }
  .col-cpf { width: 14%; white-space: nowrap; }
  .col-sig { width: 11%; text-align: center; padding: 4px 5px; vertical-align: middle; }
  .voto-sim { font-weight: 700; color: #14532d; }
  .voto-nao { font-weight: 700; color: #991b1b; }
  .voto-abst { font-weight: 700; color: #475569; }
  .sig-mini {
    max-height: 17px;
    max-width: 58px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
  .sem-assinatura { color: #999; font-size: 8pt; }
  .apuracao-resumo {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
  }
  .apuracao-resumo th, .apuracao-resumo td {
    border: 1px solid #999;
    padding: 8px 10px;
    text-align: center;
  }
  .apuracao-resumo th { background: #f5f5f5; font-weight: 700; }
  .juridico { font-size: 10pt; line-height: 1.5; }
  .juridico ol { padding-left: 16px; margin: 6px 0; }
  .juridico li { margin-bottom: 6px; text-align: justify; }
  .fundamento { font-size: 9.5pt; color: #222; }
  .fundamento li { margin-bottom: 5px; }
  .anexo-break { page-break-before: always; padding-top: 0; }
  .pendentes { font-size: 9.5pt; margin: 8px 0 0 16px; }
  .dirigentes {
    margin-top: 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    page-break-inside: avoid;
  }
  .dirigente { text-align: center; font-size: 10pt; }
  .dirigente .linha {
    border-top: 1px solid #111;
    padding-top: 6px;
    margin-top: 36px;
    font-weight: 700;
  }
  .dirigente .hint { font-size: 8.5pt; color: #555; margin-top: 3px; }
  .local-data {
    text-align: right;
    margin: 24px 0 16px;
    font-size: 10pt;
  }
  .footer {
    margin-top: 24px;
    padding-top: 8px;
    border-top: 1px solid #ccc;
    font-size: 8pt;
    color: #666;
    text-align: center;
    line-height: 1.45;
  }
  @media print {
    body { margin: 0; }
    tr { page-break-inside: avoid; }
  }
`;

function renderCooperativaHeader(coop: ReturnType<typeof getCooperativaById>, protocolo: string): string {
  const nome = coop?.nome ?? "Cooperativa";
  const linhas: string[] = [];
  if (coop?.cnpj) linhas.push(`CNPJ ${escapeHtml(formatCnpj(coop.cnpj))}`);
  if (coop?.endereco) linhas.push(escapeHtml(coop.endereco));
  const contato = [coop?.telefone, coop?.email].filter(Boolean).join(" · ");
  if (contato) linhas.push(escapeHtml(contato));

  return `
    <header class="letterhead">
      <p class="coop-nome">${escapeHtml(nome)}</p>
      <p class="coop-meta">${linhas.join("<br/>")}</p>
      <p class="coop-meta" style="margin-top:6px"><strong>Protocolo:</strong> ${escapeHtml(protocolo)}</p>
    </header>`;
}

function renderResultadoTexto(resumo: ResumoVotacaoPauta): string {
  const { votosSim, votosNao, votosAbstencao, totalVotos, pctSim, pctNao } = resumo;
  if (totalVotos === 0) {
    return "Não houve votos registrados com assinatura no período da consulta.";
  }
  const maioria =
    votosSim > votosNao ? "FAVORÁVEL (SIM)" : votosNao > votosSim ? "CONTRÁRIA (NÃO)" : "EMPATADA";
  return `Apurados ${totalVotos} voto(s) válido(s): ${votosSim} SIM (${pctSim.toLocaleString("pt-BR")}%), ${votosNao} NÃO (${pctNao.toLocaleString("pt-BR")}%) e ${votosAbstencao} abstenção(ões). Declara-se, para os devidos fins, tendência majoritária ${maioria}, nos termos do quadro de apuração e do rol nominal anexo.`;
}

function renderLinhaVoto(
  data: AppData,
  cooperativaId: string,
  voto: VotoCooperadoLinha,
  indice: number,
  incluirAssinatura: boolean
): string {
  const coop = findCooperado(data, voto.cooperadoId, cooperativaId);
  const assinaturaCol = incluirAssinatura
    ? `<td class="col-sig">${renderAssinaturaMini(voto.assinaturaDataUrl)}</td>`
    : "";

  return `<tr>
    <td class="col-num">${indice}</td>
    <td>${escapeHtml(voto.cooperadoNome)}</td>
    <td class="col-cpf">${escapeHtml(formatCpfCnpj(coop?.cpfCnpj))}</td>
    <td class="col-voto"><span class="${classeVoto(voto.voto)}">${escapeHtml(labelVoto(voto.voto))}</span></td>
    <td class="col-data">${escapeHtml(formatDateTime(voto.createdAt))}</td>
    ${assinaturaCol}
  </tr>`;
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
  const nomeCoop = coop?.nome ?? "Cooperativa";
  const dataEncerramento = formatDataPorExtenso(pauta.fimEm);
  const dataAbertura = formatDataPorExtenso(pauta.inicioEm);

  const linhasResumo = resumo.votos
    .map((v, i) => renderLinhaVoto(data, cooperativaId, v, i + 1, false))
    .join("");

  const linhasAnexo = resumo.votos
    .map((v, i) => renderLinhaVoto(data, cooperativaId, v, i + 1, true))
    .join("");

  const pendentesHtml =
    resumo.pendentes.length > 0
      ? `<div class="secao">Associados elegíveis sem voto registrado</div>
         <p class="paragrafo sem-indent">
           Constam ${resumo.pendentes.length} associado(s) elegível(is) que não registraram voto com assinatura nesta pauta:
         </p>
         <ul class="pendentes">${resumo.pendentes.map((p) => `<li>${escapeHtml(p.nome)}</li>`).join("")}</ul>`
      : "";

  const clausulas = CLAUSULAS_ATA_DELIBERATIVA.map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  const fundamentos = FUNDAMENTO_LEGAL_ATA.map((c) => `<li>${escapeHtml(c)}</li>`).join("");

  const observacaoHtml = pauta.observacao?.trim()
    ? `<p class="paragrafo sem-indent"><span class="rotulo">Observações da diretoria:</span> ${escapeHtml(pauta.observacao.trim())}</p>`
    : "";

  const reuniaoHtml =
    reuniao || horario
      ? `<p class="paragrafo sem-indent">
           ${reuniao ? `<span class="rotulo">Reunião complementar (WhatsApp):</span> ${escapeHtml(reuniao)}. ` : ""}
           ${horario ? `<span class="rotulo">Horário:</span> ${escapeHtml(horario)}. ` : ""}
           A deliberação principal ocorreu por votação eletrônica no ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}, com autenticação individual e assinatura manuscrita digital.
         </p>`
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

    <div class="doc-title">
      <h1>Ata de deliberação cooperativa</h1>
      <p class="sub">Consulta / deliberação de associados · registro eletrônico</p>
      <p class="sub">${escapeHtml(protocolo)}</p>
    </div>

    <p class="paragrafo">
      Aos ${escapeHtml(dataEncerramento)}, encerrado o prazo da consulta aberta em ${escapeHtml(dataAbertura)},
      a <strong>${escapeHtml(nomeCoop)}</strong>, sociedade cooperativa regida pela Lei nº 5.764, de 16 de dezembro de 1971,
      consolida nesta ata o registro formal da deliberação abaixo identificada, em observância ao princípio da
      democracia cooperativista e às disposições estatutárias aplicáveis.
    </p>

    <div class="secao">I — Fundamentação legal</div>
    <ol class="juridico fundamento">${fundamentos}</ol>

    <div class="secao">II — Identificação da deliberação</div>
    <div class="quadro">
      <p class="objeto">${escapeHtml(pauta.texto)}</p>
      <p><span class="rotulo">Eleitorado:</span> ${escapeHtml(labelEscopoEleitoral(getEscopoEleitoralPauta(pauta)))}</p>
      <p><span class="rotulo">Período de votação:</span> ${escapeHtml(formatDate(pauta.inicioEm))} a ${escapeHtml(formatDate(pauta.fimEm))}</p>
      <p><span class="rotulo">Identificador:</span> ${escapeHtml(pauta.id)}</p>
      ${pauta.criadoPorNome ? `<p><span class="rotulo">Elaborada por:</span> ${escapeHtml(pauta.criadoPorNome)}</p>` : ""}
      ${pauta.abertaEm ? `<p><span class="rotulo">Consulta aberta em:</span> ${escapeHtml(formatDateTime(pauta.abertaEm))}</p>` : ""}
      ${pauta.resultadoPublicadoEm ? `<p><span class="rotulo">Resultado publicado em:</span> ${escapeHtml(formatDateTime(pauta.resultadoPublicadoEm))}</p>` : ""}
      ${pauta.encerradaEm ? `<p><span class="rotulo">Votação finalizada em:</span> ${escapeHtml(formatDateTime(pauta.encerradaEm))}${pauta.encerradaPorNome ? ` · ${escapeHtml(pauta.encerradaPorNome)}` : ""}</p>` : ""}
    </div>
    ${observacaoHtml}
    ${reuniaoHtml}

    <div class="secao">III — Apuração do resultado</div>
    <table class="apuracao-resumo">
      <thead>
        <tr>
          <th>Sim</th>
          <th>Não</th>
          <th>Abstenção</th>
          <th>Total de votos</th>
          <th>Elegíveis</th>
          <th>Participação</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${resumo.votosSim} (${resumo.pctSim.toLocaleString("pt-BR")}%)</td>
          <td>${resumo.votosNao} (${resumo.pctNao.toLocaleString("pt-BR")}%)</td>
          <td>${resumo.votosAbstencao} (${resumo.pctAbstencao.toLocaleString("pt-BR")}%)</td>
          <td>${resumo.totalVotos}</td>
          <td>${resumo.totalElegiveis}</td>
          <td>${pctParticipacao.toLocaleString("pt-BR")}%</td>
        </tr>
      </tbody>
    </table>

    <p class="paragrafo">${escapeHtml(renderResultadoTexto(resumo))}</p>

    <table>
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Associado</th>
          <th class="col-cpf">CPF/CNPJ</th>
          <th class="col-voto">Voto</th>
          <th class="col-data">Registrado em</th>
        </tr>
      </thead>
      <tbody>${linhasResumo || `<tr><td colspan="5">Nenhum voto registrado.</td></tr>`}</tbody>
    </table>

    ${pendentesHtml}

    <div class="anexo-break">
      <div class="secao">IV — Anexo: assinaturas dos associados participantes</div>
      <p class="paragrafo sem-indent">
        Relação nominal dos associados que registraram voto, com reprodução reduzida da assinatura manuscrita digital
        capturada no ato do registro, para fins de arquivo e comprovação da manifestação de vontade.
      </p>
      <table>
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th>Associado</th>
            <th class="col-cpf">CPF/CNPJ</th>
            <th class="col-voto">Voto</th>
            <th class="col-data">Data e hora</th>
            <th class="col-sig">Assinatura</th>
          </tr>
        </thead>
        <tbody>${linhasAnexo || `<tr><td colspan="6">Nenhum registro disponível.</td></tr>`}</tbody>
      </table>
    </div>

    <div class="secao">V — Disposições sobre o registro eletrônico</div>
    <ol class="juridico">${clausulas}</ol>

    <div class="secao">VI — Encerramento</div>
    <p class="paragrafo">
      Nada mais havendo a registrar sobre a presente deliberação, lavrou-se a presente ata em meio eletrônico,
      com validade de registro institucional da cooperativa, a ser arquivada na documentação social da entidade e,
      quando couber, ratificada conforme estatuto e orientação jurídica.
    </p>

    <p class="local-data">${escapeHtml(coop?.endereco?.split(",")[0]?.trim() || nomeCoop)}, ${escapeHtml(dataEncerramento)}.</p>

    <div class="dirigentes">
      <div class="dirigente">
        <div class="linha">Presidente da Assembleia / Diretor-Presidente</div>
        <div class="hint">Nome completo</div>
      </div>
      <div class="dirigente">
        <div class="linha">Secretário(a) da Assembleia</div>
        <div class="hint">Nome completo</div>
      </div>
    </div>

    <div class="footer">
      ${escapeHtml(protocolo)} · Pauta ${escapeHtml(pauta.id)} · ${resumo.totalVotos} voto(s) com assinatura<br/>
      Documento gerado em ${escapeHtml(geradoEm)} · ${escapeHtml(VOTACAO_DELIBERATIVA_PLATAFORMA)}
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
