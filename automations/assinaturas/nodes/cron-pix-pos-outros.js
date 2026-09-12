// Node "Pos Outros" do workflow "AN - Assinaturas Cron PIX" (n8n VxyloA6hZtppGEja).
// Chaves reais so no n8n.
// Lembretes e pausa da renovacao PIX. Envio pelo Samuel (wpp-avulso).
const r = $json;
const SK = 'SUPABASE_SERVICE_KEY';
const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''");
const self = this;
const sql = async (q) => { return await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true }); };
const wpp = async (number, text) => { try { await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-avulso', headers: { 'Content-Type': 'application/json' }, body: { number, text }, json: true }); } catch (e) { } };
const shorten = async (url) => { try { const s = await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/encurtar-url', headers: { 'Content-Type': 'application/json' }, body: { url }, json: true }); return (s && s.shortLink) || url; } catch (e) { return url; } };
const NL = String.fromCharCode(10);
let num = String(r.whatsapp || '').replace(/[^0-9]/g, ''); if (num && num.slice(0, 2) !== '55') num = '55' + num;
const pn = String(r.nome || '').trim().split(' ')[0] || '';
const oi = (pn ? ('Oi, ' + pn + '! ') : 'Oi! ');

// Pagina do Pix (QR Code + botao de copiar). O lembrete e a segunda chance do cliente pagar, entao
// ele leva a pagina tambem, nao so o codigo cru: copiar um codigo de 200 caracteres no WhatsApp
// falha facil no celular. A pagina foi gravada no Pos Gerar; aqui a gente acha pelo pix_order_id.
let pagina = '';
if (r.pix_order_id) {
  try {
    const l = await sql("select token from serena_pix_links where pagarme_order_id = '" + esc(r.pix_order_id) + "' order by criado_em desc limit 1");
    const tok = (Array.isArray(l) && l[0] && l[0].token) ? String(l[0].token) : '';
    if (tok) pagina = await shorten('https://n8n.americanutrition.com/webhook/pix?t=' + tok);
  } catch (e) { pagina = ''; }
}
const comPagina = (txt) => pagina ? (txt + NL + NL + 'Ou abra aqui, com *QR Code* e botão de copiar:' + NL + pagina) : txt;

if (r.acao === 'lembrete1') {
  await sql("update assinatura_cobrancas set lembrete1_em=now(), atualizado_em=now() where id='" + esc(r.cobranca_id) + "'::uuid;");
  if (num && r.pix_qr) { await wpp(num, comPagina(oi + '\u{1F4CB} Passando pra lembrar: o PIX da *renovação da sua assinatura* vence *hoje*. Segue o código de novo — copia e cola no app do banco \u{1F447}')); await wpp(num, r.pix_qr); }
  return { json: { ok: true, lembrete1: r.id, pagina_pix: pagina || null } };
}
if (r.acao === 'lembrete2') {
  await sql("update assinatura_cobrancas set lembrete2_em=now(), atualizado_em=now() where id='" + esc(r.cobranca_id) + "'::uuid;");
  if (num && r.pix_qr) { await wpp(num, comPagina(oi + '⏳ Último lembrete: se o PIX da renovação não for pago até *' + r.limite_fmt + '*, sua assinatura será *pausada* (sem multa — dá pra reativar depois). Código abaixo \u{1F447}')); await wpp(num, r.pix_qr); }
  return { json: { ok: true, lembrete2: r.id, pagina_pix: pagina || null } };
}
if (r.acao === 'pausar') {
  await sql("update assinatura_cobrancas set status='falhou', erro='pix_nao_pago', atualizado_em=now() where id='" + esc(r.cobranca_id) + "'::uuid; update assinaturas set status='pausada', atualizado_em=now() where id='" + esc(r.id) + "'::uuid;");
  if (num) { await wpp(num, oi + 'sua assinatura America Nutrition foi *pausada* porque não recebemos o PIX da renovação. \u{1F499}' + NL + NL + 'Sem multa nenhuma — quando quiser *reativar*, é só me chamar aqui que eu resolvo na hora!'); }
  return { json: { ok: true, pausada: r.id } };
}
return { json: { ok: true, nada: true } };
