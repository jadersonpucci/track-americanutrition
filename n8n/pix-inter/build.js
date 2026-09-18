// Monta o codigo SDK (literal, sem helpers no codigo gerado) do workflow "AN - PIX Banco Inter (Provedor)"
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
const J = s => JSON.stringify(s);
const LIB = process.env.NOLIB ? '' : ((fs.existsSync(path.join(__dirname, 'nodes', '_qrcode_lib.min.js')) ? N('_qrcode_lib.min.js') : N('_qrcode_lib.js')) + '\n');
const PG = "{ postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } }";
const TG = "{ telegramApi: { id: '5FInpXVy62zrG60P', name: 'Telegram account' } }";
const SSL = "{ httpSslAuth: newCredential('Banco Inter mTLS') }";
const CFG_SQL = "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from checkout_config";
const HDRS = "{{ JSON.stringify(Object.assign({ Authorization: 'Bearer ' + $json.token, 'Content-Type': 'application/json' }, $json.conta ? { 'x-conta-corrente': $json.conta } : {})) }}";
const RESP = "{{ JSON.stringify($json) }}";

const DDL = `create table if not exists checkout_config (chave text primary key, valor text, atualizado_em timestamptz default now());
insert into checkout_config (chave, valor) values
  ('pix_provider', 'pagarme'),
  ('inter_ambiente', 'producao'),
  ('inter_client_id', ''),
  ('inter_client_secret', ''),
  ('inter_chave_pix', ''),
  ('inter_conta_corrente', ''),
  ('inter_pix_expiracao_seg', '86400'),
  ('pix_admin_token', substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
  ('telegram_chat_id', '-1003766435449'),
  ('telegram_thread_id', '289')
on conflict (chave) do nothing;
create table if not exists checkout_pix_inter (
  txid text primary key,
  order_code text,
  status text default 'ATIVA',
  valor_centavos integer,
  nome text, email text, documento text, telefone text,
  checkout jsonb,
  pix_copia_cola text,
  location text,
  expira_em timestamptz,
  criado_em timestamptz default now(),
  pago_em timestamptz,
  end_to_end_id text,
  valor_pago numeric,
  confirmado_em timestamptz,
  pedido_shopify text,
  erro text
);
create index if not exists checkout_pix_inter_email_idx on checkout_pix_inter (email);
create index if not exists checkout_pix_inter_criado_idx on checkout_pix_inter (criado_em);
select 'https://n8n.americanutrition.com/webhook/pix-provedor?t=' || valor as painel_provedor, 'Preencha inter_client_id, inter_client_secret e inter_chave_pix em checkout_config e crie a credencial SSL "Banco Inter mTLS" nos 4 nos HTTP do Inter.' as proximo_passo from checkout_config where chave = 'pix_admin_token';`;

