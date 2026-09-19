// Gera as operacoes de update_workflow (n8n MCP) do boleto hibrido (boleto + PIX) do Banco Inter no workflow z18gprrjyTy8noJC.
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const CFG_SQL = "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from checkout_config";
const BASE = 'https://n8n.americanutrition.com';
const ops = [];
const add = (node) => ops.push({ type: 'addNode', node });
const conn = (source, target, sourceIndex, targetIndex) => ops.push({ type: 'addConnection', source, target, sourceIndex: sourceIndex || 0, targetIndex: targetIndex || 0 });
const settings = (nodeName, s) => ops.push({ type: 'setNodeSettings', nodeName, settings: s });
const setp = (nodeName, p, value) => ops.push({ type: 'setNodeParameter', nodeName, path: p, value });
const pg = (name, query, position, queryReplacement) => ({ name, type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position, credentials: PG, parameters: { operation: 'executeQuery', query, options: Object.assign({ queryBatching: 'single' }, queryReplacement ? { queryReplacement } : {}) } });
const js = (name, code, position) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: code } });
const hook = (name, httpMethod, p, position, mode) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position, parameters: Object.assign({ httpMethod, path: p }, mode ? { responseMode: mode } : {}, { options: {} }) });
const cond = (name, position, leftValue) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ leftValue, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } });
const respond = (name, position, body) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position, parameters: { respondWith: 'json', responseBody: body || '={{ JSON.stringify($json) }}', options: {} } });

// ---------- UTIL: tabela + config do boleto ----------
add(pg('UTIL: tabela Boleto', `create table if not exists checkout_boleto_inter (
  codigo_solicitacao text primary key, seu_numero text, order_code text, valor numeric, nome text, documento text, email text,
  checkout jsonb, linha_digitavel text, codigo_barras text, nosso_numero text, txid text, pix_copia_cola text, vencimento date,
  status text, origem_recebimento text, valor_recebido numeric, pago_em timestamptz, consultado_em timestamptz, confirmado_em timestamptz,
  pedido_shopify text, erro text, criado_em timestamptz default now(), atualizado_em timestamptz
);
create index if not exists checkout_boleto_inter_order_idx on checkout_boleto_inter (order_code);
insert into checkout_config (chave, valor) values
  ('boleto_provider', 'pagarme'),
  ('inter_boleto_dias_vencimento', '3'),
  ('inter_boleto_dias_agenda', '0'),
  ('inter_boleto_mensagem', 'Pague pela linha digitavel ou pelo QR Code PIX deste boleto.')
on conflict (chave) do nothing;
select count(*) as boletos_inter from checkout_boleto_inter;`, [1040, -400]));
conn('UTIL: tabela Nibo', 'UTIL: tabela Boleto');

// ---------- Boleto: criar (chamado pelo Fluxo A) ----------
let Y = 5600;
add(hook('Boleto: Requisição', 'POST', 'checkout-boleto-inter-criar', [0, Y], 'responseNode'));
add(pg('Boleto: Config', CFG_SQL, [260, Y]));
add(js('Boleto: Criar', N('boleto_criar.js'), [520, Y]));
add(pg('Boleto: Gravar', `insert into checkout_boleto_inter (codigo_solicitacao, seu_numero, order_code, valor, nome, documento, email, checkout, linha_digitavel, codigo_barras, nosso_numero, txid, pix_copia_cola, vencimento, status)
select $1, $2, $3, $4::numeric, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::date, $15 where nullif($1, '') is not null
on conflict (codigo_solicitacao) do nothing returning codigo_solicitacao`, [780, Y],
  '={{ [$json.gravar, $json.seu_numero, $json.order_code, $json.valor, $json.nome, $json.documento, $json.email, $json.checkout, $json.linha, $json.barras, $json.nosso_numero, $json.txid, $json.pix, $json.vencimento, $json.situacao] }}'));
add(respond('Boleto: Responder', [1040, Y], "={{ JSON.stringify($('Boleto: Criar').first().json.resposta) }}"));
conn('Boleto: Requisição', 'Boleto: Config'); conn('Boleto: Config', 'Boleto: Criar'); conn('Boleto: Criar', 'Boleto: Gravar'); conn('Boleto: Gravar', 'Boleto: Responder');
settings('Boleto: Gravar', { alwaysOutputData: true, onError: 'continueRegularOutput' });

