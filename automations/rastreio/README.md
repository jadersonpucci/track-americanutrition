# Rastreio (track.americanutrition.com)

- Página: `index.html` no branch `main` (Vercel, projetos `track-americanutrition` e `americanutrition-track`).
- Motor: n8n `America Nutrition - Rastreio Personalizado v3` (`Pobps91zvSWe9wCA`), `POST /webhook/rastreio/buscar`
  `{modo:'codigo', codigo}` ou `{modo:'pedido', pedido, validacao}`. Fontes: Envia (todas as transportadoras) e a
  API dos Correios na RapidAPI (só códigos no formato AB123456789CD).

## Extravio pela transportadora (18/10/2026)

**O problema.** A J&T marca o extravio no próprio site, mas pela Envia chega só um scan `110` com
`event: "Information"` e sem texto. A página mostrava "information". Caso real: um lote de 24 pacotes saiu de
São Vicente para Guarulhos em 06/10 às 16:33 e levou o 110 em 17/10 às 14:06:10, todos no mesmo segundo
(AN-15790 a AN-15839, 26 pedidos).

**O 110 da J&T** é "problema" em geral: endereço, recusa e avaria também. Por isso só conta como extravio quando
é o último scan, vem sem descrição e chega depois de 5 ou mais dias parado. Também conta o texto "extraviado"
no evento mais recente (Correios, Loggi).

**Nó `Detectar Extravio`** (`nodes/detectar-extravio.js`, entre `Ajustar Previsao +2d` e `Responder Sucesso`):
- marca `rastreio.extraviado = true` e `rastreio.extravio = {data, fonte, reenvio_codigo, reenvio_url}`;
- devolve `status_chave: 'exception'`, para a página antiga continuar funcionando;
- `status_atual` vira "Pacote extraviado pela transportadora", e `detalhe_atual` leva a mensagem combinada: o
  pedido saiu daqui normalmente, quem extraviou foi a transportadora, e a America Nutrition reenvia sem custo;
- tira a previsão de entrega antiga;
- na linha do tempo, o evento 110 vira "Extraviado pela transportadora";
- **reenvio:** outro rastreio no mesmo pedido da Shopify (o reenvio entra como segundo fulfillment). O motor só
  enxerga os 250 pedidos enviados mais recentes; para os mais antigos vale a tabela abaixo;
- 110 que não é extravio deixa de aparecer como "information" e vira "Ocorrência registrada pela transportadora".

**Tabela `rastreio_extravios`** (`codigo` pk, `extraviado`, `novo_codigo`, `nota`): manda sobre a detecção.
`extraviado=false` desmarca um falso positivo, `extraviado=true` marca à mão um extravio que a transportadora
não sinalizou, e `novo_codigo` aponta o reenvio. O lote de 17/10 foi cadastrado: 24 códigos, todos com o
reenvio (16 pela J&T e 8 pelos Correios, postados em 14 e 15/10).

**Página** (`site-index-extravio.patch`, contra o `index.html` do `main`):
- título "Extraviado pela J&T", a mensagem acima e a frase do reenvio sem custo em destaque;
- botão "Acompanhar o reenvio" quando há código novo;
- etiqueta "Reenvio sem custo" e, no cartão, "Já reenviado" ou "Reenvio sem custo" no lugar da previsão.

Publicado no `main` em 18/10 (commit `f4b7bbd`). Sem ele, a página mostrava a mesma mensagem no estado
"Precisa de atenção".

**Serena:** a ferramenta `consultar_status_pedido` repassa a situação e a mensagem. A base
(`serena_config.base_treinamento`, "Regras importantes do rastreio") ganhou a regra: explicar que o extravio
foi da transportadora, que o reenvio é sempre sem custo, passar o rastreio novo quando houver, e acionar
`escalar_humano` quando ainda não houver reenvio.

**Aviso aos clientes do lote (18/10).** Todos os 26 pedidos já tinham sido reenviados. Atenção ao conferir: parte
dos reenvios saiu pelos Correios, então procurar só códigos `888…` da J&T deixa esses de fora. Os 8 pacotes
reenviados pelos Correios (AN-15790, AN-15791, AN-15792, AN-15797, AN-15812 com AN-15831, AN-15814, AN-15832)
receberam da Serena, pelo WhatsApp, a explicação do extravio e o código novo, registrada na conversa. O AN-15816
(Laercio) ficou de fora porque o reenvio já tinha sido entregue em 15/10.

## Retirada nos Correios (26/10/2026)

