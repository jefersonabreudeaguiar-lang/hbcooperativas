import { NextResponse } from "next/server";
import { uploadFiscalNotePhoto } from "@/lib/supabase/hbCreditFiscalNotesStorage";
import { getParceiroByUserId } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi } from "@/lib/security/creditGuard";
import { bufferFromDataUrl, validatePdfUpload } from "@/lib/security/uploadMime";

interface RouteParams {
  params: Promise<{ transactionId: string }>;
}

export async function POST(request: Request, context: RouteParams) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
    return NextResponse.json({ error: "Acesso restrito ao mercado." }, { status: 403 });
  }

  const parceiro = gate.ctx.session
    ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
    : null;
  if (!parceiro) {
    return NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 });
  }
  if (parceiro.status !== "ativo") {
    return NextResponse.json({ error: "Mercado inativo." }, { status: 403 });
  }

  const { transactionId } = await context.params;
  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "Transação inválida." }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let buffer: Buffer | undefined;
  let mimeType = "application/pdf";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("foto") ?? form.get("arquivo");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "PDF ausente ou inválido." }, { status: 400 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = String(form.get("mimeType") ?? file.type ?? "application/pdf");
  } else {
    const body = await request.json().catch(() => null);
    const fotoDataUrl = String(body?.foto ?? body?.pdf ?? "");
    if (!fotoDataUrl) {
      return NextResponse.json({ error: "PDF ausente." }, { status: 400 });
    }
    buffer = bufferFromDataUrl(fotoDataUrl) ?? undefined;
    mimeType = "application/pdf";
  }

  if (!buffer) {
    return NextResponse.json({ error: "PDF inválido." }, { status: 400 });
  }

  const mimeCheck = validatePdfUpload(buffer, mimeType);
  if (!mimeCheck.ok) {
    return NextResponse.json({ error: mimeCheck.error }, { status: 400 });
  }

  const result = await uploadFiscalNotePhoto(
    gate.ctx.supabase,
    parceiro.id,
    transactionId,
    buffer,
    mimeCheck.mime
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, nota: result.nota });
}
