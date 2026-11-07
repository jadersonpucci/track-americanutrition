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
