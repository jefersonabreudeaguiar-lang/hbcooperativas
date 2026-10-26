# Changelog responsável / gestão (por build)

Texto curto para **operadores** e **suporte**. Versão do app: badge **`v{N}`** no header (mesmo build do PWA).

Produção: https://hbcooperativas.vercel.app

---

## v666

- **Cooperado (cirúrgico):** abrir Financeiro não roda `posProcessarFinanceiroLocal`/reconcile da cooperativa no idle; integridade adia `limparFicha` na troca de aba; cooperado fora do `AbaLastGoodSafeRoot` do responsável.

## v665

- **T2:** F5 no PC volta a fundir `coopeagriplla_data:<CNPJ>` no idle (não pula reload só porque hidratou LKG); persist idle ~5s.
- **T1:** Conferir só monta linhas completas de Em aberto na subaba «Em aberto»; reload do persist no PC não dispara `notify` se a riqueza não mudou.

## v661

- **T1:** `staffGestaoPerfilReconciliarLivroHookHabilitado` — hook de livro desmontado no PC fora de `/livro-caixa`; Conferir leitura no desktop sem merge `getDataOperationalTruth`.
- **T2:** Em aberto usa `appDataParaPagarCooperadosResponsavel` (mesma projeção do Pagar); remove fallback da lista Pagar; fallback de valor quando resumo vem NaN.

## v661

- **T1:** reconcile ficha só quando necessário no PC; cache de leitura; Início sem hook de livro-caixa; uma passagem em `appDataParaPagar`.
- **T2:** preservar ficha a partir da nota; motor Em aberto por candidatos; Início usa `dataPagar`; latch Em aberto não reidrata linha vazia.

## v662

- **T1:** `posProcessarIntegridade` não reconcilia Livro Caixa no PC por padrão; hook livro só em `/livro-caixa`; removido de Conferir/Notas.
- **T2:** Conferir leitura no PC sem latch LKG; sem `reaplicarAbaLastGood` no Pagar/sync; cache painel zera após parse do persist; reconcile ficha quando notas cruas pedem.

## v664

- **T1:** F5 frio gestão — `preloadAppData({ eager: true })` quando não há LKG; PC com LKG não agenda segundo parse idle; sync com operacional vazio lê persist na hora.
- **T2:** `totalValoresAPagarGestaoUnificado` (Início/relatório = linhas Em aberto); candidatos com `cooperados[]` vazio; cache leitura com `pendenteCents`; reparo integridade `forcar` no desktop.

## v660

- **T1:** `useReconciliarLivroCaixaGestao` isolado no desktop (`isStaffMobileViewportActive`) — sem `subscribe` fora de `/livro-caixa`.
- **T2:** `appDataParaLeituraFichaEmAbertoResponsavel` reconcilia ficha das notas — paridade Em aberto × Pagar após F5/leitura.
- **T3:** Fila Conferir enriquece `cooperadoNomeSnapshot` via `resolverNomeCooperadoGestao`; DOM `data-staff-gestao-perfil-version`.

## v659

- **Perfil desktop v2:** zero sync automático no PC; sem abertura sync; sem poll Conferir; HB warmup staff off; **reconciliar livro** só em `/livro-caixa` sem `subscribe` (fim do loop que travava o Chrome).

## v658

- **Perfil desktop v1:** `staffGestaoPerfilDesktop` — uma política para PC (sync, abertura, persist, prefetch, cap de tiers pesados automáticos). `data-staff-gestao-perfil` no HTML. Doc `METODO-GESTAO-PC-2026.md`.

## v657

- **PC abertura:** sync automático adiado (~6s) e tier `pulse` (sem `financeiro_delta` forçado); parse do `localStorage` no idle (~4,5s); prefetch de rotas só após 12s.

## v656

- **PC menu:** marca troca de rota e pausa sync/poll automático ~2,4s; `runSync` respeita a mesma pausa; removido aquecimento por hover no sidebar (imports pesados).

## v655

- **PC gestão (modo desktop):** sync automático de fundo desligado (live, idle, visibility, fila catch-up global); menu e UI não competem com rajadas de sync. Mobile inalterado.
- **PC prefetch:** `scheduleStaffNavPrefetchEarly` só no mobile; desktop usa um prefetch leve adiado (sem `prefetchStaffTabRouteChunks` triplicado no login).

## v654

- **PC gestão:** menu lateral com Link nativo (sem otimista/history.replace); limpa estado otimista no desktop; quiescência de sync só no mobile.

## v653

- **Fix travamento:** keep-alive da gestão **só no celular**; **uma aba no DOM**; desktop volta à rota única (sem 4 telas pesadas paralelas). Troca otimista usa cache pinado.

## v652

- **Fix travamento/tela branca:** abas pinadas (Início, Conferir, Pagar, Livro) voltam a ficar montadas no keep-alive; pull inicial da Conferir só 1× por cooperativa na sessão; quiescência de troca 1,2s.

## v651

- **Perf R2+:** Cooperados, Conta HB, Mensalidades (staff) e efeitos da Conferir só com aba visível; abas pesadas incluem Cooperados/Conta no keep-alive.

## v650

- **Troca de abas (R2):** quiescência 3,5s (sync/fila), `useDeferredValue` no keep-alive, só uma aba pesada (Conferir/Pagar) no DOM; Início gestão não recalcula stats em background.

## v649

- **Conferir:** abas/grupos da fila usam nome da ficha/nota operacional (`cooperadoNomeSnapshot`), não só cadastro local — evita «Cooperado» genérico.

## v648

- **Nomes na gestão:** cooperados vindos só da ficha/nota/PIX deixam de aparecer como «Cooperado»; lista operacional + `getCooperadoNomeResolvido`.
- **R4:** «A pagar» e Em aberto somam mesmo sem `data.cooperados` vazio — cadastro puxado na abertura quando há ficha sem cooperados locais.

## v647

- **R3/R4:** «Em aberto» deixa de reutilizar latch antigo após PIX/sync; cache do painel gestão zera ao terminar sync staff.
- **Atualizar:** puxa operacional com `skipDestructiveReset` (não só notas) — alinha totais com a nuvem sem zerar lastro local.
- **Início gestão:** card «A pagar» não usa placeholder com valor 0 enquanto os totais pesados carregam.

## v646 (programa Fase R — base técnica)

- **Gate ampliado:** `npm run responsavel:verify:fase-r` (lançamento + desempenho U4 + homolog operacional read-only).
- **Doc:** `docs/plano-mestre/RESPONSAVEL-EXPERIENCIA-UNICA-E-LANCAMENTO.md`.
- **Contratos:** keep-alive com Início + Conferir + Pagar + Livro pinados; teste de desempenho alinhado ao U4.

## Referência histórica (já em produção)

| Build | Destaque gestão |
|-------|-----------------|
| **v505** | F5 instantâneo — lastro no 1º quadro |
| **v497** | Atualizar não zera |
| **v498** | Conferir fila não zera Em aberto |
| **v500** | Paridade valores reais painel × em aberto |

Contratos vivos: `npm run responsavel:verify:lancamento`.
