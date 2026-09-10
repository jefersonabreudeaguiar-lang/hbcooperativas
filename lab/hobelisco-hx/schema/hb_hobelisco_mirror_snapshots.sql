-- HOBELISCO — Fase 1: espelho prod → LAB (snapshots anonimizados)
-- Aplicar no Supabase LAB (mesmo projeto do hb_hobelisco_v2_staging.sql)

CREATE TABLE IF NOT EXISTS hb_hobelisco_mirror_snapshots (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL DEFAULT '1.0',
  environment text NOT NULL DEFAULT 'LAB',
  prod_commit_sha text,
  prod_commit_ref text,
  lab_commit_sha text,
  code_aligned boolean NOT NULL DEFAULT false,
  staleness_hours numeric NOT NULL DEFAULT 0,
  deploy_url text,
  aggregates jsonb NOT NULL DEFAULT '{}',
  config_flags jsonb NOT NULL DEFAULT '{}',
  anonymized boolean NOT NULL DEFAULT true,
  issues jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'OK'
);

CREATE INDEX IF NOT EXISTS hb_hobelisco_mirror_snapshots_synced_at
  ON hb_hobelisco_mirror_snapshots (synced_at DESC);

COMMENT ON TABLE hb_hobelisco_mirror_snapshots IS 'Espelho read-only prod→LAB — metadados agregados, sem PII';
