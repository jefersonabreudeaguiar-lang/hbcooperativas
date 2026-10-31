"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[global-app-error]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#f9fafb",
          color: "#111827",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Não foi possível abrir o app</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
            Ocorreu uma falha ao iniciar. Seus dados continuam salvos. Tente abrir novamente ou use o diagnóstico para informar o suporte.
          </p>
          {error.digest ? (
            <p style={{ color: "#6b7280", fontSize: 12 }}>Código: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "12px 16px",
              border: 0,
              borderRadius: 10,
              background: "#15803d",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Tentar novamente
          </button>
          <a
            href="/pwa-crash-forensics.html"
            style={{ display: "inline-block", marginTop: 16, color: "#166534" }}
          >
            Abrir diagnóstico
          </a>
        </main>
      </body>
    </html>
  );
}
