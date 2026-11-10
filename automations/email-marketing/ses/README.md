# Sistema de e-mail próprio (Amazon SES + n8n + Supabase)

Início em 05/11/2026. O Klaviyo continua ativo até este sistema assumir.

## Amazon SES (sa-east-1, plano Essentials)
- Domínio `americanutrition.com` verificado: DKIM (3 CNAME no Cloudflare), MAIL FROM `envio.americanutrition.com`
  (MX + SPF). O DMARC já existia (`p=none`), mantido.
- Supressão da conta ligada para BOUNCE e COMPLAINT. Gerenciador Virtual de Entregabilidade, rastreamento de
  engajamento e entrega compartilhada otimizada ligados. Validação automática desligada (custo à parte).
- Produção: pedido inicial negado pela análise automática; caso 179384563600849 respondido em 05/11 com os detalhes.
  **Liberado em 10/11/2026**: fora do sandbox, 50.000 emails/dia, 14 por segundo (sa-east-1). Conferido na API
  (`GET /v2/email/account`): `ProductionAccessEnabled: true`, `ReviewDetails.Status: GRANTED`,
  `EnforcementStatus: HEALTHY`, tipo `MARKETING`. Domínio com DKIM e MAIL FROM em `SUCCESS`.
- Compromissos com a AWS: mandar só para quem pediu para receber (inscritos), tratar bounce e reclamação (já feito,
  ver abaixo), testar com o simulador da AWS (não com endereços reais) e pedir aumento antes de precisar.
- Aquecimento: IP compartilhado, sem IP dedicado. Começar pelos clientes mais engajados (compraram ou abriram
  email nos últimos 90 dias) e subir o volume aos poucos, olhando bounce (manter < 2%) e reclamação
  (manter < 0,1%). A AWS pausa a conta acima de 5% de bounce ou 0,1% de reclamação.
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

## Fluxos automáticos (10/11/2026)

Banco em `fluxos.sql` (aplicado pelo `/pg/query` do Supabase, porque o usuário do n8n não é dono das tabelas):
`email_contatos` ganhou as colunas da Shopify (consentimento, pedidos, gasto, último pedido), mais `email_pedidos`
(pedidos pagos) e `email_fila` (um email agendado por linha, único por email + modelo + referência).

| Workflow | Id | O que faz |
|---|---|---|
| `[Email] Sincronizar Shopify e agendar fluxos` (`sincronizar.workflow.js`) | `M3em7RCOHKjzJffe` | A cada 2 min: 250 clientes e 100 pedidos pagos da Shopify (por `updated_at`, cursor em `email_config`) → `email_sync_contatos` / `email_sync_pedidos` → `email_agendar()` |
| `[Email] Despachar fila (SES)` (`despachar.workflow.js`) | `rkAbBsGIbcznBPjk` | A cada 5 min: `email_proximos(150)` → SES (10/s) → `email_marcar` |

**Fluxos** (os mesmos emails do Klaviyo, modelos em `email_templates`):

| Fluxo | Gatilho | Emails |
|---|---|---|
| Boas-vindas | inscreveu no email marketing e não comprou | 1.1 na hora, 1.2 +1h, 1.3 +25h, 1.4 +49h |
| Pós-compra | pedido pago (uma série por cliente a cada 60 dias) | 2.1 +2d, 2.2 +4d, 2.3 +8d, 2.4 +12d, 2.5 +18d, 2.6 +33d |
| Recompra | pedido com ImunoFosfo | 3.1 +22d, só se não comprou de novo |
| VIP | o pedido que levou o cliente a 3 pedidos | 5.1 na hora, uma vez na vida |

**Regras no envio** (`email_proximos`): só sai para `status = 'inscrito'` **e** consentimento `SUBSCRIBED` na Shopify;
o cupom de boas-vindas (1.1) não sai para quem já comprou; item com mais de 2 dias de atraso expira (não manda email
velho); nome vazio vira "você"; rodapé e `List-Unsubscribe` com o link de descadastro de cada pessoa.
Só entra na fila o que acontecer depois de `fluxos_inicio` (10/11/2026 16:20 UTC): ligar o sistema não dispara nada
para a base antiga.

**Modo** (`email_config.fluxos_modo`):
- `teste` (atual): tudo roda, mas o email vai para `success@simulator.amazonses.com` com "[TESTE]" no assunto e a
  fila marca `teste`. Necessário enquanto os 9 fluxos do Klaviyo estiverem ligados, senão a cliente recebe dois emails.
- `ativo`: manda para a cliente, até `envio_limite_dia` (300 no começo) por dia.
- `off`: nada sai.

**Para virar a chave:** pausar os fluxos do Klaviyo (workflow `7KnxBKb4iY2ch05q`, lista fixa de ids) e, no mesmo
momento, `update email_config set valor = 'ativo' where chave = 'fluxos_modo'`. Depois subir o `envio_limite_dia`
aos poucos (300 → 1.000 → 3.000), olhando bounce e reclamação em `email_eventos`.

**Teste de ponta a ponta (10/11):** item na fila para um contato inscrito → despachante → SES (simulador) →
evento `delivery` de volta em 2 s, com a tag `modelo` → fila marcada `teste`. Linha de teste apagada.

**Fica para depois:** navegação abandonada (precisa do rastreio de navegação, que hoje é do Klaviyo), carrinho
abandonado e assinatura (eventos do nosso checkout; o WhatsApp já cobre).

## Próximos passos
1. Virar a chave (Klaviyo pausado + `fluxos_modo = ativo`), com a aprovação do Jaderson.
2. Primeiro envio de campanha: Esquenta Black Friday só para os engajados (compraram nos últimos 90 dias), como
   aquecimento da conta.
3. Carrinho abandonado e assinatura no sistema próprio; depois, cancelar o Klaviyo.
