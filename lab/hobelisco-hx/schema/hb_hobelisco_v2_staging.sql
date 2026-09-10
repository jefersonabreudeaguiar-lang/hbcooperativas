-- HOBELISCO V2 — Staging observe-only schema
-- STAGING ONLY — NÃO aplicar em produção
-- Aplicação MANUAL — ver docs/HOBELISCO-V2-STAGING-MIGRATION.md

CREATE TABLE IF NOT EXISTS hb_hobelisco_observations (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  observed_at timestamptz NOT NULL,
  persisted_at timestamptz,
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  source text NOT NULL,
  sensor text NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL,
  actor_type text,
  actor_id_hash text,
  request_id text,
  correlation_id text,
  endpoint text,
  operation text,
  outcome text NOT NULL,
  fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS hb_hobelisco_observations_id_env
  ON hb_hobelisco_observations (id, environment);

CREATE TABLE IF NOT EXISTS hb_hobelisco_incidents (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  severity text NOT NULL,
  status text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  signals_count int NOT NULL DEFAULT 0,
  fingerprint text,
  context jsonb NOT NULL DEFAULT '{}',
  explanation text
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_memory (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  layer text NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_threat_fingerprints (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  fingerprint text NOT NULL,
  sequence jsonb NOT NULL,
  severity text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_antibodies (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  threat_pattern text NOT NULL,
  rule_id text,
  state text NOT NULL DEFAULT 'CANDIDATE'
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_heartbeats (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_state (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_learning (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  cooperative_id text,
  hypothesis text NOT NULL,
  state text NOT NULL DEFAULT 'PROPOSED'
);

CREATE TABLE IF NOT EXISTS hb_hobelisco_audit (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '2.0',
  environment text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  event_hash text NOT NULL,
  previous_event_hash text
);

-- RLS: staging service role only — NÃO conceder ao app produtivo
ALTER TABLE hb_hobelisco_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hb_hobelisco_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hb_hobelisco_memory ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE hb_hobelisco_observations IS 'HOBELISCO V2 observe-only — staging';
