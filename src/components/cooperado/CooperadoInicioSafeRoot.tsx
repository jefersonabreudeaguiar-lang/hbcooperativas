"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Button } from "@/components/ui/Button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Impede tela vazia no Início cooperado se um bloco da árvore quebrar. */
export class CooperadoInicioSafeRoot extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[cooperado-inicio-safe-root]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl space-y-4" data-cooperado-inicio-safe-fallback="1">
          <PageSkeleton />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">O Início não terminou de carregar.</p>
            <p className="mt-1 text-amber-800">Recarregue ou use Atualizar no menu.</p>
            <Button
              className="mt-3"
              size="sm"
              type="button"
              onClick={() => {
                try {
                  window.location.assign("/dashboard?_hbInicio=1");
                } catch {
                  window.location.reload();
                }
              }}
            >
              Abrir Início
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
