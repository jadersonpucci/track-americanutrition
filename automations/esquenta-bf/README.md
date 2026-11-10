# Esquenta Black Friday (07 a 26/11/2026)

Desconto exclusivo para quem se cadastra com a Serena no WhatsApp: **10% OFF com 1 unidade, 15% OFF a partir
de 2 unidades**, em todos os produtos, uma vez por cliente, até 26/11 às 23h59.

## Peças

| Peça | Onde | O que faz |
| --- | --- | --- |
| Slider do site | `automations/site/an-esquenta-popup.liquid` → `snippets/an-esquenta-popup.liquid` do tema publicado, chamado no `layout/theme.liquid`; imagem `assets/an-esquenta-bf.webp` (Higgsfield, cópia em `automations/site/`) | Card no canto inferior esquerdo, **sem mostrar desconto** ("Acesso antecipado à Black Friday"), com contagem regressiva até 26/11, borda em brilho, brasas e botão pulsando. O botão abre o WhatsApp da Serena (+1 347 222-5493) com "Quero participar do Esquenta Black Friday 🔥". Entra depois de 5 s; fechar recolhe numa etiqueta "🔥 Esquenta" na lateral; volta aberto no máximo 1 vez a cada 2 dias; quem clicou não vê de novo. Liga com o metafield da loja `an_site.esquenta_popup = on`; prévia com `?esquenta=preview`; sai sozinho depois de 26/11. Eventos no Pixel: `EsquentaPopupView` e `Contact`. |
| Cadastro | Workflow `[Serena] Esquenta Black Friday (cadastro)` (`ZlZIbmHyCkAk9zB5`), `cadastro.sql` | A cada 1 min, quem escreveu "esquenta" para a Serena entra em `esquenta_bf` e ganha a nota da equipe "esquenta black friday". Se a mensagem traz o cupom de um afiliado (texto dos representantes), grava a indicação. |
| Serena | Adendo de 06/11 em `serena_config.system_prompt` (`adendo-serena.md`) | Confirma o cadastro sem mandar link, explica a regra e, na compra, aplica o cupom certo pela quantidade (link, PIX ou boleto). |
| Cupons | Shopify | `ESQ10-U5E` (10%, sem mínimo) e `ESQ15-U5E` (15%, mínimo de 2 unidades). Uma vez por cliente, sem somar com outro cupom nem com o PACK 3+/6+ (a Shopify aplica o maior). Fim: 26/11 23h59. Os códigos não são divulgados: vão dentro do link da Serena. |

## Testes (06/11)

- Cálculo da Shopify (`carrinho-calcular`): 1 un + ESQ10 = 10%; 1 un + ESQ15 = sem desconto; 2 un + ESQ15 = 15%;
  3 e 6 un = 15% (vence o PACK).
- Chat de teste da Serena: "Quero participar do Esquenta Black Friday" → confirmou o cadastro, explicou a regra,
  sem link. "Quero 2 frascos do ImunoFosfo 90" → link com `items=…:2&discount=ESQ15-U5E`. O cadastro de teste
  entrou em `esquenta_bf` com a nota e foi apagado depois.

## Comissão dos representantes (atribuição automática, 07/11)

O link da Serena leva o cupom do Esquenta, que é da casa. Para a venda não se perder:

1. O texto dos representantes pede para o cliente mandar "Quero participar do Esquenta Black Friday – SEUCUPOM".
   O cadastro grava o representante em `esquenta_bf.indicacao` e o cupom dele em `esquenta_bf.indicacao_cupom`.
2. No `Afiliados - Registrar Comissão` (`PNAFMdGMpTr8GSfU`), o nó novo **Esquenta: Cupom do Representante**
   (`nodes/comissao-esquenta-representante.js`) roda antes do `Registrar Conversao`: se o pedido usou ESQ10/ESQ15
   e o telefone (DDD + 8 últimos dígitos, tolera +55 e o 9) está em `esquenta_bf` com indicação, o cupom do
   representante entra no início de `discount_codes` com valor 0 e o `resolver_afiliado` dá a venda para ele.
3. A regra de **cap em promoção da casa** continua valendo, como em toda promoção: comissão = % do programa − %
   do desconto. Programa de 30% (QualiVita, Vix) fica com 15% no pedido de 2+ unidades e 20% no de 1 unidade;
   programa de 10% zera com o desconto de 15%.

## No ar (07/11/2026)

Slider ligado às 23h31 de 06/11 (`an_site.esquenta_popup = on`). Lista começou vazia; as sessões do chat de teste
(`session_site` com `teste-`) não entram no cadastro.

## Landing de cadastro e post nos grupos de avisos (09/11)

- **Página** `americanutrition.com/pages/esquenta` (Shopify page 143119646892, `templateSuffix: esquenta`), com o template
  `automations/site/page.esquenta.liquid` (`{% layout none %}`, sem header/rodapé da loja) e a imagem
  `assets/an-esquenta-landing.webp` (Higgsfield, 1:1). Pede nome, WhatsApp (máscara BR) e e-mail, com aceite LGPD.
  Não mostra desconto. Aceita `?ref=CUPOM` (vai na mensagem para a Serena, e o cadastro atribui o representante como
  no fluxo acima) e `utm_*`.
  **Clique do afiliado (09/11):** como a página usa `layout none`, o script de afiliados do `theme.liquid` não
  rodava e o `?ref=` não aparecia no painel do afiliado (0 cliques na landing até então). A página agora tem o mesmo
  bloco do tema: grava `an_aff` (prazo = janela do painel) e `an_ref` e loga o clique no `/aff-api`
  (`afiliado_cliques`). Respeita o modo sem afiliado (`an_noaff`). Não grava `an_cupom`, porque o cupom do Esquenta
  é exclusivo e vem pela Serena.
