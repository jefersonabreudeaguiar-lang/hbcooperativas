# Ponto de retorno — Referência Cooperado Desktop (Orlando)

**Objetivo:** Voltar ao conjunto de arquivos que define o **fluxo cooperado desktop canônico**, sem tocar em dados (Supabase, AppData produção, notas, mercado, HB Crédito persistido).

---

## Identificação

| Campo | Valor |
|--------|--------|
| Referência | `REFERENCIA-ORLANDO-DESKTOP-COOPERADO` |
| Manifest | `backups/REFERENCIA-ORLANDO-DESKTOP-COOPERADO/REFERENCIA-MANIFEST.json` |
| Documento mestre | `scripts/backups/REFERENCIA-CANONICA-COOPERADO-DESKTOP-ORLANDO.md` |
| HEAD git registrado | `d9d741a1202f2b5d03ff99e494039a7200919aa7` (ver `backups/REFERENCIA-ORLANDO-DESKTOP-COOPERADO/GIT_HEAD.txt`) |

---

## Restaurar só o núcleo cooperado (recomendado)

Copia **de** `backups/REFERENCIA-ORLANDO-DESKTOP-COOPERADO/` **para** a raiz do repo:

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
$base = "backups\REFERENCIA-ORLANDO-DESKTOP-COOPERADO"
robocopy "$base\src\modules\auth" "src\modules\auth" AuthProvider.tsx
robocopy "$base\src\lib" "src\lib" cooperadoApresentacaoFinanceira.ts cooperadoFluxoFinanceiroGlobal.ts mobileExperience.ts
robocopy "$base\src\components\sync" "src\components\sync" CooperativaSyncProvider.tsx
robocopy "$base\src\components\cooperado" "src\components\cooperado" CooperadoFinanceiroGate.tsx
robocopy "$base\src\services" "src\services" bicProjecaoFinanceiraCooperado.ts
```

Se existirem cópias no snapshot de dashboard/ficha/notas/layout/hooks, repita `robocopy` para esses paths conforme `REFERENCIA-MANIFEST.json`.

Validar após restore:

```powershell
npx tsc --noEmit
npm run build
npx tsx scripts/test-h203-apresentacao-consolidada.ts
npm run test:h204-orlando-global
```

---

## Restaurar árvore `src/` completa (emergência)

Usa snapshot anterior mais amplo:

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
robocopy backups\H204-BEFORE-ORLANDO-GLOBAL\src src /E
```

**Atenção:** sobrescreve **todo** `src/`, incluindo alterações não relacionadas. Preferir restore parcial acima.

---

## O que NÃO fazer ao restaurar

- Não executar `reset-operacional`, `wipe-*`, `repair-*` cloud.
- Não alterar pagamentos/notas/fichas na nuvem para “testar”.
- Não commitar/push/deploy automaticamente após restore — revisar diff manualmente.

---

## Escopo congelado (não restaurar / não editar neste ponto de referência)

- Motor e APIs **HB Crédito** (`src/modules/hb-credit`, `src/app/api/credit`, `src/lib/hb-credit` profundo).
- Fluxos **responsável** (fechamento, fila conferência, relatórios gestão) — permanecem como estão alinhados hoje.

Cooperado desktop continua **consumindo** descontos HB **após** sync operacional; isso não exige mudar o motor HB.

---

**Este arquivo é o índice operacional do ponto de retorno.**
