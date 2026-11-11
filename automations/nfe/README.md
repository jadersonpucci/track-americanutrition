# NF-e pela Focus NFe

A America Nutrition emite NF-e pela **Focus NFe**, na conta da Rodolog (plano Growth, 4.000 documentos por mês
divididos entre os CNPJs). A Notasy, que emitiu até a nota 234 da série 68, deixa de ser usada para NF-e.

## O robô

Workflow **AN · NF-e Focus (emitir e anexar)** (`s1JHMJosqDcEeWbr`). O código fica em
[`nodes/emitir-focus.js`](nodes/emitir-focus.js), e o arquivo do SDK ([`nfe-focus.workflow.js`](nfe-focus.workflow.js)) é
gerado por [`gerar-workflow.mjs`](gerar-workflow.mjs). No repo os segredos ficam como placeholders; as chaves reais
ficam só no n8n.

### Na hora, por aviso (sem ficar consultando)

Desde 30/10/2026 a emissão funciona por aviso. Os três avisos chegam em
`POST /webhook/nfe-focus-evento?t=<NFE_TOKEN_EVENTO>` e o webhook responde 200 na hora.

| Quem avisa | Quando | O que o robô faz |
|---|---|---|
| Shopify `orders/paid` (`WebhookSubscription/1712311894188`) | Pedido pago | Busca o pedido. Se está pago, não foi enviado e é de `nfe_desde` em diante, emite a nota. |
| Shopify `orders/create` (`WebhookSubscription/1712311926956`) | Pedido criado | Igual. Cobre os pedidos do nosso checkout, que já nascem pagos. |
| Focus, gatilho `nfe` do CNPJ (`hook 2RLZzAJk`) | A SEFAZ autorizou ou rejeitou | Autorizada: anexa DANFE e XML no pedido. Rejeitada: avisa no Telegram. |

O mesmo pedido pode chegar duas vezes (create e paid), mas a Focus não aceita duas notas com a mesma `ref` (o número
do pedido). O robô também ignora pedido que já está na `nfe_emissoes`.

### Rede de segurança a cada 1 hora

Pega o que algum aviso perdeu: as notas que ficaram em processamento e os pedidos pagos e não enviados que ainda não
têm nota.

### Quando a nota é autorizada

O robô anexa no pedido da Shopify:

- o DANFE (PDF) e o XML, nos Arquivos da Shopify;
- os metafields `nfe.numero`, `nfe.chave`, `nfe.danfe`, `nfe.xml` e `nfe.danfe_url`, fixados na tela do pedido.

O pedido não recebe tag de NF-e (pedido do Jaderson, 30/10).

### Quando o pedido não fecha

Uma nota rejeitada ou um pedido que não fecha vai para o Telegram e fica parado até alguém mandar reprocessar. Não
fechar quer dizer: sem CPF, item sem preço (brinde), total diferente de itens + frete + juros, ou CEP de outro estado.

### Configuração (`serena_config`)

| Chave | Valores |
|---|---|
| `nfe_modo` | `off` (parado), `simulacao` (monta e grava o payload, não envia) ou `on` (emite) |
| `nfe_desde` | A partir de quando os pedidos entram, por exemplo `2026-10-30T00:00:00-03:00` |

### Manual

`GET https://n8n.americanutrition.com/webhook/nfe-focus?t=<NFE_TOKEN_MANUAL>&pedido=AN-123&modo=on`

Reprocessa um pedido só, inclusive os que estão como `erro` ou `revisar`. Sem `pedido`, roda a rodada normal no modo
indicado.

### Tabela `nfe_emissoes`

Uma linha por pedido. Guarda:

- o status (`simulado`, `revisar`, `processando`, `autorizado_sem_anexo`, `autorizado`, `erro` ou `cancelado`);
- número, série, chave e os links do DANFE e do XML;
- os ids dos arquivos na Shopify;
- UF, valor, ICMS e DIFAL;
- o payload enviado e a resposta da Focus.

