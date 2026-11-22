# Black Friday 2026

Decisões do Jaderson (22/11/2026):

| Item | Decisão |
| --- | --- |
| Período | quinta 26/11 20h (acesso antecipado dos cadastrados do Esquenta) até segunda 30/11 23h59 (Brasília) |
| Desconto | progressivo por frascos no carrinho: 1 = 20%, 2 = 30%, 3 = 35%, 4+ = 40% |
| Soma com outros descontos | não. Nenhum cupom ou desconto atual soma com o da Black |
| Cupom de afiliado | vale com 0% (só marca a venda para a representante) |
| Comissão | metade da taxa do programa sobre o valor pago, sem o corte por desconto (30% → 15%) |
| Paulo | só tráfego pago e sem representante (regra já em vigor desde 01/09/2026) |
| Custo | R$ 70 por frasco de ImunoFosfo 90 |
| Canal | tudo pelo checkout próprio (checkout.americanutrition.com) |

## O que está configurado

- **Shopify:** 4 descontos automáticos agendados ("Black Friday 20/30/35/40% OFF", ids 1514985029804, 1514985062572,
  1514985095340, 1514985128108), 26/11 23:00Z a 01/12 02:59:59Z, mínimo de 1/2/3/4 itens, mesmos produtos do PACK +
  ImunoFosfo Liquid (sem o ImunoFosfo USA), sem combinar com outros descontos de produto/pedido. O PACK 3+/6+ continua
  ligado (pausar foi recusado); como não combina, a Shopify aplica o maior, que é o da Black.
- **Checkout próprio:** calcula pelo carrinho da Shopify (`/webhook/carrinho-calcular`), então os descontos automáticos
  entram sozinhos. Teste 22/11: 6 frascos + PROMO5 → aplicou o PACK 6+ (10%), o maior.
- **Cupons:** nó `Black: cupons` no `Shopify — Validar Cupom` (`checkout/nodes/cupom-black-friday.js`) + verificador
  `POST /webhook/afiliado-cupom` (`t3JGmaZZc4OeUzPo`). Na janela: cupom de afiliado = 0%; outros = recusados com
  "Na Black Friday o desconto já está aplicado no carrinho e não soma com cupons.". Teste com `teste_black: 'sim'`.
- **Comissão:** nó `Black: comissão metade` no `Afiliados - Registrar Comissão` (`afiliados/black-comissao-metade.md`).
- **Nome real do desconto no pedido:** nó `Nome do Desconto` no `Pagar.me — Confirmação Pago → Shopify`
  (`checkout/nodes/confirmacao-nome-desconto.js`), entre `Truncar Tags (max 40)` e `Criar Pedido Shopify`. O pedido
  saía com "DESCONTO" quando o desconto era automático; agora grava o nome que a Shopify aplicou no carrinho
  ("PACK 6+", "Kit Mensal", "Black Friday 40% OFF"). Cupom de verdade continua com o próprio código. A representante
  segue identificada pela anotação "Cupom usado". Testes (22/11) contra o cálculo real: AN-16725 → "Kit Mensal";
  6 frascos → "PACK 6+"; ESQ15-U5E → mantém; PROMO5 + 6 frascos → "PACK 6+"; valor que não bate → mantém "DESCONTO".

## Comunicação (textos aprovados em 22/11/2026)

- **E-mails** (`email-marketing/ses/campanha-black.sql`, modelos `7.2-black-antecipado` e `7.3-black-friday` em
  `padrao.py`): 162 cadastrados do Esquenta (bf + landing) na qui 26/11 20h; 8.442 inscritos na base, 4.700 na sex 27/11 8h
  e 3.742 no sáb 28/11 10h (limite 5.000/dia). Botão para `/products/imunofosfo` com utm `black-friday-2026`.
  Cancelar o que falta: `update email_fila set status = 'pulado', motivo = 'campanha cancelada' where ref = 'black-2026' and status = 'pendente'`.
- **Grupos** (`broadcasts_grupos` 263 e 264, avisos 1 e 2, só texto): abertura sex 27/11 8h (com menção a todos) e
  "último dia" seg 30/11 10h. Cancelar: `update broadcasts_grupos set status = 'cancelado' where id in (263, 264)`.
- **Serena:** `adendo-serena.md` no `system_prompt` (vale de 26/11 20h a 30/11 23h59; antes, avisa que começa quinta 20h).
- **Representantes:** `texto-representantes.md` (o Jaderson envia).
- Nada sai pelo WhatsApp da Serena de forma proativa (restrição do número).
