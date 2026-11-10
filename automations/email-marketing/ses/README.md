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
- `email_templates` (`email_templates.sql`): modelos (v2 desde 10/11, ver abaixo), com `{{ nome }}` (primeiro nome) e `{{ link_descadastro }}`.

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
| `[Email] Despachar fila (SES)` (`despachar.workflow.js`) | `y6lJyKkXGLnLOuqX` (desde 10/11 noite; o antigo `rkAbBsGIbcznBPjk` foi arquivado) | A cada 5 min: `email_proximos(150)` → cupom do 6.3 na Shopify → SES (10/s) → `email_marcar` |

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
- `teste`: tudo roda, mas o email vai para `success@simulator.amazonses.com` com "[TESTE]" no assunto e a
  fila marca `teste`. Necessário enquanto os 9 fluxos do Klaviyo estiverem ligados, senão a cliente recebe dois emails.
- `ativo` (atual, desde 10/11): manda para a cliente, até `envio_limite_dia` (300 no começo) por dia.
- `off`: nada sai.

**Para virar a chave:** pausar os fluxos do Klaviyo (workflow `7KnxBKb4iY2ch05q`, lista fixa de ids) e, no mesmo
momento, `update email_config set valor = 'ativo' where chave = 'fluxos_modo'`. Depois subir o `envio_limite_dia`
aos poucos (300 → 1.000 → 3.000), olhando bounce e reclamação em `email_eventos`.

**Teste de ponta a ponta (10/11):** item na fila para um contato inscrito → despachante → SES (simulador) →
evento `delivery` de volta em 2 s, com a tag `modelo` → fila marcada `teste`. Linha de teste apagada.

**Fica para depois:** navegação abandonada (precisa do rastreio de navegação, que hoje é do Klaviyo), carrinho
abandonado e assinatura (eventos do nosso checkout; o WhatsApp já cobre).

## Chave virada (10/11/2026, 13:55 BRT, pedido do Jaderson)
- Klaviyo: `AN - Klaviyo Pausar/Reativar fluxos` (`7KnxBKb4iY2ch05q`, lista `ALVO`) passou para `draft` os 4 fluxos que o
  SES assumiu: **1 - Boas Vindas** (`WvgX7N`), **Pós-Compra Onboarding** (`SjYtmB`), **Recompra ImunoFosfo** (`TqL3U5`)
  e **Cliente VIP** (`YrH4Zm`). Todos responderam 200.
- Continuam `live` no Klaviyo, porque ainda não existem aqui: carrinho adicionado (`Ukh7KK`), checkout abandonado
  (`S66Gjr`), navegação abandonada (`VdxU27`), assinatura ativada (`XCjDrW`) e cobrança falhou (`RxpFWu`).
- `fluxos_modo = ativo`, `envio_limite_dia = 300`.
- Quem estava no meio de um fluxo do Klaviyo antes de hoje deixa de receber os emails restantes (o fluxo em rascunho
  para de enviar); o SES só pega quem entrou depois de `fluxos_inicio`.
- Para voltar atrás: `fluxos_modo = 'off'` e, no workflow do Klaviyo, `STATUS = 'live'`.
- Sincronização corrigida no mesmo dia: paginação pelo `endCursor` da Shopify (`email_sync_cursor`), porque milhares de
  clientes têm o mesmo `updated_at` (importação de abril) e o cursor por data andava segundos por rodada.

## Painel (10/11/2026)

`https://n8n.americanutrition.com/webhook/email-painel?t=<token>` (o token fica em `email_config.painel_token`,
gerado no banco; o link completo foi passado ao Jaderson e não vai para o repositório).

- **Workflow** `[Email] Painel (pagina + API)` (`TWcB4R1rLQQt9tes`): `GET /webhook/email-painel` devolve a página
  (`painel-shell.html`); `GET /webhook/email-painel-api?t=&dias=` devolve `email_painel(token, dias)` (`painel.sql`).
  Token errado: `{ok:false}`.
- **Página**: CSS e JS como assets do tema da Shopify (`assets/email-painel.css` e `assets/email-painel.js`, fontes
  aqui; `painel.html` é a versão inteira para abrir local). Para mudar: editar, subir com `themeFilesUpsert` e
  trocar o `?v=` no `Responder HTML` do workflow.