**O problema.** Quando os Correios não entregam (área sem entrega, restrição, ninguém em casa), o último evento vira
"Objeto aguardando retirada no endereço indicado". A API dos Correios na RapidAPI manda o endereço da unidade em
`eventos[0].unidade.endereco` (logradouro, número, bairro, cidade, UF) e `rota: "RETIRADA"`, mas o `Normalizar
Resposta` só guardava a cidade. Caso real: AN-16159, `AE059939994BR`, Avenida Sete de Setembro, 486, Centro,
Diadema/SP.

**Nó `Detectar Retirada`** (`nodes/detectar-retirada.js`, entre `Detectar Extravio` e `Responder Sucesso`):
- `rastreio.retirada = {aguardando, endereco, logradouro, numero, bairro, cidade, uf, cep, unidade, motivo, desde,
  prazo_ate, prazo_estimado, maps_url, documentos}`;
- `status_atual` vira "Aguardando retirada nos Correios" e `detalhe_atual` traz o endereço, o que levar e o prazo
  (a página e a Serena já mostram esse campo);
- prazo: `dataLimiteRetirada` quando a API manda; senão 7 dias corridos a partir do evento (`prazo_estimado: true`);
- na linha do tempo, o evento de retirada ganha "Endereço para retirada: ...".

**Aviso pelo WhatsApp:** `[Serena] Aviso de Retirada` (`automations/serena-whatsapp/retirada-aviso.workflow.js`).

## Comprovante de entrega na página (26/10/2026)

O comprovante da J&T aparecia como miniatura de 88px cortada. Pedido do Jaderson: deixar legível e mostrar todas
as fotos. A mudança está no `index.html` da branch `main` (Vercel, commit 299aa4e):

- A primeira foto aparece inteira e grande no card (`object-fit: contain`, fundo branco), com "Toque para ampliar".
- Com mais de uma foto, aparecem miniaturas e um contador. A tela cheia tem setas, swipe e teclado (← → Esc).
- A imagem da tela cheia é posicionada com `position: absolute` e não como item de flex, para não encolher no Safari.

As fotos vêm de `rastreio.comprovante`, montado no nó "Ajustar Previsao +2d": `url` sai de `podFile` e
`evidencias` sai de `podEvidences` do Envia (até 6). Para a J&T, o Envia hoje manda só **um** arquivo, a imagem
com a assinatura e os dados do recebedor, e `podEvidences` vem vazio. As outras fotos da J&T (pacote na porta) ficam
no sistema da própria J&T. O site deles tem captcha, então só daria para buscar com a API oficial (JMS), liberada ao
cliente pelo comercial da J&T.

## Tentativa de entrega e devolução da J&T (03/11/2026)

**O problema.** AN-16220 (`888031005427277`, Maringá/PR): a página mostrava um evento "1" em 30/10 09:38, e o status
atual era "Saiu de Maringá", em trânsito.

Pela Envia, a J&T tinha mandado esta sequência:
- **30/10 07:22, código 94:** saiu para entrega.
- **30/10 09:38, código 110:** "Information", com `location: "1"`, que é o código de motivo da ocorrência. O
  `Normalizar Resposta` usava o texto cru como status.
- **31/10 16:29, código 172:** "Return problem", o pacote devolvido.
- **31/10 16:52, código 50:** saída de Maringá para a base de SP, ou seja, a volta para nós.

**Correção** no nó `Detectar Extravio` (`nodes/detectar-extravio.js`), só quando não é extravio:
- 110 logo depois de um 94 (sem entrega no meio) vira "Tentativa de entrega sem sucesso" (`exception`), com "O
  entregador não conseguiu entregar o pacote neste dia.";
- outro 110 com texto que é só número ou vazio vira "Ocorrência registrada pela transportadora";
- status só numérico na linha do tempo nunca aparece;
- **depois de um evento de devolução**, os eventos seguintes viram `returned`: "Em devolução: saiu de …" e
  "Em devolução: chegou …", e uma entrega vira "Pacote devolvido à America Nutrition". O rastreio fica com
  `status_chave: returned`, "Pacote em devolução" (ou "devolvido") e a mensagem para falar no WhatsApp e combinar o
  reenvio, sem previsão de entrega;
- o detalhe do 172 ("o esscaneador é [nome]") vira "A transportadora registrou a devolução do pacote.".

A página já tinha o estado `returned` ("Voltou pra gente"). O rastreio proativo trata `returned` como encerrado e
não manda mensagem.

**Testado** no código acima. Os Correios recentes saíram iguais a antes.

## Rastreio dos EUA pela Shopify (03/11/2026)

