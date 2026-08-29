"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class HbCreditScannerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[HbCreditQrScanner]", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">Não foi possível abrir a câmera nesta tela.</p>
          <p className="text-sm text-amber-900">
            Use a opção de colar o código manualmente ou recarregue a página e tente de novo.
          </p>
          <Button type="button" variant="secondary" className="w-full" onClick={this.reset}>
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
