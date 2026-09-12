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
const sql = async (q) => { return await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true }); };
const self = this;
const wpp = async (number, text) => { try { await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-avulso', headers: { 'Content-Type': 'application/json' }, body: { number, text }, json: true }); } catch (e) { } };
const NL = String.fromCharCode(10);
const ord = o.body || o;
const charge = (ord.charges && ord.charges[0]) || {};
const tx = charge.last_transaction || {};
const qr = tx.qr_code || '';
const qrUrl = tx.qr_code_url || '';
const expiraEm = tx.expires_at || '';
const orderId = ord.id || '';
const total = Math.round(Number(ord.amount) || Number(mo.cobrar) || 0);
if (!qr || !orderId) { return { json: { ok: false, erro: 'sem_qr', assinatura: sub.id, resposta_pagarme: ord } }; }
await sql("insert into assinatura_cobrancas (assinatura_id, ciclo_ref, status, tentativa, valor_centavos, premio, pix_order_id, pix_qr, pix_link) values ('" + esc(sub.id) + "'::uuid,'" + esc(sub.ciclo_ref) + "','aguardando',1," + total + "," + (mo.premio ? 'true' : 'false') + ",'" + esc(orderId) + "','" + esc(qr) + "','" + esc(qrUrl) + "') on conflict (assinatura_id, ciclo_ref) do update set status='aguardando', pix_order_id=excluded.pix_order_id, pix_qr=excluded.pix_qr, pix_link=excluded.pix_link, valor_centavos=excluded.valor_centavos, atualizado_em=now() where assinatura_cobrancas.status <> 'pago';");
if (mo.pontual && mo.pontual > 0) { await sql("update assinaturas set desconto_proxima_pct=null, atualizado_em=now() where id='" + esc(sub.id) + "'::uuid;"); }
// PAGINA DE PAGAMENTO (12/09/2026). Antes disto a renovacao mandava SO o codigo copia e cola.
// O Marcelo respondeu "Vc consegue mandar QR code? Nao ta dando certo esse codigo": no celular um
// codigo Pix de 200 caracteres quebra em varias linhas e copiar do WhatsApp falha facil.
// A pagina do Pix (serena_pix_links + [Serena] Pagina do Pix) ja existia, mas so o caminho de venda
// da Serena a usava. Agora a renovacao usa tambem: QR Code na tela, botao de copiar com um toque e
// contagem do prazo. O codigo continua indo em mensagem separada, para quem preferir copia e cola.
let link = '';
let token = '';
try {
  token = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const itensTxt = 'Renovacao da assinatura America Nutrition';
  const ins = 'insert into serena_pix_links (token, draft_id, draft_numero, itens, total_reais, qr_code, qr_code_url, expira_em, pagarme_order_id, pagarme_charge_id, cliente_nome, telefone) values ('
    + "'" + esc(token) + "', null, null, '" + esc(itensTxt) + "', " + (total / 100) + ", '" + esc(qr) + "', '" + esc(qrUrl) + "', "
    + (expiraEm ? ("'" + esc(expiraEm) + "'::timestamptz") : "now() + interval '9 days'") + ", '" + esc(orderId) + "', '" + esc(charge.id || '') + "', '" + esc(sub.nome || '') + "', '" + esc(String(sub.whatsapp || '')) + "')";
  const r = await sql(ins);
  if (r && r.error) throw new Error(String(r.error).slice(0, 200));
  link = 'https://n8n.americanutrition.com/webhook/pix?t=' + token;
  try {
    const s = await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/encurtar-url', headers: { 'Content-Type': 'application/json' }, body: { url: link }, json: true, timeout: 12000 });
    if (s && s.shortLink && !s.error) link = s.shortLink;
  } catch (e) { /* fica o link longo */ }
} catch (e) { link = ''; token = ''; }

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
  t += 'Valor: *' + valor + '*' + NL + NL;
  if (link) {
    t += 'O jeito mais fácil é abrir esta página: tem *QR Code* e botão de copiar o código com um toque \u{1F447}' + NL + link + NL + NL;
    t += 'Se preferir copia e cola, mando o código na próxima mensagem.';
  } else {
    t += 'Vou te mandar o código *copia e cola* na próxima mensagem — copie e cole no app do seu banco. \u{1F447}';
  }
  await wpp(num, t);
  await wpp(num, qr);
}
return { json: { ok: true, gerado: sub.id, order_id: orderId, ciclo_ref: sub.ciclo_ref, valor_centavos: total, whatsapp: num, pagina_pix: link || null, avulso: (sub.avulso === true) } };
