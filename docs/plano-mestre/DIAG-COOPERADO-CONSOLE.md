# Diagnóstico cooperado — console (browser e celular)

## Opção A — já logado no app (após deploy com o script)

1. Login como **cooperado**.
2. DevTools → **Console** (no celular: Chrome `chrome://inspect` ou Safari Web Inspector).
3. Rode:

```javascript
await HB_COOP_COOPERADO_DIAG_RUN();
copy(JSON.stringify(__HB_COOP_COOPERADO_DIAG__, null, 2));
```

4. Cole o JSON no chat (ou salve em arquivo).

## Opção B — carregar script manualmente (produção atual)

Cole **duas linhas** no console (em qualquer página logada do mesmo domínio):

```javascript
var s = document.createElement("script");
s.src = "https://hbcooperativas.vercel.app/hb-cooperado-acesso-diag.js?_=" + Date.now();
document.head.appendChild(s);
```

Aguarde `[HB] Diagnostico cooperado carregado` e rode a Opção A.

## Reproduzir travamento

1. Com o app aberto, use normalmente até travar.
2. Rode `await HB_COOP_COOPERADO_DIAG_RUN()` **de novo**.
3. Envie os **dois** JSONs (antes e depois) se possível.

O script ativa `hb.coop.mobile.trace=1` e inclui o ring `trace` no relatório.
