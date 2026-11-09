// Gera o codigo do SDK do workflow "AN · NF-e Painel" (so a API) a partir dos arquivos desta pasta.
// A pagina (pagina.html) sobe como templates/page.nfe-painel.liquid no tema da Shopify.
// Sem chave no codigo: senha do painel, token do robo e token da Focus ficam em credenciais do n8n.
// Uso: node gerar-workflow.mjs > painel.workflow.js
import { readFileSync } from 'node:fs';
const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const js = (s) => JSON.stringify(s);
const out = `import { workflow, node, trigger, sticky, switchCase, newCredential } from '@n8n/workflow-sdk';
const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const ROBO = { httpQueryAuth: newCredential('NF-e robo (token manual)') };
const FOCUS = { httpBasicAuth: newCredential('Focus NFe') };
const CORS = { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } };
const SQL_NFE = "select pedido, status, mensagem, numero, serie, chave, danfe_url, xml_url, payload, uf, valor, atualizado_em from nfe_emissoes where pedido = $1";
const roboParams = { method: 'GET', url: 'https://n8n.americanutrition.com/webhook/nfe-focus', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'pedido', value: "={{ $('Agir').first().json.pedido }}" }, { name: 'modo', value: 'on' }] },
  options: { timeout: 150000, response: { response: { neverError: true } } } };
const api = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, credentials: { httpHeaderAuth: newCredential('Painel NF-e (senha)') }, config: { name: 'API', parameters: { httpMethod: 'POST', path: 'nfe-painel-api', authentication: 'headerAuth', responseMode: 'responseNode', options: { allowedOrigins: '*' } } }, output: [{ body: { acao: 'ver', pedido: '16477' } }] });
const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: ${js(ler('preparar.js'))} } } });
const lerNfe = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Ler NF-e', alwaysOutputData: true, parameters: { operation: 'executeQuery', query: SQL_NFE, options: { queryReplacement: '={{ [$json.pedido] }}' } } } });
const agir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Agir', parameters: { jsCode: ${js(ler('agir.js'))} } } });
const rota = switchCase({ version: 3.2, config: { name: 'Rota', parameters: { rules: { values: [
  { outputKey: 'robo', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'robo', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'corrigir', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'corrigir', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'nada' } } } });
const robo = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, credentials: ROBO, config: { name: 'Robô', parameters: roboParams } });
const reenviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, credentials: FOCUS, config: { name: 'Focus reenviar', parameters: { method: 'POST', url: "={{ 'https://api.focusnfe.com.br/v2/nfe?ref=' + encodeURIComponent($json.pedido) }}", authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.nf) }}', options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } } } } });
const avaliar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avaliar reenvio', parameters: { jsCode: ${js(ler('avaliar-reenvio.js'))} } } });
const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Gravar', parameters: { operation: 'executeQuery', query: "update nfe_emissoes set status = case when status in ('autorizado', 'autorizado_sem_anexo') then status else $2 end, payload = $3::jsonb, mensagem = $4, atualizado_em = now() where pedido = $1 returning status", options: { queryReplacement: '={{ [$json.pedido, $json.status, $json.payload, $json.mensagem] }}' } } } });
const espera = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Esperar SEFAZ', parameters: { amount: 6, unit: 'seconds' } } });
const acompanhar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, credentials: ROBO, config: { name: 'Robô (acompanhar)', parameters: roboParams } });
const reler = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Reler NF-e', alwaysOutputData: true, executeOnce: true, parameters: { operation: 'executeQuery', query: SQL_NFE, options: { queryReplacement: "={{ [$('Agir').first().json.pedido || ''] }}" } } } });
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resposta', parameters: { jsCode: ${js(ler('montar-resposta.js'))} } } });
const resp = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: CORS } } });
const nota = sticky(${js('## Painel de NF-e\n\nPagina: americanutrition.com/pages/nfe-painel (tema: templates/page.nfe-painel.liquid). API: POST /webhook/nfe-painel-api {acao: ver|emitir, pedido, documento?, ie?} com header X-Painel-Senha.\nEmitir sem correcao chama o robo AN · NF-e Focus. Com correcao troca CPF/CNPJ/IE no payload que o robo montou (nfe_emissoes) e reenvia para a Focus com a mesma ref; o robo acompanha e anexa no pedido.\nCredenciais: Painel NF-e (senha) [Header Auth], NF-e robo (token manual) [Query Auth, nome t], Focus NFe [Basic Auth, usuario = token da Focus, senha vazia]. Codigo em automations/nfe/painel/.')});
export default workflow('nfe-painel', 'AN · NF-e Painel', { settings: { executionOrder: 'v1' } })
  .add(api).to(preparar).to(lerNfe).to(agir).to(rota
    .onCase(0, robo.to(reler))
    .onCase(1, reenviar.to(avaliar.to(gravar.to(espera.to(acompanhar.to(reler))))))
    .onCase(2, reler))
  .add(reler).to(montar).to(resp)
  .add(nota);
`;
process.stdout.write(out);
