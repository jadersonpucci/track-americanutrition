-- Boleto: linha digitável e PIX copia e cola no próprio lançamento.
-- · boleto_linha: só dígitos (47 bancário / 48 arrecadação). O app desenha o código de barras e copia com 1 clique.
-- · pix_codigo: BR Code do boleto híbrido ou de uma cobrança PIX.
-- Preenchidos pelo Telegram (fin_boleto_criar), pela leitura do PDF anexado (workflow Financeiro · Ler boleto) ou à mão.
alter table lancamentos add column if not exists boleto_linha text;
alter table lancamentos add column if not exists pix_codigo text;
-- boletos que já chegaram pelo Telegram guardavam a linha em referencia
update lancamentos set boleto_linha = referencia where boleto_linha is null and referencia ~ '^[0-9]{47,48}$';
