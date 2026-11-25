// No "Resposta" do workflow AN - Reviews Enviar p/ Grupos (PQpcMivb7NabvzrO). JSON para o painel, pagina HTML
// para o botao do Telegram. 30/10/2026: passa a dizer tambem se o depoimento entrou no site (Publicar no Site).
const e = $('Entrada').first().json;
const m = $('Montar Card').first().json;
const ag = $input.first().json || {};
const bid = ag.bid;
const site = ag.site || null;
let obj;
if (e.site) obj = (site && site.ok) ? { ok: true, site: site } : { ok: false, erro: (site && site.erro) || m.erro || 'Falha ao publicar no site', site: site };
else if (m.acao === 'preview') obj = { ok: true, preview: true, png_b64: m.b64 };
else if (m.acao === 'agendar' && bid) obj = { ok: true, broadcast_id: bid, site: site };
else if (m.acao === 'agendar') obj = { ok: false, erro: 'Falha ao agendar' };
else obj = { ok: false, erro: m.erro, ja: !!m.ja, em: m.em || null };

if (e.via !== 'get') return [{ json: { out: JSON.stringify(obj), ctype: 'application/json; charset=utf-8' } }];

const h = (s)=> String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const pagina = (titulo, msg, cor)=> '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Depoimentos</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#fff;color:#17233F;display:flex;min-height:90vh;align-items:center;justify-content:center;margin:0;padding:20px}.c{max-width:420px;text-align:center;border:1.5px solid #E3E9F4;border-radius:16px;padding:28px}h1{font-size:22px;color:'+cor+';margin:0 0 10px}p{font-size:15px;line-height:1.5;color:#39435C;margin:0}</style></head><body><div class="c"><h1>'+h(titulo)+'</h1><p>'+msg+'</p></div></body></html>';
const linhaSite = (site && site.ok) ? ' Também já está na página de depoimentos do site.' : (site ? ' <b>Não entrou no site:</b> ' + h(site.erro || 'erro') + '.' : '');
let html;
if (obj.ok) html = pagina('✓ Enviado', 'Depoimento agendado para o grupo <b>Depoimentos sobre ImunoFosfo</b> e para o Telegram. Sai em até 1 minuto.' + linhaSite, '#0B7A34');
else if (obj.ja) html = pagina('Já enviado', 'Esse depoimento já foi para os grupos em '+h(obj.em)+'. Para reenviar, use o painel de reviews.', '#07388E');
else html = pagina('Não enviado', h(obj.erro || 'Erro'), '#AD0404');
return [{ json: { out: html, ctype: 'text/html; charset=utf-8' } }];
