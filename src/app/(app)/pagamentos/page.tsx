import { redirect } from "next/navigation";

/** Legado: pagamentos → fluxo oficial ficha-corrida / pagar. */
export default function PagamentosRedirect() {
  redirect("/ficha-corrida");
}
