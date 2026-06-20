import { NextResponse } from "next/server";

const SHARE_KEY = "hb_comprovante_mensalidade_share";

function redirectParaMensalidades(request: Request, query = "comprovante=1") {
  const url = new URL(`/mensalidades?${query}`, request.url);
  return NextResponse.redirect(url, 303);
}

function htmlComSessionStorage(dataUrl: string): string {
  const payload = JSON.stringify({ dataUrl, savedAt: Date.now() });
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Enviando comprovante…</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <p>Redirecionando para mensalidades…</p>
  <script>
    try {
      sessionStorage.setItem(${JSON.stringify(SHARE_KEY)}, ${JSON.stringify(payload)});
      location.replace("/mensalidades?comprovante=1");
    } catch (e) {
      location.replace("/mensalidades?comprovante=1&erro=armazenamento");
    }
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  return redirectParaMensalidades(request);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    let file: File | null = null;

    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        file = value;
        break;
      }
    }

    if (!file) {
      return redirectParaMensalidades(request, "comprovante=1&erro=sem-arquivo");
    }

    if (file.size > 6 * 1024 * 1024) {
      return redirectParaMensalidades(request, "comprovante=1&erro=arquivo-grande");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    return new NextResponse(htmlComSessionStorage(dataUrl), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return redirectParaMensalidades(request, "comprovante=1&erro=leitura");
  }
}
