import { redirect } from "next/navigation";

/** Legado: entregas/vendas → fluxo oficial notas-pedido. */
export default function EntregasRedirect() {
  redirect("/notas-pedido");
}
