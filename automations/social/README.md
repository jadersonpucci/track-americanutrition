# Comentários Facebook / Instagram — moderação e respostas (13/09/2026)

Peças no n8n:

| Workflow | id | Papel |
|---|---|---|
| `[Serena Social] Comentarios IG FB` | `9KXACZ6PK3Vr7kHZ` | Webhook da Meta (`POST /webhook/america-nutrition-comments`) → Claude Haiku classifica (`responder / ocultar / avisar / ignorar`) → responde/oculta pela Graph → Telegram tópico 284 → grava a decisão em `fb_comentarios` |
| `[Serena Social] Fila e Resumo` | `0wJEkmOyaRyIwb7O` | Cron 10 min: reenvia ao webhook os comentários gravados pelos syncs que ainda não têm ação (`_origem=banco`). Cron 20h BRT: resumo do dia no Telegram |
| `[Sync] Comentarios Facebook` / `[Sync IG] Comentarios Instagram` | `0lTU1bTugl95wPz6` / `JlEfyITWqCetLcQI` | Cron 10 min: Graph → `fb_comentarios` (só gravam) |

Fontes aqui (`moderacao-*.js`, `fila-comentarios.js`, `resumo-diario.js`) têm as chaves substituídas por placeholders.

## O que mudou em 13/09

Diagnóstico: 30 dias, FB 300 comentários de clientes / IG 129. Nada era auditável (a decisão só ficava no console
do n8n), 0 ocultados em 30 dias apesar das 7 categorias de ocultação, o webhook é a única porta de entrada (o sync
só arquiva) e o classificador recebia o texto cru, sem autor nem contexto (respondeu "Oi Dulcemar!" a um comentário
da Sandra que citava a Dulcemar).

1. **Fila pelo banco** (`fila-comentarios.js`): a cada 10 min, comentários em `fb_comentarios` com `acao is null`
   (ou `erro` com < 3 tentativas), criados depois de `serena_config.social_catchup_desde`, são reenviados ao webhook
   no formato da Meta com `_origem: 'banco'`. 10 por rodada, 3 s entre eles; `fila_em` evita reenvio em 30 min;
   mais de 72 h vira `expirado`. Kill switch `social_fila_ativa=off`. Não reprocessa o passado: `social_catchup_desde`
   foi fixado na hora do deploy para não responder duas vezes o que o webhook já tratou.
2. **Contexto no classificador** (`moderacao-parse-webhook.js`, `moderacao-deduplicacao.js`): `parent_id`, autor,
   rede, anúncio ou não, texto do post e, quando é resposta, o comentário pai ou a nossa resposta anterior
   (casada por `resposta_id`). Instrução explícita: dirigir-se ao autor, nunca a quem ele cita. Dedupe passou de
   60 s para 10 min. Claude: `temperature 0.2` e `cache_control` no system prompt (5,4k tokens por chamada).
3. **Auditoria** (`moderacao-auditoria.js`): upsert em `fb_comentarios` com `acao, categoria, resposta,
   resposta_id, motivo, processado_em, origem_proc`. Resposta sem id da Graph vira `falha_resposta`.
   Erro do Claude vira `erro` (+`tentativas`) pelo nó novo `Marcar Erro DB`; na 3ª vez, `erro_definitivo`.
4. **Modo aviso para ocultar** (`moderacao-validar.js`): `serena_config.social_ocultar_modo = avisar` (padrão)
   transforma `ocultar` em `avisar`: nada é escondido, o Telegram recebe "SUGESTÃO DE OCULTAR" com o motivo.
   Depois de calibrar, `= ocultar` volta a esconder de verdade. O Switch ganhou a saída `Avisar`.
5. **Resumo diário** (`resumo-diario.js`, 20h BRT, tópico 284): totais por rede e ação, categorias, origem
   (webhook x fila; se só a fila trabalhou, avisa que o webhook da Meta ficou mudo), ocultados/avisos/falhas e
   amostra de respostas.

Teste de 13/09 (payload da fila): "Boa tarde onde posso procurar" → `responder/duvida`, resposta publicada com
o site oficial e `resposta_id` gravado; "Foi proibido a produção no Brasil…" → `avisar/regulatorio`, nada
escondido, aviso no Telegram.

Fica para depois: resposta privada ao comentário (Graph `private_replies` no FB, `recipient.comment_id` no IG)
e Serena no Direct/Messenger (`meta_ativo`), que dependem do app da Meta; painel de comentários mostrar `acao`.

### Regras extras do classificador (`serena_config.social_prompt_extra`)

Texto livre carregado pela Deduplicação e enviado como segundo bloco de `system` na chamada ao Claude (o prompt
principal fica intacto e em cache). Hoje contém: link do grupo (`grupo.americanutrition.com`) quando o comentário
pede para entrar; link do produto (`americanutrition.com/products/imunofosfo`) quando pergunta o site; dirigir-se ao
autor pelo nome; continuar a thread quando é resposta a um comentário nosso. Editar direto na tabela; vale na
próxima execução, sem republicar.

Backlog do Facebook: em 13/09 `social_catchup_desde` foi colocado em `2026-09-12T00:00:00Z` para a fila tratar os
comentários que ficaram sem resposta desde 12/09 (os do Instagram desse período foram marcados `ignorar`, pois
lá a moderação já vinha respondendo).
