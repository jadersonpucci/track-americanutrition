# Checkout US (Stripe → Shopify → etiqueta)

Workflow n8n `Jh6gs4OwUo7kUS7p` — *Checkout US — Stripe Webhook*.
`payment_intent.*` do Stripe → `carrinhos_us` → pedido na Shopify com a tag `USA` →
`fulfillmentOrderMove` para o local **Estados Unidos** (`gid://shopify/Location/73805234348`,
Nokomis/FL) → compra da etiqueta pelo Shopify Shipping → aviso no WhatsApp do Paulo com o PDF.

Todos os pedidos usam a variante única `gid://shopify/ProductVariant/46382792933548`
(ImunoFosfo (USA)). Caixa padrão 22 × 13,7 × 4,2 cm, 50 g vazia, 0,32 kg por frasco.

Nós versionados aqui:

| Arquivo | Nó no n8n |
| --- | --- |
| `nodes/etiqueta-us.js` | `Etiqueta US` |
| `nodes/msg-aviso-us.js` | `Msg Aviso US` |

## Envio internacional: código SH e país de origem (22/09/2026)

Pedido `AN-15573` (Valéria, Paris/FR) foi o primeiro envio **internacional** saindo do
local dos Estados Unidos. A compra da etiqueta falhou com:

```
Missing harmonized system code. | Missing country of origin.
```

Para envio doméstico nos EUA a USPS não pede declaração alfandegária, então os pedidos
anteriores passaram sem esses campos. Para fora do país a Shopify exige, em cada
`inventoryItem`, o **código do Sistema Harmonizado** e o **país de origem** — e ela lê isso
da ficha do produto, não do payload da etiqueta.

O que foi feito:

- `InventoryItem/48477762388140` (ImunoFosfo (USA)) agora tem `harmonizedSystemCode = 210690`
  e `countryCodeOfOrigin = US`. **2106.90** é "food preparations not elsewhere specified or
  included", a posição dos suplementos alimentares (na tarifa americana completa,
  2106.90.9998); a Shopify aceita os 6 dígitos, que valem internacionalmente. Origem `US`
  porque o ImunoFosfo é fabricado nos EUA.
- O nó `Etiqueta US` passou a checar isso **antes** de comprar: quando o país de entrega não
  é os Estados Unidos, ele lê o `inventoryItem` da variante e preenche os padrões
  (`HS_PADRAO = '210690'`, `ORIGEM_PADRAO = 'US'`) se algum estiver vazio, em vez de deixar a
  etiqueta falhar. Só preenche o que está faltando; nunca sobrescreve um código já cadastrado.
- Quando preenche, o aviso do Paulo ganha a linha `🛃 dados alfandegários preenchidos
  automaticamente (HS ..., origem ...) - confira na ficha do produto`, para ninguém descobrir
  a classificação errada só na alfândega.

Classificação fiscal é responsabilidade do exportador: 2106.90 é o código padrão do setor
para suplemento, mas produto novo com outra natureza precisa do código próprio
(ex.: suplemento para pets é 2309.90, proteína em pó é 2106.10).

### Preenchimento de todos os produtos (22/09/2026)

Para não depender da rede de segurança, os 24 `inventoryItem` da loja receberam código SH e
origem `US` (todos são fabricados nos EUA; as fichas do Green Propolis e do Carvão Vegetal
dizem "produzido/encapsulado nos Estados Unidos"):

| Produtos | Código SH |
| --- | --- |
| Suplementos humanos (ImunoFosfo e linha, Ômega 3, D3, Propólis, Creatina, Life Gummy, Vitamins, Life Hair, Carvão) | `210690` |
| ImunoPet (líquida e cápsulas) | `230990` — preparações para alimentação animal |
| Life Protein | `210610` — concentrados de proteína |

Se algum produto novo tiver natureza diferente, cadastre o código dele na ficha antes do
primeiro envio internacional; a rede de segurança só preenche o padrão de suplemento.

### Etiqueta do AN-15573

Emitida em 22/09/2026 depois da correção. Saiu pela **UPS** (`1Z212B906703820225`), com o
formulário alfandegário anexo — a Shopify gerou os dois PDFs (etiqueta + customs form).

Ponto aberto: o cliente pagou *USPS First Class Package International Service* no checkout,
mas a compra não informa preferência de transportadora, então a Shopify escolheu a UPS. O
`ShippingLabelPurchaseInput` aceita `preferredRateSelection { carrierCode, serviceCode }`
(`usps`, `ups_shipping`, `dhl_express`...). Passar `carrierCode` derivado do serviço pago
alinharia o custo com o que o cliente pagou — não foi implementado ainda porque, sem o
`serviceCode` exato, preferir a USPS pode cair numa modalidade mais cara dela.
