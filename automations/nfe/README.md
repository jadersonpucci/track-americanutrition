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

