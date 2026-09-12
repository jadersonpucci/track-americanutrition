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

## QR Code e página de pagamento na renovação (12/09/2026)

O Marcelo recebeu o PIX e respondeu: *"Vc consegue mandar QR code?"* e *"Não tá dando certo esse
código"*. Ele estava certo. Um código PIX tem cerca de 200 caracteres. No celular ele quebra em cinco
ou seis linhas, e copiar do WhatsApp falha com facilidade.

A **página do Pix** (`serena_pix_links` + workflow `[Serena] Pagina do Pix`) já existia e resolve isso:
QR Code na tela, botão de copiar com um toque, passo a passo e contagem do prazo. Só que apenas o
caminho de **venda** da Serena a usava. A renovação de assinatura mandava o código cru e nada mais.

Agora a renovação também cria a página:

| Onde | O que mudou |
|---|---|
| `Pos Gerar` | grava em `serena_pix_links`, encurta o link e manda junto com o valor; o código continua em mensagem separada |
| `Buscar Acoes` | passou a trazer `c.pix_order_id`, que é como o lembrete acha a página |
| `Pos Outros` | os dois lembretes levam o link da página, não só o código |

Dois ajustes na própria página, que só apareceram agora porque o PIX de assinatura é diferente do de venda:

- **Contador.** O PIX de venda expira em 30 minutos, o de assinatura em 9 dias. O contador formatava
  só `mm:ss`, então mostraria `12960:00`, que parece defeito. Agora mostra dias, horas ou minutos,
  conforme o prazo.
- **Confirmação de pagamento.** O `pix-status` só sabia checar pelo draft order da Shopify, e
  assinatura não tem draft. Agora, quando não há `draft_id`, ele confere `assinatura_cobrancas` pelo
  `pix_order_id` — é onde a **AN - Assinatura PIX Confirmar** marca pago. Sem isso a página ficaria
  para sempre em "aguardando", mesmo depois de o cliente pagar.
