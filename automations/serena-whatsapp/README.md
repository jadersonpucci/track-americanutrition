# Serena no WhatsApp do Samuel (Evolution API)

Alternativa ao Respond.io: o cérebro da Serena (`[Serena] Core`, `POST /webhook/serena-core`)
passa a responder direto no número do Samuel, através da instância `Samuel` da Evolution API.

Tudo roda no n8n (`https://n8n.americanutrition.com`). Este diretório guarda o código-fonte
(n8n Workflow SDK) e a documentação de operação.

## Workflows

| Workflow | ID | Função |
|---|---|---|
| `[Serena WhatsApp] Entrada Samuel -> Serena Core -> Evolution` | `zeJ8nScEpt7TckFb` | Recebe os eventos do Samuel, normaliza, chama o Core e responde |
| `[Serena WhatsApp] Saida Painel -> Samuel + Config` | `BTJBa03LiBillfHy` | Entrega o que o atendente escreve no Painel da Serena + endpoint de configuração |
| `[Serena WhatsApp] UTIL Criar Tabelas` | `KWmhz68lU6bSUeAr` | Cria `serena_wpp_buffer`, `serena_wpp_pausas` e as chaves `wpp_*` (já executado, deixar inativo) |
| `Evolution Samuel \| Dispatcher de Webhook` | `kW1lyiLPbmIIGjGR` | Já existia. Ganhou o alvo `serena` -> `/webhook/serena-wpp-in` |

## Fluxo de entrada

```
Evolution (instância Samuel)
  -> /webhook/samuel-in (dispatcher, fan-out)
  -> /webhook/serena-wpp-in
     Triagem ............ ignora grupos, status, reações, figurinhas; resolve @lid via wa_identidades
     Rotear por Tipo .... texto | imagem | audio | humano (fromMe vindo do celular)
       imagem ........... getBase64 na Evolution -> Claude Haiku descreve (via /webhook/claude-call)
       audio ............ getBase64 na Evolution -> ElevenLabs scribe_v1 transcreve
       humano ........... pausa a Serena para o número (wpp_pausa_humano_min) e grava no painel
     Registrar no Buffer  dedup por msg_id, lê config wpp_*, checa pausa e limite por hora
     Pode Responder? .... modo teste/producao/off, lista de teste, regex de assuntos do Clube
     Aguardar ........... wpp_debounce_seg (junta mensagens picadas)
     Coletar Buffer ..... só a execução da última mensagem continua; concatena o lote
     Chamar Serena Core . POST /webhook/serena-core {canal: 'whatsapp', telefone, nome, texto}
     Fatiar Resposta .... quebra respostas > 900 chars por parágrafo
     Enviar pelo Samuel . POST /message/sendText/Samuel com delay (mostra "digitando")
     Marcar Entregue .... entregue=true nas mensagens papel=serena canal=whatsapp
```

O Core já grava cliente + resposta em `serena_mensagens`, unifica identidade e respeita
`serena_conversas.ia_pausada` (pausa feita pelo Painel).

## Configuração (sem SQL, direto do iPhone)

`GET https://n8n.americanutrition.com/webhook/serena-wpp-config?t=TOKEN`
(o token está no nó `Validar Config` do workflow de saída)

| Parâmetro | Exemplo | Efeito |
|---|---|---|
| `chave=wpp_modo&valor=teste` | `teste` / `producao` / `off` | Em `teste`, só os números da lista recebem a Serena |
| `chave=wpp_teste_numeros&valor=5541999999999,5511888888888` | | Números (com 55 + DDD) liberados no modo teste |
| `chave=wpp_max_por_hora&valor=30` | | Máximo de respostas da Serena por cliente por hora |
| `chave=wpp_debounce_seg&valor=4` | | Segundos esperando mensagens picadas (4s por padrão) |
| `chave=wpp_pausa_humano_min&valor=120` | | Minutos de pausa quando um humano responde pelo celular |
| `chave=wpp_ignorar_regex&valor=(estrela\|saldo do clube\|resgat)` | | Mensagens que casam ficam com o bot do Clube |
| `liberar=5541999999999` | | Remove a pausa automática daquele número |

Sem parâmetros, o endpoint só mostra a config atual e as pausas ativas.

## Rollout sugerido

1. Histórico: ficou em `wpp_modo=teste` (só o número do Jaderson) de 02/09 até 03/09/2026 00:15 BRT, quando passou para **`wpp_modo=producao`** (todos os clientes). Para voltar ao teste ou desligar: `...&chave=wpp_modo&valor=teste` ou `valor=off`.
2. Colocar o próprio número na lista: `...&chave=wpp_teste_numeros&valor=55DDDNUMERO`.
3. Mandar mensagens para o Samuel (texto, áudio, foto de comprovante) e acompanhar no
   Painel da Serena (`/webhook/painel-serena`).
4. Quando estiver satisfeito: `...&chave=wpp_modo&valor=producao`.
5. Desligar o Respond.io do fluxo de atendimento (Custom Channel) para não haver resposta dupla.

## Convivência com os outros bots do Samuel

- `Clube — Assistente WhatsApp (Samuel)` responde a `estrela|ponto|saldo|clube|resgat` e a mensagens
  contendo e-mail. A regex `wpp_ignorar_regex` evita que a Serena responda os mesmos assuntos.
  Mensagens de cliente que contenham um e-mail ainda podem gerar resposta dupla; se isso
  incomodar, remova o alvo `clube` do dispatcher quando a Serena estiver em produção.
- Disparos automáticos (dunning, reviews, fidelidade, carrinho) continuam iguais. A resposta do
  cliente a esses disparos agora cai na Serena.
