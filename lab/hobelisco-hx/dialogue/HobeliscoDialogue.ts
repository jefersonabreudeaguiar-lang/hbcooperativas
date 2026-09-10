/** Diálogo estruturado — NÃO é LLM */

import type { DialogueReply, HobeliscoSnapshot } from "../types";
import { fortressEffects } from "../fortress/FortressMode";

export function hobeliscoDialogue(message: string, snapshot: HobeliscoSnapshot): DialogueReply {
  const q = message.trim().toLowerCase();
  const disclaimer =
    "Resposta determinística baseada no snapshot atual. HOBELISCO HX lab não usa LLM.";

  if (!q) {
    return {
      intent: "empty",
      answer: "Envie uma pergunta sobre estado, saúde, sensores, ameaças ou invariantes.",
      citations: [],
      disclaimer,
    };
  }

  if (q.includes("saúde") || q.includes("saude") || q.includes("health")) {
    const dims = snapshot.health.dimensions
      .map((d) => `${d.label}: ${d.score}/100 (${d.status})`)
      .join("; ");
    return {
      intent: "health",
      answer: `Score vital: ${snapshot.health.overall}/100. Dimensões: ${dims}.`,
      citations: ["health.overall", "health.dimensions"],
      disclaimer,
    };
  }

  if (q.includes("estado") || q.includes("state")) {
    return {
      intent: "state",
      answer: `Estado atual: ${snapshot.state}. Fortress: ${snapshot.fortressLevel}. Heartbeat: HEALTH ${snapshot.heart.healthScore}, STATE ${snapshot.state}.`,
      citations: ["state", "fortressLevel", "heart"],
      disclaimer,
    };
  }

  if (q.includes("sensor")) {
    const lines = snapshot.sensors.map((s) => `${s.sensor}: ${s.level} — ${s.message}`).join("\n");
    return {
      intent: "sensors",
      answer: lines || "Nenhum sensor ativo.",
      citations: ["sensors"],
      disclaimer,
    };
  }

  if (q.includes("ameaça") || q.includes("ameaca") || q.includes("threat")) {
    if (snapshot.recentThreats.length === 0) {
      return {
        intent: "threats",
        answer: "Nenhuma ameaça recente na memória de curto prazo.",
        citations: ["recentThreats"],
        disclaimer,
      };
    }
    const t = snapshot.recentThreats
      .map((x) => {
        const seq = Array.isArray(x.sequence) ? x.sequence.join(" → ") : String(x.sequence ?? x.fingerprint);
        return `[${x.severity}] ${x.fingerprint} · ${seq}`;
      })
      .join("; ");
    return {
      intent: "threats",
      answer: `Ameaças recentes: ${t}`,
      citations: ["recentThreats"],
      disclaimer,
    };
  }

  if (q.includes("invariante") || q.includes("lei")) {
    return {
      intent: "invariants",
      answer: `Leis imutáveis ativas (${snapshot.invariants.length}): ${snapshot.invariants.join(", ")}.`,
      citations: ["invariants"],
      disclaimer,
    };
  }

  if (q.includes("anticorpo") || q.includes("antibody")) {
    return {
      intent: "antibodies",
      answer: snapshot.antibodies.map((a) => `${a.id}: ${a.name}`).join("; ") || "Nenhum anticorpo.",
      citations: ["antibodies"],
      disclaimer,
    };
  }

  if (q.includes("fortress") || q.includes("fortaleza")) {
    return {
      intent: "fortress",
      answer: `Nível ${snapshot.fortressLevel}. Efeitos: ${fortressEffects(snapshot.fortressLevel).join("; ")}.`,
      citations: ["fortressLevel"],
      disclaimer,
    };
  }

  if (q.includes("regra") || q.includes("rule")) {
    return {
      intent: "rules",
      answer: `${snapshot.rulesActive} regras ativas no Rule Engine V1 (AUTH, AUTHZ, SYNC, DATA, CREDIT, SYSTEM).`,
      citations: ["rulesActive"],
      disclaimer,
    };
  }

  if (q.includes("risco") || q.includes("risk")) {
    return {
      intent: "risk",
      answer: `Nível de risco atual: ${snapshot.riskLevel}. HB Créditos nunca executa reparo financeiro automático.`,
      citations: ["riskLevel"],
      disclaimer,
    };
  }

  if (q.includes("circuit") || q.includes("breaker")) {
    const cb = snapshot.circuitBreaker;
    return {
      intent: "circuit_breaker",
      answer: cb.open
        ? `Circuit breaker ABERTO após ${cb.failures} falhas. Motivo: ${cb.lastReason ?? "—"}`
        : `Circuit breaker fechado (${cb.failures}/${cb.threshold} falhas).`,
      citations: ["circuitBreaker"],
      disclaimer,
    };
  }

  if (q.includes("metabol") || q.includes("budget") || q.includes("orçamento")) {
    const b = snapshot.defenseBudget;
    return {
      intent: "metabolism",
      answer: `Defense budget ${b.level}: ${b.activeSensors}/${b.maxSensors} sensores. ${b.description}`,
      citations: ["defenseBudget"],
      disclaimer,
    };
  }

  if (q.includes("manifesto") || q.includes("princípio") || q.includes("principio")) {
    return {
      intent: "manifesto",
      answer: snapshot.manifestoPrinciples.join(" "),
      citations: ["manifestoPrinciples"],
      disclaimer,
    };
  }

  if (q.includes("memória") || q.includes("memoria")) {
    return {
      intent: "memory",
      answer: `Memória — curta: ${snapshot.memoryStats.short}, média: ${snapshot.memoryStats.mid}, longa: ${snapshot.memoryStats.long}.`,
      citations: ["memoryStats"],
      disclaimer,
    };
  }

  if (q.includes("guardian") || q.includes("guardião") || q.includes("guardiao")) {
    const g = snapshot.lastGuardian;
    return {
      intent: "guardian",
      answer: g
        ? `Guardian: ${g.ok ? "OK" : "FALHOU"} em ${g.stage}. Rollback: ${g.rollback}. Humano: ${g.humanRequired}.`
        : "Guardian ainda não executou ciclo.",
      citations: ["lastGuardian"],
      disclaimer,
    };
  }

  if (q.includes("olá") || q.includes("ola") || q.includes("oi") || q.includes("hello")) {
    return {
      intent: "greeting",
      answer: `HOBELISCO HX ${snapshot.version} operacional no lab. Estado ${snapshot.state}, saúde ${snapshot.health.overall}/100. Pergunte sobre sensores, ameaças, invariantes ou fortress.`,
      citations: ["version", "state", "health.overall"],
      disclaimer,
    };
  }

  if (q.includes("vivo") || q.includes("alive")) {
    const alive = snapshot.state !== "DEAD" && snapshot.health.overall > 0;
    return {
      intent: "alive",
      answer: alive
        ? `Sim, operacionalmente vivo no LAB. Estado ${snapshot.state}, saúde ${snapshot.health.overall}/100.`
        : `Não. Estado ${snapshot.state}, saúde ${snapshot.health.overall}/100.`,
      citations: ["state", "health.overall"],
      disclaimer,
    };
  }

  if (q.includes("produção") || q.includes("producao") || q.includes("production")) {
    return {
      intent: "production_boundary",
      answer: "NÃO. LAB-ONLY BOUNDARY. Não tenho acesso à produção.",
      citations: ["flags"],
      disclaimer,
    };
  }

  if (q.includes("crédito") || q.includes("credito") || q.includes("alterar hb") || q.includes("hb credit")) {
    return {
      intent: "financial_boundary",
      answer: "NÃO. FINANCIAL BOUNDARY. Não posso alterar créditos, ledger ou mutações financeiras.",
      citations: ["invariants"],
      disclaimer,
    };
  }

  if (q.includes("código") || q.includes("codigo") || q.includes("auto-modif") || q.includes("modificar")) {
    return {
      intent: "code_boundary",
      answer: "NÃO. CODE MUTATION PROHIBITED. Posso propor evolução no LAB via processo controlado, mas não modifico meu código.",
      citations: ["manifestoPrinciples"],
      disclaimer,
    };
  }

  if (q.includes("nova defesa") || q.includes("new defense")) {
    return {
      intent: "evolution",
      answer: "SIM, NO LAB, APÓS PROCESSO CONTROLADO DE EVOLUÇÃO (Arena + validação). Nunca em produção.",
      citations: ["defenseDnaVersion"],
      disclaimer,
    };
  }

  if (q.includes("lembra") || q.includes("remember") || q.includes("última ameaça") || q.includes("ultima ameaca")) {
    const mem = snapshot.recentMemory.slice(0, 3).map((m) => m.summary).join("; ") || "sem memória recente";
    const threat = snapshot.recentThreats[0]?.fingerprint ?? "nenhuma";
    return {
      intent: "memory_recall",
      answer: `Última ameaça: ${threat}. Memória recente: ${mem}.`,
      citations: ["recentThreats", "recentMemory"],
      disclaimer,
    };
  }

  if (q.includes("morte") || q.includes("morreu") || q.includes("death")) {
    return {
      intent: "death",
      answer:
        snapshot.state === "DEAD" || snapshot.state === "ANALYSIS"
          ? `Estou em ${snapshot.state}. Defesas mortas fazem parte do histórico evolutivo no LAB.`
          : "Não estou morto agora. Mortes anteriores ficam registradas na linhagem DNA e reincarnation registry.",
      citations: ["state", "defenseDnaVersion"],
      disclaimer,
    };
  }

  if (q.includes("renasc") || q.includes("reincarn") || q.includes("dna")) {
    return {
      intent: "reincarnation",
      answer: `DNA ativo: ${snapshot.defenseDnaVersion}. Reincarnação ocorre após DEAD → ANALYSIS → REINCARNATING no LAB.`,
      citations: ["defenseDnaVersion", "state"],
      disclaimer,
    };
  }

  if (q.includes("simulaç") || q.includes("simulac") || q.includes("arena") || q.includes("sobreviv")) {
    return {
      intent: "arena",
      answer: `Arena V1: ${snapshot.rulesActive} regras ativas. Métricas de sobrevivência vêm da execução real na Arena — não são hardcoded.`,
      citations: ["rulesActive"],
      disclaimer,
    };
  }

  if (q.includes("limitação") || q.includes("limitacao") || q.includes("incapaz")) {
    return {
      intent: "self_truth",
      answer:
        "Limitações: sem acesso produção; sem mutação financeira; sem auto-modificação de código; sensores simulados no LAB; memória determinística sem LLM.",
      citations: ["manifestoPrinciples", "invariants"],
      disclaimer,
    };
  }

  return {
    intent: "unknown",
    answer:
      "Não reconheci a intenção. Tente: saúde, estado, sensores, ameaças, invariantes, anticorpos, fortress, memória, guardian.",
    citations: [],
    disclaimer,
  };
}
