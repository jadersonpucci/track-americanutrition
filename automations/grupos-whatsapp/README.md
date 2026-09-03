# Grupos WhatsApp — Moderação Automática (n8n `AyS0758LjFJ1qx8v`)

Fluxo: `Moderacao IN` (POST /webhook/grupo-moderacao, alimentado pelo dispatcher do Samuel) → `Pre-filtro de Suspeita` (Code) → `Direto?` (IF) → regra direta vai para `Apagar ou Alertar`; o resto passa por `Classificar com Claude` (Sonnet) antes.

Fontes aqui (`moderacao-prefiltro.js`, `moderacao-apagar-ou-alertar.js`) têm as chaves substituídas por placeholders; as reais ficam só no n8n.

## Convite para grupo de fora (03/09/2026)

Caso: às 17:59 a Vanderli postou em dois grupos (#1 ImunoFosfo e Connect Oncológicas) o link `chat.whatsapp.com/J7YGFsy6QuNFtx27vHSvyc` "grupo sobre tratamentos alternativos para o câncer". O pré-filtro antigo só mandava para a IA link acompanhado de palavra de venda, então a mensagem passou sem moderação.

Regra nova, sem IA: qualquer `chat.whatsapp.com/<codigo>` (ou cartão nativo de convite, `groupInviteMessage`) é resolvido na Evolution (`GET /group/inviteInfo/Samuel?inviteCode=`). Se o grupo de destino não estiver na lista `GRUPOS` (os oficiais ImunoFosfo), a mensagem recebe a categoria `link_grupo_externo` com confiança 100 e é apagada para todos, com registro em `grupo_moderacao` e aviso no Telegram. Se o convite estiver inválido ou a Evolution falhar, confere pelo `inviteCode` de cada grupo oficial; se ainda assim não der para confirmar, só alerta (confiança 60). Mensagens da equipe e de admins continuam intocadas.

Reprocessadas na hora as duas mensagens da Vanderli: o convite resolveu para o grupo **"SUPERANDO O CÂNCER - CALCIUM 2-AEP"** (concorrente) e as duas foram apagadas (`acao = apagada`).
