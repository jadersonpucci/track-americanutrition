// n8n Workflow SDK — [Serena WhatsApp] Envio Samuel (texto ou audio) (id EhmndFruX6hOIRDN)
// POST /webhook/serena-samuel-enviar  { number, text, delay } | { number, audio_texto, voz_id, delay }
import { workflow, node, trigger, sticky, switchCase, expr } from '@n8n/workflow-sdk';

const EVO = { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } };
const ELEVEN = { httpHeaderAuth: { id: '1sbAJVPlniO6CUig', name: 'ElevenLabs API' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook Enviar', parameters: { httpMethod: 'POST', path: 'serena-samuel-enviar', responseMode: 'responseNode', options: {} } },
  output: [{ body: { number: '5511999999999', text: 'oi', delay: 1000 } }] });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const b = $input.first().json.body || $input.first().json;
const number = String(b.number || b.telefone || '').replace(/\\D/g, '');
if (!number || number.length < 10) throw new Error('number invalido');
const audioTextoRaw = String(b.audio_texto || '').trim();
const text = String(b.text || b.texto || '').trim();
if (!audioTextoRaw && !text) throw new Error('informe text ou audio_texto');
const delay = Math.max(0, Math.min(8000, Number(b.delay || 1000)));
const vozId = String(b.voz_id || 'CcElPA8NBrawbunFs7rh');

// Texto falado: tira markdown do WhatsApp, emojis, links e marcadores; numeros em reais e porcentagem viram palavras;
// quebras de linha viram pausas. E o que deixa a voz soar natural em vez de ler simbolos.
function paraFala(t) {
  let s = String(t || '');
  s = s.replace(/https?:\\/\\/\\S+/gi, '');
  s = s.replace(/[*_~\`]+/g, '');
  s = s.replace(/^\\s*[-•▪◦>]+\\s+/gm, '');
  s = s.replace(/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{200D}\\u{1F1E6}-\\u{1F1FF}]/gu, '');
  s = s.replace(/R\\$\\s*(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{2}))?/g, function (m, r, c) {
    const reais = r.replace(/\\./g, '');
    let out = reais + (reais === '1' ? ' real' : ' reais');
    if (c && c !== '00') out += ' e ' + String(Number(c)) + (c === '01' ? ' centavo' : ' centavos');
    return out;
  });
  s = s.replace(/(\\d+)\\s*%/g, '$1 por cento');
  s = s.replace(/\\bn[º°]\\s*/gi, 'número ');
  s = s.replace(/\\s*\\n+\\s*/g, '. ');
  s = s.replace(/[,;:]\\s*\\./g, '.').replace(/([!?…])\\s*\\./g, '$1').replace(/\\.\\s*\\./g, '.');
  s = s.replace(/\\s{2,}/g, ' ').trim();
  return s;
}
let audioTexto = paraFala(audioTextoRaw);

// Modelo principal eleven_v3 (mais natural e expressivo); reserva eleven_multilingual_v2 com ajustes mais soltos.
// b.modelo = 'v2' forca o v2 ja na primeira tentativa. b.estabilidade, b.velocidade e b.tag (direcao do v3, ex: '[animada]') sao opcionais.
const modelo = String(b.modelo || 'v3').toLowerCase();
const est = (b.estabilidade != null && b.estabilidade !== '') ? Number(b.estabilidade) : null;
const vel = (b.velocidade != null && b.velocidade !== '') ? Math.max(0.7, Math.min(1.2, Number(b.velocidade))) : null;
const tag = String(b.tag || '').trim();
const textoV3 = (tag ? tag + ' ' : '') + audioTexto;
const corpoV3 = { text: textoV3, model_id: 'eleven_v3', voice_settings: { stability: (est != null ? est : 0.5), similarity_boost: 0.8, speed: (vel != null ? vel : 1.1) } };
const corpoV2 = { text: audioTexto, model_id: 'eleven_multilingual_v2', voice_settings: { stability: (est != null ? est : 0.38), similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: (vel != null ? vel : 1.08) } };
const corpoA = modelo === 'v2' ? corpoV2 : corpoV3;

return [{ json: { number: number, text: text || audioTextoRaw, audio_texto: audioTexto, voz_id: vozId, delay: delay, tipo: audioTexto ? 'audio' : 'texto', modelo_a: corpoA.model_id, corpo_a: corpoA, corpo_b: corpoV2 } }];` } },
  output: [{ number: '5511999999999', text: 'oi', audio_texto: '', voz_id: 'x', delay: 1000, tipo: 'texto', modelo_a: 'eleven_v3', corpo_a: {}, corpo_b: {} }] });

const eAudio = switchCase({ version: 3.2, config: { name: 'E audio?', parameters: { rules: { values: [
  { outputKey: 'audio', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.tipo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'audio' }], combinator: 'and' } },
  { outputKey: 'texto', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.tipo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'texto' }], combinator: 'and' } }
] }, options: {} } } });

const gerarVoz = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Gerar Voz (ElevenLabs)', parameters: {
  method: 'POST', url: expr('https://api.elevenlabs.io/v1/text-to-speech/{{ $json.voz_id }}?output_format=mp3_44100_128'),
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify($json.corpo_a) }}'),
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } }, timeout: 60000 } }, credentials: ELEVEN, onError: 'continueRegularOutput' },
  output: [{ data: 'binary' }] });

