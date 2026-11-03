import { spawnSync } from "node:child_process";

/** Invólucro local: recuperável somente pelo mesmo usuário Windows nesta máquina. */
export function wrapBackupKey(bytes, decrypt = false) {
  if (process.platform !== "win32") throw Error("Invólucro local exige Windows; use uma solução portátil aprovada em outro sistema.");
  const action = decrypt ? "Unprotect" : "Protect";
  const script = `Add-Type -AssemblyName System.Security; $backupKeyBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::${action}($backupKeyBytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)))`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: bytes.toString("base64"), encoding: "utf8", windowsHide: true, timeout: 30000,
  });
  if (result.error || result.status !== 0) throw Error("Não foi possível proteger ou recuperar a chave local do backup.");
  return Buffer.from(result.stdout.trim(), "base64");
}
