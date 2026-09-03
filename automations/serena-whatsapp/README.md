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

1. Estado atual: `wpp_modo=teste`, lista de teste vazia. Nenhum cliente recebe a Serena ainda.
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