- Pausa automática por humano depende do campo `data.source` da Evolution ser `android|ios|web|desktop`.
  Se o build da Evolution não enviar esse campo, a pausa automática simplesmente não acontece
  (a pausa pelo Painel continua funcionando).

## Comandos pelo celular do Samuel

Na conversa com o cliente, digitar:

- `#serena off` -> Serena para de responder aquele cliente por 30 dias
- `#serena on` -> Serena volta a responder na hora

## Painel de Conversas com ficha 360

`GET https://n8n.americanutrition.com/webhook/serena-inbox?t=TOKEN` (workflow `[Serena] Painel de Conversas`,
token no nó `Montar SQL` do `[Serena] Painel API`).

Ao abrir uma conversa, a coluna da direita monta a **ficha 360** do contato (ação `ficha360` da API):

- **Serena**: status (ativa, pausada pelo painel, pausada por humano no celular), contagem de mensagens por papel,
  canais usados, primeira/última conversa, origem do lead (anúncio CTWA / site).
- **Shopify**: cliente encontrado por telefone (com variações do 9º dígito) ou email, total de pedidos, total gasto,
  cidade, tags, nota, link direto para o admin.
- **Último envio**: rastreio ao vivo do pedido mais recente com código (mesmo motor do track.americanutrition.com):
  status, onde está, previsão, atraso, recebido por, último evento, link.
- **Pedidos**: últimos 8 com status, valor, cupom, itens, código de rastreio e link para o pedido no admin.
- **Assinatura**, **Clube America** (nível, estrelas), **Carrinho abandonado** (com link do checkout),
  **Avaliações**, **Disparos do Samuel** (com ack e opt-out) e **Fatos memorizados**.
- Botões: pausar/reativar a Serena e abrir o contato no WhatsApp.

A thread agora separa as mensagens por dia e mostra o canal de cada uma.

## Contexto e pedidos pelo telefone (Core)

O `[Serena] Core` carrega as últimas 20 mensagens do contato (qualquer canal, qualquer data) mais os fatos de
`serena_fatos`. O prompt passou a incluir o telefone do canal e a regra: em pergunta sobre pedido, último pedido,
entrega ou rastreio, chamar `buscar_pedido_telefone` com o número do WhatsApp sem pedir nada ao cliente e, se
for o caso, `consultar_status_pedido` com o rastreio do pedido mais recente.

## Painel admin central

O card **Inbox Serena** foi adicionado ao painel admin central (`assets/america_admin.html` no tema Shopify,
servido em `GET /webhook/admin`), grupo Clientes, com badge de "aguardando resposta" vindo de
`GET /webhook/serena-inbox-count?t=TOKEN` (contatos cuja última mensagem é do cliente há mais de 2 min, nos últimos 3 dias).

## Lista de números que a Serena nunca responde

Tabela `serena_wpp_bloqueados` (telefone DDI+DDD+número, com tolerância ao 9º dígito). Checada na entrada
antes de qualquer resposta automática. Não afeta as mensagens transacionais de pedido.

- Pelo painel: botão "Nunca responder automaticamente" na ficha do contato.
- Pela URL de config: `&bloquear=5513999999999&motivo=parceiro` / `&desbloquear=5513999999999`. Sem parâmetros lista os bloqueados.
- Lista inicial carregada: 10 números informados em 03/09/2026.

## Mensagens transacionais pelo Samuel

`[Transacional] Dispatcher Samuel v3` (`WXncUehLXyuIMoSm`) substitui o `Cron Dispatcher Scheduled Messages v2`
(Respond.io, despublicado). A cada minuto lê `scheduled_messages` pendentes e envia pelo Samuel:

- `pedido_pago_confirmado` (agendado por `/webhook/pedido-pago`, disparado pela confirmação do Pagar.me).
- `pedido_enviado` (agendado por `/webhook/pedido-enviado`, fulfillment da Shopify), com link
  `https://track.americanutrition.com/CODIGO` sem encurtar.
- Idempotente por pedido, respeita opt-out, 3 tentativas, e grava a mensagem na conversa do contato
  (aparece no Inbox e vira contexto da Serena). Kill switch: `wpp_transacional=off`.
- `pedido_entregue` (agendado quando o rastreio marca entrega), com o texto de 03/09.
- Agendamentos com mais de 48h são marcados como expirados e não saem.

## Memória a partir das conversas

`[Serena Memoria] Extrair Fatos das Conversas` (`j57i6dFvooHMFqu4`): a cada 30 min, contatos com mensagens
novas e conversa ociosa há 30+ min têm a transcrição enviada ao Claude Haiku, que devolve só fatos duráveis
(saúde, família, preferências, compra, perfil). Grava em `serena_fatos` (chave = categoria, com sufixo numérico
quando repete) e o Core injeta no prompt. Controle em `serena_memoria_runs`. Não depende mais do Respond.io.

## Ficha sem Respond.io

O bloco "Campos (Respond.io)" saiu da ficha. Entrou "Cadastro (Shopify)" com endereço, CEP, cidade/UF, país,
consentimento de email/SMS, opt-in de WhatsApp (note_attributes do último pedido), último pedido com cupom e
pagamento, e cupom de boas-vindas do popup (`popup_leads`).

## Tabelas novas

- `serena_wpp_buffer(id, msg_id unique, telefone, nome, texto, processado, criado_em, processado_em)`
- `serena_wpp_pausas(telefone pk, ate, motivo, atualizado_em)`
- `serena_wpp_bloqueados(telefone pk, motivo, criado_por, criado_em)`
- `serena_memoria_runs(contato_id pk, processado_ate, fatos_extraidos, atualizado_em)`

