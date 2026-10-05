import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Site (Minha conta e link de avaliação): POST /webhook/loja-publico {op, ...} → select loja_publico(body, ip)
const entrada = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Loja público', parameters: { httpMethod: 'POST', path: 'loja-publico', responseMode: 'responseNode', options: { allowedOrigins: '*' } } }
});
const fn = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'loja_publico', parameters: { operation: 'executeQuery', query: 'select loja_publico($1::jsonb, $2) as r',
      options: { queryReplacement: expr("{{ [ JSON.stringify($json.body || {}), String(($json.headers || {})['cf-connecting-ip'] || ($json.headers || {})['x-forwarded-for'] || '').split(',')[0].trim() ] }}") } },
    credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } }
  }
});
const responder = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json.r) }}'), options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }] } } } }
});
export default workflow('loja-publico', 'Loja · API pública (Minha conta)').add(entrada).to(fn).to(responder);
