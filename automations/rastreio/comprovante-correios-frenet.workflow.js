// n8n Workflow SDK — [Rastreio] Comprovante Correios (Frenet)  (workflow vzmhY9lCvOnBXlA0)
// Comprovante de entrega dos Correios (assinatura do recebedor) na pagina de rastreio, igual ao da J&T.
// A Frenet nao tem API para isso: o arquivo so existe no painel (painel.frenet.com.br/Order/DocumentCarrier?shippingOrderID=...).
// Por isso o fluxo usa a SESSAO do painel guardada na credencial "Frenet Painel (sessao)" (Header Auth, header Cookie com
// .ASPXAUTH e ASP.NET_SessionId). O login do painel tem reCAPTCHA e NAO e automatizado: quando a sessao vence, chega um
// alerta no Telegram (1 por dia) e alguem copia o cookie de novo e atualiza a credencial.
//
// A cada 30 min:
//   1. le o que ja foi conferido (rastreio_comprovantes, ver comprovante-correios.sql);
//   2. lista os 200 envios mais novos da Frenet (pagina comeca em 0), so Correios com etiqueta, nao cancelados;
//      ate 25 por rodada, com espera crescente por envio (1h..6h) e no maximo 40 tentativas;
//   3. confere no rastreio da Frenet se foi "entregue ao destinatario";
//   4. entregue -> baixa o PDF do painel, tira a imagem da assinatura e grava em PNG (inflate/deflate em JS puro:
//      o Code node do n8n bloqueia require('zlib'));
//   5. GET /webhook/rastreio/comprovante-correios?codigo=XX123456789BR serve a imagem (cache 1 dia);
//      &check=1 responde {ok} (usado pelo motor do rastreio, no no "Ajustar Previsao +2d", nodes/ajustar-previsao-comprovante.js).
// Tokens da Frenet: so no n8n. Aqui ficam placeholders.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 30 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } } });

const conferidos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Ja conferidos', parameters: {"operation": "executeQuery", "query": "select coalesce(json_agg(json_build_object('codigo', codigo, 'tentativas', tentativas, 'ultima_tentativa', ultima_tentativa, 'obtido_em', obtido_em)), '[]'::json) as lista from rastreio_comprovantes where criado_em > now() - interval '90 days'", "options": {}} } });

