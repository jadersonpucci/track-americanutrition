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
| `chave=wpp_debounce_seg&valor=8` | | Segundos esperando mensagens picadas |
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

## Tabelas novas

- `serena_wpp_buffer(id, msg_id unique, telefone, nome, texto, processado, criado_em, processado_em)`
- `serena_wpp_pausas(telefone pk, ate, motivo, atualizado_em)`