// ---------- BStatus: polling do checkout ----------
Y = 5900;
add(hook('BStatus: Requisição', 'GET', 'boleto-inter-status', [0, Y], 'responseNode'));
add(pg('BStatus: Cobrança', 'select (select row_to_json(b) from checkout_boleto_inter b where b.codigo_solicitacao = $1) as cobranca', [260, Y],
  "={{ [ String(($json.query && $json.query.order_id) || '').replace(/^interb_/, '').replace(/[^a-zA-Z0-9-]/g, '') ] }}"));
add(js('BStatus: Avaliar', N('boleto_status.js'), [520, Y]));
add(pg('BStatus: Guardar nº pedido', "update checkout_boleto_inter set pedido_shopify = coalesce(pedido_shopify, nullif($2, '')) where codigo_solicitacao = $1 returning codigo_solicitacao", [780, Y], '={{ [$json.codigo, $json.salvar] }}'));
add(respond('BStatus: Responder', [1040, Y], "={{ JSON.stringify((function(){ var j = Object.assign({}, $('BStatus: Avaliar').first().json); delete j.salvar; delete j.codigo; return j; })()) }}"));
conn('BStatus: Requisição', 'BStatus: Cobrança'); conn('BStatus: Cobrança', 'BStatus: Avaliar'); conn('BStatus: Avaliar', 'BStatus: Guardar nº pedido'); conn('BStatus: Guardar nº pedido', 'BStatus: Responder');
settings('BStatus: Cobrança', { alwaysOutputData: true });
settings('BStatus: Guardar nº pedido', { alwaysOutputData: true, onError: 'continueRegularOutput' });

// ---------- BConfirmar: verifica no Inter, cria pedido, lanca no Nibo ----------
Y = 6200;
add(hook('BConfirmar: Requisição', 'POST', 'boleto-inter-confirmar', [0, Y], 'responseNode'));
add(pg('BConfirmar: Buscar', `with c as (
  update checkout_boleto_inter set consultado_em = now()
  where codigo_solicitacao = $1 and confirmado_em is null and ($2::boolean or consultado_em is null or consultado_em < now() - interval '15 seconds')
  returning codigo_solicitacao
)
select (select coalesce(json_object_agg(chave, valor), '{}'::json) from checkout_config) as cfg,
       (select row_to_json(b) from checkout_boleto_inter b where b.codigo_solicitacao = $1) as cobranca,
       (select count(*) from c) as pode`, [260, Y],
  "={{ [ String(($json.body && $json.body.codigo) || '').replace(/[^a-zA-Z0-9-]/g, ''), (($json.body && $json.body.force) === true) ] }}"));
add(js('BConfirmar: Processar', N('boleto_confirmar.js'), [520, Y]));
add(cond('BConfirmar: Pago?', [780, Y], '={{ $json.reivindicar }}'));
add(pg('BConfirmar: Reivindicar', "update checkout_boleto_inter set confirmado_em = now(), pago_em = coalesce(pago_em, $5::timestamptz), status = $2, origem_recebimento = $3, valor_recebido = $4::numeric, atualizado_em = now() where codigo_solicitacao = $1 and confirmado_em is null returning codigo_solicitacao", [1040, Y - 100],
  '={{ [$json.codigo, $json.situacao, $json.origem, $json.valor_recebido, $json.pago_em] }}'));
add(js('BConfirmar: Criar pedido', N('boleto_pedido.js'), [1300, Y - 100]));
add(respond('BConfirmar: Responder (pedido)', [1560, Y - 100]));
add(respond('BConfirmar: Responder', [1040, Y + 100]));
conn('BConfirmar: Requisição', 'BConfirmar: Buscar'); conn('BConfirmar: Buscar', 'BConfirmar: Processar'); conn('BConfirmar: Processar', 'BConfirmar: Pago?');
conn('BConfirmar: Pago?', 'BConfirmar: Reivindicar', 0); conn('BConfirmar: Reivindicar', 'BConfirmar: Criar pedido'); conn('BConfirmar: Criar pedido', 'BConfirmar: Responder (pedido)');
conn('BConfirmar: Pago?', 'BConfirmar: Responder', 1);
settings('BConfirmar: Reivindicar', { alwaysOutputData: true });

