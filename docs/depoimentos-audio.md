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
  → card com botões [Aprovar] [Descartar] no Telegram do revisor
        ├─ Aprovar  → Shopify (staged upload + metaobject) + grupo TG + WhatsApp
        └─ Descartar → status 'descartado', nada é publicado
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
- Depoimentos com termos regulatórios sinalizados (`reviews.ia_flags`) chegam ao
  revisor com um alerta visível — a decisão continua sendo humana.

## Workflows n8n

| Workflow | Papel |
|---|---|
| `[Depoimentos] Reviews -> Audio (curadoria)` | Busca reviews novas, limpa o texto, gera a locução e dispara a geração do vídeo. Cron a cada 8h + execução manual. |
| `[Depoimentos] Audio -> Video` | Gera o MP4 e sobe no Hostinger. Aceita áudio do Telegram (`file_id`), binário pronto ou `audio_url`. Em `modo: curadoria` manda para aprovação e para; em `modo: publicar` segue o fluxo antigo. |
| `[Depoimentos] Publicar Aprovado` | Webhook disparado pelo botão Aprovar. Publica no Shopify, no grupo do Telegram e no WhatsApp. |
| `Depoimentos v14` (bot) | Trata os callbacks dos botões `depok:<id>` / `depno:<id>`. |
| `ElevenLabs Bridge` / `Claude SQL Bridge` | Pontes HTTP autenticadas por header, usadas pelos nós Code. |

## Tabela de curadoria

`public.depoimento_audio` — uma linha por depoimento gerado:

| coluna | uso |
|---|---|
| `review_id` | review de origem (índice único: não gera duas vezes) |
| `texto_original` / `texto_limpo` | antes e depois da limpeza, para auditoria |
| `voz`, `genero` | qual voz leu |
| `video_url` | MP4 no Hostinger |
| `status` | `pendente` → `publicando` → `publicado`, ou `descartado` |
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