const base64 = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Audio em Base64', parameters: { jsCode: `const p = $('Preparar').first().json;
let b64 = '';
try {
  const bin = $input.first().binary;
  if (bin && bin.data) {
    const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
    if (buf && buf.length > 2000) b64 = buf.toString('base64');
  }
} catch (e) { b64 = ''; }
return [{ json: { number: p.number, audio: b64, tem_audio: !!b64, delay: p.delay } }];` } },
  output: [{ number: '5511999999999', audio: 'AAAA', tem_audio: true, delay: 1000 }] });

const vozOk = switchCase({ version: 3.2, config: { name: 'Voz gerada?', parameters: { rules: { values: [
  { outputKey: 'ok', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.tem_audio }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: true }], combinator: 'and' } },
  { outputKey: 'falhou', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.tem_audio }}'), operator: { type: 'boolean', operation: 'false', singleValue: true }, rightValue: true }], combinator: 'and' } }
] }, options: {} } } });


// eleven_v3 falhou: uma segunda passada no mesmo Gerar Voz com eleven_multilingual_v2; se falhar de novo, texto.
const trocarV2 = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Trocar para v2', parameters: { jsCode: `// A voz principal (eleven_v3) falhou: tenta uma vez com eleven_multilingual_v2 (mesmo no Gerar Voz, segunda passada).
// Se ja e a segunda passada, ou o v2 ja foi o primeiro modelo, desiste e manda texto.
const p = $('Preparar').first().json;
const desistir = ($runIndex > 0) || p.modelo_a === 'eleven_multilingual_v2';
return [{ json: Object.assign({}, p, { corpo_a: p.corpo_b, modelo_a: 'eleven_multilingual_v2', tentar: !desistir }) }];` } },
  output: [{ tentar: true }] });

const tentarV2 = switchCase({ version: 3.2, config: { name: 'Tentar v2?', parameters: { rules: { values: [
  { outputKey: 'sim', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.tentar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: true }], combinator: 'and' } },
  { outputKey: 'nao', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.tentar }}'), operator: { type: 'boolean', operation: 'false', singleValue: true }, rightValue: true }], combinator: 'and' } }
] }, options: {} } } });

const enviarAudio = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Enviar Audio (Samuel)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/message/sendWhatsAppAudio/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: expr('{{ JSON.stringify({ number: $json.number, audio: $json.audio, delay: $json.delay, encoding: true }) }}'),
  options: { response: { response: { neverError: true } }, timeout: 90000 } }, credentials: EVO, onError: 'continueRegularOutput' },
  output: [{ key: { id: 'X' } }] });

const enviarTexto = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Enviar Texto (Samuel)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/message/sendText/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ number: $('Preparar').first().json.number, text: $('Preparar').first().json.text, delay: $('Preparar').first().json.delay }) }}"),
  options: { response: { response: { neverError: true } }, timeout: 60000 } }, credentials: EVO, onError: 'continueRegularOutput' },
  output: [{ key: { id: 'X' } }] });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const r = $input.first().json || {};
const ok = !!(r.key && r.key.id) || !!r.messageId;
let tipo = 'texto', modelo = null;
try { if ($('Enviar Audio (Samuel)').isExecuted) tipo = 'audio'; } catch (e) { tipo = 'texto'; }
if (tipo === 'audio') { try { modelo = $('Trocar para v2').isExecuted ? 'eleven_multilingual_v2' : $('Preparar').first().json.modelo_a; } catch (e) { modelo = null; } }
return [{ json: { ok: ok, tipo: tipo, modelo: modelo, message_id: (r.key && r.key.id) || r.messageId || null, erro: ok ? null : JSON.stringify(r).slice(0, 300) } }];` } },
  output: [{ ok: true, tipo: 'texto', message_id: 'X', erro: null }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} } }, output: [{}] });

const nota = sticky('## Envio pelo Samuel (texto ou audio)\n\nPOST /webhook/serena-samuel-enviar\n- texto: { number, text, delay }\n- audio: { number, audio_texto, voz_id, delay } -> texto limpo pra fala -> ElevenLabs eleven_v3 (reserva: segunda passada com eleven_multilingual_v2) -> sendWhatsAppAudio (PTT). Se a voz falhar, manda o texto.\n\nUsado pela Entrada (ack rapido e resposta em audio) e pelo pos-entrega. Responde { ok, tipo, message_id }.', [preparar, base64], { color: 6 });

export default workflow('serena-samuel-enviar', '[Serena WhatsApp] Envio Samuel (texto ou audio)')
  .add(entrada).to(preparar)
  .to(eAudio
    .onCase(0, gerarVoz.to(base64.to(vozOk.onCase(0, enviarAudio).onCase(1, trocarV2.to(tentarV2.onCase(0, gerarVoz).onCase(1, enviarTexto))))))
    .onCase(1, enviarTexto))
  .add(enviarAudio).to(resultado)
  .add(enviarTexto).to(resultado)
  .add(resultado).to(responder)
  .add(nota);
