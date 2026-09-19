# PIX via Banco Inter no checkout (n8n)

Fontes do workflow **"AN - PIX Banco Inter (Provedor)"** (`https://n8n.americanutrition.com/workflow/z18gprrjyTy8noJC`) e dos dois roteadores adicionados aos fluxos existentes. O checkout (`checkout.americanutrition.com`) e o frontend não mudam: a resposta ao checkout tem o mesmo formato do Pagar.me (`pix_qr_code`, `pix_qr_code_url`, `order_id`) e o polling continua em `/webhook/pagarme-status`.

## Como funciona

```
checkout ──POST /webhook/checkout-gate──▶ Fluxo A (Pagar.me — Criar Pedido)
                                             │ blocklist, estoque, guarda de preço (inalterados)
                                             ▼
                                   Roteador PIX (Inter?)  ──pix + pix_provider=inter──▶ POST /webhook/checkout-pix-inter-criar
                                             │ qualquer falha / via_inter=false                   │ token OAuth2 (mTLS) → PUT /pix/v2/cob/{txid}
                                             ▼                                                     │ grava checkout_pix_inter, gera QR (data URL)
                                   Montar Payload Pagar.me (como sempre)                           ▼
                                                                                   { order_id: "inter_<txid>", pix_qr_code, pix_qr_code_url, ... }

checkout ──GET /webhook/pagarme-status?order_id=inter_…──▶ Roteador Inter (status) ──▶ GET /webhook/pix-inter-status
Inter ─────POST /webhook/pix-inter-webhook {pix:[{txid,…}]}─┐
                                                            ├──▶ POST /webhook/pix-inter-confirmar {txid}
                                                            │      GET /pix/v2/cob/{txid} no Inter (fonte da verdade)
                                                            │      CONCLUIDA → UPDATE … where confirmado_em is null (idempotente)
                                                            │      → POST /webhook/pagarme-pago (order.paid no formato Pagar.me)
                                                            │        = mesmo fluxo que cria o pedido Shopify, Respond.io, comissão, CAPI
```

- **Fail-open**: com o Inter ligado, qualquer erro (token, certificado, API, banco) devolve `via_inter=false` e o Fluxo A segue no Pagar.me. Cartão e boleto nunca passam pelo Inter.
- **Voltar ao Pagar.me a 1 clique**: painel `GET /webhook/pix-provedor?t=TOKEN` (botão "Voltar ao Pagar.me (1 clique)" / "Usar Banco Inter"). A troca é imediata (lê `checkout_config.pix_provider` a cada cobrança) e avisa no Telegram (tópico de alertas) com o link de reversão.
- O pedido Shopify de um PIX Inter fica com `note_attributes.pagarme_order = inter_<txid>`; é assim que o polling descobre o número do pedido.

## Endpoints do workflow

| Método/rota | Uso |
|---|---|
| `POST /webhook/checkout-pix-inter-criar` | chamado pelo Fluxo A; corpo = payload do checkout |
| `GET /webhook/pix-inter-status?order_id=inter_<txid>` | chamado pelo roteador do `pagarme-status` |
| `POST /webhook/pix-inter-confirmar {txid[, force]}` | verifica no Inter e cria o pedido (idempotente) |
| `POST /webhook/pix-inter-webhook` | callback do Inter (cada txid é re-verificado no banco) |
| `POST /webhook/pix-inter-token {k}` | interno: token OAuth2 com cache (exige `pix_admin_token`) |
| `GET /webhook/pix-provedor?t=TOKEN[&set=inter|pagarme][&nibo=on|off]` | painel: troca de provedor e liga/desliga o lançamento no Nibo |
| `GET /webhook/pix-inter-setup?t=TOKEN` | registra o webhook no Inter (`PUT /pix/v2/webhook/{chave}`) |

## Tabelas (criadas pelo nó UTIL)

- `checkout_config (chave, valor)`: `pix_provider` (`pagarme`|`inter`), `inter_client_id`, `inter_client_secret`, `inter_chave_pix`, `inter_conta_corrente` (opcional), `inter_ambiente` (`producao`|`sandbox`), `inter_pix_expiracao_seg` (86400), `pix_admin_token`, `telegram_chat_id`, `telegram_thread_id`.
- `checkout_pix_inter`: uma linha por cobrança (txid, valor, cliente, payload do checkout, copia-e-cola, status, pago_em, end_to_end_id, confirmado_em, pedido_shopify, erro).

## Setup (uma vez)

1. Rodar o nó **UTIL** (cria tabelas, semeia config e imprime o link do painel com o token).
2. Preencher em `checkout_config`: `inter_client_id`, `inter_client_secret`, `inter_chave_pix` (e `inter_conta_corrente` se a conta tiver mais de uma). O UTIL também importa essas chaves da `integracoes_config` se já existirem lá.
3. Credencial n8n do tipo **SSL Certificates** ("Inter mTLS": certificado + chave gerados no Internet Banking Empresa → API) nos 4 nós HTTP do Inter.
4. `GET /webhook/pix-inter-setup?t=TOKEN` → registra `https://n8n.americanutrition.com/webhook/pix-inter-webhook` no Inter.
5. Ligar no painel. Para desligar: mesmo painel, "Voltar ao Pagar.me".

