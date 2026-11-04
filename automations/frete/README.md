# Frete real no Painel de Vendas

Workflow n8n **Frete Envia Reconciliacao** (`SFKUuIXrSv1zV0El`), cron de 1h. Código do nó
"Casar e Gravar Frete" em [`casar-gravar-frete.js`](casar-gravar-frete.js). As chaves reais ficam só no n8n;
aqui aparecem como `SUPABASE_SERVICE_KEY` e `<FRENET_TOKEN>`.

Grava `vendas.frete_real` (custo da etiqueta) e `vendas.frete_origem` nas vendas dos últimos 45 dias que ainda
estão com frete 0 (sem Mercado Livre e sem edição manual).

| `frete_origem` | De onde vem o valor |
|---|---|
| `envia` | Custo real da etiqueta no Envia (`queries.envia.com/v4/orders`, `shipment.total_cost`). |
| `frenet_cotacao` | **Estimativa.** Etiqueta emitida pela Frenet, ou código dos Correios que não está no Envia. |

## Frenet (26/10/2026)

Desde 22/10, parte das etiquetas sai pela Frenet, e essas vendas ficavam com frete 0 no painel. A API da Frenet que
lista os envios com o valor cobrado (whitelabel `/v1/orders`, `/wallet/demonstrative`) exige `x-partner-token`, que
ainda não temos (sem ele dá 401).

Até lá, o custo é a **cotação da própria Frenet** (`POST api.frenet.com.br/shipping/quote`, header `token`):

- **Serviço:** o mesmo da etiqueta. Código `AP...` usa PAC (03298); `AE`, `AD` e os demais usam SEDEX (03220).
- **Origem e destino:** do CD em Santos (CEP 11060230) para o CEP do pedido na Shopify.
- **Peso:** 0,32 kg por frasco + 0,05 kg de caixa.
- **Dimensões:** 22 x 13,7 x (4,2 x qtd) cm.
- **Valor declarado:** o subtotal, com mínimo de R$ 24.

Ficam de fora os pedidos fora do Brasil e os de USPS/UPS/FedEx/DHL, cuja etiqueta é da Shopify Shipping e não tem
custo na API.

Na primeira rodada, 44 vendas receberam frete pela cotação. A média foi R$ 15, de R$ 6,13 (SEDEX dentro de SP) a cerca
de R$ 43 (Norte).

Quando a Frenet liberar o token de parceiro, troque a cotação pelo valor cobrado e regrave as vendas com
`frete_origem = 'frenet_cotacao'`.

## Cotação do checkout pela Frenet, +2% (04/11/2026)

O `POST /webhook/frete-cotacao` (workflow **Envia.com — Cotação de Frete**, `lszlpy1Pl4dnHW2w`), usado pelo checkout,
passa a cotar pela **Frenet** (`api.frenet.com.br/shipping/quote`). Código do nó "Normalizar Opcoes + Regra Gratis"
em [`cotacao-checkout-normalizar.js`](cotacao-checkout-normalizar.js) (token como `<FRENET_TOKEN>`).

- Todo valor de frete leva **+2%** (`MARGEM`), arredondado no centavo. Frete Grátis (R$ 250+) continua R$ 0.
- Ficam Correios (SEDEX e PAC) e J&T, como era na Envia. Jadlog vem da Frenet e fica de fora.
- A Envia continua sendo chamada e só entra (também com +2%) se a Frenet falhar ou não devolver opção.
- Mantidos: sem SEDEX Hoje, sem J&T para o Pará, +2 dias no prazo exibido ("Renomear JT"), ordenação por prazo.
- O servidor não recalcula o frete: o valor escolhido no checkout vai para o pedido.
- As ferramentas da Serena (Calcular Frete, Consultar Frete Região) ainda cotam pela Envia.
