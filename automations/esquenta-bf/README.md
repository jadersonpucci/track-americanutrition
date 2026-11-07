# Esquenta Black Friday (07 a 26/11/2026)

Desconto exclusivo para quem se cadastra com a Serena no WhatsApp: **10% OFF com 1 unidade, 15% OFF a partir
de 2 unidades**, em todos os produtos, uma vez por cliente, até 26/11 às 23h59.

## Peças

| Peça | Onde | O que faz |
| --- | --- | --- |
| Popup do site | `automations/site/an-esquenta-popup.liquid` → `snippets/an-esquenta-popup.liquid` do tema publicado, chamado no `layout/theme.liquid` | Botão abre o WhatsApp da Serena (+1 347 222-5493) com "Quero participar do Esquenta Black Friday 🔥". Liga com o metafield da loja `an_site.esquenta_popup = on`; prévia com `?esquenta=preview`; sai sozinho depois de 26/11. Aparece depois de 6 s (ou ao sair da página no computador), 1 vez a cada 2 dias; quem clicou não vê de novo. Eventos no Pixel: `EsquentaPopupView` e `Contact`. |
| Cadastro | Workflow `[Serena] Esquenta Black Friday (cadastro)` (`ZlZIbmHyCkAk9zB5`), `cadastro.sql` | A cada 1 min, quem escreveu "esquenta" para a Serena entra em `esquenta_bf` e ganha a nota da equipe "esquenta black friday". Se a mensagem traz o cupom de um afiliado (texto dos representantes), grava a indicação. |
| Serena | Adendo de 06/11 em `serena_config.system_prompt` (`adendo-serena.md`) | Confirma o cadastro sem mandar link, explica a regra e, na compra, aplica o cupom certo pela quantidade (link, PIX ou boleto). |
| Cupons | Shopify | `ESQ10-U5E` (10%, sem mínimo) e `ESQ15-U5E` (15%, mínimo de 2 unidades). Uma vez por cliente, sem somar com outro cupom nem com o PACK 3+/6+ (a Shopify aplica o maior). Fim: 26/11 23h59. Os códigos não são divulgados: vão dentro do link da Serena. |

## Testes (06/11)

- Cálculo da Shopify (`carrinho-calcular`): 1 un + ESQ10 = 10%; 1 un + ESQ15 = sem desconto; 2 un + ESQ15 = 15%;
  3 e 6 un = 15% (vence o PACK).
- Chat de teste da Serena: "Quero participar do Esquenta Black Friday" → confirmou o cadastro, explicou a regra,
  sem link. "Quero 2 frascos do ImunoFosfo 90" → link com `items=…:2&discount=ESQ15-U5E`. O cadastro de teste
  entrou em `esquenta_bf` com a nota e foi apagado depois.

## Atenção

- O cupom do Esquenta substitui o cupom de afiliado no link, então a comissão do representante não é gerada
  pelo cupom. A indicação fica registrada em `esquenta_bf.indicacao` para acerto manual ou para ligar a
  atribuição depois.
