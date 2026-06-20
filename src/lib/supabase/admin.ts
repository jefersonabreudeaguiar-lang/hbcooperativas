import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CloudCooperativaRow = {
  id: string;
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  responsavel: string;
  email: string;
  status: "ativa" | "inativa";
  mensalidade_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

let adminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Cliente admin — só usar em API routes / server. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;

  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  return adminClient;
}
