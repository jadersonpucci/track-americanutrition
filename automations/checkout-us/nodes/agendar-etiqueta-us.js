// AGENDAR ETIQUETA US (20/10/2026, pedido do Jaderson): a etiqueta saia no mesmo minuto do pagamento, junto com o
// e-mail de envio da Shopify (notifyCustomer), e o processo parecia automatico demais. Agora a compra espera de
// 20 a 60 minutos (sorteado), a qualquer hora. O no 'Esperar Etiqueta' segura a execucao ate 'liberar_em'.
const ESPERA_MIN = 20, ESPERA_MAX = 60;             // minutos depois do pagamento
const sorteio = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const espera = sorteio(ESPERA_MIN, ESPERA_MAX);
const alvo = new Date(Date.now() + espera * 60000);
const out = Object.assign({}, $input.first().json, {
  liberar_em: alvo.toISOString(),
  liberar_em_local: alvo.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  espera_min: espera
});
return [{ json: out }];