// ----- geradores (rodam AQUI, no build; o codigo gerado e 100% literal) -----
const pos = p => `[${p[0]}, ${p[1]}]`;
function pg(v, name, query, opts, p, output, cfgExtra) {
  const options = Object.assign({ queryBatching: 'single' }, opts || {});
  const optSrc = Object.keys(options).map(k => k === 'queryReplacement' ? `queryReplacement: expr(${J(options[k])})` : `${k}: ${J(options[k])}`).join(', ');
  const extra = cfgExtra ? ', ' + cfgExtra : '';
  return `const ${v} = node({\n  type: 'n8n-nodes-base.postgres', version: 2.6,\n  config: { name: ${J(name)}, position: ${pos(p)}${extra}, parameters: { operation: 'executeQuery', query: ${J(query)}, options: { ${optSrc} } }, credentials: ${PG} },\n  output: [${J(output || {})}]\n});\n`;
}
function js(v, name, code, p, output, cfgExtra) {
  const extra = cfgExtra ? ', ' + cfgExtra : '';
  return `const ${v} = node({\n  type: 'n8n-nodes-base.code', version: 2,\n  config: { name: ${J(name)}, position: ${pos(p)}${extra}, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${J(code)} } },\n  output: [${J(output || {})}]\n});\n`;
}
function hook(v, name, method, hookPath, p, responseNode) {
  const rm = responseNode === false ? '' : ", responseMode: 'responseNode'";
  return `const ${v} = trigger({\n  type: 'n8n-nodes-base.webhook', version: 2.1,\n  config: { name: ${J(name)}, position: ${pos(p)}, parameters: { httpMethod: ${J(method)}, path: ${J(hookPath)}${rm}, options: {} } },\n  output: [{ headers: {}, params: {}, query: {}, body: {} }]\n});\n`;
}
function respondJson(v, name, p, body) {
  return `const ${v} = node({\n  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,\n  config: { name: ${J(name)}, position: ${pos(p)}, parameters: { respondWith: 'json', responseBody: expr(${J(body || RESP)}), options: {} } }\n});\n`;
}
function cond(v, name, p, leftValue, operation) {
  return `const ${v} = ifElse({\n  version: 2.2,\n  config: { name: ${J(name)}, position: ${pos(p)}, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ leftValue: expr(${J(leftValue)}), rightValue: true, operator: { type: 'boolean', operation: ${J(operation || 'true')}, singleValue: true } }], combinator: 'and' } } }\n});\n`;
}
function interHttp(v, name, method, url, p, bodyExpr) {
  const body = bodyExpr ? `, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr(${J(bodyExpr)})` : '';
  return `const ${v} = node({\n  type: 'n8n-nodes-base.httpRequest', version: 4.4,\n  config: { name: ${J(name)}, position: ${pos(p)}, parameters: { method: ${J(method)}, url: expr(${J(url)}), authentication: 'none', provideSslCertificates: true, sendHeaders: true, specifyHeaders: 'json', jsonHeaders: expr(${J(HDRS)})${body}, options: { timeout: 25000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${SSL} },\n  output: [{ statusCode: 200, body: {} }]\n});\n`;
}
function telegram(v, name, p, chatExpr, textExpr, threadExpr) {
  return `const ${v} = node({\n  type: 'n8n-nodes-base.telegram', version: 1.2,\n  config: { name: ${J(name)}, position: ${pos(p)}, onError: 'continueRegularOutput', parameters: { resource: 'message', operation: 'sendMessage', chatId: expr(${J(chatExpr)}), text: expr(${J(textExpr)}), additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true, message_thread_id: expr(${J(threadExpr)}) } }, credentials: ${TG} },\n  output: [{ ok: true }]\n});\n`;
}

const TG_TEXT = "{{ (function(){ var j = $('Confirmar: Criar pedido (order.paid)').first().json; return '\\u{1F6A8} <b>PIX INTER PAGO SEM PEDIDO</b>\\n\\ntxid: <code>' + j.txid + '</code>\\nValor: R$ ' + Number(j.valor || 0).toFixed(2) + '\\nErro ao chamar /webhook/pagarme-pago: ' + j.erro + '\\n\\nReenviar: POST /webhook/pix-inter-confirmar {\"txid\":\"' + j.txid + '\",\"force\":true} (ja marcado confirmado; criar pedido manualmente se persistir).'; })() }}";

let code = `import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from '@n8n/workflow-sdk';\n\n`;
code += `const utilTrigger = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'UTIL: rodar 1x (tabelas + config)', position: [0, -400] }, output: [{}] });\n`;
code += pg('utilDdl', 'UTIL: criar tabelas e config', DDL, null, [260, -400], { painel_provedor: 'https://n8n.americanutrition.com/webhook/pix-provedor?t=TOKEN', proximo_passo: '...' });

