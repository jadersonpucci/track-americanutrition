# AN - Boleto Personalizado (n8n `YimLSOs5CJqkrPTz`)

Página e PDF do boleto com o visual da America Nutrition, servidos por `GET /webhook/boleto`.
Tudo sai da própria linha digitável (banco, vencimento, valor, código de barras), sem API do gateway.
Cada emissão é registrada em `boletos_emitidos` e ganha um código de conferência (`?c=<codigo>`) com link curto
(`seguro.americanutrition.com/...`, via `POST /webhook/encurtar-url`, cacheado no staticData do workflow).

| Rota | Uso |
|---|---|
| `GET /webhook/boleto?l=<linha>&n=<nome>&d=<cpf>&p=<pedido>&it=<itens>&end=<endereco>` | página HTML (imprimir, copiar código de barras, copiar PIX) |
| `... &pdf=1` | a mesma coisa em PDF, uma folha A4 (nó "Gerar PDF", gerador próprio sem biblioteca) |
| `GET /webhook/boleto?c=<codigo>` | conferência pública: "este boleto é nosso?" (valor, vencimento, situação, linha digitável) |

`it` = itens `nome=valor|nome=valor`; `end` = endereço em uma linha. Parâmetros opcionais do modo Inter: `b=inter`, `nn=<nosso numero>`, `pix=<copia e cola>` (só como fallback; o normal é ler do banco).

## Dois bancos, mesmo visual

| | Pagar.me (Stone, banco 197) | Banco Inter (bolepix, banco 077) |
|---|---|---|
| Detecção | linha digitável começa com `197` | linha começa com `077` (ou `b=inter`) |
| Logo na ficha | `logos/banco-stone-197.png` (CDN) | `logos/banco-inter-077.png` (CDN, cópia em `logos/`) |
| Beneficiário | Pagar.me Pagamentos S/A · 18.727.053/0001-74 · 0001 / 1617898 | AMERICA NUTRITION COMERCIAL LTDA · 11.298.909/0001-94 · 00019 / 305653768 |
| Nosso número | derivado da linha | o da API do Inter (`checkout_boleto_inter.nosso_numero`) |
| PIX | não | bloco "Pague na hora com PIX": QR Code + copia e cola + botão copiar; no PDF, QR na caixa "Como pagar" |
| Situação | `pagarme_orders` (documento + valor) | `checkout_boleto_inter.confirmado_em`; se ainda não confirmado, `GET /webhook/boleto-inter-status?order_id=interb_<codigo>` (consulta o Inter ao vivo) |

No modo Inter a página busca a linha em `checkout_boleto_inter` (`linha_digitavel`) e pega de lá `codigo_solicitacao`, `nosso_numero`, `pix_copia_cola` e a situação. A conferência (`?c=`) faz o mesmo e mostra "Banco Inter (077) · boleto com PIX".

Quem monta a URL para o Inter é o nó "Boleto: Criar" (`../pix-inter/nodes/boleto_criar.js`): `boleto_url` = página (encurtada pelo AN Links), `boleto_pdf` = `&pdf=1`, `boleto_pdf_inter` = PDF original do Inter (`/webhook/inter-boleto-pdf?c=`).

## Arquivos

- `gerar_documento.js`: nó "Gerar Documento" (HTML e conferência), colar como está.
- `gerar_pdf.js`: nó "Gerar PDF". **No n8n o nó recebe `../pix-inter/nodes/_qrcode_lib.min.js` + `\n` + este arquivo** (a lib `qrcode-generator` desenha o QR PIX em retângulos no PDF). O arquivo sozinho também roda como módulo (`module.exports = gerarPdfBoleto`) para testes.
- `test_pagina.js`: testes locais com mocks (`node test_pagina.js`): modo Inter aguardando/pago/sem registro, modo Pagar.me inalterado, conferência, PDF com QR.
- `logos/`: logo do Inter usado (PNG transparente para a página; JPEG fundo branco para o PDF, que só embute DCTDecode). Publicados no CDN em `imagens/logos/20260919-96m6vu56.png` e `imagens/logos/20260919-ife4wh99.jpg`.

Impressão pelo navegador (`window.print`) cabe em uma folha nos dois modos (CSS `@media print` compacta topo, caixas e bloco PIX; o copia-e-cola some no papel, o QR fica).
