# Rollback — Concerto BIC Movimento III

## Staff / admin porta

```json
"NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF": "false",
"NEXT_PUBLIC_BIC_LEITURA_PORTA_ADMIN": "false"
```

Staff volta a `bicCentralMesPrincipalQuantoVouReceber` indireto (flag off em `bicStaffLeituraCooperado`). Admin volta a `bicCentralValorAReceberAgregado` no painel.

## Revision watch

Opcional: trocar `watchBicCooperativaCloudRevision` de volta por `fetchCooperativaCloudRevision` nos três call sites (comportamento idêntico, só perde coalesce).
