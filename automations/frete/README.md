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
- 04/11/2026: a **Serena** (`/webhook/calcular-frete`, usado também pelo Gerar PIX e Gerar Boleto) passa a usar a
  mesma cotação do checkout: o nó "Formatar resposta" chama o `/webhook/frete-cotacao` (código em
  `automations/serena-whatsapp/nodes/calcular-frete-formatar-resposta.js`). Envia só de reserva, também com +2%.

## Horário de corte das 12h e data estimada (09/11/2026)

No "Renomear JT" da cotação (`lszlpy1Pl4dnHW2w`, [`cotacao-renomear-jt-prazo.js`](cotacao-renomear-jt-prazo.js)), que
vale para o checkout e para a Serena:

- **Corte às 12h (Brasília):** pedido em dia útil até 12h é postado no mesmo dia; depois das 12h, ou em sábado,
  domingo e feriado, é postado no próximo dia útil. Como o prazo da transportadora conta da postagem, depois do corte
  o prazo exibido ganha **+1 dia útil** (além dos +2 de sempre). O Frete Grátis mantém o texto "10 a 15 dias úteis".
- **Data estimada:** cada opção leva `entrega_ate` (AAAA-MM-DD) e `entrega_ate_txt` ("qui, 12/11"), contando só dias
  úteis (sem fim de semana e feriado nacional, mesma tabela do rastreio). A resposta leva também `postagem`,
  `postagem_txt` e `corte_12h`. O checkout ainda mostra só o prazo em dias; a data está disponível para exibir.
- Testado: ter 10h30 → posta hoje; ter 13h → posta qua (+1); sáb → posta seg; qui 19/11 à tarde → posta seg 23/11
  (20/11 é feriado). No ar às 9h40 de 09/11: prazos iguais (antes do corte) e datas preenchidas.

## Frete Grátis sempre mais lento que o pago (09/11/2026)

Quando o frete pago mais lento passa de **10 dias úteis** (já com os +2 e o corte das 12h), o Frete Grátis deixa de mostrar "10 a 15 dias úteis". Esse prazo ficava igual ou mais rápido que o pago.

Nesse caso ele passa a mostrar **(mais lento + 1) a (mais lento + 5) dias úteis**, contados como o pago, e a data estimada fica sempre depois da do pago mais lento.

O cálculo fica no nó "Renomear JT" (`cotacao-renomear-jt-prazo.js`). A opção grátis leva também `eta_ajustado_pago` com o prazo do pago usado como base.

Teste ao vivo, mesma cotação, às 10h de 09/11:

| Destino | Pago mais lento | Frete Grátis |
|---|---|---|
| Manaus | PAC, 22 dias | 23 a 27 dias |
| Macapá | PAC, 17 dias | 18 a 22 dias |
| São Paulo | PAC, 7 dias | continua 10 a 15 dias |
