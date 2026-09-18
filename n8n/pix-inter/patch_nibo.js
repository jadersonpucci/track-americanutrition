// Gera as operacoes de update_workflow (n8n MCP) que adicionam a integracao Inter -> Nibo ao workflow z18gprrjyTy8noJC.
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SSL = { httpSslAuth: { id: 'zwJ4hV7cEu5RuxKd', name: 'Inter mTLS' } };
const CFG_SQL = "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from checkout_config";
const HDRS = "={{ JSON.stringify(Object.assign({ Authorization: 'Bearer ' + $json.token, 'Content-Type': 'application/json' }, $json.conta ? { 'x-conta-corrente': $json.conta } : {})) }}";
const ops = [];
const add = (node) => ops.push({ type: 'addNode', node });
const conn = (source, target, sourceIndex, targetIndex) => ops.push({ type: 'addConnection', source, target, sourceIndex: sourceIndex || 0, targetIndex: targetIndex || 0 });
const settings = (nodeName, s) => ops.push({ type: 'setNodeSettings', nodeName, settings: s });
const pg = (name, query, position, queryReplacement) => ({ name, type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position, credentials: PG, parameters: { operation: 'executeQuery', query, options: Object.assign({ queryBatching: 'single' }, queryReplacement ? { queryReplacement } : {}) } });
const js = (name, code, position) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: code } });
const hook = (name, httpMethod, p, position, mode) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position, parameters: Object.assign({ httpMethod, path: p }, mode ? { responseMode: mode } : {}, { options: {} }) });
const cond = (name, position, leftValue) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ leftValue, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } });
const respond = (name, position, body) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position, parameters: { respondWith: 'json', responseBody: body || '={{ JSON.stringify($json) }}', options: {} } });
const Y = 3300;

// ---------- UTIL: tabela + config do Nibo ----------
add(pg('UTIL: tabela Nibo', `create table if not exists inter_nibo_lancamentos (
  chave text primary key,
  origem text, tipo text, valor numeric, data date,
  nome text, documento text, descricao text, referencia text,
  txid text, end_to_end_id text, id_transacao text, detalhes jsonb,
  status text default 'novo', nibo_receipt_id text, erro text,
  criado_em timestamptz default now(), atualizado_em timestamptz
);
create index if not exists inter_nibo_lancamentos_data_idx on inter_nibo_lancamentos (data);
insert into checkout_config (chave, valor) values
  ('nibo_lancar', 'off'),
  ('nibo_extrato', 'on'),
  ('nibo_conta_inter_id', ''),
  ('nibo_cliente_id', ''),
  ('nibo_categoria_id', 'e900f1af-b0b1-4248-936c-026a69c1dbb7'),
  ('nibo_tipos_lancar', 'PIX|TED|DOC|BOLETO|TRANSFER|DEPOSITO')
on conflict (chave) do nothing;
delete from inter_nibo_lancamentos where chave like 'teste:%';
select count(*) as lancamentos_nibo from inter_nibo_lancamentos;`, [780, -400]));
conn('UTIL: importar inter_* de integracoes_config', 'UTIL: tabela Nibo');

// ---------- Nibo API (proxy interno com a credencial) ----------
// Vive em workflow separado: 'AN - Nibo API (proxy interno)' (rgxtQzfi5BXh57M3), gerado por nibo_api_proxy.sdk.js.
// O validador do update_workflow nao aceita credencial httpHeaderAuth em no HTTP; via SDK (create_workflow_from_code) aceita.

// ---------- Nibo Lancar (1 recebimento) ----------
const Y2 = Y + 400;
add(hook('Nibo Lançar: Requisição', 'POST', 'inter-nibo-lancar', [0, Y2], 'responseNode'));
add(pg('Nibo Lançar: Config', CFG_SQL, [260, Y2]));
add(js('Nibo Lançar: Validar', N('nibo_lancar_validar.js'), [520, Y2]));
add(cond('Nibo Lançar: Ok?', [780, Y2], '={{ $json.ok }}'));
add(pg('Nibo Lançar: Registrar', `with ins as (
  insert into inter_nibo_lancamentos (chave, origem, tipo, valor, data, nome, documento, descricao, referencia, txid, end_to_end_id, id_transacao, status, detalhes)
  values ($1, $2, $3, $4::numeric, $5::date, $6, $7, $8, $9, $10, $11, $12, 'novo', $13::jsonb)
  on conflict (chave) do update set atualizado_em = now() where inter_nibo_lancamentos.status = 'erro' or $14::boolean
  returning chave
)
select (select coalesce(json_object_agg(chave, valor), '{}'::json) from checkout_config) as cfg,
       (select chave from ins) as nova,
       (select row_to_json(c) from checkout_pix_inter c where c.txid = nullif($10, '')) as cobranca`, [1040, Y2 - 100],
  '={{ [$json.chave, $json.origem, $json.tipo, $json.valor, $json.data, $json.nome, $json.documento, $json.descricao, $json.referencia, $json.txid, $json.end_to_end_id, $json.id_transacao, $json.detalhes, $json.forcar === true] }}'));
