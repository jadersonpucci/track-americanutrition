// Node "Pos Gerar" do workflow "AN - Assinaturas Cron PIX" (n8n VxyloA6hZtppGEja).
// Chaves reais so no n8n.
//
// Grava a cobranca em assinatura_cobrancas e manda duas mensagens pelo Samuel (wpp-avulso):
// a explicacao e, em seguida, o codigo copia e cola sozinho - senao o cliente nao consegue
// copiar so o codigo no WhatsApp.
const o = $json || {};
const mo = $('Montar Order PIX').item.json;
const sub = mo.sub;
const SK = 'SUPABASE_SERVICE_KEY';
const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''");
const sql = async (q) => { return await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true }); };
const wpp = async (number, text) => { try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-avulso', headers: { 'Content-Type': 'application/json' }, body: { number, text }, json: true }); } catch (e) { } };
const NL = String.fromCharCode(10);
const ord = o.body || o;
const charge = (ord.charges && ord.charges[0]) || {};
const tx = charge.last_transaction || {};
const qr = tx.qr_code || '';
const qrUrl = tx.qr_code_url || '';
const orderId = ord.id || '';
const total = Math.round(Number(ord.amount) || Number(mo.cobrar) || 0);
if (!qr || !orderId) { return { json: { ok: false, erro: 'sem_qr', assinatura: sub.id, resposta_pagarme: ord } }; }
await sql("insert into assinatura_cobrancas (assinatura_id, ciclo_ref, status, tentativa, valor_centavos, premio, pix_order_id, pix_qr, pix_link) values ('" + esc(sub.id) + "'::uuid,'" + esc(sub.ciclo_ref) + "','aguardando',1," + total + "," + (mo.premio ? 'true' : 'false') + ",'" + esc(orderId) + "','" + esc(qr) + "','" + esc(qrUrl) + "') on conflict (assinatura_id, ciclo_ref) do update set status='aguardando', pix_order_id=excluded.pix_order_id, pix_qr=excluded.pix_qr, pix_link=excluded.pix_link, valor_centavos=excluded.valor_centavos, atualizado_em=now() where assinatura_cobrancas.status <> 'pago';");
if (mo.pontual && mo.pontual > 0) { await sql("update assinaturas set desconto_proxima_pct=null, atualizado_em=now() where id='" + esc(sub.id) + "'::uuid;"); }
let num = String(sub.whatsapp || '').replace(/[^0-9]/g, ''); if (num && num.slice(0, 2) !== '55') num = '55' + num;
if (num) {
  const pn = String(sub.nome || '').trim().split(' ')[0] || '';
  const valor = 'R$ ' + (total / 100).toFixed(2).replace('.', ',');
  // Avulso = o cliente pediu para renovar agora (veio pelo /webhook/assinatura-pix-avulso).
  // Nesse caso nao existe "vence em", porque o ciclo foi realinhado para hoje: falar de vencimento
  // soaria como cobranca atrasada em vez de renovacao pedida por ele.
  const avulso = (sub.avulso === true || sub.avulso === 'true');
  let t = (pn ? ('Oi, ' + pn + '! ') : 'Oi! ') + '\u{1F9EC}' + NL + NL;
  if (avulso) { t += 'Preparei aqui a *renovação* da sua assinatura America Nutrition \u{1F5D3}' + NL + NL; }
  else { t += 'Sua *renovação* da assinatura America Nutrition vence em *' + sub.venc_fmt + '* \u{1F5D3}' + NL + NL; }
  if (mo.premio) { t += '\u{1F381} *Mês de bônus: 30% OFF de fidelidade + frete grátis!*' + NL + NL; }
  else if (mo.pontual && mo.pontual > 0) { t += '\u{1F381} *Presente especial: ' + mo.pontual + '% OFF nesta renovação!*' + NL + NL; }
  if (avulso) { t += 'É só pagar o PIX de *' + valor + '* que eu já libero a sua próxima entrega. Vou te mandar o código *copia e cola* na próxima mensagem — copie e cole no app do seu banco. \u{1F447}'; }
  else { t += 'Pra garantir a próxima entrega com desconto, é só pagar o PIX de *' + valor + '*. Vou te mandar o código *copia e cola* na próxima mensagem — copie e cole no app do seu banco. \u{1F447}'; }
  await wpp(num, t);
  await wpp(num, qr);
}
return { json: { ok: true, gerado: sub.id, order_id: orderId, ciclo_ref: sub.ciclo_ref, valor_centavos: total, whatsapp: num, avulso: (sub.avulso === true) } };
