# Estorno Pix → comprovante anexado no pedido (24/11/2026)

Pedido do Jaderson: quando um pedido pago por Pix é reembolsado na Shopify, o comprovante da devolução tem que ficar no
próprio pedido. Ele queria o PDF oficial do Inter ou, se não desse, o mais próximo disso.

## Como funciona
1. **Devolução:** o reembolso na Shopify devolve o Pix na hora pelo Inter. Isso é feito pelo
   `AN - Estorno Automatico (Shopify)` (`iRJFQgEn3xPpEkre`), que grava `estornos_log` com rota `pix_inter` e o `rtrId`
   no `detalhe`.
2. **Comprovante:** `[Financeiro] Estorno Pix -> comprovante no pedido` (n8n `yvhZL3Onb8s3l9hC`) roda a cada 10 minutos:
   - lê até 5 devoluções sem comprovante dos últimos 30 dias;
   - busca o extrato completo do Inter (aplicação só de extrato, credencial SSL "Inter Extrato") e acha o lançamento
     com `detalhes.endToEndId` igual ao `rtrId`;
   - gera o PDF ([`estorno-comprovante-pdf.js`](estorno-comprovante-pdf.js)) e sobe nos arquivos da Shopify
     (`stagedUploadsCreate` com PUT, só `Content-Type`, e depois `fileCreate`);
   - prende o PDF no pedido, no campo **Comprovante de estorno** (`an_financeiro.comprovante_estorno`, tipo
     `list.file_reference`, fixado na página do pedido), e põe a tag `estornado-pix`;
   - marca `estornos_log.comprovante_file_id` e `comprovante_em`. Se der erro, grava em `comprovante_erro` e a linha não
     é tentada de novo.
3. **Ainda fora do extrato:** devolução que ainda não apareceu no extrato fica para a rodada seguinte.

O código dos nós está em [`estorno-comprovante-nos.js`](estorno-comprovante-nos.js).

## O PDF
A API do Inter não entrega o PDF oficial do app. O extrato completo traz os mesmos campos:
- título "Pix recebido devolvido", valor, data com o dia da semana, horário e ID da transação (o E2E da devolução);
- quem recebeu: nome, CPF mascarado como o Inter faz, agência, conta e instituição;
- quem pagou.

O PDF segue a ordem e o visual do comprovante do app. Ele não usa a marca do banco: no topo vai "America Nutrition ·
Comprovante de devolução Pix", e no rodapé diz que os dados são do extrato oficial do Inter. O PDF é escrito à mão, sem
biblioteca: Helvetica com WinAnsiEncoding e larguras AFM para alinhar à direita.

## Primeira rodada (24/11)
As 3 devoluções Pix que já existiam (estornos #7, #9 e #11) ganharam o PDF, `READY` na Shopify e preso no pedido.

Na primeira tentativa o envio para o storage do Google recusou o cabeçalho `x-goog-acl` (não assinado). O nó
`Enviar PDF` manda só `Content-Type: application/pdf`.