---

# Bloco 2 (03/09/2026): handoff, alertas, fila, correções, áudio, pós-entrega, métricas

## Workflows adicionados ou alterados

| Workflow | ID | Função |
|---|---|---|
| `[Serena WhatsApp] UTIL v3 Handoff + Agentes + Correcoes` | `FRKUmJfZvORXfpST` | Cria `serena_correcoes`, `serena_agentes`, `serena_atribuicoes`, `serena_alertas` e semeia config nova (já executado) |
| `[Serena WhatsApp] Watchdog -> Telegram` | `sYBUj3v8LGAtZYR8` | Alerta de falha a cada 5 min no tópico 289 do Telegram |
| `[Serena WhatsApp] Envio Samuel (texto ou audio)` | `EhmndFruX6hOIRDN` | `POST /webhook/serena-samuel-enviar`: texto ou áudio (ElevenLabs) pelo Samuel |
| `[Serena] Sync Base de Treinamento` | `D71uJKMi3u442bL0` | Ganhou cron de 1 min com ETag + hash: sincroniza na hora que o site muda |
| `[Serena] Core` | `5Z5MdXAiatwnjc73` | Handoff pausa e abre fila; injeta carrinho abandonado, correções e notas; base primeiro para o cache do Claude |
| `[Serena Tool] Escalar Humano` | `pENiiK4JvuowUEqn` | Card no Telegram com link "Assumir no Inbox" |
| `[Serena WhatsApp] Entrada Samuel -> Serena Core -> Evolution` | `zeJ8nScEpt7TckFb` | Ack rápido (resposta em duas etapas) e resposta em áudio |
| `[Transacional] Dispatcher Samuel v3` | `WXncUehLXyuIMoSm` | Pós-entrega: manda o modo de uso dos produtos depois do "pedido entregue" |
| `[Serena] Painel API` | `YDUxkTRfg6uTucHB` | Ações novas: filas, agentes, atribuir, nota, corrigir, metricas |
| `[Serena] Painel de Conversas` (Inbox) | `yX8m7r9Zff5L77Ec` | Identidade do atendente, filas, atribuição, notas, correção, métricas |

## 1. Sincronização instantânea da base de treinamento

O site `https://serena.americanutrition.com` está na Hostinger e devolve `ETag` e `Last-Modified`. O workflow de sync
agora roda **a cada 1 minuto**: faz um `HEAD`, compara com `serena_config.base_etag` e só baixa a página quando o
cabeçalho mudou. Depois de limpar o HTML calcula um hash do texto e só regrava `base_treinamento` (e `base_hash`)
se o conteúdo realmente mudou. Quando muda, avisa no Telegram (tópico 289): "Base da Serena atualizada, versão X".

Na prática a Serena passa a usar o treinamento novo em até 1 minuto depois de o site ser publicado, em todos os canais.
Para forçar: `POST /webhook/serena-sync-base` com `{"force": true}`. O cron diário das 4h continua como rede de segurança.

## 2. Alerta de falha no Telegram (watchdog)

`[Serena WhatsApp] Watchdog -> Telegram`, a cada 5 min:

- **Samuel desconectado**: `connectionState` da instância na Evolution diferente de `open` (repete a cada 30 min, e manda "reconectado" quando volta).
- **Serena sem responder**: clientes cuja última mensagem é deles há mais de `wpp_alerta_min` (10 min) com a Serena ativa
  (em modo teste só conta os números da lista de teste). Repete a cada 30 min.
- **Clientes aguardando atendente**: conversas pausadas com mensagem pendente, ou handoff/atribuição aberta sem resposta
  humana há mais de 30 min. Repete a cada 60 min.

Dedupe em `serena_alertas`. Os alertas trazem link direto para o Inbox.

## 3. Handoff inteligente + fila "aguardando humano"

Quando a Serena usa `escalar_humano`:

1. O Core passa `contato_id`, `canal`, `telefone` e `nome_cliente` para a ferramenta. O card no Telegram (tópico 94)
   ganhou o link **"Assumir no Inbox da Serena"** (`serena-inbox?t=...&c=<contato_id>` abre a conversa direto).
2. A Serena é pausada naquele contato: no WhatsApp via `serena_wpp_pausas` (motivo `handoff`, duração `wpp_pausa_handoff_min`,
   720 min por padrão); no site/outros canais via `serena_conversas.ia_pausada`.
3. Abre uma atribuição em `serena_atribuicoes` (status `aberto`, motivo `handoff`). Ela some da fila quando alguém clica
   **"Resolvido: devolver para a Serena"** (ou reativa a Serena), que também limpa as pausas.

No Inbox, o seletor "Todas as conversas" tem **Aguardando resposta**, **Fila: esperando atendente** e **Fila: esperando a Serena**,
ordenadas por tempo de espera (⏱ na lista). O KPI "Fila humano" no topo mostra as atribuições abertas.

## 4. Carrinho abandonado, correções e notas no cérebro

`Carregar Contexto` do Core passou a trazer:

- **Carrinho abandonado** dos últimos 7 dias, não convertido (por telefone ou email): itens, total, cupom, recusa de cartão,
  boleto pendente e o `checkout_url` oficial. O prompt orienta a Serena a ajudar a concluir a compra (mandar o link, oferecer
  PIX/boleto em caso de recusa) sem forçar a venda se o cliente veio por outro assunto.
- **Correções** da equipe (`serena_correcoes`): as do próprio contato e as últimas 30 dias em geral (até 8), no formato
  "Serena disse X -> correto é Y".
- **Notas internas** (`serena_fatos` com `origem='manual'`) marcadas como "(nota da equipe)".