- **Workflow** `[Esquenta] Landing: leads` (`1m6U1d74zXfDEJsD`): `POST /webhook/esquenta-lead`
  `{nome, email, whatsapp, aceite, ref?, utm_*}`. Valida, grava em `esquenta_leads` (um por telefone; reenvio
  atualiza e soma `envios`), completa o e-mail do contato da Serena quando estiver vazio e devolve
  `{ok, whatsapp}` com o link `wa.me/13472225493` e a mensagem "Quero participar do Esquenta Black Friday 🔥 – REF".
  Erro de validação: HTTP 400 `{ok:false, erros:[...]}`. A página redireciona para o link (o site passa por
  `/url?q=`, que dá 302 para o wa.me). O cadastro no Esquenta acontece quando a pessoa envia a mensagem.
- **Post** `broadcasts_grupos` id 234: imagem `assets/an-esquenta-post.jpg` + legenda com o link da landing,
  `mencionar_todos = true`, avisos da comunidade 1 (`120363233277583685@g.us`) e 2 (`120363423321725793@g.us`),
  `enviar_em` 09/11/2026 10:00 (Brasília). Cancelar antes: `update broadcasts_grupos set status = 'cancelado' where id = 234`.
- Testado: POST válido 200, inválido 400, CORS ok; envio pelo navegador (celular) gravou e abriu o WhatsApp com o REF.
  Leads de teste (5511900000001 a 0003) apagados.

## Cupom do Esquenta não soma com outros cupons (09/11)

- **Shopify:** ESQ10-U5E e ESQ15-U5E com `combinesWith` todo `false` (pedido, produto e frete). Antes o frete
  podia combinar; agora nenhum outro desconto entra junto, nem o PACK 3+/6+ (vale o maior).
- **Checkout próprio:** o campo de cupom aceita vários códigos separados por vírgula (desconto + frete grátis +
  brinde). No `Shopify — Validar Cupom` (`rIOXH8eJm1Yb2t21`), o nó `Guardas (Meia-Noite + Esquenta exclusivo)`
  (`automations/checkout/nodes/cupom-guardas.js`) deixa só o cupom do Esquenta válido e marca os outros como
  inválidos ("não pode ser usado junto com outros cupons").
- Testado: `ESQ15-U5E` sozinho continua válido (15%). `ESQ15-U5E,IMUNOFOSFO` e `IMUNOFOSFO,ESQ10-U5E` deixam só o
  do Esquenta. `IMUNOFOSFO,PROMO5` segue como antes.

## Arte com toda a linha (09/11/2026)

A arte anterior mostrava só o ImunoFosfo, mas o Esquenta vale para todos os produtos. A arte nova é `esquenta-black-todos-produtos.jpg` (1080×1080), com os 15 produtos ativos da loja. Só fica de fora o ImunoFosfo USA, duplicado, e o Life Protein, com 2 unidades.

Como foi feita:
1. **Cenário:** gerado no Higgsfield (`gpt_image_2_6`), com pódio de 3 degraus azul-marinho, fogo e brasas, sem texto nem produto.
2. **Produtos:** os mockups da Shopify, com o fundo removido pelo `image_background_remover` do Higgsfield. São os rótulos reais, nada gerado por IA.
3. **Montagem:** em HTML (`arte-todos/arte.html`, com as posições em `layout.json`), fotografada com o Chromium (`node render.js 2 saida.png`). Texto em Montserrat, sem mostrar desconto.

`arte.html` usa como fundo o `bg1.png` (cenário do Higgsfield) e os recortes em `trim/`, que ficaram só no scratchpad. Para refazer, gere o cenário e os recortes de novo.

## Arte nova: caixa da America Nutrition (10/11/2026)

A arte só com o ImunoFosfo e depois a com toda a linha foram trocadas pela **06** da rodada com a identidade da marca
(escolha do Jaderson): cliente abrindo a caixa azul da America Nutrition (logo com as faixas vermelhas) com a linha
dentro e o selo "ESQUENTA BLACK FRIDAY". Gerada no Higgsfield (`gpt_image_2_6`, qualidade alta) com o logo e os
frascos reais como referência; ampliada para 2160 px.
- Landing (`assets/an-esquenta-landing.webp`, 1200×1200) e post (`assets/an-esquenta-post.jpg`, 1080×1080): a quadrada.
- Card do site (`assets/an-esquenta-bf.webp`, 960×542): versão larga da mesma cena, sem o texto do canto (o card
  tem o texto dele).
- Texto alternativo das duas imagens atualizado no tema (`templates/page.esquenta.liquid`, `snippets/an-esquenta-popup.liquid`).
- O post do dia 09/11 (`broadcasts_grupos` 234) já tinha saído com a arte anterior; o arquivo novo vale para um próximo post.
