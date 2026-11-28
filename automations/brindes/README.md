# Brindes

## Brinde pendente → pedido de bonificação automático (28/11/2026)

Workflow `[Brindes] Brinde pendente -> pedido de bonificacao` (`JCUNAiZTB65Mx9eH`), código em
[`brinde-pendente.workflow.js`](brinde-pendente.workflow.js). Pedido do Jaderson: brinde combinado com cliente não pode
passar batido.

**Como usar:** no cadastro do cliente na Shopify, colocar a tag `BRINDE PENDENTE: <qtd> <produto>`
(ex.: `BRINDE PENDENTE: 1 ImunoFosfo 90`) e escrever o motivo na nota do cliente.

**O que acontece no próximo pedido pago dele** (o fluxo roda a cada 15 min e olha pedidos pagos atualizados nas últimas 3 h):
1. Sai um pedido de R$ 0 com o produto, 100% de desconto, frete R$ 0, mesmo endereço e CPF, tags `BONIFICACAO`, `BRINDE` e
   `BRINDE DE: <pedido>`. A NF-e sai como remessa em bonificação (ver `automations/nfe/README.md`).
2. O pedido de venda ganha a tag `BRINDE INCLUIDO: <pedido do brinde>`.
3. A tag do cliente vira `BRINDE ENVIADO: ...` (não repete).
4. Aviso no Telegram (serena-alerta): "Brinde incluído... mandar JUNTO com o pedido X (mesma caixa)".

Produtos conhecidos (mapa `PRODUTOS` no nó Filtrar): `ImunoFosfo 90` → variante 44436756234412. Produto fora do mapa
ou erro na criação: só avisa no Telegram (1x por dia) para incluir à mão; a tag do cliente fica até resolver.

Primeiro caso: cliente do Esquenta (pedido AN-16608), tag colocada em 27/11/2026.
