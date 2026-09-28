# Homolog — teste Jeferson desktop (fluxo = Orlando)

**Commit de teste:** branch `homolog/bic-orlando-b12`  
**Cooperado de teste:** Jeferson `c_1781981564381_w67gg`  
**Referência de comportamento:** Orlando desktop (não cópia de dados)

---

## O que sobe neste homolog

- H203 — gate `apresentacaoConsolidada` (UI só após sync)
- H204 — `cooperadoPagamentosHydrated` só após `runSync` completo
- M6/M7/M8 facades + `cooperadoFluxoFinanceiroGlobal`
- **Sem** alterar HB Crédito motor nem área responsável

---

## O que NÃO fazemos

- Copiar pagamentos/notas/fichas do Orlando para o Jeferson
- Wipe/repair/reset operacional na nuvem neste passo

---

## Depois do deploy homolog

1. Abrir URL homolog (Vercel preview / ambiente configurado).
2. Login **cooperado Jeferson** no **desktop** (largura > 1024px).
3. Aguardar **Atualizando…** terminar (sync force no mount).
4. Conferir abas:
   - **Início** — card A receber / recibo (dados **do Jeferson**)
   - **Ficha corrida** — painel quanto vou receber + totais
   - **Notas** — listagem coerente
5. Comparar **comportamento** com Orlando (ordem, gates, recibo), não valores iguais.

Se AppData antigo no navegador: sair, limpar site data **só no aparelho de teste**, entrar de novo.

---

## Script read-only (antes/depois deploy)

```powershell
cd C:\Image-Cipher\coopeagriplla-gestao
npx tsx scripts/homolog-jeferson-fluxo-desktop-readonly.ts
```

- Exit **0** — operacional Jeferson presente, projeção OK  
- Exit **2** — slice financeiro ausente na nuvem (precisa sync pós-login)  
- Exit **3** — guard `desatualizado` (sync no app)

---

## Critério GO para commit/push produção

- [ ] Homolog build verde  
- [ ] Jeferson desktop: sync conclui sem erro persistente  
- [ ] Relatórios/abas **estruturalmente** iguais ao Orlando  
- [ ] Nenhum vazamento de dado de outro cooperado  

---

**Próximo passo após GO:** merge/deploy produção (autorização explícita).
