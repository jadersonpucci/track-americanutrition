# Pix na chave vira pedido pago, sem QR Code (10–11/11/2026)

## Problema
Muitos clientes pagam Pix direto na chave de e-mail, que estava na Stone. A Cris gerava o pedido e um QR Code na Venda
Manual, e o Jaderson pagava esse QR pela Stone para o pedido nascer pago na Shopify e o dinheiro cair no Inter.
Custo: tarifa por Pix, dinheiro passando por dois bancos e duas pessoas envolvidas.

## Como fica
1. **Portabilidade**: a chave de e-mail vai da Stone para o Inter (feita pelo Jaderson no app do Inter).
2. **`[Financeiro] Pix na chave -> aviso + pedido`** (n8n `0QcbRYOFIVnAvfyC`, fonte `pix-chave.workflow.js`), a cada 2 min:
   lê o extrato completo do Inter pela aplicação só de extrato (`inter_ext_*`, credencial SSL "Inter Extrato"), separa
   créditos Pix **sem txid** feitos na chave configurada, ignora transferências da própria empresa (CNPJ 11.298.909/0001-94),
   grava em `pix_chave_recebidos` e manda WhatsApp (Samuel) para a Cris com valor, pagador, CPF mascarado e o link
   `/webhook/venda-manual?pix=<token>&a=<token de agente>`.
   - A API de Pix do Inter (`pix/v2/pix`) não traz nome nem CPF do pagador; o extrato traz (`detalhes.nomePagador`,
     `cpfCnpjPagador`, `chavePixRecebedor`, `endToEndId`).
3. **Venda Manual** (`web_assets.path = 'venda-manual'`, trecho em `venda-manual-pix.ui.js`): com `?pix=` abre o Pix
   no topo, preenche cliente, endereço e itens da última compra do mesmo CPF (venda manual ou checkout pago), trava o
   valor em Pix − frete, troca os botões por **Criar pedido pago** e **Não é venda**. Com `?a=` (token de agente da
   `serena_agentes`) mostra a lista de Pix na chave sem pedido. Cópia da página anterior: `venda-manual-bkp-20261111`.
4. **`[Financeiro] Venda Manual · Pix na chave (API)`** (n8n `TvldjPWt0CFUOf0C`, `POST /webhook/venda-manual-pix`, fonte
   `venda-manual-pix.workflow.js`): ações `lista`, `get`, `status`, `ignorar`, `criar`. **Criar** sempre devolve primeiro
   um resumo (`precisa_confirmar`) e só cria com `confirmar: true`. Aí manda `order.paid` para `/webhook/pagarme-pago`
   (mesmo caminho dos Pix do checkout: gateway "Banco Inter", `inter_e2e` = endToEndId, id `pixchave_<e2e>`, tag
   `pix-chave`), lança no financeiro por `/webhook/inter-nibo-lancar` com a chave `pix:<e2e>` (a mesma da importação do
   extrato, concilia sem duplicar) e grava a venda em `vendas_manuais` (`pagamento = 'pix_chave'`).

## Configuração (`checkout_config`)
| chave | valor |
|---|---|
| `pix_chave_ativo` | `off` até a portabilidade terminar; `on` liga a varredura |
| `pix_chave_manual` | a chave de e-mail, em minúsculas |
| `pix_chave_aviso_fone` | WhatsApp que recebe o aviso (Cris) |
| `pix_chave_aviso_token` | token de agente da Cris (`serena_agentes`) |
| `pix_chave_desde` | Pix anteriores a este horário são ignorados (acertar na hora de ligar) |

Teste sem gravar nem avisar: `POST /webhook/pix-chave-varrer {"k": <pix_admin_token>, "teste": true, "dias": 2}` lista os
candidatos com dados mascarados.

## Incidente no teste (10/11, 20:36)
Um teste de `criar` com Pix fictício de R$ 327 bateu exatamente com a tabela e, na versão inicial, a confirmação só era
pedida quando havia diferença de valor. Criou o pedido **AN-16531** (pago, sem pagamento real) e a NF-e **448** saiu
automática. Pedido cancelado sem reembolso pelo Jaderson; NF-e 448 cancelada pela API da Focus em 11/11 (SEFAZ 135);
registros de teste apagados. Correção: `criar` exige `confirmar: true` sempre. Testes seguintes param no resumo.