const escolher = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escolher envios', parameters: { jsCode: `
// Escolhe envios dos Correios (Frenet) para buscar o comprovante de entrega no painel.
// Lista os 500 envios mais novos da Frenet (pagina comeca em 0; ate 08/11/2026 eram 200, e entregas de mais de ~1 semana ficavam de fora), confere no rastreio da Frenet quem ja foi entregue
// e respeita uma espera crescente por envio (1h, 2h... ate 6h) para nao consultar demais.
// PRIORIDADE: codigos pedidos pela equipe entram primeiro na fila da rodada.
const PRIORIDADE = ['AE069586903BR'];
const TOKEN = '<FRENET_TOKEN>';
const PARTNER = '<FRENET_PARTNER_TOKEN>';
const H = { token: TOKEN, 'x-partner-token': PARTNER, Accept: 'application/json' };
const MAX = 25;
let conhecidos = $input.first().json.lista || [];
if (typeof conhecidos === 'string') { try { conhecidos = JSON.parse(conhecidos); } catch (e) { conhecidos = []; } }
const mapa = {}; for (const r of conhecidos) mapa[r.codigo] = r;
let envs = [];
for (const p of [0, 1, 2, 3, 4]) {
  try {
    const r = await this.helpers.httpRequest({ method: 'GET', url: 'https://whitelabel.apifrenet.com.br/v1/shipments?page=' + p + '&per_page=100', headers: H, json: true, timeout: 30000 });
    envs = envs.concat((r && r.shipments) || []);
  } catch (e) {}
}
const codDe = (s) => { const v = (s.volumes || []).find(x => x.labelId); return v ? String(v.labelId).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''; };
envs.sort((a, b) => (PRIORIDADE.indexOf(codDe(b)) >= 0) - (PRIORIDADE.indexOf(codDe(a)) >= 0));
const agora = Date.now(), out = [];
for (const s of envs) {
  if (out.length >= MAX) break;
  const q = s.quotation || {};
  if (String(q.carrierCode || '').toUpperCase() !== 'COR') continue;
  if ([1, 7, 9].indexOf(Number(s.shipmentStatus)) >= 0) continue;
  const vol = (s.volumes || []).find(v => v.labelId) || null;
  if (!vol) continue;
  const cod = String(vol.labelId).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const k = mapa[cod];
  if (k && k.obtido_em) continue;
  const tent = k ? Number(k.tentativas || 0) : 0;
  if (tent >= 40) continue;
  if (PRIORIDADE.indexOf(cod) < 0 && k && k.ultima_tentativa && agora - new Date(k.ultima_tentativa).getTime() < Math.min(6, Math.max(1, tent)) * 3600000) continue;
  let entregue = false;
  try {
    const t = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.frenet.com.br/tracking/trackinginfo', headers: { token: TOKEN, 'Content-Type': 'application/json' }, body: { ShippingServiceCode: String(q.shippingServiceCode || ''), TrackingNumber: cod }, json: true, timeout: 20000 });
    entregue = ((t && t.TrackingEvents) || []).some(e => /entregue ao destinat/i.test(String(e.EventDescription || '')));
  } catch (e) { continue; }
  out.push({ json: { codigo: cod, shipment_id: s.shipmentId, entregue: entregue } });
}
return out;
` } } });

const entregue = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Entregue?', parameters: {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "loose"}, "conditions": [{"leftValue": "={{ $json.entregue }}", "rightValue": true, "operator": {"type": "boolean", "operation": "true", "singleValue": true}}], "combinator": "and"}, "options": {}} } });

// Credencial "Frenet Painel (sessao)" escolhida na interface do n8n (o MCP nao consegue anexar Header Auth).
const painel = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Painel DocumentCarrier', parameters: {
  url: "={{ 'https://painel.frenet.com.br/Order/DocumentCarrier?shippingOrderID=' + $json.shipment_id }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' }] },
  options: { redirect: { redirect: { followRedirects: false } }, response: { response: { fullResponse: true, neverError: true, responseFormat: 'file' } }, timeout: 40000, batching: { batch: { batchSize: 1, batchInterval: 1500 } } } } } });

const extrair = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Extrair imagem', parameters: { mode: 'runOnceForEachItem', jsCode: `
// Le a resposta do painel (modo: uma vez por item). PDF = comprovante: tira a imagem da assinatura e grava em PNG.
// 302 para /Error = ainda nao disponivel. 302 para Logout/Login = sessao vencida (alerta no Telegram, 1 por dia).
// Extrai a maior imagem de um PDF (assinatura do comprovante dos Correios) e devolve {mime, buf}.
// Sem zlib (o n8n bloqueia o modulo): inflate e deflate em JS puro.
// DCTDecode (JPEG) volta como esta; FlateDecode RGB/Gray 8 bits vira PNG.
function inflarZlib(buf) {
  let p = 2, bb = 0, bc = 0, op = 0;
  let out = Buffer.alloc(Math.max(65536, buf.length * 10));
  const cabe = n => { if (op + n > out.length) { const o = Buffer.alloc(Math.max(out.length * 2, op + n)); out.copy(o, 0, 0, op); out = o; } };
  const bit = () => { if (!bc) { if (p >= buf.length) throw new Error('fim do stream'); bb = buf[p++]; bc = 8; } const b = bb & 1; bb >>= 1; bc--; return b; };
  const bits = n => { let v = 0; for (let i = 0; i < n; i++) v |= bit() << i; return v; };
  const montar = (lens) => {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(lens.length);
    for (const l of lens) count[l]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < lens.length; i++) if (lens[i]) symbol[offs[lens[i]]++] = i;
    return { count, symbol };
  };
  const ler = (t) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bit();
      const c = t.count[len];
      if (code - c < first) return t.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('codigo invalido');
  };
  const LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const ORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  let fimBloco = 0;
  while (!fimBloco) {
    fimBloco = bit();
    const tipo = bits(2);
    if (tipo === 0) {
      bb = 0; bc = 0;
      const len = buf[p] | (buf[p + 1] << 8); p += 4;
      cabe(len); buf.copy(out, op, p, p + len); op += len; p += len;
      continue;
    }
    let tl, td;
    if (tipo === 1) {
      const l = new Array(288); for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
      tl = montar(l); td = montar(new Array(30).fill(5));
    } else if (tipo === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) cl[ORD[i]] = bits(3);
      const tc = montar(cl);
      const lens = [];
      while (lens.length < hlit + hdist) {
        const s = ler(tc);
        if (s < 16) lens.push(s);
        else if (s === 16) { const prev = lens[lens.length - 1]; for (let r = 3 + bits(2); r > 0; r--) lens.push(prev); }
        else if (s === 17) { for (let r = 3 + bits(3); r > 0; r--) lens.push(0); }
        else { for (let r = 11 + bits(7); r > 0; r--) lens.push(0); }
      }
      tl = montar(lens.slice(0, hlit)); td = montar(lens.slice(hlit));
    } else throw new Error('bloco invalido');
    for (;;) {
      let s = ler(tl);
      if (s < 256) { cabe(1); out[op++] = s; continue; }
      if (s === 256) break;
      s -= 257;
      const len = LB[s] + bits(LE[s]);
      const ds = ler(td);
      const dist = DB[ds] + bits(DE[ds]);
      cabe(len);
      for (let k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
    }
  }
  return out.slice(0, op);
}

