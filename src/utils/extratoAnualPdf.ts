import { jsPDF } from "jspdf";
import { resumoExtratoAnual, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { formatCurrency, formatDate } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

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
  linha(`Bruto das entregas: ${formatCurrency(resumo.bruto)}`, true);
  linha(`Total recebido: ${extrato.financeiro ? formatCurrency(extrato.financeiro.recebido) : "Não apurado nesta edição"}`, true);
  linha(`Descontos efetivados: ${extrato.financeiro ? formatCurrency(extrato.financeiro.descontosEfetivados) : "Não apurado nesta edição"}`, true);
  linha("Os produtos somam entregas conferidas, pagas e entregues. Recebimentos e descontos usam a data dos pagamentos confirmados no app.");
  y += 4;
  function tituloTabela() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setFillColor("#E7EFE9");
    doc.rect(14, y - 3.5, 182, 6, "F");
    doc.text("Produto", 16, y);
    doc.text("Quantidade", 130, y);
    doc.text("Valor", 194, y, { align: "right" });
    y += 6;
  }
  if (!resumo.itens.length) linha("Nenhum produto de entrega aprovada registrado neste período.");
  else tituloTabela();
  for (const item of resumo.itens) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const nome = doc.splitTextToSize(item.nome, 108) as string[];
    const altura = Math.max(5, nome.length * 3.8 + 1.2);
    if (y + altura > 278) {
      doc.addPage();
      cabecalho();
      tituloTabela();
      doc.setFont("helvetica", "normal");
    }
    doc.text(nome, 16, y);
    doc.text(`${qtd.format(item.quantidade)} ${labelUnidade(item.unidade)}`, 130, y);
    doc.text(formatCurrency(item.centavos / 100), 194, y, { align: "right" });
    y += altura;
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
