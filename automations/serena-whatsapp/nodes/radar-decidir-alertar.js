// No "Decidir e Alertar" do workflow Grupos | Radar de Oportunidade e Risco (id 8ejWMM4ENM5PPjeH).
// Alterado em 06/09: o insert em grupo_radar passou a devolver o id e o card de DEPOIMENTO
// ESPONTANEO ganhou o botao inline que abre /webhook/dep-review. Segredos redigidos.
const SK = 'SUPABASE_SERVICE_KEY';
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVOLUTION_APIKEY';
const TG = 'http://telegram-bot-api:8081/botTELEGRAM_BOT_TOKEN/sendMessage';
const TG_CHAT = '6531084136';
const CRIS = '16464270203';
const NL = String.fromCharCode(10);
const ctx = $('Registrar e Pre-filtrar').first().json;
const esc = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).slice(0, 900).replace(/'/g, "''") + "'");
const req = async (o) => { try { return await this.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true });
let tipo = 'nenhum';
let conf = 0;
let resumo = '';
try {
  const blocos = Array.isArray($json.content) ? $json.content : [];
  let bruto = blocos.filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
  bruto = bruto.replace(/```json/g, '').replace(/```/g, '').trim();
  const j = JSON.parse(bruto);
  tipo = String(j.tipo || 'nenhum');
  conf = parseInt(j.confianca, 10) || 0;
  resumo = String(j.resumo || '').slice(0, 140);
} catch (e) { return []; }
const VALIDOS = ['compra_quente', 'risco', 'depoimento'];
if (VALIDOS.indexOf(tipo) === -1) return [];
const MIN = tipo === 'risco' ? 60 : 75;
if (conf < MIN) return [];
// Resolver telefone real: o participant vem como @lid e wa.me/<lid> nao abre conversa
const ehLid = String(ctx.participant || '').indexOf('@lid') !== -1;
let telefone = ctx.autor_num;
let origem = 'direto';
if (ehLid) {
  telefone = '';
  origem = 'nao_resolvido';
  const rows = await sql('select telefone from wa_identidades where lid = ' + esc(ctx.autor_num) + ' limit 1;');
  if (Array.isArray(rows) && rows.length && rows[0].telefone) { telefone = String(rows[0].telefone); origem = 'wa_identidades'; }
  if (!telefone) {
    const g = await req({ method: 'GET', url: EVO + '/group/participants/Samuel?groupJid=' + encodeURIComponent(ctx.jid), headers: { apikey: EVO_KEY }, json: true });
    const ps = (g && (g.participants || g)) || [];
    for (const p of ps) {
      const lid = String((p && p.id) || '').split('@')[0];
      const ph = String((p && p.phoneNumber) || '').split('@')[0];
      if (lid === String(ctx.autor_num) && ph) { telefone = ph; origem = 'evolution'; }
    }
    if (telefone) { await sql('insert into wa_identidades (telefone,lid,fonte) values (' + esc(telefone) + ',' + esc(ctx.autor_num) + ",'radar') on conflict (lid) where lid is not null do nothing;"); }
  }
}
const insRadar = await sql('insert into grupo_radar (grupo_jid,grupo_nome,autor,push_name,msg_id,texto,tipo,confianca,resumo,alertado) values (' + esc(ctx.jid) + ',' + esc(ctx.grupo_nome) + ',' + esc(telefone || ctx.autor_num) + ',' + esc(ctx.push_name) + ',' + esc(ctx.msg_id) + ',' + esc(ctx.texto) + ',' + esc(tipo) + ',' + conf + ',' + esc(resumo) + ',true) on conflict (msg_id) do nothing returning id;');
// id da linha do radar: o botao do card precisa dele. Se a msg ja existia, o insert nao devolve nada e buscamos.
let radarId = (Array.isArray(insRadar) && insRadar[0] && insRadar[0].id) ? insRadar[0].id : 0;
if (!radarId) { const rr = await sql('select id from grupo_radar where msg_id = ' + esc(ctx.msg_id) + ' limit 1;'); radarId = (Array.isArray(rr) && rr[0] && rr[0].id) ? rr[0].id : 0; }
const contato = telefone ? ('wa.me/' + telefone) : ('nao foi possivel resolver o numero (id interno ' + ctx.autor_num + ') - responder pelo proprio grupo');
const ICONE = { compra_quente: '\uD83D\uDD25', risco: '\u26A0\uFE0F', depoimento: '\u2B50' };
const TITULO = { compra_quente: 'COMPRA QUENTE', risco: 'ATENCAO - PRECISA DE HUMANO', depoimento: 'DEPOIMENTO ESPONTANEO' };
let t = ICONE[tipo] + ' ' + TITULO[tipo] + NL + NL;
t += 'Grupo: ' + ctx.grupo_nome + NL;
t += 'Pessoa: ' + (ctx.push_name || 'sem nome') + NL;
t += 'Contato: ' + contato + NL;
t += 'Confianca: ' + conf + '%' + NL + NL;
t += 'Leitura: ' + resumo + NL + NL;
t += 'Mensagem original:' + NL + String(ctx.texto).slice(0, 400);
if (tipo === 'depoimento') { t += NL + NL + 'Vale pedir autorizacao e virar review no site.'; }
const corpoTG = { chat_id: TG_CHAT, text: t, disable_web_page_preview: true };
// Depoimento com id resolvido ganha o botao que abre a pagina de virar review no site
if (tipo === 'depoimento' && radarId) {
  corpoTG.reply_markup = { inline_keyboard: [[{ text: '\u2b50 Virar review no site', url: 'https://n8n.americanutrition.com/webhook/dep-review?t=an-dep-3Xk9Wq7Vz&id=' + radarId }]] };
}
await req({ method: 'POST', url: TG, headers: { 'Content-Type': 'application/json' }, body: corpoTG, json: true });
if (tipo === 'risco') {
  const w = '*ATENCAO - PRECISA DE HUMANO*' + NL + NL + '_' + ctx.grupo_nome + '_' + NL + (ctx.push_name || 'sem nome') + NL + contato + NL + NL + resumo + NL + NL + String(ctx.texto).slice(0, 300);
  await req({ method: 'POST', url: EVO + '/message/sendText/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { number: CRIS, text: w, delay: 800, linkPreview: false }, json: true });
}
return [{ json: { tipo: tipo, confianca: conf, resumo: resumo, grupo: ctx.grupo_nome, telefone: telefone, origem: origem } }];