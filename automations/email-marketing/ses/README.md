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
- `email_templates` (`email_templates.sql`): 13 modelos, com `{{ nome }}` (primeiro nome) e `{{ link_descadastro }}`.

## Padrão visual (Modelo 2 · Marca forte, aprovado em 05/11/2026)
- `padrao.py` gera os 13 modelos em `templates/<slug>.html` a partir de blocos prontos: topo azul com logo branco,
  selo e título grande (com foto do produto opcional), cartões numerados, cupom, ficha, depoimentos, canais da
  comunidade, conversa com a Serena e rodapé azul. Para mudar um email, edite o bloco dele em `EMAILS` e rode
  `python3 padrao.py`; depois suba o HTML para `email_templates` (update por slug).
- Fontes: Barlow Condensed (títulos) e Inter (texto) via Google Fonts, com Arial de reserva (Gmail usa a reserva).
- Layout fluid-hybrid: as colunas empilham no celular mesmo em clientes sem media query.
- Imagens na Shopify Files: logo branco `an-logo-branco-email.png` e as fotos dos produtos (`&width=600`).
- No envio, trocar `{{ nome }}` (se vier vazio, usar um texto neutro: vários títulos terminam com o nome) e
  `{{ link_descadastro }}` (enquanto a página não existe, o teste usa o site).
- O conteúdo é o mesmo dos emails do Klaviyo, reorganizado nos blocos novos.

## Próximos passos
1. Monitoramento: configuration set + SNS (bounce, complaint, delivery) → webhook n8n → supressão + revogar consentimento na Shopify.
2. Contatos: espelho dos inscritos da Shopify no Supabase + página de descadastro + cabeçalhos List-Unsubscribe.
3. Fluxos: boas-vindas, pós-compra, recompra, VIP, carrinho abandonado, assinatura. Depois, desligar os do Klaviyo.
