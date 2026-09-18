// Workflow separado "AN - Nibo API (proxy interno)" (id rgxtQzfi5BXh57M3), criado com create_workflow_from_code (n8n MCP).
// POST /webhook/nibo-api  body: { k: pix_admin_token, method: GET|POST|PUT|DELETE, path: 'receipts', query: {...}, body: {...} }
// Resposta: { ok, statusCode, body }. A credencial "Nibo API" (httpHeaderAuth, ApiToken) fica so no no HTTP.
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';
const fs = require('fs'); // (ilustrativo: no MCP o jsCode vai inline; ver nodes/nibo_api_validar.js)

const req = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Nibo API: Requisição', parameters: { httpMethod: 'POST', path: 'nibo-api', responseMode: 'responseNode', options: {} } } });
const cfg = node({ type: 'n8n-nodes-base.postgres', version: 2.6,
  config: { name: 'Nibo API: Config', parameters: { operation: 'executeQuery', query: "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from checkout_config", options: { queryBatching: 'single' } },
    credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });
const validar = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Nibo API: Validar', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: fs.readFileSync('nodes/nibo_api_validar.js', 'utf8') } } });
const autorizado = ifElse({ version: 2.2, config: { name: 'Nibo API: Autorizado?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
  conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } } });
const http = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Nibo API: HTTP', parameters: {
  method: expr('{{ $json.method }}'), url: expr('https://api.nibo.com.br/empresas/v1/{{ $json.path }}'),
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: expr('{{ $json.temQuery }}'), specifyQuery: 'json', jsonQuery: expr('{{ JSON.stringify($json.query) }}'),
  sendHeaders: true, specifyHeaders: 'keypair', headerParameters: { parameters: [{ name: 'Accept', value: 'application/json' }] },
  sendBody: expr('{{ $json.temCorpo }}'), contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ $json.corpo }}'),
  options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'zFzlsxxGVLsAuPvI', name: 'Nibo API' } } } });
const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Nibo API: Responder', parameters: { respondWith: 'json',
  responseBody: expr('{{ JSON.stringify({ ok: Number($json.statusCode) >= 200 && Number($json.statusCode) < 300, statusCode: $json.statusCode, body: $json.body }) }}'), options: {} } } });
const negado = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Nibo API: Responder (negado)', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: {} } } });

export default workflow('an-nibo-api-proxy', 'AN - Nibo API (proxy interno)')
  .add(req).to(cfg).to(validar).to(autorizado.onTrue(http.to(responder)).onFalse(negado));
