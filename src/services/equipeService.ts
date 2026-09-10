import type { AppData, ModoAcesso, Resource, User } from "@/types";
import { MODULOS_ACESSO, PRESET_RELATORIOS, negarModulos, resourcesFromModulos } from "@/permissions";
import { generateId, addAuditEntry } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { hashPasswordSync } from "@/lib/security/password";
import { getLastCloudSyncError, secureApiFetch } from "@/lib/security/clientSession";
import { normalizeCnpj } from "@/utils/cooperativa";

type UsuarioActor = Pick<User, "id" | "name">;

export interface MembroEquipeInput {
  name: string;
  email: string;
  password: string;
  funcao: string;
  modoAcesso: ModoAcesso;
  modulosLiberados: Resource[];
  modulosRestritos: Resource[];
}

export interface AtualizarMembroEquipeInput {
  name?: string;
  funcao?: string;
  password?: string;
  modoAcesso?: ModoAcesso;
  modulosLiberados?: Resource[];
  modulosRestritos?: Resource[];
  active?: boolean;
}

export function listMembrosEquipe(data: AppData, cooperativaId: string): User[] {
  return data.users.filter(
    (u) =>
      u.cooperativaId === cooperativaId &&
      (u.role === "responsavel" || u.role === "tesoureiro") &&
      u.active !== false
  );
}

export function listMembrosEquipeIncluindoInativos(data: AppData, cooperativaId: string): User[] {
  return data.users.filter(
    (u) => u.cooperativaId === cooperativaId && (u.role === "responsavel" || u.role === "tesoureiro")
  );
}

export function listContadoresEquipe(data: AppData, cooperativaId: string): User[] {
  return data.users.filter((u) => u.cooperativaId === cooperativaId && u.role === "contador");
}

export function listContadoresEquipeIncluindoInativos(data: AppData, cooperativaId: string): User[] {
  return data.users.filter((u) => u.cooperativaId === cooperativaId && u.role === "contador");
}

function buildPermissoes(
  role: User["role"],
  modoAcesso: ModoAcesso,
  modulosLiberados: Resource[],
  modulosRestritos: Resource[]
): Pick<User, "modoAcesso" | "permissoesExtras" | "permissoesNegadas"> {
  if (modoAcesso === "parcial") {
    return {
      modoAcesso: "parcial",
      permissoesExtras: resourcesFromModulos(modulosLiberados),
      permissoesNegadas: undefined,
    };
  }
  return {
    modoAcesso: "total",
    permissoesExtras: undefined,
    permissoesNegadas: negarModulos(role, modulosRestritos),
  };
}

export function criarMembroEquipe(
  data: AppData,
  actor: UsuarioActor,
  cooperativaId: string,
  cooperativaCnpj: string | undefined,
  input: MembroEquipeInput
): { ok: true; user: User } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const funcao = input.funcao.trim();
  const password = input.password;

  if (!name) return { ok: false, error: "Informe o nome." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (!funcao) return { ok: false, error: "Informe a função do responsável." };

  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "Este e-mail já está cadastrado." };
  }

  const permissoes = buildPermissoes(
    "responsavel",
    input.modoAcesso,
    input.modulosLiberados,
    input.modulosRestritos
  );

  const newUser: User = {
    id: generateId("u"),
    email,
    password: hashPasswordSync(password),
    name,
    role: "responsavel",
    cooperativaId,
    cooperativaCnpj,
    active: true,
    funcao,
    responsavelPrincipal: false,
    ...permissoes,
  };

  return { ok: true, user: newUser };
}

export interface ContadorEquipeInput {
  name: string;
  email: string;
  password: string;
  funcao?: string;
}

export function criarContadorEquipe(
  data: AppData,
  actor: UsuarioActor,
  cooperativaId: string,
  cooperativaCnpj: string | undefined,
  input: ContadorEquipeInput
): { ok: true; user: User } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const funcao = input.funcao?.trim() || "Contador";

  if (!name) return { ok: false, error: "Informe o nome do contador." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "Este e-mail já está cadastrado." };
  }

  const newUser: User = {
    id: generateId("u"),
    email,
    password: hashPasswordSync(password),
    name,
    role: "contador",
    cooperativaId,
    cooperativaCnpj,
    active: true,
    funcao,
    responsavelPrincipal: false,
    modoAcesso: "total",
  };

  return { ok: true, user: newUser };
}

