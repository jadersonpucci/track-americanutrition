// Gera nfe-focus.workflow.js (SDK do n8n) a partir de nodes/emitir-focus.js e painel/painel-no-emissor.js.
// Uso: node gerar-workflow.mjs [arquivo-de-codigo] > saida.js
import fs from 'fs';
const src = process.argv[2] || new URL('./nodes/emitir-focus.js', import.meta.url).pathname;
const code = fs.readFileSync(src, 'utf8');
const painelCode = fs.readFileSync(new URL('./painel/painel-no-emissor.js', import.meta.url).pathname, 'utf8');
process.stdout.write(`// n8n Workflow SDK — AN · NF-e Focus (emitir e anexar). Gerado por gerar-workflow.mjs a partir de nodes/emitir-focus.js.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Rede de seguranca (60 min)', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const manual = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Manual', parameters: { httpMethod: 'GET', path: 'nfe-focus', responseMode: 'lastNode', options: {} } }, output: [{ query: { t: 'x' } }] });

const eventos = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Eventos (Shopify e Focus)', parameters: { httpMethod: 'POST', path: 'nfe-focus-evento', responseMode: 'onReceived', options: {} } }, output: [{ query: { t: 'x' }, body: { name: 'AN-1' } }] });

// 09/11/2026: as chaves ficam so no no 'Chaves NF-e (não apagar)' (desativado, sem conexao). No repo vao placeholders;
// no n8n o codigo dele tem as linhas const SK/FOCUS_TOKEN/TG_BOT/TOKEN_MANUAL/TOKEN_EVENTO = '...'; lidas em execucao.
const chaves = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Chaves NF-e (não apagar)', disabled: true, parameters: { jsCode: "// Guarda as chaves do emissor (lidas em execucao pelo 'Emitir e Anexar' e pelo 'Painel'). Nao executa.\nconst SK = '<SUPABASE_SERVICE_KEY>';\nconst FOCUS_TOKEN = '<FOCUS_TOKEN_AN>';\nconst TG_BOT = '<TOKEN_ALERTAS>';\nconst TOKEN_MANUAL = '<NFE_TOKEN_MANUAL>';\nconst TOKEN_EVENTO = '<NFE_TOKEN_EVENTO>';\nreturn [];" } } });

const emitir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Emitir e Anexar', parameters: { jsCode: ${JSON.stringify(code)} } }, output: [{ ok: true }] });

// Painel de NF-e da Central Administrativa (09/11/2026): le as chaves do 'Emitir e Anexar' em tempo de execucao.
const painelApi = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Painel API', parameters: { httpMethod: 'POST', path: 'nfe-painel-api', responseMode: 'responseNode', options: { allowedOrigins: '*' } } }, output: [{ body: { k: 'x', acao: 'ver', pedido: '16477' } }] });
const painel = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Painel', parameters: { jsCode: ${JSON.stringify(painelCode)} } }, output: [{ ok: true }] });
const painelResp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Painel Responder', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } } });

const nota = sticky('## NF-e pela Focus\\n\\nNa hora (POST /webhook/nfe-focus-evento): aviso da Shopify (orders/create e orders/paid) emite a nota do pedido; aviso da Focus (gatilho nfe) anexa a nota autorizada. A cada 60 min, rede de seguranca: acompanha as notas em processamento (autorizada = DANFE e XML anexados no pedido da Shopify, metafields nfe.*, tag NF-e) e emite as dos pedidos pagos e nao enviados desde serena_config.nfe_desde. Modo em serena_config.nfe_modo (off / simulacao / on). Manual: GET /webhook/nfe-focus?t=TOKEN&pedido=AN-123&modo=on. Controle em nfe_emissoes.', [emitir], { color: 4 });

export default workflow('an-nfe-focus', 'AN · NF-e Focus (emitir e anexar)', { settings: { executionOrder: 'v1' } })
  .add(eventos).to(emitir).add(cron).to(emitir).add(manual).to(emitir).add(painelApi).to(painel).to(painelResp).add(chaves).add(nota);
`);
