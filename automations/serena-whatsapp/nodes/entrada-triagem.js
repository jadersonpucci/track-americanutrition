const p = $input.first().json.body || $input.first().json;
const ev = String(p.event || '').toLowerCase().replace(/_/g, '.');
if (ev !== 'messages.upsert') return [];

const d = p.data || {};
const key = d.key || {};
const jid = String(key.remoteJid || '');
if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return [];

const m = d.message || {};
const inner = (m.ephemeralMessage && m.ephemeralMessage.message) || (m.viewOnceMessage && m.viewOnceMessage.message) || (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) || m;
if (inner.protocolMessage || inner.reactionMessage || inner.pollUpdateMessage || inner.senderKeyDistributionMessage) return [];

// Identidade: jid normal traz o telefone; @lid precisa do remoteJidAlt/senderPn ou do mapa wa_identidades (resolvido no SQL)
const isLid = jid.endsWith('@lid');
const lid = isLid ? jid.split('@')[0].replace(/\D/g, '') : '';
const raw = isLid ? String(key.remoteJidAlt || key.senderPn || d.senderPn || key.participantAlt || '') : jid;
let tel = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
if (tel && (tel.length < 10 || tel.length > 15)) tel = '';
if (!tel && !lid) return [];

const pega = (o, c) => (o && o[c]) ? String(o[c]) : '';
// documento pode vir direto ou embrulhado com legenda
const doc = inner.documentMessage || (inner.documentWithCaptionMessage && inner.documentWithCaptionMessage.message && inner.documentWithCaptionMessage.message.documentMessage) || null;
const texto = String(
  inner.conversation
  || pega(inner.extendedTextMessage, 'text')
  || pega(inner.imageMessage, 'caption')
  || pega(inner.videoMessage, 'caption')
  || pega(doc, 'caption')
  || pega(inner.buttonsResponseMessage, 'selectedDisplayText')
  || pega(inner.listResponseMessage, 'title')
  || pega(inner.templateButtonReplyMessage, 'selectedDisplayText')
  || ''
).trim();

const base = {
  telefone: tel,
  lid: lid,
  nome: String(d.pushName || '').trim().slice(0, 80),
  msg_id: String(key.id || ''),
  jid: jid
};

// Mensagem enviada pelo proprio numero do Samuel: so interessa quando veio do celular (humano digitando)
if (key.fromMe === true) {
  const src = String(d.source || '').toLowerCase();
  const doCelular = ['android', 'ios', 'web', 'desktop'].indexOf(src) >= 0;
  if (!doCelular || !texto || !tel) return [];
  const cmd = texto.match(/^#serena\s*(on|off)\b/i);
  return [{ json: Object.assign({}, base, { tipo: 'humano', texto: texto, comando: cmd ? cmd[1].toLowerCase() : '' }) }];
}

if (inner.imageMessage) {
  return [{ json: Object.assign({}, base, { tipo: 'imagem', texto: texto, mimetype: inner.imageMessage.mimetype || 'image/jpeg' }) }];
}
// PDF (comprovante, receita, exame, nota fiscal): segue o caminho da imagem e o Claude le o documento
if (doc && /pdf/i.test(String(doc.mimetype || '') + ' ' + String(doc.fileName || ''))) {
  return [{ json: Object.assign({}, base, { tipo: 'imagem', texto: texto, mimetype: 'application/pdf', documento: true, arquivo: String(doc.fileName || 'documento.pdf').slice(0, 120) }) }];
}
// Video: a fala vai para a transcricao (mesmo caminho do audio; o ElevenLabs aceita mp4).
// GIF disfarcado de video e video muito longo nao valem a transcricao.
if (inner.videoMessage && !inner.videoMessage.gifPlayback) {
  const segs = Number(inner.videoMessage.seconds || 0);
  if (segs <= 300) {
    return [{ json: Object.assign({}, base, { tipo: 'video', texto: '', legenda: texto, segundos: segs, mimetype: inner.videoMessage.mimetype || 'video/mp4' }) }];
  }
  return [{ json: Object.assign({}, base, { tipo: 'texto', texto: (texto ? texto + ' ' : '') + '[O cliente enviou um video longo (' + Math.round(segs / 60) + ' min) que nao da para ouvir por aqui. Agradeca e peca o resumo em texto, ou avise que a equipe vai assistir.]' }) }];
}
if (inner.audioMessage) {
  return [{ json: Object.assign({}, base, { tipo: 'audio', texto: '', mimetype: inner.audioMessage.mimetype || 'audio/ogg' }) }];
}
// CONTATO COMPARTILHADO (15/10/2026): o cartao de contato do WhatsApp traz o numero no vCard
// ("item1.TEL;waid=5511965970821:+55 11 96597-0821"). Antes caia em "nao consigo abrir" e a Serena pedia o
// numero em texto (caso Rita, 15/10 10:27, mandando o contato da irma para a gente orientar). Agora vira texto
// com o numero no formato "+55 11 96597-0821", que a Serena le e o [Serena] Indicacao reconhece sozinho.
const cartoes = inner.contactMessage ? [inner.contactMessage]
  : ((inner.contactsArrayMessage && Array.isArray(inner.contactsArrayMessage.contacts)) ? inner.contactsArrayMessage.contacts : []);
if (cartoes.length) {
  const fmt = n => (n.length === 12 || n.length === 13) && n.indexOf('55') === 0
    ? '+55 ' + n.slice(2, 4) + ' ' + n.slice(4, n.length - 4) + '-' + n.slice(-4)
    : '+' + n;
  const lidos = cartoes.slice(0, 5).map(cc => {
    const v = String((cc && cc.vcard) || '');
    const nomeC = String((cc && cc.displayName) || (v.match(/^FN:(.*)$/m) || [])[1] || '').trim().slice(0, 60);
    const tels = [];
    v.split(/\r?\n/).forEach(l => {
      if (!/^(item\d+\.)?TEL/i.test(l)) return;
      const waid = (l.match(/waid=(\d+)/i) || [])[1];
      const exibido = String(l.split(':').slice(1).join(':'));
      let n = waid || exibido.replace(/\D/g, '');
      // sem waid e sem +DDI: numero nacional, entao e do Brasil
      if (!waid && n.length >= 10 && n.length <= 11 && !/^\s*\+/.test(exibido)) n = '55' + n;
      if (n && n.length >= 10 && n.length <= 15 && tels.indexOf(n) < 0) tels.push(n);
    });
    return { nome: nomeC, tels: tels };
  }).filter(x => x.tels.length);
  if (lidos.length) {
    const desc = lidos.map(x => (x.nome || 'sem nome') + ', ' + x.tels.map(fmt).join(' / ')).join('; ');
    return [{ json: Object.assign({}, base, { tipo: 'texto', texto: (texto ? texto + '\n' : '') + '[O cliente compartilhou um contato do WhatsApp: ' + desc + ']' }) }];
  }
}
if (!texto) {
  if (inner.stickerMessage) return [];
  const midia = inner.videoMessage ? 'um video' : doc ? 'um documento (' + String(doc.fileName || doc.mimetype || 'arquivo') + ')' : inner.locationMessage ? 'uma localizacao' : inner.contactMessage ? 'um contato' : '';
  if (!midia) return [];
  return [{ json: Object.assign({}, base, { tipo: 'texto', texto: '[O cliente enviou ' + midia + ' que nao consigo abrir por aqui. Se for comprovante ou documento, peca uma foto (imagem) ou PDF; se precisar do conteudo, peca em texto.]' }) }];
}
return [{ json: Object.assign({}, base, { tipo: 'texto', texto: texto }) }];