Também mudou a ordem do system prompt: a base de treinamento vem primeiro (prefixo idêntico em todas as chamadas) e o
contexto do cliente por último. Assim o cache de prompt do Claude passa a ser aproveitado de verdade (antes o cabeçalho
variável vinha antes da base e invalidava o cache a cada conversa).

## 5. Pós-entrega inteligente (modo de uso)

No `[Transacional] Dispatcher Samuel v3`, depois que a mensagem `pedido_entregue` sai com sucesso, um segundo passo pega
`produto_entregue` dos `template_params`, carrega a base de treinamento e pede ao Claude uma mensagem curta com o modo de uso
de cada produto (dose, horário, com/sem alimento, dica), sem inventar o que não está na base. Envia pelo Samuel logo em seguida
e grava em `serena_mensagens` com autor `pos_entrega:pedido_entregue`. Liga/desliga com `wpp_pos_entrega=on|off`.

## 6. Resposta em duas etapas (ack rápido)

Se a mensagem do cliente casa com `wpp_ack_regex` (pedido, rastreio, frete, CEP, entrega, prazo, boleto, PIX, cupom, reembolso, troca),
é a primeira do lote e a Serena não falou nos últimos 10 min, o Samuel responde na hora com `wpp_ack_texto`
("Só um instante, já estou verificando isso pra você 🙂") e a resposta completa vem depois. O ack fica gravado na conversa com autor `ack`.
`wpp_ack_rapido=on|off`.

## 7. Resposta em áudio

Quando o cliente manda áudio e a resposta da Serena é curta (até 400 caracteres, sem link), a resposta sai como mensagem de voz:
ElevenLabs `eleven_multilingual_v2` com a voz `wpp_voz_id` (padrão **Letícia**, `CcElPA8NBrawbunFs7rh`) e
`sendWhatsAppAudio` da Evolution (PTT). Se a geração falhar, cai no texto normal. `wpp_audio_resposta=on|off`.
Para trocar a voz: `...&chave=wpp_voz_id&valor=<voice_id do ElevenLabs>`.

Tudo isso passa pelo workflow auxiliar `POST /webhook/serena-samuel-enviar`
(`{number, text, delay}` ou `{number, audio_texto, voz_id, delay}` -> `{ok, tipo, message_id}`), que também serve para qualquer envio avulso.

## 8. Inbox: atendentes, notas, correção, atribuição e métricas

- **Identidade**: o chip "quem está atendendo?" no topo pede o nome (fica salvo no navegador) e ele vai como autor das mensagens,
  notas e correções. Atendentes cadastrados em `serena_agentes` (Jaderson, Cris, Samuel); abrindo o Inbox com `&a=<token do agente>`
  o nome é reconhecido automaticamente. Para cadastrar mais, inserir em `serena_agentes (nome, token)`.
- **Atribuição**: seção "Atendimento" na ficha mostra o responsável, permite "Atribuir a..." e "Resolvido: devolver para a Serena".
  Responder pelo Inbox atribui a conversa a quem respondeu. A lista mostra o nome do responsável em cada conversa.
- **Notas internas**: textarea na ficha grava em `serena_fatos` (origem `manual`), com "x" para apagar. A Serena lê as notas como "nota da equipe".
- **Correção**: link "corrigir" em cada bolha da Serena. Você escreve como ela deveria ter respondido; fica em `serena_correcoes`
  (a Serena passa a seguir nas próximas respostas) e, se quiser, é enviado ao cliente como sua mensagem, sem pausar a Serena.
- **Métricas** (botão no topo, 7/30/90 dias): conversas, autonomia (sem mensagem humana), mensagens por papel, handoffs, fila aberta,
  tempo médio e mediano de resposta, links de pagamento enviados, transacionais, pós-entrega, correções, áudios, por dia, por canal,
  por atendente e **vendas atribuídas**: pedidos pagos na Shopify de clientes atendidos pela Serena entre a primeira resposta e 72h
  depois da última (com link para cada pedido).

## Config nova (`serena_config`, via `/webhook/serena-wpp-config?t=TOKEN&chave=...&valor=...`)

| Chave | Padrão | Efeito |
|---|---|---|
| `wpp_pausa_handoff_min` | `720` | Minutos de pausa no WhatsApp após um handoff |
| `wpp_ack_rapido` / `wpp_ack_regex` / `wpp_ack_texto` | `on` / lista de assuntos / frase | Resposta em duas etapas |
| `wpp_audio_resposta` / `wpp_voz_id` | `on` / Letícia | Resposta em áudio |
| `wpp_pos_entrega` | `on` | Modo de uso após "pedido entregue" |
| `wpp_alerta_min` | `10` | Minutos sem resposta da Serena que disparam alerta |
| `base_hash` / `base_etag` | automático | Controle do sync da base |

## Tabelas novas

- `serena_correcoes(id, contato_id, mensagem_id, texto_serena, correcao, autor, criado_em)`
- `serena_agentes(nome pk, token unique, ativo, criado_em)`
- `serena_atribuicoes(contato_id pk, agente, status aberto|resolvido, motivo, atribuido_em, atualizado_em)`
- `serena_alertas(chave pk, ultimo_em, detalhe)`

## Testes feitos em 03/09

- Sync: cron de 1 min rodando; primeira passada detectou o site (v7.64, 311k caracteres) e avisou no Telegram.
- Handoff via site de teste: Core devolveu `handoff: true`, card no tópico 94 com link do Inbox, atribuição aberta, contato apareceu na fila humana com tempo de espera.
- Envio auxiliar: áudio (Letícia) e texto entregues no número de teste.
- Métricas de 7 dias com 8 vendas atribuídas encontradas na Shopify.
- Ack rápido: mensagem simulada "qual o rastreio do meu último pedido?" no número de teste recebeu "Só um instante..." na hora
  e a resposta completa da Serena (consulta do pedido pelo telefone) 10 s depois.
