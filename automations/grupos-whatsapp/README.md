# Grupos WhatsApp — Moderação Automática (n8n `AyS0758LjFJ1qx8v`)

Fluxo: `Moderacao IN` (POST /webhook/grupo-moderacao, alimentado pelo dispatcher do Samuel) → `Pre-filtro de Suspeita` (Code) → `Direto?` (IF) → regra direta vai para `Apagar ou Alertar`; o resto passa por `Classificar com Claude` (Sonnet) antes.

Fontes aqui (`moderacao-prefiltro.js`, `moderacao-apagar-ou-alertar.js`) têm as chaves substituídas por placeholders; as reais ficam só no n8n.

## Convite para grupo de fora (03/09/2026)

Caso: às 17:59 a Vanderli postou em dois grupos (#1 ImunoFosfo e Connect Oncológicas) o link `chat.whatsapp.com/J7YGFsy6QuNFtx27vHSvyc` "grupo sobre tratamentos alternativos para o câncer". O pré-filtro antigo só mandava para a IA link acompanhado de palavra de venda, então a mensagem passou sem moderação.

Regra nova, sem IA: qualquer `chat.whatsapp.com/<codigo>` (ou cartão nativo de convite, `groupInviteMessage`) é resolvido na Evolution (`GET /group/inviteInfo/Samuel?inviteCode=`). Se o grupo de destino não estiver na lista `GRUPOS` (os oficiais ImunoFosfo), a mensagem recebe a categoria `link_grupo_externo` com confiança 100 e é apagada para todos, com registro em `grupo_moderacao` e aviso no Telegram. Se o convite estiver inválido ou a Evolution falhar, confere pelo `inviteCode` de cada grupo oficial; se ainda assim não der para confirmar, só alerta (confiança 60). Mensagens da equipe e de admins continuam intocadas.

Reprocessadas na hora as duas mensagens da Vanderli: o convite resolveu para o grupo **"SUPERANDO O CÂNCER - CALCIUM 2-AEP"** (concorrente) e as duas foram apagadas (`acao = apagada`).

## Limpar tudo o que um número postou (08/09/2026) — n8n `OlDkvRz2Phh7ISvy`

Caso: na manhã de 08/09 o número **+55 86 92002-8427** (Luercio / "Carvalho" / "L.chaves") despejou 57 mensagens em três grupos (#1, #2 e Connect Oncológicas) — texto, vídeo, foto e chave PIX pedindo doação. A moderação automática pegou só parte (15 no Connect); o resto passou porque pedido de ajuda pessoal é classificado como `normal`, e é assim que deve continuar sendo.

Faltava uma forma de limpar **o número inteiro** de uma vez, sem depender do classificador. Fonte em `limpar-numero.js`.

`GET /webhook/grupo-limpar?t=an-mod-5Rt8Bn2W&numero=5586920028427`

- Varre as mensagens recentes na Evolution (`POST /chat/findMessages/Samuel`) e filtra no código — nessa versão a Evolution **ignora o `where`**, então filtro server-side não funciona.
- Considera só os 11 grupos oficiais, só mensagens de terceiros (`fromMe: false`) e casa o número tanto em `key.participant` (que hoje vem em `@lid`) quanto em `key.participantAlt`.
- Grava o texto original em `grupo_moderacao` **antes** de apagar (`categoria = spam_geral`, `motivo = 'Limpeza manual do numero inteiro'`) e só então chama `DELETE /chat/deleteMessageForEveryone/Samuel`.
- Manda um resumo para o Telegram e devolve JSON com o total por grupo.

Parâmetros: `&teste=1` só lista (use sempre antes), `&horas=48` amplia a janela (padrão 24, máx. 720), `&remover=1` também tira a pessoa dos grupos onde ela postou. Números da equipe são recusados.

Limite do WhatsApp: só dá para apagar para todos **em grupo**. Na conversa privada, mensagem que o outro mandou não pode ser "desenviada" — some só do nosso lado.

## Pausa geral das automações de grupo (09/09/2026)

O número do Samuel voltou depois do banimento. Antes de religar qualquer coisa, tudo o que
posta ou apaga em grupo, e tudo o que dispara mensagem não pedida, foi **despublicado no n8n**.
Nada foi apagado: é só publicar de novo, um de cada vez.

| Workflow | ID | O que fazia |
|---|---|---|
| Grupos \| Auto-Resposta v2 (IA) | `4fR11ODZtAJB6rWc` | Respondia preço, link e posologia dentro dos grupos |
| Grupos \| Moderação Automática | `AyS0758LjFJ1qx8v` | Apagava spam para todos |
| Grupos \| Resumo Diário com Aprovação | `OgE8nAxAwjCwKtJp` | Gerava o resumo diário |
| Grupos \| Publicar Resumo Aprovado | `mWXSSyxqBfhpLX3V` | Publicava o resumo no clique do botão |
| Grupos \| Disparador de Resumos Agendados | `8ZGjprsMgYiwNQNC` | Postava os resumos aprovados a cada 5 min |
| AN - Receita do Dia (Grupos WhatsApp) | `5ZJByEsg1RWkk9gr` | 1 receita por dia, 10h BRT, em todos os grupos |
| Broadcast Grupos \| WF-B Dispatcher | `Znr91NDLNbICdik3` | Cron de 1 min que disparava os broadcasts agendados |
| Convite Grupo \| WF1 Agendador | `L291r4YlBnxu4Cfs` | Agendava convite 3 dias após cada compra |
| Convite Grupo \| WF2 Dispatcher | `4fThGqrY5TnS8Xle` | Mandava os convites a cada 10 min |
| Popup Boas-Vindas - Cupom 10% | `9RlnW2MtMFGeQ07s` | Mandava o cupom de boas-vindas pelo Samuel |
| AN - Popup Follow-up Cupom (Samuel) | `C0lG0p0hYBpfqDmU` | Lembrete do cupom 48h depois |
| AN - Reviews Convite Pós-Entrega (Samuel) | `QWB9Gw8e7DTH4bP5` | Convite de avaliação 15 dias após a postagem |

O popup dos 10% também saiu do site: no `layout/theme.liquid` a linha
`{% render 'an-popup-boasvindas' %}` virou comentário, com a explicação em volta. O snippet
continua no tema, então religar é tirar o comentário. Conferido no HTML servido de
`www.americanutrition.com`: o popup sumiu e o chat da Serena continua lá.

### Por que a pressa: a fila de convites

Antes de pausar, a tabela `convites_grupo` tinha **1.207 convites vencidos** esperando envio,
o mais antigo agendado para **24/06**. O histórico de envio conta o resto:

| Quando (BRT) | Convites enviados |
|---|---|
| 30/05 10h | 1 |
| 08/09 18h | 118 |
| 08/09 19h | 32 |

Ou seja: o dispatcher passou meses sem entregar, acumulou mais de mil convites e despejou 150
em duas horas no dia 08/09 — o mesmo dia do banimento. Convite não solicitado, em volume, para
gente que nunca escreveu para o número. É o padrão que o WhatsApp pune.

Não dá para afirmar que foi a única causa, mas é o sinal mais forte que os dados mostram. E a
fila continuava armada: no minuto em que o número voltasse, os outros 1.207 sairiam.

O mesmo padrão, menor, estava em `review_convites`: **76 convites de avaliação vencidos**, o mais
antigo de **02/07**. Por isso esse workflow entrou na lista, mesmo não sendo de grupo.

**Antes de religar qualquer um desses, esvaziar ou expirar a fila acumulada.** Publicar sem
limpar repete exatamente o disparo que derrubou o número.

### O que continua ligado (e por quê)

- **Entrada Samuel** e **Envio Samuel**: a Serena só responde quem escreve primeiro.
- **Dispatcher Transacional v3**: pago, enviado e entregue. Fila vazia, é resposta a compra real.
- **Carrinho Abandonado**: 1 carrinho vencido na fila, sem represamento.
- **Rastreio Proativo** e **Reposição Automática**: 0 vencidos nas duas filas.
- Leitura pura, que nunca posta: Radar, Snapshot de grupos, Leitor de Imagens, Raio-X Semanal,
  Fila de Oportunidades, Expurgo, painéis.
- **Grupos | Limpar Mensagens de um Numero**: endpoint manual, só roda quando alguém chama.

## Filas zeradas e a trava contra represamento (09/09/2026)

### O que foi removido

| Fila | Antes | Depois |
|---|---|---|
| `convites_grupo` | 1.255 agendados, 1.207 vencidos, o mais antigo de 24/06 | 0 |
| `carrinhos_abandonados` | 124 pendentes vencidos, o mais antigo de 22/06 | 0 |

Nada foi apagado: as linhas viraram `status = 'expirado'`, então o histórico continua lá para
auditoria e nenhuma dessas mensagens sai mais. As demais filas (transacional, avaliação,
reposição, broadcast) já estavam limpas.

**Correção sobre o relato anterior.** Os "76 convites de avaliação vencidos" que eu citei não
eram fila: os 76 estão com `status = 'cancelado'`. A consulta que eu usei filtrava só por
`enviado_em is null`, que naquela tabela não distingue cancelado de pendente. Não havia
represamento em `review_convites`. O workflow `AN - Reviews Convite Pós-Entrega` foi pausado
por causa dessa leitura errada — continua pausado, mas por decisão, não por fila.

**Achado no lugar disso:** `carrinhos_abandonados` tinha 124 pendentes vencidos desde 22/06,
num cron de 1 minuto e com o workflow **ligado**. Minha primeira consulta usou `abandonado_em`
em vez de `abandonar_em` e por isso mostrou 1. Nenhuma mensagem de carrinho chegou a sair
depois que o número voltou; o `Dispatcher Carrinho Abandonado` (`MqCaAfZt6PIVat1R`) foi pausado
antes disso.

### A trava: `Filas | Guarda de Represamento` (`z75qStbDY4Xu2pUv`)

Código em `guarda-filas.js`. Cron de 15 minutos, mais
`GET /webhook/filas-guarda?t=TOKEN` (`&teste=1` só conta, não expira).

A regra é uma frase: **mensagem atrasada demais não é mensagem atrasada, é mensagem que não
deve mais existir.** A cada rodada ele expira o que passou do prazo e alerta no tópico 289
quando ainda sobra fila vencida.

| Fila | Prazo | TTL | Alerta acima de |
|---|---|---|---|
| `convites_grupo` | `enviar_em` | 72h | 30 |
| `carrinhos_abandonados` | `abandonar_em` | 72h | 30 |
| `scheduled_messages` | `send_at` | 48h | 30 |
| `review_convites` | `enviar_em` | 168h | 30 |
| `serena_reposicao` | `avisar_em` | 168h | 30 |
| `broadcasts_grupos` | `enviar_em` | 24h | 3 |

Duas camadas, de propósito. O TTL impede o disparo em massa mesmo que ninguém esteja olhando:
por mais tempo que um disparador fique parado, a fila não vira bomba. O alerta é o que evita a
próxima surpresa: represamento passa a ser aviso, não descoberta depois do estrago.

Os nomes de tabela e coluna são fixos no node, nunca vêm do banco — o node monta SQL e isso
tinha que ficar fechado. O webhook exige token porque mexe em dado de produção; o cron entra
sem query e roda direto.

**Para vigiar uma fila nova**, acrescente uma linha em `FILAS`. Fila de disparo nova sem linha
aqui é fila que pode represar de novo.

Testado em produção: `?teste=1` contou 124 carrinhos vencidos sem tocar em nada; a rodada real
expirou os 124, zerou todas as filas e mandou o alerta no tópico 289; sem token, responde
`token invalido`.

### A própria guarda virou spam, e o conserto (10/09)

Print da madrugada: "Guarda de filas — carrinhos_abandonados, ainda vencidos: 31" às 02:30,
02:45, 03:00, 03:15... O cron é de 15 minutos e a primeira versão avisava sempre que uma fila
passava do limite, sem checar se algo havia mudado. Foi o mesmo erro que o watchdog cometia com
a fila humana, cometido de novo por mim no dia seguinte.

**Fila esvaziada.** 33 carrinhos `pendente` vencidos (de 09/09 em diante) viraram `expirado`.
Sobrou 1, que ainda não venceu. Nenhum deles ia sair mesmo: o `Dispatcher Carrinho Abandonado`
está despublicado.

**Dedupe de verdade.** O alerta agora fala quando o **conjunto** de filas em alarme muda, e se
nada mudou repete no máximo uma vez a cada 12h. O conjunto vai em `serena_alertas.detalhe`,
mesma tabela que o watchdog usa. Quando o alarme cessa, manda uma linha de "filas normalizadas"
e apaga o estado. Erro de SQL e expurgo grande (10+) mantêm aviso próprio, com piso de 30 min.

Importante: o conjunto é comparado por **nome de fila**, não pela contagem. Comparar contagem
não resolveria nada — era justamente o que fazia o texto parecer novo a cada rodada, porque o
número muda sozinho.

**Flag `pausado`.** Fila cujo disparador está desligado de propósito (`convites_grupo` e
`carrinhos_abandonados` hoje) continua sendo expirada, mas não gera alerta: acumular era o
esperado, e avisar disso a cada rodada é só barulho. **Ao republicar o disparador, tire a flag** —
senão a fila volta a acumular sem ninguém ser avisado, que é exatamente o buraco de 08/09.

Conferido em produção: modo conferência e rodada real, as duas com `em_alarme: null` e
`avisou: false`.

## Moderação religada só para a mensagem automática de ausência (10/09/2026)

Print do grupo #1 ImunoFosfo: uma cliente perguntou sobre a fórmula e, logo em seguida, dois
robôs de WhatsApp Business responderam no grupo — "Agradecemos sua mensagem. Não estamos
disponíveis no momento" e "Olá! Obrigada pelo seu contato. No momento estou fora do atendimento
(...) Daniele Sales Corretora de Imóveis, Creci 5853f". É o robô de quem está no grupo
respondendo à mensagem dos outros. Enterra a pergunta de quem é cliente de verdade.

**A capacidade já existia e não foi acionada porque eu tinha pausado a moderação em 09/09.**
A categoria `ausencia_automatica` já estava no pré-filtro e já era de remoção automática.
Conferido com os textos exatos do print, mais quatro mensagens legítimas de controle:

| Mensagem | Resultado |
|---|---|
| "Agradecemos sua mensagem. Não estamos disponíveis no momento..." | apaga |
| "Obrigada pelo seu contato. No momento estou fora do atendimento..." | apaga |
| "Oi boa tarde, gostaria de saber sobre essa fórmula, a opinião de quem usou" | passa |
| "Comecei a tomar mês passado e minha disposição melhorou muito, obrigada a todos" | passa |
| "Muito obrigada pela atenção de vocês, Deus abençoe" | passa |
| "Bom dia, quantas cápsulas por dia devo tomar?" | passa |

**O que mudou ao religar:**

- `MODO_AUTO` ficou só com `ausencia_automatica`. Spam de venda, golpe, spam geral e convite
  para grupo de fora continuam sendo detectados e avisados no tópico 🛡 Moderação, mas **não
  apagam nada sozinhos** — reativando por partes, como combinado. Para voltar a apagar, é só
  devolvê-los à lista.
- **Teto de 20 remoções por hora**, contadas em `grupo_moderacao`. Acima disso o Samuel para de
  apagar e passa a só alertar, mesmo com confiança alta. Apagar em massa é comportamento de
  conta comprometida, e foi volume que derrubou o número em 08/09. Um grupo saudável não produz
  20 mensagens automáticas por hora; se produzir, alguém precisa olhar antes.
- O aviso no Telegram passou a dizer **por que** não apagou: teto batido, ou categoria em modo
  aviso.

**Dois limites honestos.** A decisão final é do classificador (Claude), que precisa devolver
confiança de 90 ou mais; abaixo disso a mensagem só é avisada, não apagada. E o texto original
fica salvo em `grupo_moderacao` antes de qualquer remoção, para repostar se algo for apagado
por engano.
