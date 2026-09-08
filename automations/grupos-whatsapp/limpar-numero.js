// Node "Limpar Mensagens" do workflow "Grupos | Limpar Mensagens de um Numero" (n8n OlDkvRz2Phh7ISvy).
// Chaves reais so no n8n.
// Limpeza manual: apaga para todos, nos grupos oficiais, tudo o que um numero postou na janela pedida.
// Usa o mesmo caminho da Moderacao Automatica (deleteMessageForEveryone) e grava o texto original em
// grupo_moderacao ANTES de apagar, para poder conferir ou repostar depois.
const q = ($json.query || $json.body || $json) || {};
const TOKEN = 'an-mod-5Rt8Bn2W';
if (String(q.t || '') !== TOKEN) return [{ json: { erro: 'token invalido' } }];
const numero = String(q.numero || '').replace(/[^0-9]/g, '');
if (numero.length < 10) return [{ json: { erro: 'use ?numero=55DDD9XXXXXXXX' } }];
const horas = Math.max(1, Math.min(720, Number(q.horas || 24)));
const soListar = String(q.teste || '') === '1';
const remover = String(q.remover || '') === '1';
const GRUPOS = {
  '120363233277583685@g.us': 'Fosfoetanolamina (ImunoFosfo)',
  '120363246659395526@g.us': '#1 ImunoFosfo',
  '120363353982971871@g.us': 'ImunoFosfo Connect Oncologicas',
  '120363307265095030@g.us': '#2 ImunoFosfo',
  '120363423321725793@g.us': 'Fosfoetanolamina (ImunoFosfo) #2',
  '120363407686844370@g.us': '#3 ImunoFosfo',
  '120363426145445382@g.us': 'Depoimentos sobre ImunoFosfo',
  '120363404254700593@g.us': 'ImunoFosfo Diabetes Oficial',
  '120363407289053552@g.us': '#1 ImunoFosfo Diabetes',
  '120363425146226301@g.us': '#4 ImunoFosfo',
  '120363429298095918@g.us': 'QA Teste Evolution'
};
const EQUIPE = ['5513981885555', '16464270203', '13472225493'];
if (EQUIPE.indexOf(numero) !== -1) return [{ json: { erro: 'esse numero e da equipe, nao vou apagar' } }];
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const SK = 'SUPABASE_SERVICE_KEY';
const TG = 'http://telegram-bot-api:8081/bot<TOKEN>/sendMessage';
const TG_CHAT = '6531084136';
const NL = String.fromCharCode(10);
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 900) + "'");
const req = async (o) => { try { return await this.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (s) => await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: s }, json: true });
// 1) coleta as mensagens recentes. Nessa versao a Evolution ignora o filtro where, entao filtramos aqui.
const corte = Math.floor(Date.now() / 1000) - horas * 3600;
const alvos = [];
const vistos = {};
for (let page = 1; page <= 40; page++) {
  const r = await req({ method: 'POST', url: EVO + '/chat/findMessages/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { where: {}, page: page, offset: 100 }, json: true, timeout: 45000 });
  const recs = (r && r.messages && r.messages.records) || [];
  if (!recs.length) break;
  let maisVelho = 0;
  for (const m of recs) {
    const k = m.key || {};
    const ts = Number(m.messageTimestamp || 0);
    if (ts && (!maisVelho || ts < maisVelho)) { maisVelho = ts; }
    if (ts < corte) continue;
    if (!GRUPOS[k.remoteJid]) continue;
    if (k.fromMe === true) continue;
    const quem = String(k.participant || '') + ' ' + String(k.participantAlt || '') + ' ' + String(m.participant || '');
    if (quem.indexOf(numero) < 0) continue;
    if (!m.message) continue;
    if (vistos[k.id]) continue;
    vistos[k.id] = 1;
    const mm = m.message || {};
    let texto = mm.conversation || (mm.extendedTextMessage && mm.extendedTextMessage.text) || (mm.imageMessage && mm.imageMessage.caption) || (mm.videoMessage && mm.videoMessage.caption) || (mm.documentMessage && mm.documentMessage.caption) || '';
    if (!texto) { texto = '[' + String(m.messageType || 'midia') + ']'; }
    alvos.push({ id: String(k.id), jid: String(k.remoteJid), participant: String(k.participant || ''), grupo: GRUPOS[k.remoteJid], texto: String(texto), push_name: String(m.pushName || ''), ts: ts });
  }
  if (maisVelho && maisVelho < corte) break;
  if (recs.length < 100) break;
}
alvos.sort((a, b) => a.ts - b.ts);
if (soListar) {
  return [{ json: { numero: numero, horas: horas, encontradas: alvos.length, modo: 'teste (nada foi apagado)', mensagens: alvos.map((a) => ({ grupo: a.grupo, texto: a.texto.slice(0, 120) })) } }];
}
// 2) grava e apaga
let apagadas = 0;
const falhas = [];
const porGrupo = {};
for (const a of alvos) {
  await sql('insert into grupo_moderacao (grupo_jid,grupo_nome,autor,telefone,push_name,msg_id,texto,categoria,confianca,motivo,acao) values (' + E(a.jid) + ',' + E(a.grupo) + ',' + E(numero) + ',' + E(numero) + ',' + E(a.push_name) + ',' + E(a.id) + ',' + E(a.texto) + ",'spam_geral',100,'Limpeza manual do numero inteiro','apagada') on conflict (msg_id) do nothing;");
  const r = await req({ method: 'DELETE', url: EVO + '/chat/deleteMessageForEveryone/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { id: a.id, remoteJid: a.jid, fromMe: false, participant: a.participant }, json: true, timeout: 30000 });
  if (r) { apagadas++; porGrupo[a.grupo] = (porGrupo[a.grupo] || 0) + 1; }
  else { falhas.push(a.id); await sql("update grupo_moderacao set acao = 'falha_ao_apagar', erro = 'delete recusado pela Evolution' where msg_id = " + E(a.id) + ';'); }
}
// 3) opcional: tira a pessoa dos grupos onde ela postou
const removidoDe = [];
if (remover) {
  const jids = {};
  for (const a of alvos) { jids[a.jid] = a.participant; }
  for (const j of Object.keys(jids)) {
    const r = await req({ method: 'POST', url: EVO + '/group/updateParticipant/Samuel?groupJid=' + encodeURIComponent(j), headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { action: 'remove', participants: [jids[j] || (numero + '@s.whatsapp.net')] }, json: true, timeout: 30000 });
    if (r) removidoDe.push(GRUPOS[j] || j);
  }
}
let t = '\u{1F9F9} LIMPEZA MANUAL' + NL + NL;
t += 'Numero: wa.me/' + numero + (alvos.length && alvos[0].push_name ? (' (' + alvos[0].push_name + ')') : '') + NL;
t += 'Janela: ultimas ' + horas + 'h' + NL;
t += 'Apagadas para todos: ' + apagadas + ' de ' + alvos.length + NL;
for (const g of Object.keys(porGrupo)) { t += '  - ' + g + ': ' + porGrupo[g] + NL; }
if (falhas.length) { t += 'Falharam: ' + falhas.length + NL; }
if (removidoDe.length) { t += 'Removido dos grupos: ' + removidoDe.join(', ') + NL; }
t += NL + 'O texto original ficou salvo em grupo_moderacao.';
await req({ method: 'POST', url: TG, headers: { 'Content-Type': 'application/json' }, body: { chat_id: TG_CHAT, text: t, disable_web_page_preview: true }, json: true });
return [{ json: { numero: numero, horas: horas, encontradas: alvos.length, apagadas: apagadas, falhas: falhas.length, por_grupo: porGrupo, removido_de: removidoDe } }];