add(js('Nibo Lançar: Montar', N('nibo_lancar_montar.js'), [1300, Y2 - 100]));
add(pg('Nibo Lançar: Atualizar', "with del as (\n  delete from inter_nibo_lancamentos where chave = $1 and $2 = 'descartar' returning chave\n), upd as (\n  update inter_nibo_lancamentos set status = $2, nibo_receipt_id = nullif($3, ''), erro = nullif($4, ''), descricao = coalesce(nullif($5, ''), descricao), atualizado_em = now()\n  where chave = $1 and $2 not in ('duplicado', 'descartar') returning chave\n), ped as (\n  update checkout_pix_inter set pedido_shopify = coalesce(pedido_shopify, nullif($6, '')) where txid = nullif($7, '') and nullif($6, '') is not null returning txid\n)\nselect coalesce((select chave from del), (select chave from upd)) as chave, (select txid from ped) as pedido_salvo", [1560, Y2 - 100],
  '={{ [$json.chave, $json.status, $json.nibo_receipt_id, $json.erro, $json.descricao, $json.pedido_shopify, $json.txid] }}'));
add(respond('Nibo Lançar: Responder', [1820, Y2 - 100], "={{ JSON.stringify($('Nibo Lançar: Montar').first().json.resposta) }}"));
add(respond('Nibo Lançar: Responder (negado)', [1040, Y2 + 100]));
conn('Nibo Lançar: Requisição', 'Nibo Lançar: Config'); conn('Nibo Lançar: Config', 'Nibo Lançar: Validar'); conn('Nibo Lançar: Validar', 'Nibo Lançar: Ok?');
conn('Nibo Lançar: Ok?', 'Nibo Lançar: Registrar', 0); conn('Nibo Lançar: Registrar', 'Nibo Lançar: Montar'); conn('Nibo Lançar: Montar', 'Nibo Lançar: Atualizar'); conn('Nibo Lançar: Atualizar', 'Nibo Lançar: Responder');
conn('Nibo Lançar: Ok?', 'Nibo Lançar: Responder (negado)', 1);
settings('Nibo Lançar: Atualizar', { alwaysOutputData: true, onError: 'continueRegularOutput' });

// ---------- Nibo Setup ----------
const Y3 = Y + 800;
add(hook('Nibo Setup: Requisição', 'GET', 'inter-nibo-setup', [0, Y3], 'responseNode'));
add(pg('Nibo Setup: Config', CFG_SQL, [260, Y3]));
add(js('Nibo Setup: Executar', N('nibo_setup.js'), [520, Y3]));
add(pg('Nibo Setup: Gravar config', "insert into checkout_config (chave, valor, atualizado_em) select x->>'chave', x->>'valor', now() from jsonb_array_elements($1::jsonb) x on conflict (chave) do update set valor = excluded.valor, atualizado_em = now() returning chave", [780, Y3], '={{ [$json.salvar_json] }}'));
add(respond('Nibo Setup: Responder', [1040, Y3], "={{ JSON.stringify((function(){ var j = Object.assign({}, $('Nibo Setup: Executar').first().json); delete j.salvar_json; return j; })()) }}"));
conn('Nibo Setup: Requisição', 'Nibo Setup: Config'); conn('Nibo Setup: Config', 'Nibo Setup: Executar'); conn('Nibo Setup: Executar', 'Nibo Setup: Gravar config'); conn('Nibo Setup: Gravar config', 'Nibo Setup: Responder');
settings('Nibo Setup: Gravar config', { alwaysOutputData: true, onError: 'continueRegularOutput' });

