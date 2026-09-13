# Depoimentos em Áudio — pipeline

Transforma reviews 5★ escritas (base própria, Supabase) em vídeos com locução
gerada por IA, com **aprovação manual obrigatória** antes de qualquer publicação.

> Este documento é público: nenhuma chave, token ou identificador de chat aparece aqui.
> Os valores reais vivem nas credenciais do n8n e nos nós dos workflows.

## Fluxo

```
review 5★ nova (audio_em IS NULL)
  → limpeza do texto por LLM (ortografia e termos médicos; proibido reescrever)
  → TTS ElevenLabs em 2 faixas:
       1. locutor da marca abre e avisa que a leitura é por voz de IA
       2. voz feminina ou masculina lê o depoimento (escolhida pelo gênero do nome)
  → concatenação dos 2 MP3 em memória
  → serviço FFmpeg gera o MP4 (fundo em loop + áudio + card final)
  → upload no Hostinger
  → card com botões [Aprovar] [Trocar voz] [Descartar] no Telegram do revisor
        ├─ Aprovar     → Shopify (staged upload + metaobject) + grupo TG + WhatsApp
        ├─ Trocar voz  → regera a locução com a outra voz e devolve um card novo
        └─ Descartar   → status 'descartado', nada é publicado
```

Nada vai ao ar sem clique humano: o nó de curadoria devolve **zero itens**, o que
faz o n8n pular toda a cadeia de publicação.

## Regras do conteúdo

- A abertura é sempre **a marca apresentando** um depoimento de cliente. Nunca uma
  voz fingindo ser o cliente.
- A abertura declara explicitamente que o texto é do cliente e a **leitura é feita
  por voz de inteligência artificial**. O mesmo aviso vai na legenda do post.
- A limpeza do texto só corrige digitação, acentuação, pontuação e termos médicos
  escritos errado. Reescrever, resumir ou acrescentar é proibido no prompt.
- A voz sai do gênero de quem escreveu, deduzido nesta ordem: título no nome
  (Pastor, Dr., Dona), concordância no próprio texto ("fiquei curado" / "curada")
  e por último o primeiro nome. Parentes citados no relato não contam — "meu esposo"
  não diz o gênero de quem escreve. Sem nenhuma pista, cai na voz feminina e o
  revisor corrige pelo botão **Trocar voz**, que regera inclusive a abertura do
  locutor (muda "escrito pela cliente" para "pelo cliente").
- **Nenhum depoimento é filtrado por conteúdo.** Todo relato 5★ aprovado vai para o
  Telegram. Termos regulatórios sinalizados (`reviews.ia_flags`) e o alerta gerado na
  limpeza aparecem no card apenas como aviso; quem decide publicar é o revisor.
  Os únicos cortes na consulta são técnicos: texto curto demais para virar áudio e
  texto acima do que cabe numa chamada de TTS.

## Workflows n8n

| Workflow | Papel |
|---|---|
| `[Depoimentos] Reviews -> Audio (curadoria)` | Busca reviews novas, limpa o texto, gera a locução e dispara a geração do vídeo. Cron a cada 8h + execução manual. |
| `[Depoimentos] Audio -> Video` | Gera o MP4 e sobe no Hostinger. Aceita áudio do Telegram (`file_id`), binário pronto ou `audio_url`. Em `modo: curadoria` manda para aprovação e para; em `modo: publicar` segue o fluxo antigo. |
| `[Depoimentos] Publicar Aprovado` | Webhook disparado pelo botão Aprovar. Publica no Shopify, no grupo do Telegram e no WhatsApp. |
| `[Depoimentos] Trocar Voz` | Webhook disparado pelo botão Trocar voz. Regera a locução com a outra voz, remonta o vídeo e devolve o card. |
| `[Depoimentos] Enviar Manual` | Webhook para depoimento que chegou por fora do sistema de reviews (WhatsApp, Instagram, e-mail): gera a locução, registra e manda para a mesma curadoria. |
| `[Depoimentos] Enviar Card` | Manda o card ao revisor por upload no bot local, o que funciona com vídeo acima de 20 MB. |
| `Depoimentos v14` (bot) | Trata os callbacks dos botões `depok:<id>` / `depno:<id>`. |
| `ElevenLabs Bridge` / `Claude SQL Bridge` | Pontes HTTP autenticadas por header, usadas pelos nós Code. |

