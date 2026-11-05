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

## Descadastro (05/11/2026)
- Banco (`descadastro.sql`): `email_contatos` (status inscrito/descadastrado/bounce/reclamacao), `email_eventos`
  (histórico) e `email_config` (segredo do link, gerado no próprio banco; nunca sai dele). RLS ligado nas 4 tabelas.
- Link de cada pessoa: `select email_link_descadastro(email)` →
  `https://n8n.americanutrition.com/webhook/descadastro?e=<email base64url>&t=<token>`. Vai no rodapé
  (`{{ link_descadastro }}`) e nos cabeçalhos `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (botão "cancelar inscrição" do Gmail/Apple). No SES v2: `Content.Simple.Headers`.
- n8n `[Email] Descadastro` (`MBgdT5Cy65pGQie3`, publicado; `descadastro.workflow.js`): GET mostra a página (não muda
  nada, por causa de antivírus que abrem links); POST confirma pelo botão ou pelo One-Click. Grava no banco, pede o
  motivo (opcional), permite voltar a receber e muda o consentimento de marketing do cliente na Shopify.
- Antes de qualquer envio de marketing: pular quem não está `inscrito` em `email_contatos`.

## Bounce, spam e eventos (05/11/2026)
- SES: configuration set `an-marketing` (padrão do domínio; supressão BOUNCE/COMPLAINT; métricas de reputação) com
  destino `sns-n8n` para os eventos BOUNCE, COMPLAINT, DELIVERY, DELIVERY_DELAY, REJECT, RENDERING_FAILURE, OPEN e CLICK.
- SNS: tópico `arn:aws:sns:sa-east-1:368672081051:an-ses-eventos`, inscrição https em `/webhook/ses-eventos`.
- n8n `[Email] Eventos SES` (`ZVbEox3td4zeJmyx`, publicado; `eventos.workflow.js`): confere a assinatura do SNS com o
  certificado da AWS, confirma a inscrição sozinho e grava cada evento com `email_registrar_evento()` (`eventos.sql`).
- Bloqueio em `email_contatos`: bounce permanente ou 3 temporários em 30 dias → `bounce`; marcou como spam →
  `reclamacao` e descadastra na Shopify. A supressão da conta no SES continua como segunda barreira.
- No envio: `ConfigurationSetName: 'an-marketing'` e `EmailTags: [{ Name: 'modelo', Value: <slug com _ no lugar de .> }]`
  (a tag aparece em `email_eventos.detalhe.modelo`, para medir entrega/abertura/clique por email).
- Testado com o simulador da AWS (success/bounce/complaint@simulator.amazonses.com): eventos em ~3 s, bloqueios certos.
- `AN - SES Admin` (`OxrgTAAz0dVYHw7o`) também chama o SNS (API Query por GET).

## Próximos passos
1. Contatos: espelho dos inscritos da Shopify no Supabase.
2. Fluxos (boas-vindas, pós-compra, recompra, VIP, carrinho) com envio que pula quem não está `inscrito`.
3. Fluxos: boas-vindas, pós-compra, recompra, VIP, carrinho abandonado, assinatura. Depois, desligar os do Klaviyo.
