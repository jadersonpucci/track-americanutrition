// n8n "[Email] Navegacao (site)" (sWxSxmEAzH8f3tc7), publicado em 10/11/2026. Webhook POST /webhook/an-nav.
// Recebe do snippet an-nav do tema (site/an-nav.liquid) os produtos vistos por visitantes identificados e grava com
// email_nav_registrar. O site manda form-urlencoded (d=<json>) por sendBeacon: sem preflight de CORS.
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Site', parameters: { httpMethod: 'POST', path: 'an-nav', responseMode: 'onReceived', responseCode: 204, options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar', parameters: { jsCode: `const b = $input.first().json.body || {};
let d = b.d !== undefined ? b.d : b;
if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return []; } }
if (!d || typeof d !== 'object') return [];
const s = (x, n) => (x === undefined || x === null) ? '' : String(x).slice(0, n);
const id = s(d.id, 200);
if (!/^(e|c|f):/.test(id)) return [];
const p = d.produto || {};
const out = { id: id, cid: s(d.cid, 64), tipo: d.tipo === 'produto' ? 'produto' : 'id',
  produto: { titulo: s(p.titulo, 200), handle: s(p.handle, 200), variant_id: s(p.variant_id, 40), preco: s(p.preco, 20), foto: s(p.foto, 500), url: s(p.url, 500) } };
return [{ json: { j: JSON.stringify(out) } }];` } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', parameters: { operation: 'executeQuery', query: 'select email_nav_registrar($1::jsonb) as r', options: { queryReplacement: expr('{{ [ $json.j ] }}') } }, credentials: PG } });

export default workflow('email-navegacao', '[Email] Navegacao (site)')
  .add(hook).to(validar).to(registrar);