code += hook('tokenReq', 'Token: Requisição', 'POST', 'pix-inter-token', [0, 0]);
code += pg('tokenCfg', 'Token: Config', CFG_SQL, null, [260, 0], { cfg: {} });
code += js('tokenCheck', 'Token: Checar cache', N('token_checar.js'), [520, 0], { ok: true, precisa: true, base: 'https://cdpj.partners.bancointer.com.br', client_id: '', client_secret: '' });
code += cond('tokenNeed', 'Token: Buscar no Inter?', [780, 0], '{{ $json.precisa }}');
code += `const tokenHttp = node({\n  type: 'n8n-nodes-base.httpRequest', version: 4.4,\n  config: { name: 'Token: OAuth Inter', position: [1040, -120], parameters: { method: 'POST', url: expr('{{ $json.base }}/oauth/v2/token'), authentication: 'none', provideSslCertificates: true, sendBody: true, contentType: 'form-urlencoded', specifyBody: 'keypair', bodyParameters: { parameters: [\n    { name: 'client_id', value: expr('{{ $json.client_id }}') },\n    { name: 'client_secret', value: expr('{{ $json.client_secret }}') },\n    { name: 'grant_type', value: 'client_credentials' },\n    { name: 'scope', value: 'cob.write cob.read pix.read webhook.write webhook.read' }\n  ] }, options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } } }, credentials: ${SSL} },\n  output: [{ statusCode: 200, body: { access_token: 'x', expires_in: 3600 } }]\n});\n`;
code += js('tokenSave', 'Token: Guardar', N('token_guardar.js'), [1300, -120], { ok: true, token: 'x', base: 'https://cdpj.partners.bancointer.com.br' });
code += respondJson('tokenRespond', 'Token: Responder', [1560, 0]);

code += hook('criarReq', 'Criar: Requisição', 'POST', 'checkout-pix-inter-criar', [0, 400]);
code += pg('criarCfg', 'Criar: Config', CFG_SQL, null, [260, 400], { cfg: {} });
code += js('criarPrep', 'Criar: Preparar cobrança', N('criar_preparar.js'), [520, 400], { via_inter: true, txid: 'AN...', cents: 34690, cob: {}, token: 'x', base: 'https://cdpj.partners.bancointer.com.br', conta: '' });
code += cond('criarSegue', 'Criar: Segue no Inter?', [780, 400], '{{ $json.via_inter }}');
code += respondJson('criarRespondSem', 'Criar: Responder (sem Inter)', [1040, 560]);
code += interHttp('criarPut', 'Criar: PUT cob Inter', 'PUT', '{{ $json.base }}/pix/v2/cob/{{ $json.txid }}', [1040, 300], '{{ JSON.stringify($json.cob) }}');
code += js('criarResp', 'Criar: Resposta ao checkout', LIB + N('criar_resposta.js'), [1300, 300], { via_inter: true, gravar: true, txid: 'AN...', resposta: { order_id: 'inter_AN...', pix_qr_code: '000201...', pix_qr_code_url: 'data:image/gif;base64,...' } });
code += cond('criarGravar', 'Criar: Gravar?', [1560, 300], '{{ $json.gravar }}');
code += pg('criarInsert', 'Criar: Gravar cobrança', 'insert into checkout_pix_inter (txid, order_code, valor_centavos, nome, email, documento, telefone, checkout, pix_copia_cola, location, expira_em) values ($1, $2, $3::int, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::timestamptz) returning txid', { queryReplacement: '{{ [$json.txid, $json.order_code, $json.cents, $json.nome, $json.email, $json.documento, $json.telefone, $json.checkout, $json.copia, $json.location, $json.expira] }}' }, [1820, 200], { txid: 'AN...' });
code += js('criarFinal', 'Criar: Resposta final', N('criar_final.js'), [2080, 300], { order_id: 'inter_AN...', status: 'pending', payment_method: 'pix', pix_qr_code: '000201...', pix_qr_code_url: 'data:image/gif;base64,...' });
code += respondJson('criarRespond', 'Criar: Responder', [2340, 300]);