## Tabela de curadoria

`public.depoimento_audio` — uma linha por depoimento gerado:

| coluna | uso |
|---|---|
| `review_id` | review de origem (índice único: não gera duas vezes); nulo quando o depoimento chegou por fora |
| `origem` | `review` (veio do sistema) ou `manual` (enviado por fora) |
| `texto_original` / `texto_limpo` | antes e depois da limpeza, para auditoria |
| `voz`, `genero` | qual voz leu |
| `video_url` | MP4 no Hostinger |
| `status` | `pendente` → `publicando` → `publicado`, ou `descartado` |
| `primeiro_nome` | como a pessoa é chamada na locução ("Pastor B." vira "Pastor") |
| `tg_chat_id`, `tg_message_id` | card enviado ao revisor |
| `criado_em`, `decidido_em`, `publicado_em` | linha do tempo |

`reviews.audio_em` marca o que já entrou no pipeline, para não reprocessar.

## Armadilhas conhecidas do n8n (aprendidas na prática)

- `update_workflow` salva como rascunho: `publish_workflow` depois é obrigatório.
- A API **não** consegue vincular credencial em nó HTTP Request (nem
  `httpHeaderAuth`, nem tipos predefinidos). Esses nós precisam de um clique na UI.
- Em nó IF, só o branch `true` (índice 0) se conecta pela API. Onde for preciso
  interromper uma cadeia, um nó Code devolvendo `[]` resolve sem ramificar.
- A ponte SQL responde `[{"success": true}]` mesmo quando um `UPDATE ... RETURNING`
  não casa nenhuma linha. Verifique um campo real da linha, nunca o tamanho do array.
- Reescrever um workflow inteiro pelo SDK perde as credenciais; prefira operações
  cirúrgicas (`setNodeParameter`).
- **Vídeo não passa por dentro de um Code node.** Baixar um MP4 para `Buffer` ali
  derruba o n8n por falta de memória (`WorkflowCrashedError`). Todo arquivo grande
  anda por nós HTTP Request (`responseFormat: file`), que trabalham em streaming;
  o Code só repassa a *referência* do binário (`$('No').first().binary.video`).
- **O Telegram só baixa arquivo por URL até 20 MB** — vale para o bot oficial e
  para o servidor local, e o erro é o genérico `failed to get HTTP URL content`.
  Acima disso, envie por upload (multipart) no bot local, que aceita até 2 GB.
- Envio ao Telegram não pode falhar calado: registre o motivo em
  `depoimento_audio.erro` e mande o card em texto com o link como último recurso.
  Gravar `video_url` como se fosse sucesso esconde a falha.
- O `queryReplacement` do nó Postgres separa os parâmetros **por vírgula**. Qualquer
  texto livre com vírgula embaralha as colunas silenciosamente. Para texto de usuário,
  monte o SQL com escape (`'` vira `''`) em vez de usar parâmetros posicionais.

## Ritmo

A busca roda a cada 8 horas e leva até 5 depoimentos por rodada. Na prática o volume é
de cerca de uma review 5★ a cada três dias, então o limite nunca morde: o ritmo real é
dado pela aprovação, não pela geração.

## Depoimento que chega por fora

Nem todo relato passa pelo sistema de reviews — muita coisa chega por WhatsApp,
Instagram ou e-mail. Para esses, o webhook do `Enviar Manual` recebe:

| campo | uso |
|---|---|
| `texto` | o relato, já limpo para leitura (até ~4500 caracteres, limite de uma chamada de TTS) |
| `voz` | `Alexandre` ou `Leticia` — sem isso, assume masculina |
| `cliente_nome` | como aparece no card de aprovação |
| `primeiro_nome` | como a pessoa é chamada na locução; vazio faz a abertura dizer "escrito por um cliente" |
| `alerta` | aviso que aparece destacado no card |

Daí em diante é o mesmo caminho de sempre: card no Telegram, três botões, e nada
vai ao ar sem aprovação.
