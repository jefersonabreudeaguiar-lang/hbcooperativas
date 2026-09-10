import type { AppData, Cooperado, User } from "@/types";
import { generateId, addAuditEntry, updateData, refreshSessionForUser } from "@/services/dataStore";
import { hashPassword, hashPasswordSync, verifyPassword } from "@/lib/security/password";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { normalizeCnpj } from "@/utils/cooperativa";
import { clearCloudBootstrapCredentials, secureApiFetch } from "@/lib/security/clientSession";

type UsuarioActor = Pick<User, "id" | "name">;

export function findLoginCooperado(data: AppData, cooperadoId: string): User | undefined {
  return data.users.find((u) => u.cooperadoId === cooperadoId && u.role === "cooperado");
}

/** Responsável cria ou redefine senha temporária de login do cooperado. */
export async function definirSenhaTemporariaCooperado(
  data: AppData,
  actor: UsuarioActor,
  cooperativaId: string,
  cooperativaCnpj: string | undefined,
  cooperado: Cooperado,
  input: { email: string; password: string }
): Promise<{ ok: true; email: string; userId: string } | { ok: false; error: string }> {
  const email = normalizeAuthEmail(input.email);
  const password = input.password.trim();
  const cnpj = cooperativaCnpj ? normalizeCnpj(cooperativaCnpj) : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Informe um e-mail válido para o login." };
  }
  if (password.length < 6) {
    return { ok: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (cnpj.length !== 14) {
    return { ok: false, error: "CNPJ da cooperativa inválido." };
  }

  const existing = findLoginCooperado(data, cooperado.id);
  const emailEmUso = data.users.find(
    (u) => u.email.toLowerCase() === email && u.id !== existing?.id
  );
  if (emailEmUso) {
    return { ok: false, error: "Este e-mail já está cadastrado para outro usuário." };
  }

  const userId = existing?.id ?? generateId("u");
  const hash = hashPasswordSync(password);
  const nome = cooperado.nomeCompleto.trim() || existing?.name || "Cooperado";

  updateData((d) => {
    const users = existing
      ? d.users.map((u) =>
          u.id === existing.id
            ? { ...u, email, password: hash, name: nome, active: true }
            : u
        )
      : [
          ...d.users,
          {
            id: userId,
            email,
            password: hash,
            name: nome,
            role: "cooperado" as const,
            cooperativaId,
            cooperativaCnpj: cnpj,
            cooperadoId: cooperado.id,
            active: true,
          },
        ];

    return addAuditEntry(
      { ...d, users },
      {
        entityType: "user",
        entityId: userId,
        action: "editar",
        userId: actor.id,
        userName: actor.name,
        changes: existing
          ? `Senha temporária de login redefinida (${email})`
          : `Conta de login criada com senha temporária (${email})`,
      }
    );
  });

  try {
    const res = await secureApiFetch("/api/cooperados/provision-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: userId,
        cooperadoId: cooperado.id,
        email,
        password,
        name: nome,
        cooperativaId,
        cooperativaCnpj: cnpj,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: json.error ?? "Senha salva localmente, mas falhou na nuvem. Tente novamente.",
      };
    }
  } catch {
    return { ok: false, error: "Sem conexão com a nuvem. Tente novamente." };
  }

  return { ok: true, email, userId };
}

/** Cooperado altera a própria senha de login em Meu cadastro. */
export async function alterarSenhaCooperado(
  userId: string,
  senhaAtual: string,
  novaSenha: string,
  auditUser: Pick<User, "id" | "name">
): Promise<{ success: boolean; error?: string }> {
  const atual = senhaAtual.trim();
  const nova = novaSenha.trim();

  if (!atual) return { success: false, error: "Informe a senha atual." };
  if (nova.length < 6) return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
  if (nova === atual) return { success: false, error: "A nova senha deve ser diferente da atual." };

  const { getData } = await import("@/services/dataStore");
  const data = getData();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return { success: false, error: "Usuário não encontrado neste dispositivo." };

  const ok = await verifyPassword(atual, user.password);
  if (!ok) return { success: false, error: "Senha atual incorreta." };

  const hash = await hashPassword(nova);
  updateData((d) =>
    addAuditEntry(
      {
        ...d,
        users: d.users.map((u) => (u.id === userId ? { ...u, password: hash } : u)),
      },
      {
        entityType: "user",
        entityId: userId,
        action: "editar",
        userId: auditUser.id,
        userName: auditUser.name,
        changes: "Senha de login alterada em Meu cadastro",
      }
    )
  );

  refreshSessionForUser(userId);
  clearCloudBootstrapCredentials();

  try {
    const res = await secureApiFetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: atual, newPassword: nova }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status !== 503) {
        return {
          success: false,
          error: json.error ?? "Senha salva localmente, mas falhou na nuvem. Tente novamente.",
        };
      }
    }
  } catch {
    /* offline — senha local já foi alterada */
  }

  return { success: true };
}