code += hook('confReq', 'Confirmar: Requisição', 'POST', 'pix-inter-confirmar', [0, 900]);
code += pg('confCfg', 'Confirmar: Config + cobrança', "select (select coalesce(json_object_agg(chave, valor), '{}'::json) from checkout_config) as cfg, (select row_to_json(c) from checkout_pix_inter c where c.txid = $1) as cobranca", { queryReplacement: "{{ [ String(($json.body && $json.body.txid) || '').replace(/^inter_/, '').replace(/[^a-zA-Z0-9]/g, '') ] }}" }, [260, 900], { cfg: {}, cobranca: { txid: 'AN...', checkout: {} } });
code += js('confPrep', 'Confirmar: Preparar consulta', N('confirmar_preparar.js'), [520, 900], { fim: false, txid: 'AN...', token: 'x', base: 'https://cdpj.partners.bancointer.com.br', conta: '' });
code += cond('confConsultar', 'Confirmar: Consultar Inter?', [780, 900], '{{ $json.fim }}', 'false');
code += interHttp('confGet', 'Confirmar: GET cob Inter', 'GET', '{{ $json.base }}/pix/v2/cob/{{ $json.txid }}', [1040, 800]);
code += js('confAval', 'Confirmar: Avaliar pagamento', N('confirmar_avaliar.js'), [1300, 800], { fim: false, paid: true, txid: 'AN...', e2e: 'E...', horario: '2026-01-01T00:00:00Z', valor: 346.9 });
code += cond('confPago', 'Confirmar: Pago?', [1560, 800], '{{ $json.fim }}', 'false');
code += pg('confClaim', 'Confirmar: Reivindicar', "update checkout_pix_inter set status = 'CONCLUIDA', pago_em = coalesce(pago_em, $2::timestamptz), end_to_end_id = $3, valor_pago = $4::numeric, confirmado_em = now() where txid = $1 and confirmado_em is null returning txid", { queryReplacement: '{{ [$json.txid, $json.horario, $json.e2e, $json.valor] }}' }, [1820, 700], { txid: 'AN...' }, 'alwaysOutputData: true');
code += js('confPedido', 'Confirmar: Criar pedido (order.paid)', N('confirmar_pedido.js'), [2080, 700], { paid: true, status: 'paid', order_id: 'inter_AN...', txid: 'AN...', erro: '' });
code += pg('confAnotar', 'Confirmar: Anotar erro', "update checkout_pix_inter set erro = nullif($2, '') where txid = $1 returning txid", { queryReplacement: '{{ [$json.txid, $json.erro] }}' }, [2340, 700], { txid: 'AN...' }, "alwaysOutputData: true, onError: 'continueRegularOutput'");
code += cond('confErro', 'Confirmar: Erro no pedido?', [2600, 700], "{{ String($('Confirmar: Criar pedido (order.paid)').first().json.erro || '') !== '' }}");
code += telegram('confTg', 'Confirmar: Alerta Telegram', [2860, 600], "{{ $('Confirmar: Config + cobrança').first().json.cfg.telegram_chat_id }}", TG_TEXT, "{{ Number($('Confirmar: Config + cobrança').first().json.cfg.telegram_thread_id || 0) }}");
code += respondJson('confRespondPedido', 'Confirmar: Responder (pedido)', [3120, 700], "{{ JSON.stringify($('Confirmar: Criar pedido (order.paid)').first().json) }}");
code += respondJson('confRespond', 'Confirmar: Responder', [1300, 1050]);