- **O que mostra** (Hoje / 7 / 30 / 90 dias, atualiza a cada 5 min, claro/escuro):
  receita e vendas atribuídas, enviados, entrega, abertura, clique, conversão, bounce e reclamação com selo de
  saúde (limites da AWS), descadastros; gráficos de envios, aberturas/cliques e receita por dia; tabela por email
  (fluxo, modelo, assunto, entrega, abertura, clique, vendas, receita, bounce, na fila); lista das vendas
  atribuídas; links mais clicados; contatos por status (inscritos, sem aceite, descadastrados, bounce, spam,
  novos, compraram em 90 dias, sincronização); fila (agendados por fluxo, pulados e motivo, expirados, erros);
  problemas (bounces, spam, erros) e descadastros com motivo.
- **Atribuição de venda**: pedido pago até 5 dias depois de um clique num email nosso (o último clique leva) ou,
  sem clique, até 2 dias depois de uma abertura. Só emails reais (fila `enviado`), nunca testes.
- **UTM**: o despachante acrescenta `utm_source=email&utm_medium=fluxo&utm_campaign=<fluxo>&utm_content=<modelo>`
  nos links do site, para as vendas aparecerem também nos relatórios da Shopify.
- `email_pedidos` ganhou `total` (valor do pedido), preenchido pela sincronização.
- **Redesenho (10/11, noite)**: abas Visão geral, Emails, Vendas, Contatos e Operação. A aba Emails mostra a
  prévia de cada modelo (miniatura e o email inteiro ao clicar, com assunto, prévia e números do modelo). Prévia por
  `GET /webhook/email-painel-modelo?t=&slug=` (`email_modelo_html`, nome trocado por "Maria"); lista dos modelos com
  fluxo e quando sai em `email_modelos(token)` (`painel-modelos.sql`), devolvida junto com os dados.
- **Painel Central** (`assets/america_admin.html` do tema 153190498476, servido por `/webhook/admin`): card
  "Email Marketing" no grupo Vendas, com ícone próprio, abrindo o painel dentro da central. Backup do arquivo
  anterior no scratchpad da sessão.
- Utilitário `AN - Email SQL Admin (Supabase)` (`LDFQ1DbzM3MxXnmv`): roda SQL como dono das tabelas (pinData no nó SQL).
- Testado com dados de exemplo (interceptando a API) no computador e no celular, sem erro no console; com o token
  errado a API devolve `{ok:false}`.

## Reestruturação v2 (10/11/2026, fim da tarde)

Pedido do Jaderson: menos emails parecidos no pós-compra, carrinho abandonado, guia "leia antes de abrir" por
produto na entrega, complemento, recompra calculada pela dose a partir do dia seguinte à entrega.
Banco em `reestruturacao.sql` (+ `produtos.sql` e `templates.sql`, gerados por `python3 padrao.py`) e
`painel-modelos.sql`. Testado antes num Postgres local com pedidos, entregas e carrinho de exemplo.

| Fluxo | Gatilho | Emails |
|---|---|---|
| Boas-vindas (3, era 4) | inscreveu e não comprou | 1.1 na hora · 1.3 +1d · 1.4 +3d (depoimentos + lembrete do cupom + comunidade). Para todos se a pessoa comprar |
| Carrinho abandonado (novo) | `carrinhos_abandonados` status `abandonado` (o checkout próprio) | 6.1 ~1h (itens com foto e preço, link do carrinho, aviso se o cartão foi recusado ou o boleto está gerado) · 6.2 +1d (depoimentos + Serena) · 6.3 +3d com **cupom de 10% único, uso único, válido 24h a partir do envio** (`VOLTA10-XXXXXX`, criado na Shopify pelo despachante; o link leva `&discount=` e o checkout aplica sozinho). Para se o carrinho virar `convertido` ou sair pedido do mesmo email |
| Entrega (3, eram 6) | aviso `pedido_entregue` do rastreio (`scheduled_messages`, pelo número AN-xxxxx) | 2.1 na entrega: "Leia antes de abrir", um bloco de modo de uso por produto do pedido, com quanto o estoque dura · 2.2 +10d: o complemento certo para o produto (só se a pessoa ainda não tem) · 2.3 +15d: avaliação |
| Recompra (calculada, por produto) | mesma entrega | Um par de avisos para cada data de término: 3.1 alguns dias antes de acabar (5, ou 3 para quem dura até 12 dias) · 3.2 3 dias depois. Produtos que acabam até 10 dias depois do primeiro vão juntos; o que acaba bem depois ganha o próprio aviso (ex.: 1 Ômega + 2 ImunoFosfo = aviso do Ômega no dia 26 e do ImunoFosfo no dia 56). Link do checkout já com os itens do aviso. Cancela só se a pessoa comprou de novo algum produto daquele aviso |
| VIP | 3º pedido | 5.1, 3 dias depois do pedido |

