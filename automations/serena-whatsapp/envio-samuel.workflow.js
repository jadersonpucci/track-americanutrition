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
const audioTexto = String(b.audio_texto || '').trim();
const text = String(b.text || b.texto || '').trim();
if (!audioTexto && !text) throw new Error('informe text ou audio_texto');
const delay = Math.max(0, Math.min(8000, Number(b.delay || 1000)));
return [{ json: { number: number, text: text || audioTexto, audio_texto: audioTexto, voz_id: String(b.voz_id || 'CcElPA8NBrawbunFs7rh'), delay: delay, tipo: audioTexto ? 'audio' : 'texto' } }];` } },
  output: [{ number: '5511999999999', text: 'oi', audio_texto: '', voz_id: 'x', delay: 1000, tipo: 'texto' }] });

const eAudio = switchCase({ version: 3.2, config: { name: 'E audio?', parameters: { rules: { values: [
  { outputKey: 'audio', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.tipo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'audio' }], combinator: 'and' } },
  { outputKey: 'texto', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.tipo }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'texto' }], combinator: 'and' } }
] }, options: {} } } });

const gerarVoz = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Gerar Voz (ElevenLabs)', parameters: {
  method: 'POST', url: expr('https://api.elevenlabs.io/v1/text-to-speech/{{ $json.voz_id }}?output_format=mp3_44100_64'),
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ text: $json.audio_texto, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 } }) }}"),
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
let tipo = 'texto';
try { if ($('Enviar Audio (Samuel)').isExecuted) tipo = 'audio'; } catch (e) { tipo = 'texto'; }
return [{ json: { ok: ok, tipo: tipo, message_id: (r.key && r.key.id) || r.messageId || null, erro: ok ? null : JSON.stringify(r).slice(0, 300) } }];` } },
  output: [{ ok: true, tipo: 'texto', message_id: 'X', erro: null }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} } }, output: [{}] });

const nota = sticky('## Envio pelo Samuel (texto ou audio)\n\nPOST /webhook/serena-samuel-enviar\n- texto: { number, text, delay }\n- audio: { number, audio_texto, voz_id, delay } -> ElevenLabs TTS (eleven_multilingual_v2) -> sendWhatsAppAudio (PTT). Se a voz falhar, manda o texto.\n\nUsado pela Entrada (ack rapido e resposta em audio) e pelo pos-entrega. Responde { ok, tipo, message_id }.', [preparar, base64], { color: 6 });

export default workflow('serena-samuel-enviar', '[Serena WhatsApp] Envio Samuel (texto ou audio)')
  .add(entrada).to(preparar)
  .to(eAudio
    .onCase(0, gerarVoz.to(base64.to(vozOk.onCase(0, enviarAudio).onCase(1, enviarTexto))))
    .onCase(1, enviarTexto))
  .add(enviarAudio).to(resultado)
  .add(enviarTexto).to(resultado)
  .add(resultado).to(responder)
  .add(nota);