code += hook('statusReq', 'Status: Requisição', 'GET', 'pix-inter-status', [0, 1400]);
code += pg('statusCob', 'Status: Cobrança', 'select (select row_to_json(c) from checkout_pix_inter c where c.txid = $1) as cobranca', { queryReplacement: "{{ [ String(($json.query && $json.query.order_id) || '').replace(/^inter_/, '').replace(/[^a-zA-Z0-9]/g, '') ] }}" }, [260, 1400], { cobranca: { txid: 'AN...', confirmado_em: null, pedido_shopify: null } });
code += js('statusAval', 'Status: Avaliar', N('status_avaliar.js'), [520, 1400], { order_id: 'inter_AN...', status: 'pending', paid: false, order_number: null, txid: 'AN...', salvar: '' });
code += pg('statusSave', 'Status: Guardar nº pedido', "update checkout_pix_inter set pedido_shopify = coalesce(pedido_shopify, nullif($2, '')) where txid = $1 returning txid", { queryReplacement: '{{ [$json.txid, $json.salvar] }}' }, [780, 1400], { txid: 'AN...' }, "alwaysOutputData: true, onError: 'continueRegularOutput'");
code += respondJson('statusRespond', 'Status: Responder', [1040, 1400], "{{ JSON.stringify((function(){ var j = Object.assign({}, $('Status: Avaliar').first().json); delete j.salvar; return j; })()) }}");

code += hook('whReq', 'Inter Webhook: Requisição', 'POST', 'pix-inter-webhook', [0, 1750], false);

code += js('whProc', 'Inter Webhook: Processar', N('webhook_processar.js'), [260, 1820], { recebidos: 1, resultados: [] });

code += hook('provReq', 'Provedor: Requisição', 'GET', 'pix-provedor', [0, 2250]);
code += pg('provCfg', 'Provedor: Config', CFG_SQL, null, [260, 2250], { cfg: {} });
code += js('provDecidir', 'Provedor: Validar e decidir', N('provedor_decidir.js'), [520, 2250], { html: '<html>', mudar: '', novo: 'pagarme', atual: 'pagarme', aviso: '', chat: '', thread: '' });
code += pg('provAplicar', 'Provedor: Aplicar', "update checkout_config set valor = $1, atualizado_em = now() where chave = 'pix_provider' and $1 in ('inter', 'pagarme') returning valor", { queryReplacement: '{{ [$json.mudar] }}' }, [780, 2250], { valor: 'inter' }, 'alwaysOutputData: true');
code += cond('provAvisar', 'Provedor: Avisar Telegram?', [1040, 2250], "{{ String($('Provedor: Validar e decidir').first().json.mudar || '') !== '' }}");
code += telegram('provTg', 'Provedor: Telegram', [1300, 2150], "{{ $('Provedor: Validar e decidir').first().json.chat }}", "{{ $('Provedor: Validar e decidir').first().json.aviso }}", "{{ Number($('Provedor: Validar e decidir').first().json.thread || 0) }}");
code += `const provRespond = node({\n  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,\n  config: { name: 'Provedor: Responder', position: [1560, 2250], parameters: { respondWith: 'text', responseBody: expr("{{ $('Provedor: Validar e decidir').first().json.html }}"), options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] } } } }\n});\n`;

code += hook('setupReq', 'Setup: Requisição', 'GET', 'pix-inter-setup', [0, 2650]);
code += pg('setupCfg', 'Setup: Config', CFG_SQL, null, [260, 2650], { cfg: {} });
code += js('setupPrep', 'Setup: Preparar registro', N('setup_preparar.js'), [520, 2650], { ok: true, registrar: true, token: 'x', base: 'https://cdpj.partners.bancointer.com.br', conta: '', chave: 'chave', webhookUrl: 'https://n8n.americanutrition.com/webhook/pix-inter-webhook' });
code += cond('setupRegistrar', 'Setup: Registrar?', [780, 2650], '{{ $json.registrar }}');
code += interHttp('setupPut', 'Setup: PUT webhook Inter', 'PUT', '{{ $json.base }}/pix/v2/webhook/{{ encodeURIComponent($json.chave) }}', [1040, 2550], '{{ JSON.stringify({ webhookUrl: $json.webhookUrl }) }}');
code += js('setupRes', 'Setup: Resultado', N('setup_resultado.js'), [1300, 2550], { ok: true, http: 204 });
code += respondJson('setupRespond', 'Setup: Responder', [1560, 2650]);

