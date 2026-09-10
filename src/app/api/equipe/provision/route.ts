import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  guardCooperativaApi,
  requireEquipeManagementRole,
} from "@/lib/security/apiGuard";
import { clientIp } from "@/lib/security/authRoutes";
import {
  findAppUserByEmail,
  logSecurityEvent,
  updateAppUserProfile,
  upsertAppUserWithRoleRepair,
} from "@/lib/supabase/usersAuth";
import { isEquipeProvisionRole } from "@/lib/security/staffProvisioningPolicy";
import type { Action, ModoAcesso, Resource, UserRole } from "@/types";

type EquipeProvisionBody = {
  id?: string;
  email?: string;
  password?: string;
  name?: string;
  role?: UserRole;
  cooperativaId?: string;
  cooperativaCnpj?: string;
  funcao?: string;
  modoAcesso?: ModoAcesso;
  permissoesExtras?: Partial<Record<Resource, Action[]>>;
  permissoesNegadas?: Partial<Record<Resource, Action[]>>;
  active?: boolean;
};

function parseBody(body: EquipeProvisionBody | null) {
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body?.password ?? "");
  const id = String(body?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const role = String(body?.role ?? "") as UserRole;
  const cnpj = body?.cooperativaCnpj ? normalizeCnpj(String(body.cooperativaCnpj)) : "";
  return {
    id,
    email,
    password,
    name,
    role,
    cooperativaId: body?.cooperativaId ? String(body.cooperativaId) : undefined,
    cooperativaCnpj: cnpj.length === 14 ? cnpj : "",
    funcao: body?.funcao ? String(body.funcao).trim() : undefined,
    modoAcesso: (body?.modoAcesso === "parcial" ? "parcial" : "total") as ModoAcesso,
    permissoesExtras: body?.permissoesExtras,
    permissoesNegadas: body?.permissoesNegadas,
    active: body?.active !== false,
  };
}

/** Cadastro/atualização de responsável ou tesoureiro — somente equipe autorizada. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = parseBody(body);

  if (!input.id || !input.email || !input.name || !input.cooperativaCnpj) {
    return NextResponse.json({ error: "Dados incompletos para provisionar equipe." }, { status: 400 });
  }
  if (!isEquipeProvisionRole(input.role)) {
    return NextResponse.json({ error: "Perfil inválido para equipe." }, { status: 400 });
  }
  if (!input.password || input.password.length < 6) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, input.cooperativaCnpj, {
    requireManagement: true,
    write: true,
  });
  if (!guard.ok) return guard.response;

  const equipeDenied = requireEquipeManagementRole(guard.session, guard.enforced);
  if (equipeDenied) return equipeDenied;

  const supabase = getSupabaseAdmin()!;
  const emailTaken = await findAppUserByEmail(supabase, input.email);
  if (emailTaken && emailTaken.id !== input.id) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
  }

  const user = await upsertAppUserWithRoleRepair(supabase, {
    id: input.id,
    email: input.email,
    password: input.password,
    name: input.name,
    role: input.role,
    cooperativaId: input.cooperativaId,
    cooperativaCnpj: input.cooperativaCnpj,
    funcao: input.funcao || "Responsável",
    responsavelPrincipal: false,
    modoAcesso: input.modoAcesso,
    permissoesExtras: input.permissoesExtras,
    permissoesNegadas: input.permissoesNegadas,
    active: input.active,
  });

  if (!user) {
    return NextResponse.json({ error: "Não foi possível salvar o membro na nuvem." }, { status: 503 });
  }

  await logSecurityEvent(supabase, {
    action: "equipe.provision",
    userId: guard.session?.sub,
    userEmail: guard.session?.email,
    cooperativaCnpj: input.cooperativaCnpj,
    ip: clientIp(request),
    metadata: {
      memberId: user.id,
      memberEmail: user.email,
      role: user.role,
      modoAcesso: user.modo_acesso,
    },
  });

  return NextResponse.json({ ok: true, user: user.id });
}

/** Atualiza permissões/nome/status de membro existente (senha opcional). */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const input = parseBody(body);

  if (!input.id || !input.cooperativaCnpj) {
    return NextResponse.json({ error: "Informe o membro e o CNPJ da cooperativa." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, input.cooperativaCnpj, {
    requireManagement: true,
    write: true,
  });
  if (!guard.ok) return guard.response;

  const equipeDenied = requireEquipeManagementRole(guard.session, guard.enforced);
  if (equipeDenied) return equipeDenied;

  const supabase = getSupabaseAdmin()!;
  const { data: existing, error } = await supabase.from("app_users").select("*").eq("id", input.id).maybeSingle();
  if (error || !existing) {
    return NextResponse.json({ error: "Membro não encontrado na nuvem." }, { status: 404 });
  }
  if (existing.responsavel_principal && input.active === false) {
    return NextResponse.json({ error: "Não é possível desativar o responsável principal." }, { status: 403 });
  }

  const password = input.password && input.password.length >= 6 ? input.password : undefined;
  const user = await updateAppUserProfile(supabase, existing.id, {
    name: input.name || existing.name,
    role: (existing.role as UserRole) ?? "responsavel",
    cooperativaId: existing.cooperativa_id ?? undefined,
    cooperativaCnpj: existing.cooperativa_cnpj ?? undefined,
    funcao: input.funcao || existing.funcao || "Responsável",
    responsavelPrincipal: existing.responsavel_principal === true,
    modoAcesso: input.modoAcesso ?? existing.modo_acesso ?? "total",
    permissoesExtras: input.permissoesExtras ?? existing.permissoes_extras ?? undefined,
    permissoesNegadas: input.permissoesNegadas ?? existing.permissoes_negadas ?? undefined,
    active: input.active,
    password,
  });

  if (!user) {
    return NextResponse.json({ error: "Não foi possível atualizar o membro." }, { status: 503 });
  }

  await logSecurityEvent(supabase, {
    action: "equipe.update",
    userId: guard.session?.sub,
    userEmail: guard.session?.email,
    cooperativaCnpj: input.cooperativaCnpj,
    ip: clientIp(request),
    metadata: { memberId: user.id },
  });

  return NextResponse.json({ ok: true, user: user.id });
}
