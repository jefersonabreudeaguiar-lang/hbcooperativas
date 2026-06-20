import { Suspense } from "react";
import NotasPedidoPage from "./NotasPedidoContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Carregando...</div>}>
      <NotasPedidoPage />
    </Suspense>
  );
}
