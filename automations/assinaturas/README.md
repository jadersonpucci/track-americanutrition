# Assinaturas

## Antecipação pula a próxima renovação (27/10/2026)

**Regra do Jaderson:** quando o assinante antecipa, ele paga agora e a próxima cobrança da assinatura não
acontece. A renovação seguinte cai um ciclo depois.

### O problema

A Serena gera a antecipação como um PIX ou boleto avulso, com o cupom `ASSINANTE` (adendo de 15/09). Nada ligava
esse pedido à assinatura, e isso dava dois tipos de erro:

- **Cartão:** a assinatura cobrava de novo na data do ciclo. O Carlos Eduardo (AN-16238) antecipou em 26/10 e
  seria cobrado de novo em 29/10.
- **PIX:** o PIX automático do ciclo ficava `aguardando`, mandava lembrete e **pausava** a assinatura de quem já
  tinha pago. Aconteceu com a Claudia (AN-15738), a Marta (AN-16193) e o Valdecir (AN-16182, que seria pausado em
  28/10).

### O robô

Workflow **AN - Assinatura Antecipacao (pular ciclo)** (`lTFoEnXNyHleQR7z`), roda a cada 30 min. O código fica em
[`antecipacao-pular-ciclo.js`](antecipacao-pular-ciclo.js); as chaves reais ficam só no n8n.

Ele pega os pedidos pagos com a tag `cupom:ASSINANTE` dos últimos dias que ainda não estão ligados a uma cobrança e
acha a assinatura pelo telefone (8 últimos dígitos), CPF ou e-mail. Depois decide pelo estado do ciclo atual
(`proximo_ciclo`):

| Situação | O que faz |
|---|---|
| O ciclo atual tem cobrança aberta (`aguardando`, `falhou`, `expirado`) | O pedido paga esse ciclo. A cobrança vira `pago` com o pedido. Se a assinatura estava pausada, volta a ficar ativa. |
| Sem cobrança e o ciclo vence em até 25 dias | É antecipação. Grava o ciclo como `pago` pelo pedido. |
| O ciclo vence em mais de 25 dias | Parece compra extra. Não mexe e avisa no Telegram. |
| Há cobrança de cartão em andamento, ou a assinatura não foi achada (ou foram achadas duas) | Não mexe e avisa no Telegram. |

Nos dois primeiros casos, o robô também atualiza a assinatura: `proximo_ciclo += ciclo_dias`, `renovacoes + 1` e
`tentativas = 0`. A cobrança gravada leva o `pedido_shopify_id` do pedido. É isso que impede o robô de processar o
mesmo pedido duas vezes, e é o que faz os motores de cartão e de PIX pularem o ciclo.

O aviso vai para o Telegram, no tópico 98 (assinaturas).

### Configuração (`serena_config`)

| Chave | Valor | O que controla |
|---|---|---|
| `assinatura_antecipacao` | `off`, `simulacao` ou `on` (está `on`) | Em `simulacao`, nada é gravado e só sai o aviso no Telegram. |
| `assinatura_antecipacao_dias` | `3` | Quantos dias para trás o robô olha. Um número maior serve para repescar casos antigos. |

### A Serena

Adendo em `serena_config.system_prompt` (o texto está em `../serena-whatsapp/nodes/serena-config-adendos-prompt.md`):
ao antecipar, ela diz ao cliente a data nova da próxima renovação.

### Ajustes feitos à mão em 27/10/2026

- **Carlos Eduardo (cartão):** ciclo de 29/10 marcado como pago pelo AN-16238; próxima cobrança em 28/11.
- **Valdecir (PIX):** ciclo de 23/10 marcado como pago pelo AN-16182; próxima renovação em 22/11.

Reativadas com o OK do Jaderson (repescagem do próprio robô, com `assinatura_antecipacao_dias = 40` por uma rodada):

- **Marta:** ciclo de 18/10 pago pelo AN-16193; ativa, próxima renovação em 17/11.
- **Claudia:** ciclo de 01/10 pago pelo AN-15738; ativa, próxima renovação em 31/10.

Fica para a equipe conferir:

- **Edelmira:** pediu o AN-15752 em 01/10 e tem cobrança paga em 08/10. Vale conferir se pagou duas vezes.

## 10% já na primeira compra: nova regra de elegibilidade (27/10/2026)

**Como era:** quem já tinha assinado alguma vez na vida (estava em `assinatura_elegibilidade`) pagava cheio na
primeira compra de uma nova assinatura, e os 10% só entravam a partir da 2ª entrega.

**Como ficou (decisão do Jaderson):** os 10% valem já na primeira compra para todo mundo. Ficam de fora só:

- quem **tem assinatura ativa** (status `ativa` ou `inadimplente`), porque está fazendo uma segunda assinatura;
- quem **pagou alguma assinatura nos últimos 60 dias**.

Essa trava evita o "assina, pega o desconto, cancela e repete".

A regra está na função SQL `assinatura_elegivel_desconto(cpf, whatsapp, email)`, em
[`assinatura_elegivel_desconto.sql`](assinatura_elegivel_desconto.sql). Ela casa o cliente por CPF, pelos 11
últimos dígitos do WhatsApp ou pelo e-mail. Dois workflows usam a função:

- **AN - Assinatura Elegivel (pre-check)** (`COYdlYOezv9ARE0x`): é o que o checkout consulta para mostrar o
  desconto.
- **AN - Assinatura Criar (Checkout)** (`ZkCJD7EQcD77KBHm`), nó "Checar Elegibilidade": é o valor que
  efetivamente é cobrado. O PIX inicial herda a decisão pelo `assinatura_dados.dp` do metadata.

A tabela `assinatura_elegibilidade` continua sendo gravada, mas não decide mais nada.

**Efeito:** dos 134 clientes que já assinaram alguma vez, 28 voltam a ter os 10% na primeira compra.

**No checkout:** quem não tem direito vê que esta compra sai sem desconto porque já tem uma assinatura ativa ou
pagou uma nos últimos 60 dias, e que os 10% valem a partir da 2ª entrega.