// ---------- BWebhook: callback do Inter ----------
Y = 6600;
add(hook('BWebhook: Requisição', 'POST', 'boleto-inter-webhook', [0, Y], 'onReceived'));
add(js('BWebhook: Processar', N('boleto_webhook.js'), [260, Y]));
conn('BWebhook: Requisição', 'BWebhook: Processar');

// ---------- BSetup: registra webhook ----------
Y = 6800;
add(hook('BSetup: Requisição', 'GET', 'boleto-inter-setup', [0, Y], 'lastNode'));
add(pg('BSetup: Config', CFG_SQL, [260, Y]));
add(js('BSetup: Executar', N('boleto_setup.js'), [520, Y]));
conn('BSetup: Requisição', 'BSetup: Config'); conn('BSetup: Config', 'BSetup: Executar');

// ---------- BPdf: PDF do boleto hibrido ----------
Y = 7000;
add(hook('BPdf: Requisição', 'GET', 'inter-boleto-pdf', [0, Y], 'responseNode'));
add(pg('BPdf: Config', CFG_SQL, [260, Y]));
add(js('BPdf: Buscar', N('boleto_pdf.js'), [520, Y]));
add(cond('BPdf: Ok?', [780, Y], '={{ $json.ok }}'));
add({ name: 'BPdf: Responder PDF', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [1040, Y - 100], parameters: { respondWith: 'binary', options: { responseHeaders: { entries: [{ name: 'Content-Disposition', value: 'inline; filename="boleto-inter.pdf"' }, { name: 'Cache-Control', value: 'private, max-age=300' }] } } } });
add({ name: 'BPdf: Responder erro', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [1040, Y + 100], parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseCode: 404 } } });
conn('BPdf: Requisição', 'BPdf: Config'); conn('BPdf: Config', 'BPdf: Buscar'); conn('BPdf: Buscar', 'BPdf: Ok?'); conn('BPdf: Ok?', 'BPdf: Responder PDF', 0); conn('BPdf: Ok?', 'BPdf: Responder erro', 1);

// ---------- Painel: boleto_provider ----------
setp('Provedor: Validar e decidir', '/jsCode', N('provedor_decidir.js'));
setp('Provedor: Aplicar', '/query', "update checkout_config set valor = v.valor, atualizado_em = now() from (values ('pix_provider', $1), ('nibo_lancar', $2), ('boleto_provider', $3)) as v(chave, valor) where checkout_config.chave = v.chave and v.valor <> '' returning checkout_config.chave, checkout_config.valor");
setp('Provedor: Aplicar', '/options/queryReplacement', '={{ [$json.mudar, $json.nibo_mudar, $json.boleto_mudar] }}');
setp('Provedor: Avisar Telegram?', '/conditions', { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 }, conditions: [{ leftValue: "={{ String($('Provedor: Validar e decidir').first().json.mudar || '') !== '' || String($('Provedor: Validar e decidir').first().json.nibo_mudar || '') !== '' || String($('Provedor: Validar e decidir').first().json.boleto_mudar || '') !== '' }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' });

// ---------- Nibo: boleto hibrido tambem lanca (cobranca_boleto) ----------
const nibo = JSON.parse(fs.readFileSync(path.join(__dirname, 'ops_nibo.json'), 'utf8'));
const reg = nibo.find(o => o.type === 'addNode' && o.node.name === 'Nibo Lançar: Registrar');
const atu = nibo.find(o => o.type === 'addNode' && o.node.name === 'Nibo Lançar: Atualizar');
setp('Nibo Lançar: Registrar', '/query', reg.node.parameters.query);
setp('Nibo Lançar: Atualizar', '/query', atu.node.parameters.query);
setp('Nibo Lançar: Montar', '/jsCode', N('nibo_lancar_montar.js'));

fs.writeFileSync(path.join(__dirname, 'ops_boleto.json'), JSON.stringify(ops));
console.log('ops:', ops.length, 'addNode:', ops.filter(o => o.type === 'addNode').length);
