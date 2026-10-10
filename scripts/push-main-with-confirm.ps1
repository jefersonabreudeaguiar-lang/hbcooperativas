# Push do main + confirmação de deploy em produção (relatório completo).
$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel)
$sha = (git rev-parse HEAD).Trim()
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run confirm:production:wait -- --expect-sha $sha
exit $LASTEXITCODE