## Tributação

Definida em 30/10/2026. As notas da Notasy usavam NCM 2936.90.00 e origem nacional, e as duas coisas estavam erradas.

| Item | Regra |
|---|---|
| Regime | Lucro Presumido (CRT 3) |
| Origem | **1 (importação direta pela AN)** |
| NCM | Suplementos **2106.90.30**. ImunoPet 2309.90.90. Life Protein 2106.10.00. É a mesma classificação do HS cadastrado na Shopify, e precisa bater com a DI. |
| Unidade, GTIN | `UN`, `SEM GTIN` |
| ICMS | CST 00. **18%** dentro de SP (CFOP 5102). **4%** para fora de SP, por ser importado (Res. Senado 13/2012; CFOP 6108, não contribuinte). |
| DIFAL | Venda para consumidor de outro estado: base única, alíquota interna do destino menos 4%, partilha 100% para o destino. FCP só onde existe (RJ 2%, AL 1%, SE 1%). O valor vai também no texto da nota. |
| PIS / COFINS | Cumulativos, CST 01, 0,65% e 3%, com o ICMS fora da base (Tema 69 do STF) |
| IBS / CBS (2026) | CST 000, cClassTrib 000001, IBS UF 0,1%, CBS 0,9%, base = valor do item |
| Juros do parcelamento | A linha "Juros de parcelamento" entra como outras despesas, rateada nos itens. Entra na base do ICMS. |
| Frete | Rateado nos itens, modalidade 0 (por conta do remetente) |
| Pagamento | Cartão de crédito `03` (a prazo se tiver parcelas), débito `04`, PIX `17`, boleto `15` |

### Para o contador conferir

- A tabela de alíquota interna por estado (`UF_INTERNA` no código), principalmente AL, SE, PI, MA e RN, que mudaram
  nos últimos anos.
- Como o DIFAL vai ser pago: GNRE por nota antes do envio, ou inscrição nos estados onde mais vendemos (SC, PR, MG,
  RS, RJ). Em outubro, 72% dos pedidos foram para fora de SP.
- Se algum produto tem substituição tributária ou CEST.

## A Serena manda a nota quando o cliente pede (02/11/2026)

A Serena só fala de nota fiscal quando o cliente pede (nota, NF, NF-e, DANFE, cupom fiscal). Quando a nota já existe,
o PDF chega anexado na conversa. Funciona em três peças:

1. **Gatilho `nfe_fato_serena`** (em [`nfe-fato-serena.sql`](nfe-fato-serena.sql)). Quando uma linha da
   `nfe_emissoes` vira `autorizado`, ele grava um fato `nota fiscal AN-xxxx` no contato do cliente (`serena_fatos`,
   origem `sistema`). O contato é achado pelo telefone da nota (DDD + 8 dígitos). O fato traz número, série, data,
   a instrução "envie só se o cliente pedir" e o link do DANFE. Os fatos vão inteiros para a Serena em toda
   conversa. Na repescagem de 02/11, as 36 notas já autorizadas acharam o contato.
2. **Regra no prompt** (texto em `../serena-whatsapp/nodes/serena-config-adendos-prompt.md`):
   - **Pedido com nota:** uma frase curta e o link sozinho na última linha.
   - **Pago hoje e ainda sem nota:** a nota sai em minutos depois do pagamento.
   - **Pedido antigo ou pago há mais de um dia, sem nota:** chama `escalar_humano`.
   - **Pedido não pago:** a nota sai depois do pagamento.
   - **CNPJ ou dados diferentes do pedido:** chama `escalar_humano`.
3. **Entrada do WhatsApp**, nó `Chamar Serena Core`
   ([`../serena-whatsapp/nodes/entrada-chamar-serena-core.js`](../serena-whatsapp/nodes/entrada-chamar-serena-core.js)).
   Um link `api.focusnfe.com.br/.../DANFEs/<chave>.pdf` na resposta sai do texto e vira o PDF anexado
   (`Nota fiscal AN-xxxx.pdf`), pelo mesmo caminho do `[[ARQUIVO]]`. Resposta com esse link nunca vai em áudio.

