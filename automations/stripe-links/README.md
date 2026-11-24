# Links de pagamento da Stripe → pedido na Shopify (24/11/2026)

Pedido do Jaderson: quem paga com **cartão internacional** e recebe **no Brasil** compra por link da Stripe
(`pay.imunofosfo.com`). O pagamento vira pedido pago na Shopify, com o endereço digitado no checkout, e segue o fluxo
normal do Brasil (Frenet, nota fiscal, avisos). Os links também podem ser criados pelo chat.

**Regras do Jaderson:**
- frete grátis a partir de R$ 250,00;
- CPF obrigatório;
- entrega só no Brasil.

## Workflows (n8n)

| Workflow | id | O que faz |
| --- | --- | --- |
| `Stripe \| API interna` | `vSEbXN4D7I0QmISU` | Ponte `POST /webhook/stripe-api-interna`. A chave fica só na credencial `Stripe Live`. Exige token interno, aceita só GET/POST e só os caminhos da lista: produtos, preços, links, fretes e webhooks; sessões de checkout só para leitura. |
| `Stripe \| Sync produtos Shopify` | `FgQPl2PZpKRY9nEU` | Diário às 05:10 BRT e pelo `POST /webhook/stripe-sync-produtos`. Cada variante ativa da Shopify vira produto na Stripe, com preço em BRL e `shopify_variant_id` no metadata. Preço mudou → preço novo e o antigo é arquivado. Produtos (USA) ficam fora. Código: [`nodes/sync-produtos.js`](nodes/sync-produtos.js). |
| `Stripe \| Criar link de pagamento` | `UB5FxiyKs4r4GWnL` | `POST /webhook/stripe-criar-link`. Corpo: `{ t, itens: [{ variant_id \| busca, qtd }], desconto_pct?, frete_centavos?, referencia?, desativar? }`. Código: [`nodes/criar-link.js`](nodes/criar-link.js). |
| `Stripe \| Link pago -> pedido Shopify` | `lnQrC2LxPhLch5cI` | Webhook da Stripe `we_1UfKOrAyjp16JvlhHtuPbQWd`, eventos `checkout.session.completed` e `async_payment_succeeded`. Código: [`nodes/link-pago-pedido.js`](nodes/link-pago-pedido.js). |

### Criar link
- **Item:** pela variante, ou por texto (`busca`). Se o texto bater em mais de um produto, o robô devolve as opções;
  por exemplo, "imunofosfo 90" pode ser a tradicional ou a vegana.
- **Desconto:** o link da Stripe não aplica cupom sozinho. Por isso o link sai com um preço novo, já descontado, e o
  preço cheio e o % ficam no metadata.
- **Frete:** subtotal ≥ R$ 250 usa a tarifa "Frete grátis" (`metadata.an = frete-gratis-br`, criada uma vez). Abaixo
  disso, o valor tem que vir em `frete_centavos`; sem ele, o robô recusa.
- **Checkout:** campo `cpf` numérico de 11 dígitos, obrigatório. Entrega só `BR`, telefone e endereço de cobrança
  obrigatórios, sem cupom de promoção.

### Link pago → pedido
1. **Leitura:** do evento só sai o id da sessão; o resto é lido de novo na Stripe. Só segue sessão de link de
   pagamento, paga e em `payment`.
2. **Trava:** `stripe_link_pedidos` tem `session_id` único. Evento repetido não cria um segundo pedido.
3. **Pedido na Shopify (`orderCreate`):**
   - pago, `gateway` Stripe, preço de cada item como foi pago;
   - frete "Frete Grátis" ou "Frete";
   - endereço de entrega e de cobrança iguais ao da entrega;
   - CPF no atributo `CPF` e no metafield `an_fiscal.cpf_cnpj`, que a Frenet lê;
   - tag `stripe-link`, `sourceName` `stripe-link`;
   - `sendReceipt: false`.
4. **Fora do automático:** entrega fora do Brasil, moeda que não é real ou produto sem `shopify_variant_id` não viram
   pedido. A Cris é avisada para criar à mão.
5. **Aviso:** a Cris (logística) sempre recebe WhatsApp pelo Samuel, com cliente, itens, endereço, CPF e o pedido
   criado ou o problema.

## Na Stripe em 24/11
- **Produtos:** 21 criados pelo sync.
- **Link do ImunoFosfo 180 do Jaderson** (`plink_1TjlcPAyjp16JvlhICfQaRQ0`, `…/28EbJ080s5ErbKL13t3VC0h`): continua no ar,
  porque estava sendo aberto pela cliente. Ganhou CPF obrigatório e entrega só no Brasil. O produto dele
  (`prod_UjE1CDGwTkcGZ3`) ganhou o `shopify_variant_id` do 180.
- **Link de teste de permissão** (`plink_1UfKLJ…`): desativado.

## Pendências
- **Permissão de preços:** a chave restrita da Stripe (final `VIW4`) não tem **Prices: Write**. Sem ela, link com
  desconto não sai, e o sync não consegue mudar preço de produto que já existe. O link sem desconto e a criação de
  produto funcionam.
- **Teste de ponta a ponta:** não foi feito. O primeiro pagamento real valida; a Cris recebe o pedido criado ou o erro.