**Cálculo da duração** (`email_produtos`, base da Serena): unidades × cápsulas do frasco (lidas da variante,
"90 Caps") ÷ dose diária, contando do dia seguinte à entrega. ImunoFosfo 3/dia (90 = 30 dias), Diabetes 2/dia
(60 = 30), Liquid 10 dias por frasco, Kids 30, Ômega 2/dia, D3 2/dia, D3 50.000 1 por semana (84 dias),
Própolis 2/dia, Creatina 100 doses, Life Gummy 2/dia, Vitamins 3/dia, Life Hair 2/dia. ImunoPet (dose pelo peso),
Healing e Life Protein não têm recompra calculada. Pedido sem aviso de entrega em 14 dias: entrega estimada em
pedido + 7 dias (só recompra/complemento/avaliação; o guia não sai). Pedidos dos últimos 45 dias antes do início
entram só na recompra (quem comprou antes de desligar o Klaviyo também recebe o aviso de reposição).

**Frequência** (`email_proximos`): no máximo 1 email por pessoa por rodada; intervalo mínimo desde o último email
(serviço 18h, marketing 44h). O que não pode sair é adiado, não perdido (5 adiamentos = pula). Marketing só das 8h
às 21h, serviço das 7h às 22h. Quem recebeu 5+ emails em 60 dias sem abrir nem clicar nenhum para de receber
marketing (`sem engajamento`).

**Quem recebe:** serviço (carrinho, guia na entrega, recompra) vai para quem não se descadastrou, não deu bounce nem
reclamou, mesmo sem inscrição de marketing; o resto continua exigindo inscrito + `SUBSCRIBED`.

**Variáveis:** `email_fila.dados` guarda as variáveis de cada envio (`{{ guia_produtos }}`, `{{ carrinho_itens }}`,
`{{ recompra_url }}` etc.), trocadas por `email_preencher`. A prévia do painel usa os dados do último envio do
modelo ou `email_templates.exemplo`.

**Sincronização:** pedidos agora trazem itens (`quantity`, `variant{id title}`); `sync_pedidos_desde` voltou para
01/11/2025 para carregar o histórico de 12 meses (quem já tem o complemento, recompra dos recentes). Nenhum email
sai para pedido antigo além da recompra descrita acima.

**Utilitário SQL:** `AN - Email SQL Admin` ganhou o nó "Baixar SQL": pinData `{url}` baixa um JSON `{q}` (usado
para subir SQL grande via asset temporário do tema, apagado logo depois).

Modelos aposentados (ficam em `email_templates`, sem uso): 1.2, 2.1-pos-compra … 2.6, 3.1-recompra-imunofosfo.
Klaviyo: carrinho adicionado (`Ukh7KK`) e checkout abandonado (`S66Gjr`) pausados em 10/11 à noite. Continuam
ligados só navegação abandonada, assinatura ativada e cobrança falhou.

## Navegação abandonada própria (10/11/2026, noite)

Pedido do Jaderson. Antes só existia no Klaviyo (o rastreio do site era dele).
- **Site:** snippet `site/an-nav.liquid` instalado no tema publicado (`snippets/an-nav.liquid`, chamado no fim do
  `layout/theme.liquid`; backup do layout no scratchpad). Só registra **visitante identificado**:
  `e:` clicou num email nosso (o despachante põe `?an_e=<fila>-<assinatura>` em todo link do site),
  `c:` cliente logado (id assinado no Liquid com `hmac_sha256` e o `nav_segredo`), `f:` preencheu formulário com email.
  Visitante anônimo não manda nada. No repositório o segredo é o marcador `NAV_SEGREDO`; o valor fica só no tema e em
  `email_config.nav_segredo`.
- **n8n:** `[Email] Navegacao (site)` (`sWxSxmEAzH8f3tc7`, `navegacao.workflow.js`), POST `/webhook/an-nav`
  (form-urlencoded `d=<json>`, via sendBeacon) → `email_nav_registrar` → `email_nav_eventos` (no máximo 60 eventos
  por pessoa por hora; apaga com 45 dias).
