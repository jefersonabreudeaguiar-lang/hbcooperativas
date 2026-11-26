import { jsPDF } from "jspdf";
import { resumoExtratoAnual, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const situacoes: Record<string, string> = {
  pago: "Paga", conferida: "Conferida", entregue: "Entregue",
  aguardando_conferencia: "Em análise", rejeitada: "Rejeitada",
};

export function gerarExtratoAnualPdf(extrato: ExtratoAnualCooperado, nomeCooperativa: string) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  doc.setProperties({ title: `Extrato anual ${extrato.ano}`, author: nomeCooperativa });
  let y = 15;
  function cabecalho() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor("#205B49");
    doc.text("Extrato anual por cooperado", 14, 16);
    doc.setFontSize(10);
    const info = doc.splitTextToSize(`${nomeCooperativa} · ${extrato.nome}`, 182) as string[];
    doc.text(info, 14, 23);
    y = 25 + info.length * 5;
    doc.setFont("helvetica", "normal");
    doc.text(`01/01/${extrato.ano} a ${formatDate(extrato.ate)} · Entregas registradas no app`, 14, y);
    y += 8;
    doc.setTextColor("#18342C");
  }
  function linha(texto: string, negrito = false, margem = 14) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(10);
    const partes = doc.splitTextToSize(texto, 196 - margem) as string[];
    for (const parte of partes) {
      if (y > 277) {
        doc.addPage();
        cabecalho();
        doc.setFont("helvetica", negrito ? "bold" : "normal");
      }
      doc.text(parte, margem, y);
      y += 5;
    }
  }
  cabecalho();
  const resumo = resumoExtratoAnual(extrato);
  linha(`Bruto ${formatCurrency(resumo.bruto)} · Descontos ${formatCurrency(resumo.descontos)} · Líquido ${formatCurrency(resumo.liquido)}`, true);
  linha("Totais das entregas conferidas, pagas e entregues. O líquido não representa o total de PIX recebidos.");
  if (resumo.itens.length) {
    y += 3;
    linha("Resumo por produto", true);
    for (const item of resumo.itens) {
      linha(`${item.nome} · ${qtd.format(item.quantidade)} ${labelUnidade(item.unidade)} · ${formatCurrency(item.centavos / 100)}`);
    }
  }
  y += 4;
  linha("Entregas do período", true);
  if (!extrato.entregas.length) linha("Nenhuma entrega registrada neste período.");
  for (const entrega of extrato.entregas) {
    if (y > 260) { doc.addPage(); cabecalho(); }
    y += 3;
    const data = entrega.dataEntrega ? formatDate(entrega.dataEntrega) : formatMesReferencia(entrega.mesReferencia);
    linha(`${data} · Nota ${entrega.numeroNota || "sem número"} · ${situacoes[entrega.status] ?? entrega.status}`, true);
    const local = [entrega.contrato, entrega.localEntrega].filter(Boolean).join(" · ");
    if (local) linha(local);
    for (const item of entrega.itens ?? []) {
      linha(`${item.produtoNome} · ${qtd.format(item.quantidade)} ${labelUnidade(item.unidade)} × ${formatCurrency(item.precoUnitario)} = ${formatCurrency(item.valorBruto)}`, false, 17);
    }
    linha(`Bruto ${formatCurrency(entrega.valorBruto)} · Descontos ${formatCurrency(entrega.valorDesconto)} · Líquido ${formatCurrency(entrega.valorLiquido)}`);
  }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Página ${i} de ${paginas}`, 196, 285, { align: "right" });
  }
  return doc;
}
