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

## Pix Automático para toda a base PIX e conversão de compra em assinatura (16/10/2026)

O Pix Automático (Inter, `n8n z18gprrjyTy8noJC`, rotas `pix-auto-*`) já estava pronto desde 18/09: com a
assinatura `pix_auto_ativo`, o cron agenda o débito (`gerar_auto`, nó "Agendar Cobr Auto") em vez de mandar
QR. O convite saía em dois momentos: na adesão (`pix_auto_novas = on`, mensagem de ativação) e na
renovação por QR (nó "Pos Gerar", a partir de 12/10). Quem assinou antes de 22/09 e ainda não tinha
renovado depois de 12/10 nunca recebeu convite: nenhuma das 29 PIX ativas tinha autorizado.

A pedido do Jaderson, o convite foi para todas as PIX ativas sem convite aberto: **18 clientes**, pelo
`POST /webhook/pix-auto-migrar` com `enviar:false` (cria a recorrência no Inter, fixa `dia_fixo` e devolve
a página) e envio pelo `wpp-avulso`, 15 s entre um e outro, com registro em `serena_mensagens` para a
Serena ter o contexto se o cliente responder.

- Ficaram de fora Marcia auxiliadora e Maura Paschoal: PIX de 14/10 em aberto, 2º lembrete hoje. Quando
  pagarem, o convite vai na próxima renovação.
- Os 9 que já tinham convite aberto (adesões de 12 a 16/10 e renovações de 15 e 16/10) não receberam de novo.
- As 31 pausadas não receberam: a recorrência nasce com `dataInicial = proximo_ciclo`, que nelas está no
  passado. O convite vai se e quando forem reativadas e renovarem.
- **Pegadinha do número:** o `pix-auto-migrar` (e o "Pos Gerar") só põe o 55 quando o número não começa
  com 55, então quem é do DDD 55 (RS) e está gravado sem o código do país recebe num número errado. Caso
  Rosangela Gonçalves (`55981111480`, real `+55 55 98111-1480`): enviado à mão para o número certo.

**Conversão de compra em assinatura (caso Clerton Franca, AN-16058).** Ele pagou ImunoFosfo 90 no PIX com
o cupom de 10% (R$ 294,30, igual ao 1º mês da assinatura) e pediu os "descontos de 6 meses". Feito na mão,
igual ao que o `AN - Assinatura PIX Confirmar` grava:

1. linha em `assinaturas` (PIX, R$ 294,30 de R$ 327,00, `desconto_primeira`, endereço e CPF do pedido,
   `proximo_ciclo` 15/11, `dia_fixo` 15, `ultimo_pedido_shopify` AN-16058);
2. `assinatura_cobrancas` do ciclo 16/10 como pago (o pedido conta como 1º pagamento, então o 30% cai no 6º);
3. `assinatura_elegibilidade`, tag `ASSINATURA` no pedido e `respond-set-link` (link do portal);
4. `pix-auto-migrar` com `enviar:false` e uma mensagem só, juntando a confirmação e o link do Pix Automático.

A base da Serena (`serena_config.base_treinamento`) agora explica o Pix Automático. Antes dizia que "no PIX
não é automático". Ela também passou a escalar para a equipe o pedido de converter uma compra recente em
assinatura, em vez de dizer que é impossível. Backup em scratchpad (`bkp_base_pixauto_20261016.json`). Se o
site da base mudar, o sync sobrescreve o banco e estas regras precisam ir para o site.

### Correção do número com DDD 55 (16/10/2026)

Todos os fluxos de assinatura punham o 55 só quando o número não começava com 55. Quem é do RS (DDD 55) e
estava gravado como `55981111480` recebia em `+55 98111-1480`, que não existe. A correção ficou em três pontos:

- **Trava no banco** (`trg_assinaturas_whatsapp_ddd55` em `assinaturas`, antes de insert/update): com entrega no
  RS (estado RS ou CEP começando com 9), número de 11 dígitos `559…` vira `55559…`, e de 10 dígitos `55[6-9]…`
  ganha o 55 e o 9 do celular. Assim cron PIX, convite do Pix Automático, confirmação da autorização e dunning
  recebem o número já com o país, sem mexer em cada um. Fora do RS a trava não mexe (ver abaixo).
- **`AN - WhatsApp Avulso`** (`790457qKCPet4kOc`, nó Prep): número de 10 ou 11 dígitos é nacional e sempre ganha
  o 55; 12 ou 13 dígitos passa como veio. Cobre a mensagem de ativação da assinatura PIX, que usa o número do
  checkout antes de gravar.
- **`AN - Assinatura Criar (Checkout)`** (`ZkCJD7EQcD77KBHm`, nó Montar WhatsApp BV): mesma regra nas
  boas-vindas da assinatura no cartão, que vão direto para a Evolution.

Dados corrigidos (backup em scratchpad, `bkp_whatsapp_assinaturas_20261016.json`): Rosangela, Joel e
Alessandra (RS, confirmados por mensagens recebidas do +55 55) ficaram com o 55 na frente. **Número truncado:**
fora do RS, os 11 dígitos começando com 55 são de cliente que digitou 55 no campo de DDD do checkout, e o
número perdeu os últimos dígitos. Quatro foram corrigidos pelo telefone completo que estava na Shopify (Maura,
Gilberto, Rogério, Francisco). Luiz Fernando (pausada), Antonio Barbosa (pausada) e Ricardo Mocelin (ativa,
cartão) não têm o número certo em lugar nenhum.
