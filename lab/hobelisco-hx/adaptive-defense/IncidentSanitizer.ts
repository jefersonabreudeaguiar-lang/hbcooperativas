const SECRET_PATTERNS = [
  /password/i,
  /token/i,
  /jwt/i,
  /secret/i,
  /private.?key/i,
  /authorization/i,
  /bearer\s+/i,
];

const PII_KEYS = ["cpf", "email", "phone", "nome", "name", "address"];

export interface SanitizedIncidentPattern {
  patternId: string;
  attackFamily: string;
  sequence: string[];
  indicators: string[];
  sanitizedAt: string;
}

export interface RawIncidentInput {
  incidentId: string;
  attackFamily: string;
  events: Array<{ type: string; metadata?: Record<string, unknown> }>;
}

export function sanitizeIncident(input: RawIncidentInput): SanitizedIncidentPattern {
  const sequence: string[] = [];
  const indicators: string[] = [];

  for (const event of input.events) {
    const safeType = redactString(event.type);
    sequence.push(safeType);
    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        if (PII_KEYS.some((p) => key.toLowerCase().includes(p))) continue;
        if (typeof value === "string" && containsSecret(value)) continue;
        indicators.push(`${key}:${typeof value === "string" ? redactString(value) : "synthetic"}`);
      }
    }
  }

  return {
    patternId: `san_${input.incidentId}_${Date.now()}`,
    attackFamily: input.attackFamily,
    sequence,
    indicators: indicators.slice(0, 20),
    sanitizedAt: new Date().toISOString(),
  };
}

export function incidentToScenarioTemplate(pattern: SanitizedIncidentPattern): {
  vector: string;
  sequence: string[];
  family: string;
} {
  return {
    vector: pattern.sequence[0] ?? "unknown_variant",
    sequence: pattern.sequence.map((s) => s.replace(/\[REDACTED\]/g, "synthetic")),
    family: pattern.attackFamily,
  };
}

function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(value));
}

function redactString(value: string): string {
  if (containsSecret(value)) return "[REDACTED]";
  if (/^\d{11}$/.test(value)) return "SYNTHETIC_CPF";
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(value)) return "SYNTHETIC_EMAIL";
  if (value.length > 64) return value.slice(0, 32) + "…";
  return value;
}