- Pós-entrega: linha `pedido_entregue` de teste (ImunoFosfo + Creatina) gerou o "pedido entregue" e, em seguida, o modo de uso
  tirado da base (dose, intervalo, com/sem alimento), ambos entregues no número de teste e gravados na conversa.
- Contato de teste do handoff (canal site) foi apagado depois dos testes.

## Inbox v2 (visual novo) e onde o HTML mora

O HTML do Inbox agora é o arquivo `inbox.html` deste diretório, hospedado como asset `assets/serena_inbox.html` do tema Shopify
(mesmo esquema do painel admin). O workflow `[Serena] Painel de Conversas` só busca o asset (cache de 5 min; `&nocache=1` força).

Para publicar uma alteração: editar `inbox.html` e enviar via `POST /webhook/shopify-admin` com
`{"acao":"atualizar_pedido","endpoint":"themes/153190498476/assets.json","metodo":"PUT","payload":{"asset":{"key":"assets/serena_inbox.html","value":"<html...>"}}}`.

Visual: três colunas (lista com avatares, filtros em chips e ponto de não lido; conversa com bolhas estilo WhatsApp e ações no cabeçalho;
ficha 360 em abas Resumo / Pedidos / Cliente / Equipe), modais para atendente, correção e métricas, toasts em vez de alertas,
e layout de celular (lista → conversa → ficha, com botão voltar). Atendentes cadastrados: Cris e Samuel.

---

# Bloco 3 (03/09/2026): respostas prontas, etiquetas, cliente irritado, carrinho pela Serena, app no iPhone

| Workflow | ID | O que mudou |
|---|---|---|
| `[Serena WhatsApp] UTIL v4 Prontas + Etiquetas + Push` | `xvJIdAIv7Ie85e6H` | Cria `serena_respostas_prontas` (7 atalhos iniciais), `serena_etiquetas`, `serena_push_subs`; semeia `inbox_etiquetas`, `detectar_irritado`, `carrinho_via_serena` (já executado) |
| `[Serena] Core` | `5Z5MdXAiatwnjc73` | Detecção de humor (Haiku) com escalonamento automático; etiquetas automáticas; modo proativo |
| `Dispatcher Carrinho Abandonado` | `MqCaAfZt6PIVat1R` | A primeira mensagem do carrinho é escrita pela Serena (fallback nos templates) |
| `[Serena Tool] Escalar Humano` | `pENiiK4JvuowUEqn` | Além do card no Telegram, dispara push para os atendentes |
| `[Serena WhatsApp] Push -> Atendentes` | `TBjkNpRT6iYJvsSC` | `POST /webhook/serena-push`: Web Push nativo (RFC 8291 + VAPID) sem biblioteca |
| `[Serena] Painel API` | `YDUxkTRfg6uTucHB` | Ações `setup`, `prontas`, `pronta_salvar`, `pronta_apagar`, `etiquetar`, `push_sub`, `push_unsub`; filtro por etiqueta; métricas por etiqueta e irritados |
| `[Serena] Painel de Conversas` | `yX8m7r9Zff5L77Ec` | Serve também `/webhook/serena-inbox-manifest` e `/webhook/serena-inbox-sw.js` (PWA) |

## Respostas prontas
Digite `/` no campo de resposta para abrir a lista (setas navegam, Tab ou Enter escolhe). O botão ⚡ abre a lista e o link
"gerenciar" cadastra, edita e apaga. Variáveis: `{primeiro_nome}`, `{nome}`, `{agente}`, `{pedido}`, `{rastreio}`, `{rastreio_link}`,
preenchidas com os dados da ficha. Atalhos iniciais: `/oi`, `/aguarde`, `/rastreio`, `/pix`, `/prazo`, `/troca`, `/encerrar`.

## Etiquetas
Lista padrão em `serena_config.inbox_etiquetas` (reclamacao, venda, duvida de uso, rastreio, troca/reembolso, elogio, urgente).
No cabeçalho da conversa: "+ etiqueta" (ou uma nova digitada), "×" remove. Filtro "Todas as etiquetas" na lista e contagem
por etiqueta nas métricas. A Serena etiqueta sozinha pelo que fez na conversa: `venda` (checkout/PIX/boleto), `rastreio`,
`frete`, `endereco`, `humano` (escalou), `reclamacao` + `urgente` (cliente irritado), `insatisfeito`.

## Cliente irritado: escala sozinha
A cada mensagem, o Core pede ao Haiku uma classificação das últimas mensagens do cliente (`neutro | insatisfeito | irritado`).
`irritado` (raiva explícita, ameaça de Procon/Reclame Aqui/processo, xingamento, terceira cobrança sem solução): a Serena ainda
responde essa mensagem, mas já pausa, abre a atribuição com motivo `irritado`, manda o card no Telegram e o push.
`insatisfeito` só etiqueta. Desliga com `detectar_irritado=off`. Testado: mensagem em caixa alta ameaçando Procon foi classificada e escalada.

## Carrinho abandonado conduzido pela Serena
O dispatcher continua decidindo quem recebe e quando (carrinho, cartão recusado, boleto pendente, checagem de pagamento na Shopify,
link encurtado, intervalo anti-ban). A mensagem em si agora vem do Core em **modo proativo** (`modo: 'proativo'`, `tipo_proativo: 'carrinho'`,
`instrucao` + `contexto.carrinho`): a Serena escreve no tom dela, com histórico do cliente se houver, e a mensagem fica gravada na conversa
(autor `proativo:carrinho`), então a resposta do cliente continua com ela. Se o Core falhar ou `carrinho_via_serena=off`, caem os templates antigos.
Métrica "Carrinhos pela Serena" no modal.

