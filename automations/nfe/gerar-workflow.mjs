// Gera nfe-focus.workflow.js (SDK do n8n) a partir de nodes/emitir-focus.js.
// Uso: node gerar-workflow.mjs [arquivo-de-codigo] > saida.js
import fs from 'fs';
const src = process.argv[2] || new URL('./nodes/emitir-focus.js', import.meta.url).pathname;
const code = fs.readFileSync(src, 'utf8');
process.stdout.write(`// n8n Workflow SDK — AN · NF-e Focus (emitir e anexar). Gerado por gerar-workflow.mjs a partir de nodes/emitir-focus.js.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Rede de seguranca (60 min)', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const manual = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Manual', parameters: { httpMethod: 'GET', path: 'nfe-focus', responseMode: 'lastNode', options: {} } }, output: [{ query: { t: 'x' } }] });

const eventos = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Eventos (Shopify e Focus)', parameters: { httpMethod: 'POST', path: 'nfe-focus-evento', responseMode: 'onReceived', options: {} } }, output: [{ query: { t: 'x' }, body: { name: 'AN-1' } }] });

const emitir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Emitir e Anexar', parameters: { jsCode: ${JSON.stringify(code)} } }, output: [{ ok: true }] });

const nota = sticky('## NF-e pela Focus\\n\\nNa hora (POST /webhook/nfe-focus-evento): aviso da Shopify (orders/create e orders/paid) emite a nota do pedido; aviso da Focus (gatilho nfe) anexa a nota autorizada. A cada 60 min, rede de seguranca: acompanha as notas em processamento (autorizada = DANFE e XML anexados no pedido da Shopify, metafields nfe.*, tag NF-e) e emite as dos pedidos pagos e nao enviados desde serena_config.nfe_desde. Modo em serena_config.nfe_modo (off / simulacao / on). Manual: GET /webhook/nfe-focus?t=TOKEN&pedido=AN-123&modo=on. Controle em nfe_emissoes.', [emitir], { color: 4 });

export default workflow('an-nfe-focus', 'AN · NF-e Focus (emitir e anexar)', { settings: { executionOrder: 'v1' } })
  .add(eventos).to(emitir).add(cron).to(emitir).add(manual).to(emitir).add(nota);
`);