**O problema.** Para código dos EUA (UPS `1Z…` ou USPS `9…`), `/webhook/rastreio/buscar` respondia vazio
(AN-16353, `1Z212B90YW25124077`). Havia duas causas:
- **A fonte nunca foi alimentada.** A rota EUA lia `rastreios_logistica`, que a Shippo alimentaria, mas a tabela só
  tem linhas de teste de junho. As etiquetas dos EUA são compradas pelo Shopify Shipping, e o fluxo antigo do
  checkout US (`carrinhos_us`) só gerou 2 etiquetas, em junho.
- **O fluxo parava sem resposta.** O `alwaysOutputData` do nó `Supabase - Buscar Rastreio USA` estava dentro dos
  parâmetros, onde não vale. Sem linha na tabela, o fluxo parava ali.

**Correção:**
- `alwaysOutputData` agora está nas configurações do nó.
- `Normalizar USA` (`nodes/normalizar-usa.js`): sem linha na tabela, lê o fulfillment da Shopify que tem o código
  (`displayStatus`, `events`, `estimatedDeliveryAt`, `deliveredAt`) e traduz os status: etiqueta criada, coletado,
  em trânsito, saiu para entrega, tentativa, não entregue, entregue e etiqueta cancelada.
- O pedido é buscado pelo número quando ele vem do início do fluxo. Sem número (a busca por código só enxerga os
  250 pedidos enviados mais recentes), procura entre os pedidos com a tag `USA`, até 200 pedidos. Nesse caso
  também monta número, data e produtos para a página.
- Na etiqueta não aparece cidade, porque a Shopify põe a cidade da cliente. A previsão vem de `estimatedDeliveryAt`,
  menos 6h (fim do dia em UTC), e o "+2 dias" de exibição continua valendo. Com problema na entrega, a previsão
  some e aparece a orientação de falar no WhatsApp.

**Teste:** os 16 códigos dos EUA de agosto a novembro respondem com o mesmo status da Shopify, em cerca de 1
segundo.

## Código com espaços e link de rastreio na Shopify (04/11/2026)

- Desde 26/10 a equipe lança o código na Shopify com espaços (`AP 694 051 291 BR`). A busca por código
  ("Casar Tracking com Pedido") comparava o texto exato, não achava o pedido e a página ficava sem os frascos reais
  (aparecia a garrafa genérica "pedido"). Agora `Validar Input`, `Casar Tracking com Pedido` e
  `Validar Pedido e Extrair Tracking` comparam só letras e números.
- Workflow **AN - Link de rastreio na Shopify** (`LvVcylwv0syHUeS9`, `link-rastreio-shopify.workflow.js`, nó em
  `nodes/link-rastreio-shopify.js`): a cada 5 min, nos pedidos atualizados nas últimas 3 h, tira os espaços do código e
  troca o link do envio por `https://track.americanutrition.com/CODIGO` (antes vinha correios.com.br, Frenet, UPS, USPS),
  sem avisar a cliente. Correção retroativa feita em 04/11 nos envios desde 20/09 (187 envios).
- O e-mail de envio da Shopify sai na hora em que a equipe marca o pedido como enviado, antes da correção. Para o
  e-mail também levar o nosso link, o modelo **Confirmação de envio** (e **Atualização de envio**) em
  Configurações > Notificações usa `track.americanutrition.com` + o código sem espaços (ver trecho na conversa de 04/11).

## Etiqueta Frenet -> Shopify (05/11/2026)
- n8n `[Rastreio] Etiqueta Frenet -> Shopify` (`uotvaGJaWQ9EOpas`, `frenet-etiqueta-shopify.workflow.js`), a cada 5 min.
- Lê os últimos 100 envios da Frenet (`GET whitelabel.apifrenet.com.br/v1/shipments`, headers `token` + `x-partner-token`
  na credencial **Frenet API** do tipo Custom Auth no n8n; os tokens não entram no repositório).
- Etiqueta (`volumes[].labelId`) de pedido da Shopify (`orderId` numérico) que ainda não foi enviado → `fulfillmentCreate`
  com o código, o link `https://track.americanutrition.com/CODIGO`, a transportadora (COR → Correios) e
  `notifyCustomer: true` (o cliente recebe o email de envio na hora, sem esperar o app da Frenet).
- Segurança: ignora status 1 (aguardando pagamento), 7 e 9 (cancelado), pedidos cancelados, já enviados, em espera
  (ON_HOLD), parcialmente enviados e com mais de 20 dias; no máximo 15 por rodada. `SIMULAR = true` só lista.
- Pedidos com `orderId` UUID na Frenet (não vieram da integração da Shopify) ficam de fora.
- Na Frenet: status 1 = aguardando pagamento, 5 = postado (visto nos dados); 7 e 9 = cancelado/estornado.
