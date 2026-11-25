// n8n Workflow SDK — [Serena] Enviar Arquivo (id iy1YjV6hQutIsh5v)
// POST /webhook/serena-samuel-arquivo  { number, url, tipo: 'document'|'image'|'video', nome, legenda, delay }
// Manda PDF, imagem ou video pelo WhatsApp do Samuel (Evolution /message/sendMedia).
// Quem chama: a Entrada, quando a Serena marca [[ARQUIVO: chave]] na resposta.
// Os arquivos disponiveis ficam em serena_config.documentos (chave, nome, tipo, url, legenda, quando, gatilhos).
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido de Envio', parameters: { httpMethod: 'POST', path: 'serena-samuel-arquivo', responseMode: 'responseNode', options: {} } },
  output: [{ body: { number: '5511999999999', url: 'https://exemplo/laudo.pdf', tipo: 'document', nome: 'Laudo.pdf', legenda: 'Laudo toxicologico' } }] });

const enviar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Enviar Midia', parameters: { jsCode: `// Envia arquivo (PDF, imagem ou video) pelo WhatsApp do Samuel via Evolution /message/sendMedia.
// Body: { number, url, tipo: 'document'|'image'|'video', nome, legenda, delay }.
const EVO = 'http://evolution-api-aru6-api-1:8080';
const KEY = '83608A5B5601-4996-A041-0DDF15D13E8A';
const INST = 'Samuel';
const self = this;
const b = $input.first().json.body || $input.first().json;

const number = String(b.number || b.telefone || '').replace(/\\D/g, '');
const url = String(b.url || b.media || b.arquivo || '').trim();
const tipo = ['document', 'image', 'video'].indexOf(String(b.tipo || '')) >= 0 ? String(b.tipo) : 'document';
const MIME = { document: 'application/pdf', image: 'image/png', video: 'video/mp4' };
const mimetype = String(b.mimetype || '').trim() || (/\\.jpe?g($|\\?)/i.test(url) ? 'image/jpeg' : (/\\.png($|\\?)/i.test(url) ? 'image/png' : MIME[tipo]));
const nome = String(b.nome || b.fileName || 'arquivo').trim();
const legenda = String(b.legenda || b.caption || '').trim();
const delay = Number(b.delay || 1200);

if (!number || number.length < 10) return [{ json: { ok: false, erro: 'numero invalido' } }];
if (!/^https?:\\/\\//i.test(url)) return [{ json: { ok: false, erro: 'url invalida' } }];

const corpo = { number: number, mediatype: tipo, mimetype: mimetype, media: url, fileName: nome, delay: delay };
if (legenda) corpo.caption = legenda;

let r = null, erro = null;
try {
  r = await self.helpers.httpRequest({ method: 'POST', url: EVO + '/message/sendMedia/' + INST, headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: corpo, json: true, timeout: 90000 });
} catch (e) { erro = String(e.message || e).slice(0, 400); }

const ok = !!(r && r.key && r.key.id);
return [{ json: { ok: ok, tipo: tipo, nome: nome, message_id: ok ? r.key.id : null, erro: ok ? null : (erro || JSON.stringify(r || {}).slice(0, 300)) } }];` } },
  output: [{ ok: true, tipo: 'document', nome: 'Laudo.pdf', message_id: 'X', erro: null }] });

const resultado = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Resultado', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} } } });

const nota = sticky('## Enviar arquivo pelo WhatsApp\n\nPOST /webhook/serena-samuel-arquivo com { number, url, tipo (document|image|video), nome, legenda }. Manda o arquivo pelo Evolution (sendMedia) na instancia Samuel. Usado pela Entrada quando a Serena marca [[ARQUIVO: chave]] na resposta; os arquivos disponiveis ficam em serena_config.documentos.', [entrada, enviar], { color: 5 });

export default workflow('serena-enviar-arquivo', '[Serena] Enviar Arquivo')
  .add(entrada).to(enviar).to(resultado)
  .add(nota);
