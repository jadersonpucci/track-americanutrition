# Grupos | Samuel Responde — n8n `0OwXSCNKh3zpvyFG` (12/09/2026)

Responde **no grupo, como Samuel**, a perguntas simples que a equipe respondia à mão: link de compra, preço,
como tomar, versões do produto, depoimentos e "meu pedido não chegou". Feito do zero depois do bot antigo
(`Grupo IN`) responder a afirmações ("já vi nos sites", "gostaria de saber a mesma coisa") como se fossem
perguntas e mandar card de depoimentos a esmo.

**Silêncio é o padrão.** Tudo que não passa em todas as etapas abaixo é ignorado. O Samuel só fala quando
faz sentido e, mesmo assim, dentro de tetos que impedem excesso.

## Caminho da mensagem

`POST /webhook/grupo-samuel-responde` (alvo `samuel_responde` do dispatcher `kW1lyiLPbmIIGjGR`)
→ `Pre-filtro` → `Classificar` (Claude, HTTP) → `Decidir` → **espera 3 min** → `Reconferir e Responder`.
O que cai fora no `Decidir` vai para `Registrar Silencio`.

### 1. `prefiltro.js` — barato, sem IA
Derruba: grupo fora da lista oficial; `fromMe`; texto < 6 ou > 700 caracteres; link puro; repetida (dedupe
1h por `msg_id` em static data); sem cara de pergunta (regex de `?` e palavras como *link, valor, quanto,
como tomar, chegou, rastreio…*); chave geral `serena_config.grupo_bot_ativo != 'on'`; grupo fora de
`grupo_bot_grupos` (lista de JIDs ou `todos`); autor da equipe ou admin do grupo (conferido ao vivo em
`GET /group/participants/Samuel`).

Autor: `key.participant` vem em `@lid`; o telefone sai de `participantAlt`/`senderPn` ou da lista de
participantes. Nunca casar por substring contra `@lid`.

### 2. `Classificar` — Claude Sonnet, JSON só
`{intencao, produto, dirigida_ao_grupo, confianca, motivo}`. Intenções: `link_compra`, `preco_promocao`,
`como_tomar`, `versao_produto`, `depoimentos`, `pedido_nao_chegou`, `nenhuma`. Regras fixas no prompt:
doença, sintoma, remédio, dose para doença específica e produto de outra marca são **sempre `nenhuma`**;
`dirigida_ao_grupo=false` para resposta a outra pessoa, comentário, afirmação, relato, oração,
agradecimento. O nó segue mesmo com erro (`continueRegularOutput`): sem conteúdo = silêncio.

Credencial: **"Anthropic Header Auth"** (`iBw9xGOofdfh1fd2`). O MCP do n8n recusa anexar `httpHeaderAuth`
a HTTP Request; tem de ser selecionada na UI.

### 3. `decidir.js` — travas antes de esperar
- `confianca >= 85` e `dirigida_ao_grupo = true`, senão `ignorada`.
- Tetos, contados em `grupo_bot_log`: **2 por grupo/hora**, **8 por grupo/dia**, **20 no total/dia**.
- Mesma pessoa + mesma intenção em 12h → `bloqueada`.
- Mesma dúvida já respondida no grupo em 6h → modo `reagir` (👍 na mensagem) em vez de repetir o texto.
- `nenhuma` sai sem registro (é a maioria); o resto grava motivo.

### 4. `responder.js` — 3 minutos depois
1. Alguém da equipe respondeu nesse meio tempo? Confere mensagens `fromMe`/da EQUIPE no grupo depois do
   `ts` (Evolution `findMessages`, paginado no código) e `grupo_mensagens` do Radar. Se sim, `bloqueada`.
2. Tetos de novo (duas perguntas podem ter passado juntas).
3. `reagir` → `POST /message/sendReaction/Samuel`.
4. Monta a resposta na voz do Samuel (primeira pessoa, curta, sem assinar como robô), citando a pergunta
   (`quoted.key.participant` com o telefone em `@s.whatsapp.net`, nunca `@lid`).
   - Link/preço: variante do `CAT`, preço de `catalogo_precos`, link de checkout encurtado com `ref=grupo`.
   - Como tomar: posologia geral do rótulo por tipo (cápsulas, liquid, kids, pet, spray, ômega) + "alinha
     com quem te acompanha".
   - Pedido não chegou: cliente Shopify pelo telefone → último pedido → `rastreio/buscar`. **No grupo** só
     o status, sem número de pedido nem código; **no privado** (`wpp-avulso`) o rastreio completo e o link
     `track.americanutrition.com/<código>`. Sem pedido pelo telefone → pede CPF/número no privado.
5. `grupo_bot_log` com `respondida` e aviso no Telegram (tópico 289): grupo, intenção, pergunta, resposta.

## Ligar / desligar
```sql
update serena_config set valor = 'on'  where chave = 'grupo_bot_ativo';   -- liga
update serena_config set valor = 'off' where chave = 'grupo_bot_ativo';   -- desliga na hora
update serena_config set valor = '120363429298095918@g.us' where chave = 'grupo_bot_grupos'; -- só QA
```

## Auditar
```sql
select criado_em, grupo_jid, push_name, intencao, acao, detalhe, left(texto, 80)
from grupo_bot_log order by criado_em desc limit 50;
```

Fontes aqui têm as chaves substituídas por placeholders (`SUPABASE_SERVICE_KEY`, `EVO_API_KEY`,
`<TOKEN_ALERTAS>`); as reais ficam só no n8n.

## Ligado em 13/09/2026 (00:30 UTC)

Teste no grupo QA com payload sintético, antes de liberar para todos:
- "Oi pessoal, qual o valor do ImunoFosfo 90 cápsulas? Tem promoção?" → `preco_promocao / imunofosfo_90 / 97` →
  3 min → postou "Oi, Teste! O *ImunoFosfo 90 cápsulas* está *R$ 327,00*. Link oficial: seguro.americanutrition.com/…"
  e gravou `respondida`.
- "Gostaria de saber a mesma coisa, qual o valor?" → confiança 40 → `ignorada`, nada postado (era exatamente o erro do bot antigo).

Depois disso: `grupo_bot_ativo = on`, `grupo_bot_grupos = todos`.
