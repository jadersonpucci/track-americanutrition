const SK = 'SUPABASE_SERVICE_KEY';
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const TG = 'http://telegram-bot-api:8081/bot<TOKEN>/sendMessage';
const TG_CHAT = '6531084136';
const NL = String.fromCharCode(10);
const MODO_AUTO = ['spam_venda', 'golpe', 'spam_geral', 'ausencia_automatica', 'link_grupo_externo'];
const CONF_MIN = 90;
const ctx = $('Pre-filtro de Suspeita').first().json;
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 900) + "'");
const req = async (o) => { try { return await this.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true });
let cat = 'normal';
let conf = -1;
let motivo = '';
if (ctx.direto === true) {
  // regra deterministica do pre-filtro (ex.: convite para grupo de fora): nao passa pela IA
  cat = String(ctx.categoria || 'normal');
  conf = Number(ctx.confianca);
  if (!isFinite(conf)) conf = -1;
  motivo = String(ctx.motivo || '').slice(0, 110);
} else {
  try {
    const blocos = Array.isArray($json.content) ? $json.content : [];
    let bruto = blocos.filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    bruto = bruto.replace(/```json/g, '').replace(/```/g, '').trim();
    const j = JSON.parse(bruto);
    cat = String(j.categoria || 'normal');
    let c = Number(j.confianca);
    if (!isFinite(c)) { c = -1; } else if (c > 0 && c <= 1) { c = Math.round(c * 100); } else { c = Math.round(c); }
    conf = c;
    motivo = String(j.motivo || '').slice(0, 110);
  } catch (e) { return []; }
}
if (cat === 'normal') return [];
const confOk = conf >= 0;
const podeApagar = confOk && (MODO_AUTO.indexOf(cat) !== -1) && conf >= CONF_MIN;
let acao = podeApagar ? 'apagada' : 'alertada';
await sql('insert into grupo_moderacao (grupo_jid,grupo_nome,autor,telefone,push_name,msg_id,texto,categoria,confianca,motivo,acao,erro) values (' + E(ctx.jid) + ',' + E(ctx.grupo_nome) + ',' + E(ctx.autor_num) + ',' + E(ctx.telefone) + ',' + E(ctx.push_name) + ',' + E(ctx.msg_id) + ',' + E(ctx.texto) + ',' + E(cat) + ',' + (confOk ? conf : 0) + ',' + E(motivo) + ',' + E(acao) + ',' + E(confOk ? null : 'confianca ausente na resposta da IA') + ') on conflict (msg_id) do nothing;');
if (podeApagar) {
  const r = await req({ method: 'DELETE', url: EVO + '/chat/deleteMessageForEveryone/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { id: ctx.msg_id, remoteJid: ctx.jid, fromMe: false, participant: ctx.participant }, json: true, timeout: 30000 });
  if (!r) { acao = 'falha_ao_apagar'; await sql("update grupo_moderacao set acao = 'falha_ao_apagar', erro = 'delete recusado pela Evolution' where msg_id = " + E(ctx.msg_id) + ';'); }
}
const IC = { spam_venda: '🚫', golpe: '⚠️', spam_geral: '🚫', ausencia_automatica: '🧹', mencao_concorrente: '👀', reclamacao: '📣', link_grupo_externo: '🔗' };
const NOME = { spam_venda: 'Spam de venda', golpe: 'Golpe', spam_geral: 'Spam', ausencia_automatica: 'Mensagem automatica de ausencia', mencao_concorrente: 'Mencao a concorrente', reclamacao: 'Reclamacao de cliente', link_grupo_externo: 'Convite para grupo de fora' };
let t;
if (cat === 'ausencia_automatica' && acao === 'apagada') {
  t = '🧹 APAGUEI UMA MENSAGEM AUTOMATICA' + NL + NL;
  t += ctx.grupo_nome + ' - ' + (ctx.push_name || 'sem nome') + (ctx.telefone ? (' - wa.me/' + ctx.telefone) : '') + NL + NL;
  t += String(ctx.texto).slice(0, 280);
} else {
  const TIT = { apagada: 'MENSAGEM APAGADA', falha_ao_apagar: 'FALHA AO APAGAR', alertada: 'APENAS ALERTA' };
  t = (IC[cat] || '') + ' MODERACAO - ' + TIT[acao] + NL + NL;
  t += 'Grupo: ' + ctx.grupo_nome + NL;
  t += 'Tipo: ' + (NOME[cat] || cat) + (confOk ? (' (' + conf + '%)') : ' (confianca nao informada)') + NL;
  t += 'Pessoa: ' + (ctx.push_name || 'sem nome') + (ctx.telefone ? (' - wa.me/' + ctx.telefone) : '') + NL + NL;
  t += 'Motivo: ' + motivo + NL + NL;
  t += 'Texto original:' + NL + String(ctx.texto).slice(0, 600);
  if (acao === 'alertada') { t += NL + NL + 'Nada foi apagado. Decida voce.'; }
  if (acao === 'apagada') { t += NL + NL + 'O texto acima fica salvo em grupo_moderacao caso precise repostar.'; }
}
await req({ method: 'POST', url: TG, headers: { 'Content-Type': 'application/json' }, body: { chat_id: TG_CHAT, text: t, disable_web_page_preview: true }, json: true });
return [{ json: { categoria: cat, confianca: conf, acao: acao, grupo: ctx.grupo_nome } }];
