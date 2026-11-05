# Sistema de e-mail próprio (Amazon SES + n8n + Supabase)

Início em 05/11/2026. O Klaviyo continua ativo até este sistema assumir.

## Amazon SES (sa-east-1, plano Essentials)
- Domínio `americanutrition.com` verificado: DKIM (3 CNAME no Cloudflare), MAIL FROM `envio.americanutrition.com`
  (MX + SPF). O DMARC já existia (`p=none`), mantido.
- Supressão da conta ligada para BOUNCE e COMPLAINT. Gerenciador Virtual de Entregabilidade, rastreamento de
  engajamento e entrega compartilhada otimizada ligados. Validação automática desligada (custo à parte).
- Produção: pedido inicial negado pela análise automática; caso 179384563600849 respondido em 05/11 com os detalhes.
  Até a liberação: sandbox (200/dia, só destinatários verificados). Destinatário de teste verificado: o e-mail do Jaderson.
- Credencial no n8n: `AWS SES` (tipo aws). A chave nunca entra no repositório.

## n8n
- `AN - SES Admin` (`OxrgTAAz0dVYHw7o`): chamadas à API SES v2, editadas e rodadas pelo MCP. Despublicado após uso.
- `AN - Email Teste (SES)` (`NdD3GnUy7QPMdWSg`): envia um modelo de `email_templates` para o destinatário de teste.

## Supabase
- `email_templates` (`email_templates.sql`): 13 modelos no visual do Klaviyo (os mesmos de
  `../shopify-custom-liquid/`), com `{{ nome }}` para o primeiro nome.

## Próximos passos
1. Monitoramento: configuration set + SNS (bounce, complaint, delivery) → webhook n8n → supressão + revogar consentimento na Shopify.
2. Contatos: espelho dos inscritos da Shopify no Supabase + página de descadastro + cabeçalhos List-Unsubscribe.
3. Fluxos: boas-vindas, pós-compra, recompra, VIP, carrinho abandonado, assinatura. Depois, desligar os do Klaviyo.