## Fontes neste diretório

- `nodes/*.js`: código de cada Code node (o que está no n8n é byte a byte igual a estes arquivos).
- `nodes/patch_fluxoA_roteador.js` e `nodes/patch_status_roteador.js`: os nós adicionados em "Pagar.me — Criar Pedido (Fluxo A)" e "Pagar.me — Consultar Status".
- `nodes/_qrcode_lib.min.js`: qrcode-generator 1.4.4 (Kazuhiko Arase, MIT) minificado; gera a imagem do QR sem depender de serviço externo.
- `build.js`: monta o código SDK do workflow (`node build.js` → `workflow.sdk.js`; `NOLIB=1` omite a lib de QR).
- `test.js`: testes locais dos Code nodes com mocks (`node test.js`).
- `patch_nibo.js`: gera as operações (`update_workflow` do MCP do n8n) que adicionaram a integração Inter → Nibo ao mesmo workflow (`node patch_nibo.js` → `ops_nibo.json`).
- `nibo_api_proxy.sdk.js`: código SDK do workflow separado "AN - Nibo API (proxy interno)".
- `test_nibo.js`: testes locais dos nós do Nibo (`node test_nibo.js`).
- `patch_boleto.js` / `test_boleto.js`: operações e testes do boleto híbrido (`node patch_boleto.js` → `ops_boleto.json`; `node test_boleto.js`).
- `nodes/inter_api_validar.js`: proxy interno da API do Inter (`POST /webhook/inter-api`, mTLS + token por escopo), usado pelo boleto, setup e testes.

## Inter → Nibo (cada recebimento vira um lançamento, em tempo real)

Cada PIX recebido no Inter vira **um recebimento** (`POST /empresas/v1/receipts`) no Nibo, na conta bancária do Inter, cliente "BANCO INTER - PIX", categoria Vendas, com descrição `Pedido AN-15527` (o número do pedido Shopify; sem pedido, ex. PIX avulso ou TED: tipo + nome do pagador). Se o pedido Shopify ainda não existe na hora, o lançamento espera até ~20 s e, se preciso, fica em `erro` e é reenviado pelo job "Nibo Retry" (a cada 10 min).

Três origens alimentam o mesmo funil e a tabela `inter_nibo_lancamentos` (chave única = `pix:<endToEndId>`) garante que cada transação entra uma única vez:

1. **Webhook do Inter** (`pix-inter-webhook`): o mais rápido; lança na hora em que o banco avisa.
2. **Confirmação do pedido** (`pix-inter-confirmar`): cobre o caso de o webhook falhar/atrasar.
3. **Varredura do extrato** (a cada 10 min, Banking API `GET /banking/v2/extrato/completo?tipoOperacao=C`): pega também PIX fora do checkout, TED, boleto etc. Exige a permissão **Extrato** (escopo `extrato.read`) na aplicação da API do Inter; sem ela, o poller só registra o erro e o resto continua funcionando.

Workflows e endpoints:

| Rota | Uso |
|---|---|
| `POST /webhook/inter-nibo-lancar {k, chave, tipo, valor, data, nome, documento, ...}` | interno: registra + lança 1 recebimento (idempotente por `chave`) |
| `POST /webhook/nibo-api {k, method, path, query, body}` | interno: proxy da API Empresas do Nibo (workflow "AN - Nibo API (proxy interno)", credencial "Nibo API") |
| `GET /webhook/inter-nibo-setup?t=TOKEN` | garante a conta bancária do Inter e o cliente padrão no Nibo e grava os ids em `checkout_config` |
| `GET /webhook/inter-nibo-varrer?t=TOKEN&dias=N` | varredura manual do extrato (últimos N dias) |

Config em `checkout_config`: `nibo_lancar` (`on`|`off`, nasce `off`; botão "Ligar Nibo" no painel `pix-provedor`), `nibo_extrato` (`on`|`off`, liga/desliga o poller), `nibo_conta_inter_id`, `nibo_cliente_id`, `nibo_categoria_id` (preenchidos pelo setup), `nibo_tipos_lancar` (regex dos tipos do extrato que entram, padrão `PIX|TED|DOC|BOLETO|TRANSFER|DEPOSITO`).

Reenviar um lançamento (ex.: depois de apagar um errado no Nibo): `POST /webhook/inter-nibo-lancar` com os mesmos dados e `"forcar": true`. Linhas com status `erro` são reenviadas automaticamente na próxima chamada com a mesma chave.

