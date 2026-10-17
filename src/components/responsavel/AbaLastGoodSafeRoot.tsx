"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { AbaLastGoodNome } from "@/lib/responsavel/abaLastGoodCheckpoint";
import { tryRestoreAbaLastGoodInStore } from "@/lib/responsavel/abaLastGoodStore";

type Props = { children: ReactNode; aba: AbaLastGoodNome; coopId?: string };
type State = { hasError: boolean; restored: boolean };

/** Se Contratos ou Pagar quebrar, restaura o último recorte estável e permanece na mesma aba. */
export class AbaLastGoodSafeRoot extends Component<Props, State> {
  state: State = { hasError: false, restored: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    const restored = tryRestoreAbaLastGoodInStore(this.props.aba, this.props.coopId);
    if (restored) this.setState({ restored: true });
  }

  render() {
    if (this.state.hasError) {
      const titulo =
        this.props.aba === "contratos" ? "Contratos" : "Pagar cooperados";
      return (
        <div className="max-w-3xl space-y-4 p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">
              {this.state.restored
                ? `Restauramos a última versão estável de ${titulo}.`
                : `${titulo} não terminou de carregar.`}
            </p>
            <p className="mt-1 text-amber-800">
              Recarregue só esta aba. O restante do painel continua no mesmo lugar.
            </p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                tryRestoreAbaLastGoodInStore(this.props.aba, this.props.coopId);
                this.setState({ hasError: false, restored: false });
              }}
            >
              Recarregar aba
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
