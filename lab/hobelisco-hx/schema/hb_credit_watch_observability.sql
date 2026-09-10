-- HB Credit Watch — tabelas de observabilidade (NÃO financeiras)
-- STAGING/LAB ONLY — aplicar manualmente junto ao schema V2

CREATE TABLE IF NOT EXISTS hb_credit_probe_snapshots (
  id text PRIMARY KEY,
  coop_cnpj text NOT NULL,
  probe_type text NOT NULL DEFAULT 'hb_credit_accounts',
  observed_at timestamptz NOT NULL,
  status text NOT NULL,
  payload_hash text NOT NULL,
  accounts_read int NOT NULL DEFAULT 0,
  run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hb_credit_probe_snapshots_coop_observed
  ON hb_credit_probe_snapshots (coop_cnpj, observed_at DESC);

CREATE TABLE IF NOT EXISTS hb_credit_probe_findings (
  id text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES hb_credit_probe_snapshots(id) ON DELETE CASCADE,
  coop_cnpj text NOT NULL,
  account_id text NOT NULL,
  cooperado_id text,
  event_type text NOT NULL,
  severity text NOT NULL,
  expected_cents bigint,
  observed_cents bigint,
  difference_cents bigint,
  fingerprint text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS hb_credit_probe_findings_coop_active
  ON hb_credit_probe_findings (coop_cnpj, resolved_at);

CREATE TABLE IF NOT EXISTS hb_hobelisco_incident_outcomes (
  id text PRIMARY KEY,
  incident_id text NOT NULL,
  outcome text NOT NULL,
  notes text,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hb_hobelisco_incident_outcomes_incident
  ON hb_hobelisco_incident_outcomes (incident_id, created_at DESC);

ALTER TABLE hb_credit_probe_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hb_credit_probe_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hb_hobelisco_incident_outcomes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE hb_credit_probe_snapshots IS 'HB Credit Watch — snapshots read-only';
COMMENT ON TABLE hb_credit_probe_findings IS 'HB Credit Watch — findings deduplicated';
COMMENT ON TABLE hb_hobelisco_incident_outcomes IS 'Hobelisco — outcome humano pós-playbook';
