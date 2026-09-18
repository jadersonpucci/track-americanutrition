// Testes locais dos nos da integracao Inter -> Nibo (mocks de $input, $(), staticData e httpRequest)
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
const sd = {};
function run(code, { input, nodes = {}, http = async () => ({}) }) {
  const $input = { first: () => ({ json: input }) };
  const $ = name => { if (!(name in nodes)) throw new Error('node nao mockado: ' + name); return { first: () => ({ json: nodes[name] }) }; };
  const fn = new Function('$input', '$', '$getWorkflowStaticData', 'return (async function(){\n' + code + '\n}).call(this)');
  const calls = [];
  return fn.call({ helpers: { httpRequest: async (o) => { calls.push(o); return http(o); } } }, $input, $, () => sd).then(out => ({ out, calls }));
}
const cfg = { pix_admin_token: 'tok', inter_client_id: 'id', inter_client_secret: 'sec', inter_conta_corrente: '1234567', nibo_lancar: 'on', nibo_extrato: 'on', nibo_conta_inter_id: 'ACC', nibo_cliente_id: 'CLI', nibo_categoria_id: 'CAT', nibo_tipos_lancar: 'PIX|TED' };
(async () => {
  // token com escopo
  let r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok', escopo: 'extrato' } } } });
  console.assert(r.out[0].json.precisa === true && r.out[0].json.scope === 'extrato.read' && r.out[0].json.escopo === 'extrato', 'token escopo extrato');
  r = await run(N('token_guardar.js'), { input: { statusCode: 200, body: { access_token: 'E1', expires_in: 3600 } }, nodes: { 'Token: Checar cache': { escopo: 'extrato', base: 'https://b' } } });
  console.assert(r.out[0].json.token === 'E1' && sd.inter_tokens.extrato.token === 'E1', 'token guardar por escopo');
  r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok', escopo: 'extrato' } } } });
  console.assert(r.out[0].json.precisa === true, 'cache de outra base nao vale');
  sd.inter_tokens.extrato.base = 'https://cdpj.partners.bancointer.com.br';
  r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok', escopo: 'extrato' } } } });
  console.assert(r.out[0].json.precisa === false && r.out[0].json.token === 'E1', 'cache hit extrato');
  r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok' } } } });
  console.assert(r.out[0].json.escopo === 'cob' && r.out[0].json.precisa === true && /cob\.write/.test(r.out[0].json.scope), 'cob separado do extrato');

  // nibo api validar
  r = await run(N('nibo_api_validar.js'), { input: { cfg }, nodes: { 'Nibo API: Requisição': { body: { k: 'tok', method: 'post', path: '/receipts', body: { a: 1 } } } } });
  console.assert(r.out[0].json.ok && r.out[0].json.method === 'POST' && r.out[0].json.path === 'receipts' && r.out[0].json.temCorpo && r.out[0].json.corpo === '{"a":1}', 'api validar post');
  r = await run(N('nibo_api_validar.js'), { input: { cfg }, nodes: { 'Nibo API: Requisição': { body: { k: 'tok', method: 'GET', path: 'accounts', query: { '$top': '200' } } } } });
  console.assert(r.out[0].json.ok && r.out[0].json.temQuery && !r.out[0].json.temCorpo, 'api validar get');
  r = await run(N('nibo_api_validar.js'), { input: { cfg }, nodes: { 'Nibo API: Requisição': { body: { k: 'x', method: 'GET', path: 'accounts' } } } });
  console.assert(r.out[0].json.ok === false, 'api validar negado');
  r = await run(N('nibo_api_validar.js'), { input: { cfg }, nodes: { 'Nibo API: Requisição': { body: { k: 'tok', method: 'GET', path: '../x' } } } });
  console.assert(r.out[0].json.ok === false, 'api validar path');

  // lancar validar
  r = await run(N('nibo_lancar_validar.js'), { input: { cfg }, nodes: { 'Nibo Lançar: Requisição': { body: { k: 'tok', chave: 'pix:E1', origem: 'pix_webhook', tipo: 'pix', valor: '346.9', data: '2026-09-18T02:30:00Z', nome: ' Maria  Silva ', documento: '123.456.789-01', txid: 'AN1', end_to_end_id: 'E1' } } } });
  const ev = r.out[0].json;
  console.assert(ev.ok && ev.tipo === 'PIX' && ev.valor === 346.9 && ev.data === '2026-09-17' && ev.nome === 'Maria Silva' && ev.documento === '12345678901', 'lancar validar ' + JSON.stringify(ev));
  r = await run(N('nibo_lancar_validar.js'), { input: { cfg }, nodes: { 'Nibo Lançar: Requisição': { body: { k: 'tok', chave: 'x', valor: 0 } } } });
  console.assert(r.out[0].json.ok === false, 'lancar valor zero');

  // lancar montar
  let posted = null;
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg, nova: 'pix:E1', cobranca: { nome: 'Maria da Silva', documento: '12345678901', order_code: 'AN-1', pedido_shopify: 'AN-9999-BR' } }, nodes: { 'Nibo Lançar: Validar': ev }, http: async (o) => { posted = o.body; return { ok: true, statusCode: 200, body: 'bbb490d6-0555-4f7c-a369-0e0420f54287' }; } });
  let m = r.out[0].json;
  console.assert(m.status === 'lancado' && m.nibo_receipt_id === 'bbb490d6-0555-4f7c-a369-0e0420f54287' && m.resposta.lancado, 'montar lancado ' + JSON.stringify(m));
  console.assert(posted.method === 'POST' && posted.path === 'receipts' && posted.body.accountId === 'ACC' && posted.body.stakeholderId === 'CLI' && posted.body.categories[0].categoryId === 'CAT' && posted.body.categories[0].value === 346.9 && posted.body.date === '2026-09-17', 'corpo receipts ' + JSON.stringify(posted.body));
  console.assert(/PIX recebido · Maria Silva · \*\*\*456789\*\* · pedido AN-9999-BR/.test(posted.body.description), 'descricao ' + posted.body.description);
  console.assert(posted.body.reference === 'E1', 'reference');
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg, nova: null }, nodes: { 'Nibo Lançar: Validar': ev }, http: async () => { throw new Error('nao chamar'); } });
  console.assert(r.out[0].json.status === 'duplicado' && r.out[0].json.resposta.duplicado, 'montar duplicado');
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg: Object.assign({}, cfg, { nibo_lancar: 'off' }), nova: 'pix:E1' }, nodes: { 'Nibo Lançar: Validar': ev }, http: async () => { throw new Error('nao chamar'); } });
  console.assert(r.out[0].json.status === 'descartar' && r.out[0].json.resposta.ignorado, 'montar off (descarta para relancar depois)');
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg, nova: 'x' }, nodes: { 'Nibo Lançar: Validar': Object.assign({}, ev, { tipo: 'RENDIMENTO' }) }, http: async () => { throw new Error('nao chamar'); } });
  console.assert(r.out[0].json.status === 'ignorado', 'montar tipo fora');
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg, nova: 'x' }, nodes: { 'Nibo Lançar: Validar': ev }, http: async () => ({ ok: false, statusCode: 500, body: { error: 'x' } }) });
  console.assert(r.out[0].json.status === 'erro' && /Nibo HTTP 500/.test(r.out[0].json.erro), 'montar erro');
  r = await run(N('nibo_lancar_montar.js'), { input: { cfg: Object.assign({}, cfg, { nibo_conta_inter_id: '' }), nova: 'x' }, nodes: { 'Nibo Lançar: Validar': ev }, http: async () => { throw new Error('nao chamar'); } });
  console.assert(r.out[0].json.status === 'erro' && /config Nibo incompleta/.test(r.out[0].json.erro), 'montar config incompleta');

  // setup
  const contas = [{ id: 'BTG1', name: 'BTG', bankNumber: 208, isArchived: false }];
  let criouConta = false, criouCli = false;
  r = await run(N('nibo_setup.js'), { input: { cfg: Object.assign({}, cfg, { nibo_conta_inter_id: '', nibo_cliente_id: '', nibo_categoria_id: '' }) }, nodes: { 'Nibo Setup: Requisição': { query: { t: 'tok' } } }, http: async (o) => {
    const b = o.body;
    if (b.path === 'accounts' && b.method === 'GET') return { ok: true, statusCode: 200, body: { items: criouConta ? contas.concat([{ id: 'INTER1', name: 'Inter - America Nutrition', bankNumber: '77', isArchived: false }]) : contas } };
    if (b.path === 'accounts' && b.method === 'POST') { criouConta = true; console.assert(b.body.bankId === '2c436472-dcdb-4adf-b062-103c2dace4ec' && b.body.bankAccount === '123456' && b.body.bankAccountVerificationNumber === '7', 'conta corpo ' + JSON.stringify(b.body)); return { ok: true, statusCode: 200, body: {} }; }
    if (b.path === 'customers' && b.method === 'GET') return { ok: true, statusCode: 200, body: { items: criouCli ? [{ id: 'CLI1', name: 'BANCO INTER - PIX' }] : [] } };
    if (b.path === 'customers' && b.method === 'POST') { criouCli = true; return { ok: true, statusCode: 200, body: { id: 'CLI1', name: 'BANCO INTER - PIX' } }; }
    if (b.path === 'categories') return { ok: true, statusCode: 200, body: { items: [{ id: 'e900f1af-b0b1-4248-936c-026a69c1dbb7', name: 'Vendas', type: 'in' }] } };
    return { ok: false, statusCode: 404, body: {} };
  } });
  const s = r.out[0].json;
  console.assert(s.ok && s.config.nibo_conta_inter_id === 'INTER1' && s.config.nibo_cliente_id === 'CLI1' && s.config.nibo_categoria_id === 'e900f1af-b0b1-4248-936c-026a69c1dbb7' && JSON.parse(s.salvar_json).length === 3, 'setup ' + JSON.stringify(s));
  r = await run(N('nibo_setup.js'), { input: { cfg }, nodes: { 'Nibo Setup: Requisição': { query: { t: 'errado' } } } });
  console.assert(r.out[0].json.ok === false, 'setup negado');

  // extrato preparar
  r = await run(N('nibo_extrato_preparar.js'), { input: { cfg }, nodes: { 'Nibo Extrato: Varrer (manual)': { query: {} } }, http: async () => ({ ok: true, token: 'E1', base: 'https://b' }) });
  console.assert(r.out[0].json.ok && /extrato\/completo\?dataInicio=\d{4}-\d{2}-\d{2}&dataFim=\d{4}-\d{2}-\d{2}&tipoOperacao=C/.test(r.out[0].json.url) && r.calls[0].body.escopo === 'extrato', 'extrato preparar cron ' + r.out[0].json.url);
  r = await run(N('nibo_extrato_preparar.js'), { input: { cfg: Object.assign({}, cfg, { nibo_lancar: 'off' }) }, nodes: { 'Nibo Extrato: Varrer (manual)': { query: {} } } });
  console.assert(r.out[0].json.ok === false && r.out[0].json.pulou, 'extrato preparar off');
  r = await run(N('nibo_extrato_preparar.js'), { input: { cfg: Object.assign({}, cfg, { nibo_lancar: 'off' }) }, nodes: { 'Nibo Extrato: Varrer (manual)': { query: { t: 'tok', dias: '7' } } }, http: async () => ({ ok: true, token: 'E1', base: 'https://b' }) });
  console.assert(r.out[0].json.ok && r.out[0].json.manual && r.out[0].json.dias === 7, 'extrato preparar manual ignora off');
  r = await run(N('nibo_extrato_preparar.js'), { input: { cfg }, nodes: { 'Nibo Extrato: Varrer (manual)': { query: {} } }, http: async () => ({ ok: false, erro: 'token Inter HTTP 401' }) });
  console.assert(r.out[0].json.ok === false && /Extrato/.test(r.out[0].json.erro), 'extrato sem escopo');

  // extrato processar
  const lancados = [];
  r = await run(N('nibo_extrato_processar.js'), { input: { statusCode: 200, body: { totalPaginas: 1, transacoes: [
    { idTransacao: 'T1', dataTransacao: '2026-09-18', tipoTransacao: 'PIX', tipoOperacao: 'C', valor: '346.90', titulo: 'Pix recebido', descricao: 'x', detalhes: { endToEndId: 'E1', nomePagador: 'Maria', cpfCnpjPagador: '12345678901', txId: 'AN1' } },
    { idTransacao: 'T2', dataTransacao: '2026-09-18', tipoTransacao: 'TED', tipoOperacao: 'C', valor: '1000.00', titulo: 'TED recebida', descricao: 'y', detalhes: { nomeEmpresaPagador: 'ACME LTDA', cpfCnpjPagador: '12345678000199' } },
    { idTransacao: 'T3', dataTransacao: '2026-09-18', tipoTransacao: 'PIX', tipoOperacao: 'D', valor: '50.00', titulo: 'Pix enviado', descricao: 'z', detalhes: {} }
  ] } }, nodes: { 'Nibo Extrato: Preparar': { dataInicio: '2026-09-16', dataFim: '2026-09-18' }, 'Nibo Extrato: Config': { cfg } }, http: async (o) => { lancados.push(o.body); return o.body.chave === 'pix:E1' ? { ok: true, duplicado: true } : { ok: true, lancado: true }; } });
  const p = r.out[0].json;
  console.assert(p.ok && p.creditos === 2 && p.lancados === 1 && p.duplicados === 1 && lancados[0].chave === 'pix:E1' && lancados[1].chave === 'inter:T2' && lancados[1].nome === 'ACME LTDA' && lancados[1].valor === 1000 && lancados[0].k === 'tok', 'extrato processar ' + JSON.stringify(p));
  r = await run(N('nibo_extrato_processar.js'), { input: { statusCode: 403, body: { title: 'forbidden' } }, nodes: { 'Nibo Extrato: Preparar': { dataInicio: 'a', dataFim: 'b' }, 'Nibo Extrato: Config': { cfg } } });
  console.assert(r.out[0].json.ok === false, 'extrato processar erro http');

  // webhook processar (com nibo)
  const chamadas = [];
  r = await run(N('webhook_processar.js'), { input: { cfg }, nodes: { 'Inter Webhook: Requisição': { body: { pix: [{ txid: 'AN1', endToEndId: 'E1', valor: '346.90', horario: '2026-09-18T12:00:00Z', infoPagador: 'oi' }, { endToEndId: 'E2', valor: '10.00', horario: '2026-09-18T12:00:00Z' }] } } }, http: async (o) => { chamadas.push(o.url + '|' + (o.body.chave || o.body.txid)); return o.url.includes('confirmar') ? { paid: true, status: 'paid' } : { ok: true, lancado: true }; } });
  const w = r.out[0].json;
  console.assert(w.recebidos === 2 && w.resultados[0].paid === true && w.resultados[0].nibo === 'lancado' && w.resultados[1].nibo === 'lancado' && !w.resultados[1].paid, 'webhook processar ' + JSON.stringify(w));
  console.assert(chamadas.length === 3 && chamadas[0].includes('confirmar|AN1') && chamadas[1].includes('lancar|pix:E1') && chamadas[2].includes('lancar|pix:E2'), 'webhook chamadas ' + chamadas.join(','));

  // confirmar pedido (com nibo)
  const calls2 = [];
  const cob = { txid: 'AN1', order_code: 'AN-1', nome: 'Maria', documento: '12345678901', checkout: { items: [{ code: '1', amount: 32700, quantity: 1 }], freight: { price_cents: 1990 }, customer: { name: 'Maria', email: 'm@x.com', document: '12345678901', ddd: '11', phone: '9' } } };
  r = await run(N('confirmar_pedido.js'), { input: { txid: 'AN1' }, nodes: { 'Confirmar: Config + cobrança': { cfg, cobranca: cob }, 'Confirmar: Avaliar pagamento': { e2e: 'E1', horario: '2026-09-18T12:00:00Z', valor: 346.9 } }, http: async (o) => { calls2.push(o.url); return o.url.includes('nibo') ? { ok: true, duplicado: true } : {}; } });
  console.assert(r.out[0].json.paid && r.out[0].json.nibo === 'duplicado' && calls2.length === 2 && calls2[0].includes('pagarme-pago') && calls2[1].includes('inter-nibo-lancar'), 'confirmar pedido nibo ' + JSON.stringify(r.out[0].json));
  console.log('TESTES NIBO OK');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
