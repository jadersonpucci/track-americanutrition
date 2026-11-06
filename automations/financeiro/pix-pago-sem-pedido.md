# Pix pago sem pedido (rede de segurança) — 06/11/2026

Caso que originou: Mário Bruno Campos Faria pagou o Pix de R$ 213,03 (cobrança Inter `ANmvwl7njji1lpevm4txkknepsvreicg`,
criada 31/10 13:00, paga 13:02). O dinheiro entrou no Inter (`extrato_itens`, E2E `E0036030520261031160116c9ac736d5`),
mas a cobrança ficou `ATIVA` em `checkout_pix_inter`: o webhook do Inter não confirmou e o cliente fechou a página antes
do polling do checkout. Foi o único caso em 30 dias (1 de 234 Pix Cobrança pagos). Pedido criado em 06/11: AN-16437.

n8n `[Financeiro] Pix pago sem pedido` (`OHHd28pz032E48oY`), a cada 30 min:
- Candidatos: cobranças `ATIVA` sem `confirmado_em`, de 20 min a 30 dias atrás, cujo valor aparece no extrato do Inter
  como Pix Cobrança (linha `pix:E…` com a tarifa `:d` de "Pix Cobrança") em até 2 dias e cujo E2E não está ligado a
  nenhuma cobrança. Máximo 5 por rodada.
- Para cada uma chama `POST /webhook/pix-inter-confirmar {txid, force: true}` (fluxo oficial do `AN - PIX Banco Inter`),
  que consulta o Inter e só cria o pedido na Shopify se a cobrança estiver `CONCLUIDA` (idempotente).
- Pausa de 4 s entre chamadas: a primeira versão consultava todas as cobranças abertas de 72 h e levou 429 no token do
  Inter, que é o mesmo do checkout.
- Recuperou algum: aviso no Telegram (Alertas, tópico 289).