// ---------- Nibo Extrato (varredura) ----------
const Y4 = Y + 1150;
add({ name: 'Nibo Extrato: A cada 10 min', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.3, position: [0, Y4 - 80], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } });
add(hook('Nibo Extrato: Varrer (manual)', 'GET', 'inter-nibo-varrer', [0, Y4 + 80], 'lastNode'));
add(pg('Nibo Extrato: Config', CFG_SQL, [260, Y4]));
add(js('Nibo Extrato: Preparar', N('nibo_extrato_preparar.js'), [520, Y4]));
add(cond('Nibo Extrato: Consultar?', [780, Y4], '={{ $json.ok }}'));
add({ name: 'Nibo Extrato: GET extrato Inter', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [1040, Y4 - 100], credentials: SSL, parameters: {
  method: 'GET', url: '={{ $json.url }}', authentication: 'none', provideSslCertificates: true,
  sendHeaders: true, specifyHeaders: 'json', jsonHeaders: HDRS,
  options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } } } });
add(js('Nibo Extrato: Processar', N('nibo_extrato_processar.js'), [1300, Y4 - 100]));
conn('Nibo Extrato: A cada 10 min', 'Nibo Extrato: Config'); conn('Nibo Extrato: Varrer (manual)', 'Nibo Extrato: Config');
conn('Nibo Extrato: Config', 'Nibo Extrato: Preparar'); conn('Nibo Extrato: Preparar', 'Nibo Extrato: Consultar?');
conn('Nibo Extrato: Consultar?', 'Nibo Extrato: GET extrato Inter', 0); conn('Nibo Extrato: GET extrato Inter', 'Nibo Extrato: Processar');
add(js('Nibo Extrato: Pulado', "// Varredura nao executada (config desligada, token indisponivel ou nao autorizado): devolve o motivo como resposta.\nreturn [{ json: $input.first().json }];\n", [1040, Y4 + 100]));
conn('Nibo Extrato: Consultar?', 'Nibo Extrato: Pulado', 1);

// ---------- Nibo Retry: reenvia linhas em 'erro' a cada 10 min ----------
const Y5 = Y4 + 400;
add({ name: 'Nibo Retry: A cada 10 min', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.3, position: [0, Y5], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } });
add(pg('Nibo Retry: Config', CFG_SQL, [260, Y5]));
add(pg('Nibo Retry: Pendentes', "select chave, tipo, valor, data, nome, documento, descricao, referencia, txid, end_to_end_id, id_transacao, detalhes from inter_nibo_lancamentos where status = 'erro' and coalesce(atualizado_em, criado_em) < now() - interval '3 minutes' and criado_em > now() - interval '30 days' order by criado_em limit 25", [520, Y5]));
add(js('Nibo Retry: Reenviar', N('nibo_retry.js'), [780, Y5]));
conn('Nibo Retry: A cada 10 min', 'Nibo Retry: Config'); conn('Nibo Retry: Config', 'Nibo Retry: Pendentes'); conn('Nibo Retry: Pendentes', 'Nibo Retry: Reenviar');
settings('Nibo Retry: Pendentes', { alwaysOutputData: true });

// ---------- Inter Webhook: passa a ler config (para chamar o Nibo) ----------
add(pg('Inter Webhook: Config', CFG_SQL, [130, 1820]));
ops.push({ type: 'removeConnection', source: 'Inter Webhook: Requisição', target: 'Inter Webhook: Processar', sourceIndex: 0, targetIndex: 0 });
conn('Inter Webhook: Requisição', 'Inter Webhook: Config'); conn('Inter Webhook: Config', 'Inter Webhook: Processar');
ops.push({ type: 'setNodeParameter', nodeName: 'Inter Webhook: Processar', path: '/jsCode', value: N('webhook_processar.js') });
ops.push({ type: 'setNodeParameter', nodeName: 'Confirmar: Criar pedido (order.paid)', path: '/jsCode', value: N('confirmar_pedido.js') });

fs.writeFileSync(path.join(__dirname, 'ops_nibo.json'), JSON.stringify(ops));
console.log('ops:', ops.length, 'bytes:', JSON.stringify(ops).length, 'addNode:', ops.filter(o => o.type === 'addNode').length);