/** Cadastra contador localmente e publica credenciais na nuvem para login em qualquer dispositivo. */
export async function cadastrarContadorEquipeComNuvem(
  data: AppData,
  actor: UsuarioActor,
  cooperativaId: string,
  cooperativaCnpj: string | undefined,
  input: ContadorEquipeInput
): Promise<{ ok: true; user: User; data: AppData } | { ok: false; error: string }> {
  const criado = criarContadorEquipe(data, actor, cooperativaId, cooperativaCnpj, input);
  if (!criado.ok) return criado;

  const cloudOk = await sincronizarMembroEquipeNaNuvem(criado.user, input.password);

  if (!cloudOk) {
    const detail = getLastCloudSyncError();
    return {
      ok: false,
      error:
        detail ||
        "Não foi possível publicar o contador na nuvem. Verifique internet e Supabase (tabela app_users) e tente novamente.",
    };
  }

  return {
    ok: true,
    user: criado.user,
    data: aplicarContadorEquipeCriado(data, actor, criado.user),
  };
}

/** Atualiza senha do contador na nuvem após alteração local. */
export async function sincronizarSenhaContadorNaNuvem(
  contador: Pick<User, "id" | "email" | "name" | "role" | "cooperativaId" | "cooperativaCnpj">,
  plainPassword: string
): Promise<boolean> {
  if (contador.role !== "contador" || plainPassword.length < 6) return false;
  return atualizarMembroEquipeNaNuvem(contador, plainPassword);
}

export function aplicarContadorEquipeCriado(
  data: AppData,
  actor: UsuarioActor,
  newUser: User
): AppData {
  return addAuditEntry(
    { ...data, users: [...data.users, newUser] },
    {
      entityType: "usuario_contador",
      entityId: newUser.id,
      action: "criar",
      userId: actor.id,
      userName: actor.name,
      changes: `Contador cadastrado: ${newUser.name} (${newUser.email}) — acesso somente leitura contábil`,
    }
  );
}

export function atualizarFuncaoUsuario(
  data: AppData,
  userId: string,
  funcao: string
): AppData {
  const trimmed = funcao.trim();
  return {
    ...data,
    users: data.users.map((u) => (u.id === userId ? { ...u, funcao: trimmed || u.funcao } : u)),
  };
}

