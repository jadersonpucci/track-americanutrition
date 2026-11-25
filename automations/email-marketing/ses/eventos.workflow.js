// n8n Workflow SDK — [Email] Eventos SES (POST /webhook/ses-eventos)
// Amazon SES (configuration set an-marketing) -> SNS (topico an-ses-eventos) -> aqui.
// Confere a assinatura do SNS (certificado da AWS), confirma a inscricao do topico sozinho e grava cada
// evento com email_registrar_evento() (eventos.sql): bounce permanente / 3 temporarios em 30 dias -> 'bounce',
// reclamacao de spam -> 'reclamacao' (e descadastra na Shopify). Entrega, abertura e clique: so historico.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'SNS', parameters: { httpMethod: 'POST', path: 'ses-eventos', responseMode: 'onReceived', options: { rawBody: true } } }, output: [{ body: {} }] });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler SNS', parameters: { jsCode: `
const crypto = require('crypto');
const TOPICO = 'arn:aws:sns:sa-east-1:368672081051:an-ses-eventos';
const NL = String.fromCharCode(10);
const it = $input.first();
let b = it.json.body;
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
if (!b || !b.Type) {
  try { const buf = await this.helpers.getBinaryDataBuffer(0, 'data'); b = JSON.parse(buf.toString('utf8')); } catch (e) { b = null; }
}
if (!b || b.TopicArn !== TOPICO) return [];

// Assinatura do SNS (certificado tem que vir de sns.<regiao>.amazonaws.com). Sem URL(): o sandbox do n8n nao tem.
function hostAws(u) {
  u = String(u || '');
  if (u.indexOf('https://') !== 0) return false;
  const host = u.slice(8).split('/')[0].split('?')[0].toLowerCase();
  return host.indexOf('sns.') === 0 && host.slice(-14) === '.amazonaws.com' && host.indexOf('@') < 0;
}
if (!hostAws(b.SigningCertURL)) return [];
const campos = b.Type === 'Notification'
  ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
  : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
let texto = '';
for (const k of campos) { if (b[k] === undefined || b[k] === null) continue; texto += k + NL + b[k] + NL; }
const pem = await this.helpers.httpRequest({ method: 'GET', url: b.SigningCertURL, timeout: 10000 });
const v = crypto.createVerify(String(b.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
v.update(texto, 'utf8');
if (!v.verify(String(pem), b.Signature, 'base64')) return [];

if (b.Type === 'SubscriptionConfirmation') {
  if (hostAws(b.SubscribeURL)) await this.helpers.httpRequest({ method: 'GET', url: b.SubscribeURL, timeout: 10000 });
  return [];
}
if (b.Type !== 'Notification') return [];

let m;
try { m = JSON.parse(b.Message); } catch (e) { return []; }
const mail = m.mail || {};
const tags = mail.tags || {};
const base = { messageId: mail.messageId, modelo: (tags.modelo || [])[0] || null };
const tipo = String(m.eventType || m.notificationType || '').toLowerCase().replace(/ /g, '_');
const out = [];
const add = (email, extra) => { if (email) out.push({ json: { email: String(email).toLowerCase(), tipo: tipo === 'deliverydelay' ? 'delivery_delay' : tipo, detalhe: Object.assign({}, base, extra || {}) } }); };

if (tipo === 'bounce') {
  const bo = m.bounce || {};
  (bo.bouncedRecipients || []).forEach(r => add(r.emailAddress, { bounceType: bo.bounceType, bounceSubType: bo.bounceSubType, diagnostico: String(r.diagnosticCode || '').slice(0, 300) }));
} else if (tipo === 'complaint') {
  const c = m.complaint || {};
  (c.complainedRecipients || []).forEach(r => add(r.emailAddress, { tipoReclamacao: c.complaintFeedbackType || null }));
} else if (tipo === 'delivery') {
  ((m.delivery || {}).recipients || []).forEach(e => add(e));
} else if (tipo === 'deliverydelay') {
  ((m.deliveryDelay || {}).delayedRecipients || []).forEach(r => add(r.emailAddress, { motivo: (m.deliveryDelay || {}).delayType }));
} else if (tipo === 'open') {
  (mail.destination || []).forEach(e => add(e, { userAgent: String((m.open || {}).userAgent || '').slice(0, 200) }));
} else if (tipo === 'click') {
  (mail.destination || []).forEach(e => add(e, { link: String((m.click || {}).link || '').slice(0, 500) }));
} else if (tipo === 'reject' || tipo === 'rendering_failure') {
  (mail.destination || []).forEach(e => add(e, { motivo: String((m.reject || {}).reason || (m.failure || {}).errorMessage || '').slice(0, 300) }));
}
return out;
` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Gravar evento', parameters: {
  operation: 'executeQuery',
  query: 'select email_registrar_evento($1, $2, $3::jsonb) as r',
  options: { queryReplacement: '={{ [$json.email, $json.tipo, JSON.stringify($json.detalhe)] }}' } } } });

const shopify = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Reclamacao na Shopify', parameters: { jsCode: `
// Quem marcou como spam tambem sai do marketing na Shopify (o Klaviyo acompanha).
const res = [];
for (const it of $input.all()) {
  let r = it.json.r || {};
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = {}; } }
  if (!(r.mudou && r.status === 'reclamacao')) continue;
  let st = '';
  try {
    const gql = async (query, variables) => this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 20000,
      headers: { 'Content-Type': 'application/json' },
      body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
    const c = await gql('query($q:String!){customers(first:1, query:$q){nodes{id}}}', { q: 'email:"' + r.email + '"' });
    const id = (((((c || {}).dados || {}).data || {}).customers || {}).nodes || [])[0];
    if (id && id.id) {
      const mm = await gql('mutation($i:CustomerEmailMarketingConsentUpdateInput!){customerEmailMarketingConsentUpdate(input:$i){userErrors{message}}}',
        { i: { customerId: id.id, emailMarketingConsent: { marketingState: 'UNSUBSCRIBED', consentUpdatedAt: new Date().toISOString() } } });
      const err = ((((mm || {}).dados || {}).data || {}).customerEmailMarketingConsentUpdate || {}).userErrors || [];
      st = err.length ? 'erro: ' + err.map(x => x.message).join('; ') : 'ok';
    } else { st = 'sem cliente'; }
  } catch (e) { st = 'falhou: ' + String(e.message || e).slice(0, 120); }
  res.push({ json: { email: r.email, shopify: st } });
}
return res.length ? res : [{ json: { reclamacoes: 0 } }];
` } } });

const nota = sticky('## Eventos do Amazon SES\n\nSES (configuration set an-marketing) -> SNS an-ses-eventos -> POST /webhook/ses-eventos. Confere a assinatura do SNS, confirma a inscricao sozinho, grava em email_eventos e bloqueia em email_contatos: bounce permanente ou 3 temporarios em 30 dias = bounce; spam = reclamacao (e descadastra na Shopify).');

export default workflow('email-eventos-ses', '[Email] Eventos SES', { settings: { executionOrder: 'v1' } })
  .add(entrada).to(ler).to(gravar).to(shopify)
  .add(nota);
