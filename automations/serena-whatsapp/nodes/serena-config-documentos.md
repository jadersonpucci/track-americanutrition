# serena_config.documentos

Arquivos que a Serena pode mandar no WhatsApp. O conteudo de `serena-config-documentos.json`
e o valor da linha `serena_config` com `chave = 'documentos'`.

Campos de cada item:

| campo | para que serve |
| --- | --- |
| `chave` | identificador usado no marcador `[[ARQUIVO: chave]]` |
| `nome` | nome do arquivo como o cliente ve no WhatsApp |
| `tipo` | `document`, `image` ou `video` (vai como `mediatype` no sendMedia) |
| `url` | URL publica do arquivo (Supabase Storage) |
| `legenda` | legenda (`caption`) enviada junto |
| `quando` | criterio em linguagem natural; entra no prompt do Core |
| `gatilhos` | palavras que a rede de seguranca procura na mensagem do cliente ou na resposta; se ausente, usa a `chave` |

Para adicionar um arquivo novo: suba para o Storage, acrescente um item aqui e rode

```sql
update serena_config set valor = '<json>' where chave = 'documentos';
```

Nenhum workflow precisa mudar — o Core le a lista a cada mensagem.

## Fotos dos produtos (21/09/2026)

Alem do laudo, a lista tem 14 fotos de frasco, uma por produto/variante (`foto_imunofosfo_90`,
`foto_imunofosfo_180`, `foto_imunofosfo_60`, `foto_imunofosfo_42`, `foto_imunofosfo_vegano`,
`foto_imunofosfo_liquid`, `foto_imunofosfo_kids`, `foto_imunofosfo_diabetes`, `foto_healing`,
`foto_imunopet`, `foto_omega3`, `foto_creatina`, `foto_life_protein`, `foto_d3_k2_a`), todas com
`tipo: image`.

As URLs sao as proprias imagens da Shopify (CDN publico), com `&width=900` para chegar leve no WhatsApp.
Cada variante do ImunoFosfo tem imagem propria na Shopify, entao a foto do 180 e do vegano sao diferentes
da do 90. Para atualizar uma foto: troque a imagem na Shopify, pegue a nova `src` em
`products.json` e atualize a `url` deste arquivo + o `serena_config`.

As fotos NAO usam `gatilhos`, e sim **`termos`** (nomes de produto: "180 capsulas", "liquid", "vegano", "pet"...).
O motivo: `gatilhos` e lido pela rede de seguranca antiga, no `Cerebro Serena`, que dispara so com a palavra na
mensagem do cliente. Com `gatilhos` nas fotos, "quanto custa o imunofosfo 90" mandava foto sem ninguem pedir
(visto em teste em 21/09). `termos` e lido apenas pela rede de foto do `Montar Resposta`, que exige tambem um
pedido de foto na mensagem ("foto", "imagem", "me mostra", "como e o frasco").
