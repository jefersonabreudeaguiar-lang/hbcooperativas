"use client";

export default function AdminError() {
  function reabrir() {
    const url = new URL(window.location.href);
    url.searchParams.set("reabrir", String(Date.now()));
    window.location.replace(url);
  }

  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-bold">Não foi possível abrir a administração</h1>
      <div className="mt-5 flex justify-center gap-4">
        <button type="button" className="rounded-lg bg-green-700 px-4 py-2 text-white" onClick={reabrir}>
          Reabrir administração
        </button>
        <a className="px-4 py-2 underline" href="/dashboard">Voltar ao app</a>
      </div>
    </main>
  );
}
