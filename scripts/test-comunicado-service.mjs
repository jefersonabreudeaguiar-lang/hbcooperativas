/**
 * Testes manuais das regras de comunicado.
 * Executar: node scripts/test-comunicado-service.mjs
 */

function muralDuracaoHoras(duracao) {
  if (duracao === "24h") return 24;
  if (duracao === "2d") return 48;
  return 168;
}

function calcMuralExpiraEm(publicadoEm, duracao) {
  const base = new Date(publicadoEm).getTime();
  return new Date(base + muralDuracaoHoras(duracao) * 3600_000).toISOString();
}

function comunicadoMuralAindaVisivel(c, nowMs = Date.now()) {
  if (c.recorrente) return true;
  if (!c.muralPublicadoEm) return true;
  const duracao = c.muralDuracao ?? "24h";
  const expira = calcMuralExpiraEm(c.muralPublicadoEm, duracao);
  return new Date(expira).getTime() > nowMs;
}

function getComunicadoAssunto(c) {
  return c.assunto?.trim() || c.titulo?.trim() || "Aviso";
}

function cooperadoTemConteudoComunicado(c) {
  return Boolean(c.descricao?.trim() || c.audioDataUrl?.trim() || c.audioStoragePath?.trim());
}

function comunicadoVisivelParaCooperado(c, cooperadoId, cooperados = []) {
  if (c.cooperadoId) return Boolean(cooperadoId && c.cooperadoId === cooperadoId);
  if (c.somenteDiretoria) {
    if (!cooperadoId) return false;
    return Boolean(cooperados.find((x) => x.id === cooperadoId)?.membroDiretoria);
  }
  return c.visivelParaTodos !== false;
}

const tests = [
  {
    name: "assunto preferido sobre titulo legado",
    run: () => getComunicadoAssunto({ assunto: " Reunião ", titulo: "Antigo" }) === "Reunião",
  },
  {
    name: "fallback titulo quando assunto vazio",
    run: () => getComunicadoAssunto({ assunto: "", titulo: "Titulo" }) === "Titulo",
  },
  {
    name: "conteudo exige texto ou audio",
    run: () =>
      cooperadoTemConteudoComunicado({ descricao: "  ", audioDataUrl: "" }) === false &&
      cooperadoTemConteudoComunicado({ descricao: "Texto", audioDataUrl: "" }) === true &&
      cooperadoTemConteudoComunicado({ descricao: "", audioDataUrl: "data:audio/webm;base64,abc" }) === true &&
      cooperadoTemConteudoComunicado({ descricao: "", audioStoragePath: "623/comunicados/x.webm" }) === true,
  },
  {
    name: "somente diretoria filtra cooperado comum",
    run: () => {
      const cooperados = [
        { id: "c1", membroDiretoria: false },
        { id: "c2", membroDiretoria: true },
      ];
      const aviso = { somenteDiretoria: true, visivelParaTodos: false };
      return (
        comunicadoVisivelParaCooperado(aviso, "c1", cooperados) === false &&
        comunicadoVisivelParaCooperado(aviso, "c2", cooperados) === true
      );
    },
  },
  {
    name: "mural expira após duração escolhida",
    run: () => {
      const publicado = "2026-01-01T12:00:00.000Z";
      const expira24 = calcMuralExpiraEm(publicado, "24h");
      const dentro = new Date(expira24).getTime() - 1000;
      const fora = new Date(expira24).getTime() + 1000;
      const c = { muralPublicadoEm: publicado, muralDuracao: "24h" };
      return (
        comunicadoMuralAindaVisivel(c, dentro) === true &&
        comunicadoMuralAindaVisivel(c, fora) === false
      );
    },
  },
];

let failed = 0;
for (const t of tests) {
  try {
    if (!t.run()) {
      failed += 1;
      console.error(`FAIL: ${t.name}`);
    } else {
      console.log(`OK: ${t.name}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${t.name}`, err);
  }
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} teste(s) falharam.`);
} else {
  console.log(`\n${tests.length} teste(s) passaram.`);
}