/** Publica responsável/tesoureiro/contador na nuvem via API autenticada. */
export async function sincronizarMembroEquipeNaNuvem(
  membro: Pick<
    User,
    | "id"
    | "email"
    | "name"
    | "role"
    | "cooperativaId"
    | "cooperativaCnpj"
    | "funcao"
    | "modoAcesso"
    | "permissoesExtras"
    | "permissoesNegadas"
  >,
  plainPassword: string
): Promise<boolean> {
  if (
    (membro.role !== "responsavel" && membro.role !== "tesoureiro" && membro.role !== "contador") ||
    plainPassword.length < 6
  ) {
    return false;
  }
  const cnpj = membro.cooperativaCnpj ? normalizeCnpj(membro.cooperativaCnpj) : undefined;
  if (!cnpj || cnpj.length !== 14) return false;

  try {
    const res = await secureApiFetch("/api/equipe/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: membro.id,
        email: membro.email,
        password: plainPassword,
        name: membro.name,
        role: membro.role,
        cooperativaId: membro.cooperativaId,
        cooperativaCnpj: cnpj,
        funcao: membro.funcao,
        modoAcesso: membro.modoAcesso ?? "total",
        permissoesExtras: membro.permissoesExtras,
        permissoesNegadas: membro.permissoesNegadas,
        active: true,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[equipe/cloud]", json.error ?? res.status);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function atualizarMembroEquipeNaNuvem(
  membro: Pick<
    User,
    | "id"
    | "email"
    | "name"
    | "role"
    | "cooperativaCnpj"
    | "funcao"
    | "modoAcesso"
    | "permissoesExtras"
    | "permissoesNegadas"
  > & { active?: boolean },
  plainPassword?: string
): Promise<boolean> {
  const cnpj = membro.cooperativaCnpj ? normalizeCnpj(membro.cooperativaCnpj) : undefined;
  if (!cnpj || cnpj.length !== 14) return false;

  try {
    const res = await secureApiFetch("/api/equipe/provision", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: membro.id,
        email: membro.email,
        name: membro.name,
        role: membro.role,
        cooperativaCnpj: cnpj,
        funcao: membro.funcao,
        modoAcesso: membro.modoAcesso ?? "total",
        permissoesExtras: membro.permissoesExtras,
        permissoesNegadas: membro.permissoesNegadas,
        active: membro.active !== false,
        password: plainPassword && plainPassword.length >= 6 ? plainPassword : undefined,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[equipe/cloud/update]", json.error ?? res.status);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Cadastra responsável localmente e publica credenciais na nuvem. */
export async function cadastrarMembroEquipeComNuvem(
  data: AppData,
  actor: UsuarioActor,
  cooperativaId: string,
  cooperativaCnpj: string | undefined,
  input: MembroEquipeInput
): Promise<{ ok: true; user: User; data: AppData } | { ok: false; error: string }> {
  const criado = criarMembroEquipe(data, actor, cooperativaId, cooperativaCnpj, input);
  if (!criado.ok) return criado;

  const cloudOk = await sincronizarMembroEquipeNaNuvem(criado.user, input.password);
  if (!cloudOk) {
    const detail = getLastCloudSyncError();
    return {
      ok: false,
      error:
        detail ||
        "Não foi possível publicar o acesso na nuvem. Verifique internet e Supabase (tabela app_users) e tente novamente.",
    };
  }

  return {
    ok: true,
    user: criado.user,
    data: aplicarMembroEquipeCriado(data, actor, criado.user),
  };
}

export function aplicarMembroEquipeCriado(
  data: AppData,
  actor: UsuarioActor,
  newUser: User
): AppData {
  let updated: AppData = {
    ...data,
    users: [...data.users, newUser],
  };
  updated = addAuditEntry(updated, {
    entityType: "usuario",
    entityId: newUser.id,
    action: "criar",
    userId: actor.id,
    userName: actor.name,
    changes: `Acesso criado para ${newUser.name} (${newUser.funcao ?? "responsável"})`,
  });
  return updated;
}

export async function atualizarMembroEquipeComNuvem(
  data: AppData,
  actor: UsuarioActor,
  membroId: string,
  input: AtualizarMembroEquipeInput
): Promise<{ ok: true; data: AppData } | { ok: false; error: string }> {
  const result = aplicarAtualizacaoMembroEquipe(data, actor, membroId, input);
  if (!result.ok) return result;

  const membro = result.data.users.find((u) => u.id === membroId);
  if (!membro) return { ok: false, error: "Usuário não encontrado." };

  const cloudOk = await atualizarMembroEquipeNaNuvem(
    membro,
    input.password && input.password.length >= 6 ? input.password : undefined
  );
  if (!cloudOk) {
    return {
      ok: false,
      error:
        getLastCloudSyncError() ||
        "Não foi possível atualizar o acesso na nuvem. Verifique internet e tente novamente.",
    };
  }

  return result;
}

export function aplicarAtualizacaoMembroEquipe(
  data: AppData,
  actor: UsuarioActor,
  membroId: string,
  input: AtualizarMembroEquipeInput
): { ok: true; data: AppData } | { ok: false; error: string } {
  const membro = data.users.find((u) => u.id === membroId);
  if (!membro) return { ok: false, error: "Usuário não encontrado." };
  if (membro.responsavelPrincipal && input.active === false) {
    return { ok: false, error: "Não é possível desativar o responsável principal." };
  }

  const modoAcesso = input.modoAcesso ?? membro.modoAcesso ?? "total";
  const modulosLiberados = input.modulosLiberados ?? [];
  const modulosRestritos = input.modulosRestritos ?? [];
  const permissoes =
    input.modoAcesso || input.modulosLiberados || input.modulosRestritos
      ? buildPermissoes(membro.role, modoAcesso, modulosLiberados, modulosRestritos)
      : {};

  const updatedUsers = data.users.map((u) => {
    if (u.id !== membroId) return u;
    return {
      ...u,
      ...permissoes,
      name: input.name?.trim() || u.name,
      funcao: input.funcao?.trim() || u.funcao,
      active: input.active ?? u.active,
      password:
        input.password && input.password.length >= 6 ? hashPasswordSync(input.password) : u.password,
    };
  });

  let updated: AppData = { ...data, users: updatedUsers };
  updated = addAuditEntry(updated, {
    entityType: "usuario",
    entityId: membroId,
    action: "editar",
    userId: actor.id,
    userName: actor.name,
    changes: `Permissões atualizadas para ${membro.name}`,
  });
  return { ok: true, data: updated };
}

export function presetModulosRelatorios(): Resource[] {
  return [...PRESET_RELATORIOS];
}

export function modulosDisponiveisParaForm() {
  return MODULOS_ACESSO;
}

export function getCooperativaIdDoUsuario(user: User, data: AppData): string | undefined {
  return getUserCooperativaId(user, data);
}