code += `const nota = sticky(${J(`## PIX via Banco Inter (provedor alternativo ao Pagar.me)

**Ligar/desligar (1 clique):** GET /webhook/pix-provedor?t=TOKEN — painel com o botao "Voltar ao Pagar.me" / "Usar Banco Inter". O TOKEN esta em checkout_config (pix_admin_token) e o link e impresso pelo no UTIL.

**Como entra no checkout:** o "Pagar.me — Criar Pedido (Fluxo A)" chama POST /webhook/checkout-pix-inter-criar quando o metodo e pix. Se pix_provider != inter ou qualquer falha (token, mTLS, API), volta {via_inter:false} e o Fluxo A segue no Pagar.me (fail-open). Resposta ao checkout no mesmo formato do Pagar.me (pix_qr_code, pix_qr_code_url, order_id = inter_<txid>).

**Confirmacao:** webhook do Inter (POST /webhook/pix-inter-webhook) e o polling do checkout (/webhook/pagarme-status -> /webhook/pix-inter-status) chamam /webhook/pix-inter-confirmar, que consulta a cobranca no Inter e, se CONCLUIDA, envia um order.paid no formato Pagar.me para /webhook/pagarme-pago (mesmo fluxo que cria o pedido Shopify, Respond.io, comissao, CAPI).

**Setup:** 1) rodar o UTIL; 2) preencher inter_client_id, inter_client_secret, inter_chave_pix (e inter_conta_corrente se houver mais de uma conta) em checkout_config; 3) criar a credencial SSL "Banco Inter mTLS" (cert + key do Internet Banking > API) e selecionar nos 4 nos HTTP do Inter; 4) GET /webhook/pix-inter-setup?t=TOKEN registra o webhook no Inter; 5) ligar pelo painel.`)}, [utilTrigger, tokenReq], { color: 4, width: 620, height: 380 });\n\n`;

code += `export default workflow('an-pix-banco-inter', 'AN - PIX Banco Inter (Provedor)')
  .add(nota)
  .add(utilTrigger).to(utilDdl)
  .add(tokenReq).to(tokenCfg).to(tokenCheck).to(tokenNeed
    .onTrue(tokenHttp.to(tokenSave.to(tokenRespond)))
    .onFalse(tokenRespond))
  .add(criarReq).to(criarCfg).to(criarPrep).to(criarSegue
    .onTrue(criarPut.to(criarResp.to(criarGravar
      .onTrue(criarInsert.to(criarFinal.to(criarRespond)))
      .onFalse(criarFinal))))
    .onFalse(criarRespondSem))
  .add(confReq).to(confCfg).to(confPrep).to(confConsultar
    .onTrue(confGet.to(confAval.to(confPago
      .onTrue(confClaim.to(confPedido.to(confAnotar.to(confErro
        .onTrue(confTg.to(confRespondPedido))
        .onFalse(confRespondPedido)))))
      .onFalse(confRespond))))
    .onFalse(confRespond))
  .add(statusReq).to(statusCob).to(statusAval).to(statusSave).to(statusRespond)
  .add(whReq).to(whProc)
  .add(provReq).to(provCfg).to(provDecidir).to(provAplicar).to(provAvisar
    .onTrue(provTg.to(provRespond))
    .onFalse(provRespond))
  .add(setupReq).to(setupCfg).to(setupPrep).to(setupRegistrar
    .onTrue(setupPut.to(setupRes.to(setupRespond)))
    .onFalse(setupRespond));
`;
const out = process.env.NOLIB ? 'workflow.nolib.sdk.js' : 'workflow.sdk.js';
fs.writeFileSync(path.join(__dirname, out), code);
console.log(out + ':', code.length, 'chars');
