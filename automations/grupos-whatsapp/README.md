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
