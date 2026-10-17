"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Impede tela branca em qualquer rota autenticada se o shell quebrar. */
export class AppAreaSafeRoot extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* o painel deve continuar recuperável */
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 bg-gray-50 text-center">
          <h1 className="text-lg font-bold text-gray-900">O painel não terminou de carregar.</h1>
          <p className="text-sm text-gray-600 max-w-sm">
            Recarregue o Início. Se a tela continuar vazia, use Ctrl+Shift+R para atualizar o aplicativo.
          </p>
          <Button
            type="button"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.assign("/dashboard");
            }}
          >
            Abrir Início
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