## Inbox como app no iPhone, com notificação
- Abra `https://n8n.americanutrition.com/webhook/serena-inbox?t=TOKEN` no Safari → Compartilhar → **Adicionar à Tela de Início**.
  O manifest (`/webhook/serena-inbox-manifest?t=TOKEN`) deixa o app em tela cheia com ícone próprio.
- Dentro do app instalado, toque em 🔔 **Notificações**, informe quem está atendendo e aceite. A inscrição vai para `serena_push_subs`.
- A cada escalonamento (pedido pelo cliente ou irritado detectado) o `Escalar Humano` chama `/webhook/serena-push`, que cifra o aviso
  e entrega pelo serviço de push da Apple/Google. Tocar na notificação abre a conversa direto.
- Requisitos: iOS 16.4+ e o Inbox aberto pelo ícone da Tela de Início (Safari solto não recebe push). Android/Chrome funciona sem instalar.
- Com o Inbox aberto, a fila também avisa na hora: toast, vibração, bip e contador no título.
- Chaves VAPID geradas automaticamente na primeira chamada e guardadas em `serena_config` (`push_vapid_public/private`).

## Tabelas
- `serena_respostas_prontas(id, atalho unique, titulo, texto, ativo, criado_por, criado_em, atualizado_em)`
- `serena_etiquetas(contato_id, etiqueta, origem manual|auto, criado_por, criado_em)`
- `serena_push_subs(endpoint pk, p256dh, auth, agente, ua, ativo, falhas, criado_em, atualizado_em)`

## Modelo e cache (03/09/2026, 07:00 BRT)

- `serena_config.modelo` = **`claude-sonnet-5`** (antes `claude-sonnet-4-5-20250929`). O Core manda `output_config.effort = medium` para os modelos da família 5 / 4.6+ (eles pensam por padrão; médio mantém a resposta rápida no chat).
- A base de treinamento vai no primeiro bloco do system prompt com **cache de 1 hora** (`cache_control: {type: ephemeral, ttl: 1h}`), no Core e no pós-entrega. Antes era 5 min e, como as mensagens chegam espaçadas, quase toda resposta pagava o cache frio.
- Medido com a base atual (v7.64): 143.905 tokens em cache no Sonnet 5; resposta em 8 a 11 s.
- Custo aproximado por resposta (US$ 1 = R$ 5,50): cache quente ≈ R$ 0,19; gravação do cache (no máximo uma por hora de atividade) ≈ R$ 3,20. Com ~60 respostas/dia: ≈ R$ 55/dia, ≈ R$ 1.700/mês. Antes (Sonnet 4.5, cache de 5 min): ≈ R$ 210/dia.
- Para voltar: `update serena_config set valor = 'claude-sonnet-4-5-20250929' where chave = 'modelo'` (ou `claude-haiku-4-5-20251001` para o mais barato, ≈ R$ 0,07 por resposta quente).
- Alerta de falha da API (saldo, limite) no Telegram tópico 289 via `/webhook/serena-alerta` (dedupe 30 min) e reprocessamento automático a cada 10 min (`[Serena WhatsApp] Reprocessar sem resposta`, `wXN30aD4YloMV2NN`) quando a API volta.

---

# Lote 2 (03/09/2026, tarde): reposição, Instagram/Messenger, resumo, sugestão, lacunas, auditoria, rastreio proativo, trocas, anti-spam

Tudo ligado em produção, exceto Instagram/Messenger (`meta_ativo=off` até configurar o app da Meta). O item 4 da lista ("checkout pelo WhatsApp") já existia: a Serena gera link de pagamento, PIX e boleto pelas ações `gerar_checkout`, `gerar_pix` e `gerar_boleto` do Router.

## 1. Reposição automática (`[Serena] Reposicao Automatica`, id nWHsrcGNkuBDgYA2, cron 1h)
- Depois que o aviso "pedido entregue" sai pelo Samuel, o pedido entra em `serena_reposicao`. A Serena (mesmo modelo e cache da base) estima em quantos dias os produtos acabam pela dose recomendada (ex.: ImunoFosfo 90 caps a 3/dia = 30 dias; fallback sem IA: cápsulas/2 por dia). O aviso fica para `dura_dias - reposicao_dias_antes` (mínimo `reposicao_min_dias`, padrão 15).
- No dia, dentro de `reposicao_hora_ini..reposicao_hora_fim` (BRT), o Core em modo proativo (`tipo_proativo=reposicao`) escreve a mensagem: pergunta como está o uso, avisa que está acabando e oferece mandar o link. Se o cliente responder "quero", a conversa normal gera o checkout.
- Pula quem comprou de novo depois da entrega (`scheduled_messages` pedido_pago_confirmado), opt-out, bloqueados, quem já recebeu reposição em 30 dias; pausados tentam na próxima hora. Um agendamento por telefone por vez.
- Primeira execução agendou 15 pedidos entregues nos últimos 3 dias. Ver no Inbox: Mais > Reposições agendadas. Kill switch: `reposicao_ativa=off`.

