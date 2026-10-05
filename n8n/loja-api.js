import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Painel da loja: POST /webhook/loja-api {op, token, payload} → select loja_api(body)
// Na op "publicar", se houver deploy hook da Vercel na resposta, dispara o build do site.
const entrada = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Loja API', parameters: { httpMethod: 'POST', path: 'loja-api', responseMode: 'responseNode', options: { allowedOrigins: '*' } } }
});
const api = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'loja_api', parameters: { operation: 'executeQuery', query: 'select loja_api($1::jsonb) as r', options: { queryReplacement: expr('{{ [ JSON.stringify($json.body || {}) ] }}') } },
    credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } }
  }
});
const deploy = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Publicar se pedido', parameters: {
      jsCode: `const r = $input.first().json.r || {};
if (r.deploy_hook) {
  try { await this.helpers.httpRequest({ method: 'POST', url: r.deploy_hook, timeout: 20000 }); r.publicacao = 'iniciada'; }
  catch (e) { r.publicacao = 'erro: ' + String(e.message || e).slice(0, 120); }
}
delete r.deploy_hook;
return [{ json: r }];`
    }
  }
});
const responder = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }] } } } }
});
export default workflow('loja-api', 'Loja · API do painel').add(entrada).to(api).to(deploy).to(responder);
