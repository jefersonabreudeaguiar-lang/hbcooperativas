-- Referência lab — NÃO aplicar em produção sem ADR + PR dedicado
-- Tabelas separadas de hb_credit_* (isolamento financeiro)

-- hb_hobelisco_events
-- hb_hobelisco_incidents
-- hb_hobelisco_rules
-- hb_hobelisco_health
-- hb_hobelisco_threat_memory
-- hb_hobelisco_simulations
-- hb_hobelisco_dna

-- v0.2 lab usa LabPersistence in-memory (storage/LabPersistence.ts)
-- Esta migration documenta o contrato futuro para V2 observe-only em nuvem.

CREATE TABLE IF NOT EXISTS hb_hobelisco_events (
  id text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  event_hash text NOT NULL,
  previous_event_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_incidents (
  id text PRIMARY KEY,
  kind text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_rules (
  id text PRIMARY KEY,
  category text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL,
  policy text NOT NULL,
  recommended_action text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_health (
  id text PRIMARY KEY,
  cooperative_cnpj text,
  score int NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_threat_memory (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  sequence jsonb NOT NULL,
  severity text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_simulations (
  id text PRIMARY KEY,
  scenario_id text NOT NULL,
  passed boolean NOT NULL,
  micro_count int NOT NULL DEFAULT 1,
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_dna (
  version text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
