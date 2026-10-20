// AGENDAR ETIQUETA US (20/10/2026, pedido do Jaderson): a etiqueta saia no mesmo minuto do pagamento, junto com o
// e-mail de envio da Shopify (notifyCustomer), e o processo parecia automatico demais. Agora a compra espera de
// 2 a 4 horas (sorteado) e so acontece em horario comercial da Florida (seg a sex, 9h as 17h30, America/New_York).
// Fora da janela, vai para o proximo dia util entre 9h15 e 11h. O no 'Esperar Etiqueta' segura a execucao ate 'liberar_em'.
const TZ = 'America/New_York';
const ESPERA_MIN = 120, ESPERA_MAX = 240;          // minutos depois do pagamento
const ABRE = 9 * 60, FECHA = 17 * 60 + 30;          // janela em minutos do dia (horario da Florida)
const DIAS_UTEIS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const sorteio = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

const local = d => {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  return { dia: p.weekday, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};
const naJanela = d => { const l = local(d); return DIAS_UTEIS.includes(l.dia) && l.min >= ABRE && l.min <= FECHA; };

let alvo = new Date(Date.now() + sorteio(ESPERA_MIN, ESPERA_MAX) * 60000);
let empurrado = false;
if (!naJanela(alvo)) {
  // anda de 5 em 5 min ate abrir a janela (no maximo 4 dias) e sorteia um horario no comeco da manha
  for (let i = 0; i < 1200 && !naJanela(alvo); i++) alvo = new Date(alvo.getTime() + 5 * 60000);
  alvo = new Date(alvo.getTime() + sorteio(15, 120) * 60000);
  empurrado = true;
}
const out = Object.assign({}, $input.first().json, {
  liberar_em: alvo.toISOString(),
  liberar_em_local: alvo.toLocaleString('en-US', { timeZone: TZ }),
  espera_fora_do_horario: empurrado
});
return [{ json: out }];