// Deflate simples (Huffman fixo + LZ77 guloso) dentro de um envelope zlib
function deflarZlib(src, linha) {
  let out = Buffer.alloc(Math.max(65536, src.length >> 2)), op = 0, acc = 0, n = 0;
  const cabe = () => { if (op + 8 > out.length) { const o = Buffer.alloc(out.length * 2); out.copy(o, 0, 0, op); out = o; } };
  const put = (v, k) => { for (let i = 0; i < k; i++) { acc |= ((v >> i) & 1) << n; n++; if (n === 8) { cabe(); out[op++] = acc; acc = 0; n = 0; } } };
  const putCod = (c, k) => { for (let i = k - 1; i >= 0; i--) put((c >> i) & 1, 1); };
  const lit = (v) => { if (v < 144) putCod(0x30 + v, 8); else if (v < 256) putCod(0x190 + v - 144, 9); else if (v < 280) putCod(v - 256, 7); else putCod(0xC0 + v - 280, 8); };
  const LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const idx = (tab, v) => { let i = tab.length - 1; while (tab[i] > v) i--; return i; };
  out[op++] = 0x78; out[op++] = 0x01;
  put(1, 1); put(1, 2);
  const head = new Int32Array(1 << 16).fill(-1);
  const hash = (i) => ((src[i] << 8) ^ (src[i + 1] << 4) ^ src[i + 2]) & 0xFFFF;
  const N = src.length;
  let i = 0;
  while (i < N) {
    let melhorL = 0, melhorD = 0;
    if (i + 2 < N) {
      const h = hash(i);
      const cands = [head[h], i - 1, i - 3, i - linha, i - 2 * linha];
      for (const c of cands) {
        if (c < 0 || c >= i || i - c > 32768) continue;
        let l = 0; const max = Math.min(258, N - i);
        while (l < max && src[c + l] === src[i + l]) l++;
        if (l > melhorL) { melhorL = l; melhorD = i - c; if (l === 258) break; }
      }
      head[h] = i;
    }
    if (melhorL >= 3) {
      const s = idx(LB, melhorL); lit(257 + s); put(melhorL - LB[s], LE[s]);
      const d = idx(DB, melhorD); putCod(d, 5); put(melhorD - DB[d], DE[d]);
      for (let k = 1; k < melhorL && i + k + 2 < N; k += 1) head[hash(i + k)] = i + k;
      i += melhorL;
    } else { lit(src[i]); i++; }
  }
  lit(256);
  if (n) { cabe(); out[op++] = acc; acc = 0; n = 0; }
  let a = 1, b = 0;
  for (let k = 0; k < N; k++) { a += src[k]; if (a >= 65521) a -= 65521; b += a; if (b >= 65521) b -= 65521; }
  cabe();
  out[op++] = (b >>> 8) & 255; out[op++] = b & 255; out[op++] = (a >>> 8) & 255; out[op++] = a & 255;
  return out.slice(0, op);
}