**Teste (contato de teste da equipe, sem envio):**

- "pode me mandar a nota fiscal do meu pedido AN-16318?" → "Claro, Jaderson! Segue a nota fiscal do seu pedido
  AN-16318 💙" + o PDF.
- Uma pergunta sobre dose, na mesma conversa, não trouxe a nota.

O fato e as mensagens do teste foram apagados.

**Robô antigo desligado (02/11/2026).** O `[Serena] Nota Fiscal no Pedido` (`48bwyfca3QCCojEy`) colocava a tag
`NOTA FISCAL` no pedido quando o cliente pedia nota, para a equipe emitir na mão. A nota agora sai sozinha, e a tag
podia fazer alguém emitir de novo, então o robô foi desativado no n8n. Para voltar, basta reativar o workflow.

## Correção de 03/11/2026: pedidos sem nota

Do AN-16361 ao AN-16368 (pagos entre 02/11 às 12h59 e 21h40) ficaram sem nota. Foram duas falhas no robô:

1. **No aviso da Shopify**, o robô procurava o pedido pela busca (`name:AN-x`). A busca leva alguns segundos para achar
   um pedido recém-criado, voltava vazia e o robô desistia sem avisar. Agora o aviso busca o pedido direto pelo id.
2. **A rede de segurança de hora em hora** pegava os 40 pedidos pagos e não enviados **mais antigos** desde
   `nfe_desde`. Com mais de 40 pedidos ainda não marcados como enviados na Shopify, os novos nunca entravam. Agora a busca
   vai do mais novo para o mais antigo, até 100 pedidos.

Mais dois casos corrigidos:

- **AN-16355** ficou em `revisar` com "forma de pagamento não reconhecida". É um PIX gerado pela Serena na conversa,
  que chega sem o atributo `Pagamento` do checkout. Agora a forma de pagamento também vem da tag
  `pagamento:pix|boleto|cartao`.
- **AN-16353** é do checkout dos EUA (entrega na Flórida). Pedido com entrega fora do Brasil ou com a tag `USA` agora fica
  `ignorado`, porque não leva NF-e brasileira.

**Notas emitidas na mão:** 277 a 285, para o AN-16355 e do AN-16361 ao AN-16368. Todas foram autorizadas e anexadas.
Os pedidos AN-16306 a AN-16316 são de 30/10 antes das 16h e já tinham sido enviados, então ficaram fora, como combinado.

## Vigia: pedido pago sem nota (03/11/2026)

Workflow **AN · NF-e Vigia (pedido pago sem nota)** (`IRt0HC1j4C4kH5HL`). Código em
[`nodes/vigia.js`](nodes/vigia.js) e tabela em [`vigia.sql`](vigia.sql). Roda de hora em hora, no minuto 25, separado do
robô de emissão: se o robô quebrar, o vigia continua.

Ele procura pedido pago há mais de 2 h, dos últimos 3 dias, com entrega no Brasil, que ainda não tem nota autorizada:

| Situação | O que o vigia faz |
|---|---|
| Sem registro na `nfe_emissoes` (o robô nem viu o pedido) | Pede a nota ao robô na hora e avisa o resultado. |
| `revisar` ou `erro` | Avisa com o motivo, porque precisa de alguém. |
| `processando` ou `autorizado_sem_anexo` há mais de 2 h | Avisa. |

O aviso vai para o grupo de alertas do Telegram, no máximo uma vez a cada 12 h por pedido (`nfe_vigia_alertas`).

**Rodar na mão:** `GET /webhook/nfe-vigia?t=<NFE_VIGIA_TOKEN>`. Com `&avisar=0`, só mostra o resultado, sem avisar.

**Teste (03/11):** 37 pedidos, nenhum problema. Um pedido marcado de propósito como `revisar` foi detectado; o teste foi
desfeito.

