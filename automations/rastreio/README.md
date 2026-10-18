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
não sinalizou, e `novo_codigo` aponta o reenvio. O lote de 17/10 foi cadastrado: 24 códigos, 16 com o reenvio
encontrado na Shopify.

**Página** (`site-index-extravio.patch`, contra o `index.html` do `main`):
- título "Extraviado pela J&T", a mensagem acima e a frase do reenvio sem custo em destaque;
- botão "Acompanhar o reenvio" quando há código novo;
- etiqueta "Reenvio sem custo" e, no cartão, "Já reenviado" ou "Reenvio sem custo" no lugar da previsão.

Sem o patch publicado, a página atual mostra a mesma mensagem no estado "Precisa de atenção".

**Serena:** a ferramenta `consultar_status_pedido` repassa a situação e a mensagem. A base
(`serena_config.base_treinamento`, "Regras importantes do rastreio") ganhou a regra: explicar que o extravio
foi da transportadora, que o reenvio é sempre sem custo, passar o rastreio novo quando houver, e acionar
`escalar_humano` quando ainda não houver reenvio.
