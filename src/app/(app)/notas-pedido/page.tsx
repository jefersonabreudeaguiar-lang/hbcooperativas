import { Suspense } from "react";
import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const NotasPedidoPage = dynamic(() => import("./NotasPedidoContent"), {
  loading: () => <PageSkeleton compact />,
});

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton compact />}>
      <NotasPedidoPage />
    </Suspense>
  );
}