## Venda sem nota: tag `SEM NFE` (03/11/2026)

Pedido com a tag `SEM NFE` (também vale `sem-nfe` ou `Sem NF-e`) fica `ignorado` no robô de emissão e não entra no vigia.
Serve para venda comercial que não leva nota, como a venda do estoque da Nair dos Santos.

O primeiro caso foi o rascunho `#D4181`: Nair dos Santos, 2x ImunoFosfo 90 a R$ 200, PIX de R$ 400,00. Tags: `AF: Nair`,
`AF: Nair dos Santos`, `SEM NFE`, `venda comercial`, `pagamento:pix` e `cupom:NAIR`.


## Cupom rateado na linha de juros (06/11/2026)

**AN-16418** ficou em `revisar` desde 04/11 com "total do pedido (1381.86) nao fecha com itens + frete + juros
(1389.25)". O cupom PROMO5 (R$ 59,70) foi rateado pela Shopify em todas as linhas, inclusive na linha "Juros de
parcelamento" (R$ 7,38). O robô lia os juros sem esse desconto e calculava cada item pelo preço unitário já
arredondado.

Agora o líquido de cada linha, juros inclusive, é preço cheio × quantidade menos os descontos rateados
(`discountAllocations`). A nota do AN-16418 saiu (nº 356, série 1) e foi anexada ao pedido.

## Painel de NF-e (09/11/2026)

Card **Notas Fiscais** na Central Administrativa (`/webhook/admin`, grupo Operação). Abre
`assets/painel-nfe.html` do tema `153190498476` (o mesmo tema de onde a Central lê o `america_admin.html`), sem senha:
o link do card leva a chave `?k=`, que a página manda para a API. Sem a chave, a API responde "Acesso negado".

Digita-se o número do pedido (16477 ou AN-16477):

- **Consultar**: cliente, cidade, total, pagamento, envio, CPF/CNPJ e a situação da NF-e (com o motivo da recusa da
  SEFAZ, se houver) e os links do DANFE e do XML quando autorizada.
- **Gerar NF-e**: chama o robô (`/webhook/nfe-focus?pedido=...&modo=on`) para aquele pedido. Pedido já com nota,
  cancelado ou não pago não é emitido.
- **Corrigir e reenviar** (aparece quando a nota foi recusada): CPF/CNPJ e/ou inscrição estadual (número ou ISENTO).
  Usa o payload que o robô já montou (`nfe_emissoes.payload`), troca só o destinatário e reenvia para a Focus com a
  mesma `ref`. Grava `processando` e chama o robô para acompanhar e anexar no pedido. CNPJ com IE vira contribuinte
  (`indicador 1`); em outro estado a partilha do DIFAL sai do item.

**Onde roda:** dentro do próprio workflow do robô, `AN · NF-e Focus (emitir e anexar)` (`s1JHMJosqDcEeWbr`): webhook
`Painel API` (`POST /webhook/nfe-painel-api`) → `Painel` ([`painel/painel-no-emissor.js`](painel/painel-no-emissor.js))
→ `Painel Responder`. O `Painel` lê as chaves (Focus, token manual, banco) do código do `Emitir e Anexar` em tempo de
execução, então não existe cópia de chave nem credencial nova. A chave do card fica só no n8n e no link do card
(no repo, `<NFE_PAINEL_CHAVE>`). O `gerar-workflow.mjs` já monta esses três nós junto com o robô. A página é
[`painel/pagina.html`](painel/pagina.html).

Primeiro caso: **AN-16477** (CNPJ de empresa de SP, rejeição 232 "IE do destinatário não informada"). Reenviado pelo
painel com a IE em 09/11 e autorizado: NF-e 405, série 1, anexada no pedido.

## Chaves fora do código e IE do cliente PJ (09/11/2026)

