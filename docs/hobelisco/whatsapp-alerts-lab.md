# Hobelisco WhatsApp Alerts (LAB)

Envio de alertas de segurança para WhatsApp — **somente LAB/staging**, desligado por default.

## Configuração

### Opção A — Webhook (n8n, Zapier, Make)

```env
HOBELISCO_ENVIRONMENT=LAB
HB_HOBELISCO_WHATSAPP_ENABLED=true
HB_HOBELISCO_WHATSAPP_MODE=webhook
HB_HOBELISCO_WHATSAPP_WEBHOOK_URL=https://seu-n8n.com/webhook/hobelisco
HB_HOBELISCO_WHATSAPP_TO=5511999999999
HB_HOBELISCO_WHATSAPP_MIN_SEVERITY=HIGH
```

O webhook recebe JSON:

```json
{
  "source": "hobelisco_lab",
  "to": "5511999999999",
  "message": "texto formatado",
  "severity": "HIGH",
  "incidentId": null
}
```

Configure o n8n para encaminhar ao WhatsApp (WhatsApp Business API, Twilio, etc.).

### Opção B — WhatsApp Cloud API (Meta)

```env
HB_HOBELISCO_WHATSAPP_ENABLED=true
HB_HOBELISCO_WHATSAPP_MODE=cloud_api
HB_HOBELISCO_WHATSAPP_PHONE_ID=seu_phone_number_id
HB_HOBELISCO_WHATSAPP_TOKEN=seu_access_token
HB_HOBELISCO_WHATSAPP_TO=5511999999999
```

## Teste

```bash
curl -X POST http://localhost:3000/api/lab/hobelisco/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"title":"Teste","message":"Alerta LAB","severity":"HIGH"}'
```

## Segurança

- Desabilitado em `NODE_ENV=production` (fail-closed)
- Mensagens sanitizadas — sem senha/token/secret
- Não substitui confirmação humana no painel admin
- Campanha 10X envia resumo se `HB_HOBELISCO_WHATSAPP_ENABLED=true`

## Integração automática

Alertas de campanha 10X e incidentes CRITICAL podem usar `sendWhatsAppSecurityAlert()` em `src/lib/lab/hobeliscoWhatsAppAlert.ts`.
