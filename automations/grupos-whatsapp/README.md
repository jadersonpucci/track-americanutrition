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
