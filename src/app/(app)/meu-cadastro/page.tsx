"use client";

import { Suspense } from "react";
import MeuCadastroContent from "./MeuCadastroContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Carregando...</div>}>
      <MeuCadastroContent />
    </Suspense>
  );
}
