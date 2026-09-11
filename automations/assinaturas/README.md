# Assinaturas — renovação por PIX

Fontes dos nós do workflow **AN - Assinaturas Cron PIX** (n8n `VxyloA6hZtppGEja`).
Chaves reais só no n8n; aqui ficam placeholders.

## Como funciona o ciclo normal

Cron diário às 10h. Para cada assinatura com `metodo = 'pix'`, status `ativa` ou `inadimplente`,
sem `cancelar_no_fim` e com `proximo_ciclo <= hoje + 3`:

| Ação | Quando |
|---|---|
| `gerar` | não existe cobrança para o ciclo |
| `lembrete1` | venceu hoje e o lembrete 1 não foi enviado |
| `lembrete2` | venceu há 2 dias e o lembrete 2 não foi enviado |
| `pausar` | venceu há 5 dias e o PIX não foi pago |

O PIX é criado no Pagar.me com `metadata.tipo = assinatura_renovacao_pix`, que é o que o workflow
**AN - Assinatura PIX Confirmar** usa para marcar pago e avançar o ciclo. Sai com validade de 9 dias
(`expires_in: 777600`). O envio vai pelo Samuel, via `POST /webhook/wpp-avulso`, em duas mensagens:
a explicação e o código copia e cola sozinho, porque no WhatsApp copiar uma mensagem leva o texto todo.

Fidelidade: a cada 6ª renovação o valor cai 30% (`mes_premio`) e o frete fica grátis.
`desconto_proxima_pct` aplica um desconto pontual e é zerado depois de usar.

## Renovação sob demanda (11/09/2026)

**O problema:** o cron só olha `ativa` e `inadimplente`. Assinatura `pausada` nunca recebe PIX — e é
exatamente quem liga pedindo para renovar. Antes disso a única saída era mexer no banco na mão.

Caso real: **Marcelo José Voncik de Oliveira** (`5542999917390`), R$ 294,30, pagou em 20/07, o PIX de
22/08 não foi pago e a assinatura pausou sozinha em 27/08. Ele voltou em 11/09 querendo renovar.

**A solução:** um webhook no mesmo workflow, que gera o PIX de **uma** assinatura reaproveitando
`Montar Order PIX` → `Criar Order PIX` → `Pos Gerar`. Nenhuma outra assinatura é tocada.

```
POST /webhook/assinatura-pix-avulso
{ "t": "an-assin-7Wq3Xv", "assinatura_id": "<uuid>", "reativar": true, "ciclo_hoje": true }
```

| Campo | Efeito |
|---|---|
| `reativar` | volta a assinatura para `ativa` (quem pede renovação quer voltar a receber) |
| `ciclo_hoje` | realinha `proximo_ciclo` para hoje |

`ciclo_hoje` existe por uma razão concreta: o ciclo dele estava em 22/08, vencido há 20 dias. Sem
realinhar, ele pagaria hoje e a próxima cobrança cairia em 21/09, dez dias depois. Com o realinhamento,
paga hoje e a próxima é 11/10.

Travas, todas testadas antes de disparar de verdade:

- token errado → `{"erro":"token invalido"}`, sem tocar no Pagar.me
- `assinatura_id` que não é UUID → recusa
- assinatura que não é PIX, ou sem `pagarme_customer_id` → recusa
- `assinatura_config.pausar_todas` ligado → recusa, o avulso não furura a trava geral
- já existe cobrança **paga** para o ciclo → recusa, para nunca cobrar duas vezes

A primeira versão não tinha o `IF` de validação e o item de erro seguia para o `Montar Order PIX`,
que montava uma order sem valor. O Pagar.me recusou (`amount must be greater than or equal to 1`),
então não houve cobrança errada, mas a trava foi adicionada antes de qualquer disparo real.

Depois do avulso o cron cuida normalmente: lembrete no vencimento, lembrete em +2 dias e pausa em +5
dias sem pagamento. Se o cliente não pagar, a assinatura volta a pausar sozinha, com a mensagem padrão.

A mensagem muda nesse caminho: em vez de "sua renovação vence em 11/09", que soaria como cobrança
atrasada, vai "preparei aqui a renovação da sua assinatura".
