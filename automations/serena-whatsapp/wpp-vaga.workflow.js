// n8n "[Serena WhatsApp] Vaga de envio proativo" (21/11/2026). POST /webhook/wpp-vaga { number }.
// Chamado pelo no "Limite proativo" do Envio Samuel antes de cada mensagem: segura a resposta ate haver vaga no
// limite global de proativos (wpp_aguardar_vaga, limite-proativo.sql). Responde { r: { tipo, esperou_ms, estourou } }.
// Nenhuma chave no codigo (Postgres pela credencial do n8n).
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook Vaga', parameters: { httpMethod: 'POST', path: 'wpp-vaga', responseMode: 'lastNode', options: {} } } });

const vaga = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Aguardar vaga', credentials: PG, parameters: { operation: 'executeQuery',
  query: 'select wpp_aguardar_vaga($1) as r',
  options: { queryReplacement: "={{ [String(($json.body && $json.body.number) || '').slice(0, 60)] }}" } } } });

export default workflow('wpp-vaga', '[Serena WhatsApp] Vaga de envio proativo')
  .add(entrada).to(vaga);