## 6. Instagram Direct + Messenger (`[Serena Meta] Instagram + Messenger`, id ntmDA1FhQFZkvQNM)
- `GET /webhook/serena-meta` responde ao desafio de verificação da Meta (`hub.verify_token` = `serena_config.meta_verify_token`, hoje `an-meta-5251646623f1`).
- `POST /webhook/serena-meta` recebe `entry[].messaging[]` (mesmo formato para Instagram e Messenger), manda ao Core com `canal=instagram|messenger` e identidade `session_site = ig:<id>` ou `fb:<id>` (não existe telefone; a Serena pede e-mail ou número do pedido quando precisa), responde pela Graph API (`/v21.0/me/messages`) e marca `entregue`. Cron de 1 min entrega o que o atendente escreve no Inbox nesses canais.
- Para ligar: criar app em developers.facebook.com, assinar os webhooks `messages` da Página e do Instagram apontando para a URL acima, gerar token de página de longa duração e gravar: `meta_page_token`, opcionalmente `meta_ig_token` (Instagram Login) e `meta_app_secret` (valida `X-Hub-Signature-256`), depois `meta_ativo=on`. Tudo via `/webhook/serena-wpp-config?t=an-wpp-7Qm3Vz9K&chave=...&valor=...`.
- Testado: verificação responde o challenge com token certo e 403 com token errado; POST com `meta_ativo=off` é ignorado.

## 8. Resumo automático ao cair na fila (`[Serena Tool] Escalar Humano`)
- Em todo handoff (pedido do cliente, cliente irritado ou callback) o Escalar busca a conversa pela API do painel, o Haiku resume em 4 linhas (quem/o que quer, o que a Serena fez, o que falta, dados úteis) e grava em `serena_atribuicoes.resumo` (ação `resumo_salvar`).
- Aparece no card do Telegram, no push, na lista do Inbox (linha 📝 sob a conversa da fila), acima do campo de resposta e na aba Equipe.

## 9. Sugestão de resposta para o atendente (Core `modo=sugerir`)
- Botão ✨ Sugerir no Inbox. Chama `POST /webhook/serena-core` com `{modo:'sugerir', t:TOKEN, contato_id, nome:agente, instrucao}`; o Core carrega o histórico completo, pode consultar pedidos/rastreio (sem `escalar_humano` nem `registrar_troca`), escreve a mensagem em primeira pessoa como o atendente e NÃO grava nem envia nada. Funciona mesmo com a Serena pausada. O texto vai para o campo; o atendente revisa e envia.
- Se já houver texto no campo, ele vira instrução interna ("diga que vamos reenviar").

## 12. Perguntas sem resposta (lacunas de treinamento)
- O mesmo classificador Haiku do humor agora recebe também a resposta da Serena e devolve `sem_resposta` + `pergunta` (reescrita de forma genérica) + `tema`. Quando a Serena diz que não sabe, que vai verificar, ou ignora a pergunta, vira linha em `serena_lacunas` (uma por contato a cada 2h) e etiqueta `sem-resposta`.
- Inbox: Mais > Perguntas sem resposta (filtro por dias, só abertas, temas; marcar resolvida depois de acrescentar na base em serena.americanutrition.com). Aba Equipe mostra as do contato. O boletim diário lista as de ontem. Config: `detectar_lacunas`.

## 13. Auditoria de qualidade (`[Serena] Auditoria Diaria + Lacunas`, id 1oB1bJlRNnuIR97Z, 07:30 BRT)
- Amostra de até `auditoria_amostra` (15) conversas de ontem com cliente + Serena. Um segundo Claude (mesmo modelo e base em cache, effort low) dá nota 1-10, `resolveu`, problemas tipados (fato_errado, invencao, nao_respondeu, tom, processo, formato), resumo e sugestão para a base. Grava em `serena_auditorias` (única por contato e dia).
- Telegram (tópico 289): média, conversas com nota ≤ `auditoria_nota_alerta` (6) com link do Inbox, sugestões para a base e as lacunas do dia. Inbox: Mais > Auditoria da Serena. Primeira rodada manual (02/09): 3 conversas, média 7,7.

## 15. Rastreio proativo (`[Serena] Rastreio Proativo`, id OtzYsPkyTEIfPG4P, cron 6h)
- Pedidos com aviso "enviado" e sem aviso "entregue" (45 dias) são consultados no motor de rastreio (`/webhook/rastreio/buscar`). Sem movimentação há `rastreio_parado_dias` (3) e não entregue, entre 8h e 20h BRT: o Core proativo (`tipo_proativo=rastreio_parado`) avisa o cliente antes dele perguntar (com o link track.americanutrition.com), grava nota "rastreio parado" e etiqueta `rastreio-parado` no contato e a equipe recebe a lista no tópico 289. Máximo 2 avisos por código, 4 dias entre eles.
- Entregues, cancelados, devolvidos e extraviados são fechados (`serena_rastreio_alertas.entregue=true`). Teste a seco (config off): 25 códigos, datas lidas corretamente, 24 já entregues. Inbox: Mais > Rastreios parados.

## 16. Troca e devolução guiada (`[Serena Tool] Troca e Devolucao`, id VujldCtkPDLPLxzL)
- Nova ação `registrar_troca` na ferramenta do Core. O cabeçalho instrui a Serena a coletar, uma pergunta por vez: pedido (busca pelo telefone se não souber), produto e quantidade, motivo detalhado e foto se houver dano (a descrição da imagem que a Entrada já gera). Com tudo em mãos chama `POST /webhook/serena-troca`, que grava `serena_trocas`, abre atribuição `troca`, etiqueta `troca` e avisa Telegram (tópico 94) + push; devolve o protocolo `#id`. Caso igual nas últimas 48h é reaproveitado.
- Se o cliente já tem caso aberto, a Serena informa que está em análise e não abre outro. Inbox: Mais > Trocas e devoluções (status aberta / em_analise / aprovada / recusada / concluida, com resolução); a aba Equipe mostra os casos do contato. Recusada/concluída fecha a atribuição.

