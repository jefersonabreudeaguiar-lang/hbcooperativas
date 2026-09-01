export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatCpfCnpj(valor?: string | null): string {
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

export function formatDate(date: string): string {
  if (!date) return "-";
  const [y, m, d] = date.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(date: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatMesReferencia(mes: string): string {
  const [ano, mesNum] = mes.split("-");
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[parseInt(mesNum, 10) - 1]} ${ano}`;
}

/** Formato compacto para grade de seleção (ex.: Jan/26). */
export function formatMesReferenciaCurto(mes: string): string {
  const [ano, mesNum] = mes.split("-");
  const abrev = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const idx = parseInt(mesNum, 10) - 1;
  if (idx < 0 || idx > 11 || !ano) return mes;
  return `${abrev[idx]}/${ano.slice(-2)}`;
}

export function getCurrentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Desloca um mês de referência (YYYY-MM) em N meses. */
export function shiftMesReferencia(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Lista meses centrados no mês informado (retroativos + atual + futuros). */
export function listMesesReferencia(centro: string, passado = 6, futuro = 6): string[] {
  const items: string[] = [];
  for (let i = -passado; i <= futuro; i++) {
    items.push(shiftMesReferencia(centro, i));
  }
  return items;
}

export function classificarMesReferencia(mes: string, referencia = getCurrentMesReferencia()): "passado" | "atual" | "futuro" {
  if (mes < referencia) return "passado";
  if (mes > referencia) return "futuro";
  return "atual";
}

export function formatCPFCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return value;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