Peculiaridades do Nibo/n8n que o proxy contorna: o `$filter` de `customers` é ignorado (o setup filtra do lado de cá); o POST devolve só um UUID entre aspas (quebra o modo JSON do nó HTTP) e o modo texto serializa o stream gzip, por isso a resposta é baixada como arquivo e lida por um Code node; `sendBody`/`sendQuery` do nó HTTP precisam ser `true` literal (com expressão o n8n esconde o campo do corpo e manda vazio).

Comportamento com `nibo_lancar=off`: o evento é descartado (não fica marcado como visto), então ao ligar, a varredura do extrato lança o histórico dos últimos dias. Erros do Nibo ficam em `inter_nibo_lancamentos.erro` (status `erro`) e podem ser reenviados repetindo a chamada após apagar a linha.

## Boleto híbrido (boleto + PIX) via Banco Inter

Com `boleto_provider = inter` no `checkout_config` (painel `pix-provedor`, botão "Boleto: usar Banco Inter"), o boleto do checkout sai pela **Cobrança v3** do Inter: um boleto registrado que também traz o QR Code PIX (o cliente paga pela linha digitável ou pelo PIX). Volta ao Pagar.me a 1 clique no mesmo painel. Fail-open: qualquer falha (token, API, endereço incompleto, valor abaixo de R$ 2,50) devolve `via_inter=false` e o Fluxo A segue no Pagar.me.

Contrato para o checkout (igual ao do Pagar.me): `order_id = interb_<codigoSolicitacao>`, `boleto_url` (a página personalizada da America Nutrition em modo Inter, logo/beneficiário do Inter + QR PIX, encurtada pelo AN Links `seguro.americanutrition.com/...`), `boleto_pdf` (a mesma página com `&pdf=1`, uma folha A4), `boleto_pdf_inter` (PDF original do Inter, `GET /webhook/inter-boleto-pdf?c=<codigo>`), `boleto_line`, `boleto_barcode`, `pix_qr_code` (copia-e-cola). Detalhes da página em `../boleto-personalizado/README.md`.

| Rota | Uso |
|---|---|
| `POST /webhook/checkout-boleto-inter-criar` | chamado pelo Fluxo A (roteador trata pix e boleto); corpo = payload do checkout. Com `k` + `forcar_inter: true` emite mesmo com o provedor em Pagar.me (teste) |
| `GET /webhook/boleto-inter-status?order_id=interb_<codigo>` | polling do checkout (roteador do `pagarme-status`) |
| `POST /webhook/boleto-inter-confirmar {codigo[, force]}` | verifica no Inter (`situacao` RECEBIDO), cria o pedido pelo `pagarme-pago` (payment_method `pix` ou `boleto` conforme a origem) e lança no Nibo. Throttle de 15 s sem `force` |
| `POST /webhook/boleto-inter-webhook` | callback do Inter (Cobrança v3); cada código é re-verificado |
| `GET /webhook/boleto-inter-setup?t=TOKEN` | registra o webhook (`PUT /cobranca/v3/cobrancas/webhook`) |
| `GET /webhook/inter-boleto-pdf?c=<codigo>` | PDF original do Inter (o cliente recebe o personalizado; este fica para conferência) |
| `POST /webhook/inter-api {k, escopo, method, path, query, body}` | proxy interno da API do Inter (mTLS), qualquer escopo liberado no app |

Tabela `checkout_boleto_inter` (uma linha por boleto: código, seuNumero, valor, cliente, checkout, linha digitável, código de barras, txid/copia-e-cola do PIX, vencimento, situação, origem do recebimento, confirmado_em, pedido_shopify). Config: `boleto_provider` (`pagarme`|`inter`), `inter_boleto_dias_vencimento` (3), `inter_boleto_dias_agenda` (0 = cancela no vencimento; até 60 dias de tolerância), `inter_boleto_mensagem`.

Regras do Inter observadas na API: valor mínimo R$ 2,50; `seuNumero` até 15 caracteres; pagador exige CPF/CNPJ, nome, endereço, cidade, UF e CEP; a linha digitável fica disponível 1 a 3 s após a emissão (o nó espera e, se não vier, cancela a cobrança e cai no Pagar.me); cancelamento por `POST /cobranca/v3/cobrancas/{codigo}/cancelar`.

## Checkout (HTML servido pelo n8n)

O HTML do checkout vive no staticData do workflow "Deploy / Servir Checkout" (`GET /webhook/checkout`); publica-se com `POST /webhook/checkout-deploy` (header `x-deploy-key`, corpo `{html}`; `{"action":"get"}` devolve o publicado, `{"action":"rollback"}` volta a versão anterior). Cópia de referência em `n8n/checkout/checkout.html`.

Correção de 19/09/2026: o modal "Boleto gerado!" usava `anBoletoUrl` sem declarar (erro "Can't find variable: anBoletoUrl" ao finalizar com boleto, qualquer provedor). Agora `var anBoletoUrl = res.boleto_url || res.boleto_pdf` é definido no início do ramo do boleto.