## 17. Anti-spam (`Entrada Samuel`, node Pode Responder?)
- Número sem histórico e sem pedido (`msgs_anteriores=0` e nenhum `scheduled_messages` com o telefone) cuja primeira mensagem tem cara de oferta (link, "tráfego pago", "parceria", "fornecedor", "renda extra"... ou texto > 600 caracteres) passa pelo Haiku. `spam=true` com confiança ≥ 0,8 (vendedor, golpe, bot, divulgação): entra em `serena_wpp_bloqueados` com motivo `antispam` e o texto em `detalhe`, a Serena não responde e a equipe é avisada no tópico 289. Cliente de verdade (dúvida de produto, pedido, saúde) passa mesmo com link.
- Reversível: Inbox > Mais > Números bloqueados > desbloquear (ou `?desbloquear=55...` no endpoint de config). Config: `antispam`.

## Painel API: ações novas
`resumo_salvar`, `lacunas` (dias, so_abertas), `lacuna_resolver` (id, resolver), `auditorias` (dias), `trocas` (dias, so_abertas), `troca_status` (id, status, resolucao), `bloqueados`, `desbloquear` (telefone), `reposicoes`, `rastreios`. `conversas` devolve `resumo`; `ficha360` devolve `atribuicao.resumo`, `trocas` e `lacunas`; `metricas` ganhou lacunas, auditoria (média e ruins), trocas, spam, reposições e rastreios.

Bug antigo corrigido: `atribuir` com `resolver=true` falhava no Postgres (referência a `p` dentro do `ON CONFLICT`), então o botão "✓ Resolvido" do Inbox nunca devolvia a conversa para a Serena. Agora usa `excluded.status`.

## Endpoint de config liberado para as chaves novas
`GET /webhook/serena-wpp-config?t=an-wpp-7Qm3Vz9K&chave=X&valor=Y` aceita agora: on/off em `wpp_transacional, wpp_ack_rapido, wpp_audio_resposta, wpp_pos_entrega, detectar_irritado, detectar_lacunas, carrinho_via_serena, reposicao_ativa, antispam, auditoria_ativa, rastreio_proativo, meta_ativo`; números em `wpp_max_por_hora, wpp_pausa_humano_min, wpp_pausa_handoff_min, wpp_debounce_seg, wpp_alerta_min, max_tokens, reposicao_dias_antes, reposicao_min_dias, reposicao_hora_ini, reposicao_hora_fim, auditoria_amostra, auditoria_nota_alerta, rastreio_parado_dias`; texto em `wpp_teste_numeros, wpp_ignorar_regex, wpp_ack_regex, wpp_ack_texto, wpp_voz_id, modelo, inbox_etiquetas, meta_*`. `&bloquear=55...&motivo=...&detalhe=...` também grava o detalhe. A resposta lista toda a config (tokens da Meta mascarados).

## Inbox v4 (arquivo `inbox.html`, asset `assets/serena_inbox.html`)
Menu "☰ Mais" (Métricas, Perguntas sem resposta, Auditoria, Trocas, Reposições, Rastreios, Bloqueados, Respostas prontas), botão ✨ Sugerir no campo de resposta, resumo automático acima do composer e na aba Equipe, trocas e lacunas do contato na aba Equipe, canal `messenger`, métricas novas, `?modal=lacunas|auditoria|trocas` abre direto (links do Telegram). Cabeçalho compacto no celular.

## Tabelas e config (UTIL v5, id tpxfFjyaCRIypRep)
`serena_reposicao`, `serena_lacunas`, `serena_auditorias`, `serena_trocas`, `serena_rastreio_alertas`; colunas `resumo`/`resumo_em` em `serena_atribuicoes` e `detalhe` em `serena_wpp_bloqueados`. Config: `reposicao_ativa=on, reposicao_dias_antes=5, reposicao_min_dias=15, reposicao_hora_ini=9, reposicao_hora_fim=20, antispam=on, auditoria_ativa=on, auditoria_amostra=15, auditoria_nota_alerta=6, rastreio_proativo=on, rastreio_parado_dias=3, detectar_lacunas=on, meta_ativo=off, meta_verify_token, meta_page_token='', meta_ig_token='', meta_app_secret='', meta_page_id='', meta_ig_id=''`.

## Fontes neste diretório
`troca-devolucao.workflow.js`, `reposicao-automatica.workflow.js`, `rastreio-proativo.workflow.js`, `auditoria-diaria.workflow.js`, `meta-instagram-messenger.workflow.js`, `util-v5-lote2.workflow.js` (SDK, criados por `create_workflow_from_code`) e `nodes/` com o código atual dos nodes editados em workflows existentes: Core (Normalizar, Carregar Contexto, Cerebro Serena, Salvar Conversa, Montar Resposta), Painel API (Montar SQL, Formatar) e Entrada Samuel (Registrar no Buffer, Pode Responder?).

## Custo adicional estimado
Humor + lacuna: 1 chamada Haiku por resposta (já existia, só cresceu o prompt). Resumo no handoff: 1 Haiku por handoff. Sugestão: 1 chamada Sonnet com cache por clique. Reposição: 1 Sonnet (cache) por pedido entregue + 1 por aviso. Auditoria: até 15 Sonnet (cache, effort low) por dia ≈ R$ 0,80/dia. Rastreio: só o motor de rastreio, Sonnet apenas quando avisa. Anti-spam: 1 Haiku só em número novo suspeito. No total, bem abaixo de R$ 10/dia a mais.
