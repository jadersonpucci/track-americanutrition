// Diagnostico: lista o que a Evolution guardou de um grupo numa janela (inclui as nossas, fromMe), com a chave e o corpo.
// GET /webhook/evo-debug?t=<TOKEN_DEBUG>&jid=<grupo>&horas=3&so_minhas=1   |   &info=1 versao   |   &inst=1 instancias   |   &part=1&jid= participantes   |   &convidar=<numero> (so QA)   |   &apagar=1&modo=lid|fone (so QA)
const q = $json.query || {};
if (String(q.t || '') !== '<TOKEN_DEBUG>') return [{ json: { erro: 'token' } }];
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const get = async (path) => this.helpers.httpRequest({ method: 'GET', url: EVO + path, headers: { apikey: EVO_KEY }, json: true, timeout: 20000 });
if (String(q.info || '') === '1') {
  try { return [{ json: { info: await get('/') } }]; } catch (e) { return [{ json: { erro: String(e.message) } }]; }
}
if (String(q.inst || '') === '1') {
  try {
    const l = await get('/instance/fetchInstances');
    const arr = Array.isArray(l) ? l : [l];
    return [{ json: { instancias: arr.map(i => ({ nome: i.name || (i.instance && i.instance.instanceName), numero: i.number || (i.instance && i.instance.owner), status: i.connectionStatus || (i.instance && i.instance.status), owner: i.ownerJid || null, integracao: i.integration || null })) } }];
  } catch (e) { return [{ json: { erro: String(e.message) } }]; }
}
if (String(q.part || '') === '1') {
  try {
    const p = await get('/group/participants/Samuel?groupJid=' + encodeURIComponent(String(q.jid || '')));
    return [{ json: { participantes: p } }];
  } catch (e) { return [{ json: { erro: String(e.message) } }]; }
}
// TESTE DA BOLHA VAZIA (14/09): so no grupo QA. &convidar=<numero> adiciona o numero ao grupo QA;
// &apagar=1&modo=lid|fone apaga a mensagem mais recente de TERCEIRO no grupo QA mandando o autor
// no formato escolhido, e devolve exatamente o que foi enviado. Nunca roda em outro grupo.
const QA = '120363429298095918@g.us';
if (String(q.convidar || '')) {
  const num = String(q.convidar).replace(/[^0-9]/g, '');
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: EVO + '/group/updateParticipant/Samuel?groupJid=' + encodeURIComponent(QA), headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { action: 'add', participants: [num + '@s.whatsapp.net'] }, json: true, timeout: 30000 });
    return [{ json: { convidar: num, resposta: r } }];
  } catch (e) { return [{ json: { erro: String(e.message) } }]; }
}
if (String(q.apagar || '') === '1') {
  const modo = String(q.modo || 'lid');
  let alvo = null;
  for (let page = 1; page <= 5 && !alvo; page++) {
    let r = null;
    try { r = await this.helpers.httpRequest({ method: 'POST', url: EVO + '/chat/findMessages/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { where: {}, page, offset: 100 }, json: true, timeout: 45000 }); } catch (e) { return [{ json: { erro: String(e.message) } }]; }
    const recs = (r && r.messages && r.messages.records) || [];
    if (!recs.length) break;
    recs.sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));
    for (const m of recs) {
      const k = m.key || {};
      if (k.remoteJid !== QA || k.fromMe === true || k.deleted === true) continue;
      if (!(m.message && (m.message.conversation || m.message.extendedTextMessage))) continue;
      alvo = m; break;
    }
  }
  if (!alvo) return [{ json: { erro: 'nenhuma mensagem de terceiro no grupo QA' } }];
  const k = alvo.key;
  const fone = String(k.participantAlt || k.senderPn || '');
  const lid = String(k.participant || '');
  const autor = modo === 'fone' ? (fone || lid) : (lid || fone);
  const body = { id: String(k.id), remoteJid: QA, fromMe: false, participant: autor };
  try {
    const r = await this.helpers.httpRequest({ method: 'DELETE', url: EVO + '/chat/deleteMessageForEveryone/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body, json: true, timeout: 30000 });
    return [{ json: { modo, texto: String((alvo.message && (alvo.message.conversation || (alvo.message.extendedTextMessage && alvo.message.extendedTextMessage.text))) || '').slice(0, 80), chave_original: k, enviado: body, resposta: r } }];
  } catch (e) { return [{ json: { modo, enviado: body, erro: String(e.message) } }]; }
}
const jid = String(q.jid || '');
const horas = Math.max(1, Math.min(72, Number(q.horas || 3)));
const soMinhas = String(q.so_minhas || '') === '1';
const corte = Math.floor(Date.now() / 1000) - horas * 3600;
const out = [];
for (let page = 1; page <= 30; page++) {
  let r = null;
  try { r = await this.helpers.httpRequest({ method: 'POST', url: EVO + '/chat/findMessages/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { where: {}, page, offset: 100 }, json: true, timeout: 45000 }); } catch (e) { return [{ json: { erro: String(e.message) } }]; }
  const recs = (r && r.messages && r.messages.records) || [];
  if (!recs.length) break;
  let maisVelho = 0;
  for (const m of recs) {
    const k = m.key || {};
    const ts = Number(m.messageTimestamp || 0);
    if (ts && (!maisVelho || ts < maisVelho)) maisVelho = ts;
    if (ts < corte) continue;
    if (jid && k.remoteJid !== jid) continue;
    if (soMinhas && k.fromMe !== true) continue;
    out.push({ ts: new Date(ts * 1000).toISOString(), key: k, participant: m.participant || null, messageType: m.messageType || null, message: m.message || null, status: m.status || null, update: m.MessageUpdate || null, source: m.source || null });
  }
  if (maisVelho && maisVelho < corte) break;
  if (recs.length < 100) break;
}
out.sort((a, b) => a.ts < b.ts ? -1 : 1);
return [{ json: { jid, horas, total: out.length, mensagens: out } }];