- **Banco:** `navegacao.sql` + passo 5b do `email_agendar`: viu produto há mais de 2h (e menos de 2 dias), não comprou
  nem abriu carrinho depois, não recebeu o 4.1 em 7 dias → 4.1 com o produto mais visto (foto, preço, por que,
  "Quero o meu" direto no checkout e "Ver detalhes") e até 2 outros que olhou. É marketing: só para inscrito.
- Testado: página de produto real sem identificação não envia nada; identificada envia o produto; o segredo não aparece
  no HTML; sem erro de JS.
- O fluxo de navegação do Klaviyo (`VdxU27`) continua ligado por enquanto. Pausar quando o nosso já estiver
  identificando gente suficiente (ver no painel).

## Emails com domínio digitado errado (10/11/2026, noite)

Caso: `vitalinarocha67@gamil.vom` (carrinho) deu bounce no 6.1. ~2% dos emails do checkout têm erro no domínio
(gamil, gmsil, hormail, gmail.comm, gmail.com.br, yahoo.com.bt...).
- `corrigir-email.sql`: `email_corrigir(email)` corrige só provedor conhecido (gmail, hotmail, outlook, yahoo, icloud)
  e final de domínio claramente errado (.vom, .con, .cim...). Domínio desconhecido fica igual.
- `email_proximos` manda para `email_corrigir(f.email)`; email que nem corrigido é válido (ou domínio de teste como
  example.com) vira `pulado / email invalido`. Os 6.2 e 6.3 da Vitalina saem para @gmail.com.
- Checkout: `automations/checkout/patches/email-sugestao.html` mostra "Você quis dizer ...?" com botão Corrigir
  embaixo do campo. Publicado em 10/11 às 16h34 (BRT) com autorização do Jaderson; o deploy guardou a versão de
  09/11 23:57 (rollback: `{"action":"rollback"}` no `/webhook/checkout-deploy`). Conferido no checkout real.
- Cuidado ao testar o checkout real: ele grava o carrinho assim que o email é válido. O teste de 10/11 criou 3
  carrinhos falsos (apagados) e reativou o carrinho real da Vitalina (restaurado para `abandonado`) antes de qualquer
  mensagem sair. Testar com o HTML servido localmente (rotas interceptadas) ou apagar os carrinhos logo depois.

## Campanha Esquenta Black Friday (agendada em 10/11/2026)

- Modelo `7.1-campanha-esquenta` (`padrao.py`): arte 06 (caixa da America Nutrition) no topo, convite "sua Black Friday
  começa antes", 3 passos, prazo 26/11, vitrine com 4 produtos, Serena. Não mostra o percentual (igual ao site): o botão
  abre o WhatsApp da Serena (`wa.me/13472225493`) com "Quero participar do Esquenta Black Friday 🔥", que é o que
  faz o cadastro. Link secundário para `/pages/esquenta`. Cópia de teste mandada para contato@americanutrition.com.
- Público (`campanha-esquenta.sql`, `email_campanha_esquenta()`): 8.592 inscritos com consentimento, sem quem já está
  na landing do Esquenta, sem domínios de teste/da casa. Ordem: compra mais recente primeiro; quem nunca comprou por
  último. Ondas às 10h: 11/11 250 · 12/11 450 · 13/11 750 · 14/11 1.150 · 15/11 1.900 · 16/11 1.900 · 17/11 2.192.
- Aquecimento: `envio_rampa` (limite por dia, vale sobre `envio_limite_dia`): 300, 500, 800, 1.200, 2.000, 2.000,
  2.500 e 1.000 em 18/11 para sobras.
- Freio: com 50+ envios nas últimas 24h, bounce permanente acima de 5% ou reclamação acima de 0,3% segura todo o
  marketing (o serviço continua). Quem se cadastra na landing antes de receber é pulado.
- Cancelar as ondas que faltam: `update email_fila set status = 'pulado', motivo = 'campanha cancelada'
  where slug = '7.1-campanha-esquenta' and status = 'pendente'`.

## Próximos passos
3. Assinatura no sistema próprio; conferir sobreposição do carrinho com os fluxos de carrinho do Klaviyo e pausá-los; depois, cancelar o Klaviyo.