**Chaves.** O código do `Emitir e Anexar` ([`nodes/emitir-focus.js`](nodes/emitir-focus.js)) não tem mais chave
nenhuma e é igual no repo e no n8n. As chaves (Supabase, Focus, Telegram, token manual e de evento) ficam só no nó
**`Chaves NF-e (não apagar)`**: desativado, sem conexão, com as linhas `const X = '...';`. O `Emitir e Anexar` e o
`Painel` leem esse nó em tempo de execução (`$('Chaves NF-e (não apagar)').params.jsCode`). Não apagar nem renomear o
nó; trocar uma chave é editar a linha dela ali. Se as chaves não forem lidas, o emissor responde
`chaves do emissor nao encontradas` e não faz nada. (Só diferença repo × n8n: na linha do `limpa`, o n8n guarda os
caracteres invisíveis e o repo guarda os escapes `\u2060...`; o comportamento é o mesmo.)

**IE do cliente PJ.** Desde 09/11 a SEFAZ passou a recusar NF-e para CNPJ contribuinte sem a inscrição estadual
(rejeição 232). Agora:

- **Checkout:** com CNPJ aparece o campo "Inscrição Estadual (IE) da empresa" com a opção **Isento**. É obrigatório
  para CNPJ (IE com 2 a 14 dígitos ou Isento). Vai para o pedido junto do endereço (`shipping.ie`).
- **Pedido na Shopify:** o `Criar Pedido Shopify` (`dtDYBZJuAbFZV3cB`) grava o atributo `IE` e o metafield
  `an_fiscal.ie` ("Inscrição estadual do cliente", número ou `ISENTO`).
- **Emissor:** CNPJ com IE vai como contribuinte (`indicador 1` + IE); `ISENTO` vai com `indicador 2`; CNPJ sem IE
  continua `9`. Contribuinte de outro estado não leva a partilha do DIFAL (o DIFAL é do destinatário) e a linha de
  DIFAL some das informações complementares.
- Pedido antigo ou sem IE: corrigir pelo painel (card Notas Fiscais → Corrigir e reenviar).

Testado: simulação local do emissor no AN-16477 (IE → indicador 1, ISENTO → 2, sem IE → 9, contribuinte em MG sem
DIFAL); checkout no navegador antes e depois de publicar (CNPJ mostra o campo, sem IE bloqueia, Isento manda
`ISENTO`, CPF esconde).

## Pedido cancelado cancela a NF-e (11/11/2026)

Pedido do Jaderson: pedido cancelado na Shopify cancela a nota na SEFAZ sozinho, se ainda estiver no prazo.

- No **`Cancelar NF-e`** ([`nodes/cancelar-nfe.js`](nodes/cancelar-nfe.js)), dentro do mesmo workflow do robô, com as chaves
  lidas do `Chaves NF-e (não apagar)`.
- **Quando roda:** a cada 30 min (`Cancelamentos (30 min)`) olha as notas autorizadas nas últimas 30 h e confere na
  Shopify se o pedido foi cancelado. Também aceita o aviso `orders/cancelled` em `POST /webhook/nfe-cancelar` (sem
  token: o aviso só dispara a conferência, quem decide é a Shopify). A assinatura desse aviso precisa ser criada no
  painel da Shopify (Configurações > Notificações > Webhooks > "Cancelamento do pedido", JSON); a API bloqueou a criação
  pelo conector.
- **Regras:** nota `autorizado` + pedido com `cancelledAt` + não enviado + até 23,5 h da emissão → `DELETE /v2/nfe/AN-xxxx`
  na Focus com a justificativa "Pedido cancelado a pedido do cliente antes do envio da mercadoria.". Grava
  `nfe_emissoes.status = cancelado`, `cancel_status`, `cancel_em` e a resposta em `resposta.cancelamento`, e avisa no
  Telegram. Pedido já enviado ou fora do prazo: só avisa no Telegram (NF-e de devolução com o contador), uma vez.
- **Modo:** `serena_config.nfe_cancelar_auto` (`off` / `simulacao` / `on`). Ligado em `on` em 11/11.
