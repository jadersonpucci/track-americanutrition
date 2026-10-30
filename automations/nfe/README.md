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
