# Sincroniza .env.homolog.local → Vercel (projeto LAB). Não use no projeto oficial.
param(
  [string]$ProjectName = "hbcooperativas-lab",
  [string]$EnvFile = ".env.homolog.local"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $EnvFile)) {
  Write-Error "Arquivo $EnvFile não encontrado. Copie de .env.homolog.local ou docs/env-homolog-vercel.template"
}

$lines = Get-Content $EnvFile | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' }
if (-not $lines.Count) {
  Write-Error "Nenhuma variável em $EnvFile"
}

Write-Host "Projeto Vercel (lab): $ProjectName"
Write-Host "Variáveis a enviar: $($lines.Count)"
Write-Host "Requer: npx vercel link --project $ProjectName e login na equipe correta."
Write-Host ""

foreach ($line in $lines) {
  if ($line -match '^\s*#') { continue }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { continue }
  $key = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
  if ($key -eq "SUPABASE_DB_PASSWORD") { continue }
  if ($key -eq "NEXT_PUBLIC_APP_URL" -and $val -match "localhost") {
    Write-Host "SKIP $key (localhost — defina URL do lab na Vercel após 1º deploy)"
    continue
  }
  Write-Host "SET $key"
  $val | npx vercel env add $key production --force --yes 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Falha em $key — verifique vercel login / link"
  }
}

Write-Host ""
Write-Host "Concluído. Ajuste NEXT_PUBLIC_APP_URL na Vercel para https://<seu-lab>.vercel.app"
Write-Host "Deploy: git push origin hb-cooperativas-lab"