function pdfParaImagem(pdf) {
  const s = pdf.toString('latin1');
  const re = /(\\d+)\\s+0\\s+obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n/g;
  let m, melhor = null;
  while ((m = re.exec(s))) {
    const dict = m[2];
    if (!/\\/Subtype\\s*\\/Image/.test(dict)) continue;
    const len = Number((dict.match(/\\/Length\\s+(\\d+)/) || [])[1] || 0);
    const w = Number((dict.match(/\\/Width\\s+(\\d+)/) || [])[1] || 0);
    const h = Number((dict.match(/\\/Height\\s+(\\d+)/) || [])[1] || 0);
    if (!len || !w || !h) continue;
    if (!melhor || w * h > melhor.w * melhor.h) melhor = { dict, ini: re.lastIndex, len, w, h };
  }
  if (!melhor) return null;
  const dados = pdf.slice(melhor.ini, melhor.ini + melhor.len);
  if (/\\/DCTDecode/.test(melhor.dict)) return { mime: 'image/jpeg', buf: dados };
  if (!/\\/FlateDecode/.test(melhor.dict) || /\\/DecodeParms/.test(melhor.dict)) return null;
  const bpc = Number((melhor.dict.match(/\\/BitsPerComponent\\s+(\\d+)/) || [])[1] || 8);
  const cinza = /\\/DeviceGray/.test(melhor.dict);
  if (bpc !== 8 || (!cinza && !/\\/DeviceRGB/.test(melhor.dict))) return null;
  const canais = cinza ? 1 : 3;
  const raw = inflarZlib(dados);
  const linha = melhor.w * canais;
  if (raw.length < linha * melhor.h) return null;
  const comFiltro = Buffer.alloc((linha + 1) * melhor.h);
  for (let y = 0; y < melhor.h; y++) raw.copy(comFiltro, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  const tabela = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); tabela[k] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (let k = 0; k < b.length; k++) c = tabela[(c ^ b[k]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (tipo, data) => { const t = Buffer.from(tipo, 'latin1'); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(melhor.w, 0); ihdr.writeUInt32BE(melhor.h, 4); ihdr[8] = 8; ihdr[9] = cinza ? 0 : 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflarZlib(comFiltro, linha + 1)), chunk('IEND', Buffer.alloc(0))]);
  return { mime: 'image/png', buf: png };
}
const orig = $('Escolher envios').item.json;
const r = $input.item.json || {};
const st = Number(r.statusCode || 0);
const loc = String((r.headers && r.headers.location) || '');
const ct = String((r.headers && r.headers['content-type']) || '');
const res = { codigo: orig.codigo, shipment_id: orig.shipment_id, ok: false, erro: '', mime: null, b64: null, alerta: false };
if (st === 200 && /pdf/i.test(ct) && $input.item.binary) {
  try {
    const k = Object.keys($input.item.binary)[0];
    const pdf = await this.helpers.getBinaryDataBuffer($itemIndex, k);
    const img = pdfParaImagem(pdf);
    if (img) { res.ok = true; res.mime = img.mime; res.b64 = img.buf.toString('base64'); } else { res.erro = 'pdf sem imagem'; }
  } catch (e) { res.erro = 'pdf: ' + String(e.message || e).slice(0, 120); }
} else if (/logout|login/i.test(loc) || (st === 200 && /html/i.test(ct))) {
  res.erro = 'sessao vencida';
  const sd = $getWorkflowStaticData('global');
  if (!sd.alerta_em || Date.now() - sd.alerta_em > 20 * 3600000) { sd.alerta_em = Date.now(); res.alerta = true; }
} else if (st === 302) {
  res.erro = 'indisponivel';
} else {
  res.erro = 'http ' + st;
}
return { json: res };
` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Gravar comprovante', parameters: {"operation": "executeQuery", "query": "insert into rastreio_comprovantes (codigo, shipment_id, mime, imagem, tentativas, ultima_tentativa, obtido_em, erro) values ($1, $2::bigint, nullif($4, ''), case when $3::boolean then decode($5, 'base64') end, 1, now(), case when $3::boolean then now() end, nullif($6, '')) on conflict (codigo) do update set shipment_id = excluded.shipment_id, mime = coalesce(excluded.mime, rastreio_comprovantes.mime), imagem = coalesce(excluded.imagem, rastreio_comprovantes.imagem), tentativas = rastreio_comprovantes.tentativas + 1, ultima_tentativa = now(), obtido_em = coalesce(rastreio_comprovantes.obtido_em, excluded.obtido_em), erro = excluded.erro returning codigo, (obtido_em is not null) as tem", "options": {"queryReplacement": "={{ [$json.codigo, String($json.shipment_id || ''), String(!!$json.ok), $json.mime || '', $json.b64 || '', $json.erro || ''] }}"}} } });

const checagem = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Registrar checagem', parameters: {"operation": "executeQuery", "query": "insert into rastreio_comprovantes (codigo, shipment_id, tentativas, ultima_tentativa, erro) values ($1, $2::bigint, 1, now(), 'ainda nao entregue') on conflict (codigo) do update set tentativas = rastreio_comprovantes.tentativas + 1, ultima_tentativa = now(), erro = 'ainda nao entregue' returning codigo", "options": {"queryReplacement": "={{ [$json.codigo, String($json.shipment_id || '')] }}"}} } });

const vencida = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Sessao vencida?', parameters: {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "loose"}, "conditions": [{"leftValue": "={{ $json.alerta }}", "rightValue": true, "operator": {"type": "boolean", "operation": "true", "singleValue": true}}], "combinator": "and"}, "options": {}} } });

const avisar = node({ type: 'n8n-nodes-base.telegram', version: 1.2, credentials: { telegramApi: { id: '5FInpXVy62zrG60P', name: 'Telegram account' } }, config: { name: 'Avisar sessao vencida', onError: 'continueRegularOutput', parameters: {"resource": "message", "operation": "sendMessage", "chatId": "-1003766435449", "text": "🔑 <b>Sessão do painel da Frenet venceu</b>\nOs comprovantes de entrega dos Correios pararam de ser baixados. Para voltar: entre em painel.frenet.com.br, copie o cookie de novo (DevTools → Network → DocumentCarrier → Headers → cookie) e atualize a credencial <b>Frenet Painel (sessão)</b> no n8n.", "additionalFields": {"appendAttribution": false, "parse_mode": "HTML", "message_thread_id": 289, "disable_web_page_preview": true}} } });

// ---- servir a imagem ----
const req = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Servir: Requisição', parameters: {"httpMethod": "GET", "path": "rastreio/comprovante-correios", "responseMode": "responseNode", "options": {}} } });
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Servir: Buscar', alwaysOutputData: true, parameters: {"operation": "executeQuery", "query": "select mime, encode(imagem, 'base64') as b64 from rastreio_comprovantes where codigo = upper(regexp_replace($1, '[^A-Za-z0-9]', '', 'g')) and obtido_em is not null and imagem is not null", "options": {"queryReplacement": "={{ [String(($json.query || {}).codigo || '')] }}"}} } });
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Servir: Montar', parameters: { jsCode: `
const q = $('Servir: Requisição').first().json.query || {};
const r = $input.first().json || {};
const tem = !!r.b64;
if (q.check) return [{ json: { modo: 'json', status: tem ? 200 : 404, corpo: { ok: tem } } }];
if (!tem) return [{ json: { modo: 'json', status: 404, corpo: { ok: false, erro: 'comprovante nao encontrado' } } }];
const nome = 'comprovante-' + String(q.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '') + (r.mime === 'image/jpeg' ? '.jpg' : '.png');
const bin = await this.helpers.prepareBinaryData(Buffer.from(r.b64, 'base64'), nome, r.mime || 'image/png');
return [{ json: { modo: 'imagem' }, binary: { data: bin } }];` } } });
const ehImagem = node({ type: 'n8n-nodes-base.if', version: 2.2, config: { name: 'Servir: Imagem?', parameters: {"conditions": {"options": {"caseSensitive": true, "leftValue": "", "typeValidation": "loose"}, "conditions": [{"leftValue": "={{ $json.modo }}", "rightValue": "imagem", "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"}, "options": {}} } });
const respImg = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Servir: Responder imagem', parameters: {"respondWith": "binary", "responseDataSource": "automatically", "options": {"responseHeaders": {"entries": [{"name": "Cache-Control", "value": "public, max-age=86400"}, {"name": "Access-Control-Allow-Origin", "value": "*"}]}}} } });
const respJson = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Servir: Responder', parameters: {"respondWith": "json", "responseBody": "={{ JSON.stringify($json.corpo) }}", "options": {"responseCode": "={{ $json.status }}", "responseHeaders": {"entries": [{"name": "Access-Control-Allow-Origin", "value": "*"}, {"name": "Cache-Control", "value": "no-store"}]}}} } });

const nota = sticky('## Comprovante Correios (Frenet)\n\nBaixa do painel da Frenet (sessao guardada) a assinatura de entrega dos Correios e serve em /webhook/rastreio/comprovante-correios. Sessao vencida = alerta no Telegram; atualizar o cookie na credencial Frenet Painel (sessao).');

export default workflow('rastreio-comprovante-correios', '[Rastreio] Comprovante Correios (Frenet)', { settings: { executionOrder: 'v1' } })
  .add(relogio).to(conferidos).to(escolher).to(entregue.onTrue(painel.to(extrair.to([gravar, vencida.onTrue(avisar)]))).onFalse(checagem))
  .add(req).to(buscar).to(montar).to(ehImagem.onTrue(respImg).onFalse(respJson))
  .add(nota);
