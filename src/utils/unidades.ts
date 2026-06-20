export type ProdutoUnidade = "kg" | "un" | "mç" | "dz" | "lt";

export const UNIDADES_MEDIDA: { value: ProdutoUnidade; label: string }[] = [
  { value: "kg", label: "Quilos (kg)" },
  { value: "un", label: "Unidades (un)" },
  { value: "mç", label: "Maço (mç)" },
  { value: "dz", label: "Dúzia (dz)" },
  { value: "lt", label: "Litro (lt)" },
];

export function labelUnidade(unidade: string): string {
  return UNIDADES_MEDIDA.find((u) => u.value === unidade)?.label ?? unidade;
}

export function normalizarUnidade(unidade: string): ProdutoUnidade {
  const u = unidade.trim().toLowerCase();
  if (u === "kg" || u === "quilo" || u === "quilos") return "kg";
  if (u === "un" || u === "und" || u === "unidade" || u === "unidades") return "un";
  if (u === "mç" || u === "mc" || u === "maço" || u === "maco") return "mç";
  if (u === "dz" || u === "duzia" || u === "dúzia" || u === "duzias" || u === "dúzias") return "dz";
  if (u === "lt" || u === "l" || u === "litro" || u === "litros" || u === "ltr") return "lt";
  return "kg";
}
