"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/Button";
import {
  recarregarAbaStaffDocumento,
  staffAbaDeveRecarregarDocumento,
} from "@/lib/responsavel/staffPainelRecuperarAba";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Impede tela branca no painel da cooperativa se um cálculo do Início quebrar. */
export class StaffPainelSafeRoot extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidMount() {
    if (staffAbaDeveRecarregarDocumento()) recarregarAbaStaffDocumento();
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[staff-painel-safe-root]", error);
    if (staffAbaDeveRecarregarDocumento()) recarregarAbaStaffDocumento();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl space-y-4">
          <PageSkeleton />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">O painel não terminou de carregar.</p>
            <p className="mt-1 text-amber-800">Recarregue a página. O menu ao lado continua disponível.</p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                recarregarAbaStaffDocumento();
              }}
            >
              Recarregar
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
