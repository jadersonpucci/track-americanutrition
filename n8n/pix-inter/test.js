// Harness local: roda os Code nodes com mocks de $input, $(), staticData e this.helpers.httpRequest
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
const lib = fs.existsSync(path.join(__dirname,'nodes','_qrcode_lib.min.js')) ? N('_qrcode_lib.min.js') : N('_qrcode_lib.js');
const sd = {};
function run(code, { input, nodes = {}, http = async () => ({}) , withQr = false }) {
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = name => { if (!(name in nodes)) throw new Error('node nao mockado: ' + name); return { first: () => ({ json: nodes[name] }), item: { json: nodes[name] } }; };
  const src = (withQr ? lib + '\n' : '') + code;
  const fn = new Function('$input', '$', '$getWorkflowStaticData', 'return (async function(){\n' + src + '\n}).call(this)');
  const calls = [];
  const ctx = { helpers: { httpRequest: async (o) => { calls.push(o); return http(o); } } };
  return fn.call(ctx, $input, $, () => sd).then(out => ({ out, calls }));
}
const checkout = { payment_method: 'pix', order_ref: 'AN-123', items: [{ code: '44436756234412', amount: 32700, description: 'ImunoFosfo 90 caps', quantity: 1 }], shopify_items: [{ variant_id: '44436756234412', quantity: 1, price: 327 }], freight: { price_cents: 1990, label: 'PAC' }, customer: { name: 'Maria da Silva', email: 'Maria@Ex.com', document: '123.456.789-01', ddd: '11', phone: '999998888' }, shipping: { zip: '01000-000', street: 'Rua X', number: '10', city: 'Sao Paulo', state: 'SP', first_name: 'Maria', last_name: 'da Silva', marketing_wpp: true, coupon: '' }, ref: '' };
const cfg = { pix_provider: 'inter', inter_client_id: 'id', inter_client_secret: 'sec', inter_chave_pix: 'pix@americanutrition.com', inter_ambiente: 'producao', inter_pix_expiracao_seg: '86400', pix_admin_token: 'tok123', telegram_chat_id: '-100', telegram_thread_id: '289' };

(async () => {
  // token: checar cache
  let r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok123' } } } });
  console.assert(r.out[0].json.precisa === true && r.out[0].json.base.includes('cdpj.partners'), 'token checar precisa');
  r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'errado' } } } });
  console.assert(r.out[0].json.ok === false, 'token checar nao autorizado');
  r = await run(N('token_guardar.js'), { input: { statusCode: 200, body: { access_token: 'ABC', expires_in: 3600 } }, nodes: { 'Token: Checar cache': { base: 'https://cdpj.partners.bancointer.com.br' } } });
  console.assert(r.out[0].json.token === 'ABC', 'token guardar');
  r = await run(N('token_checar.js'), { input: { cfg }, nodes: { 'Token: Requisição': { body: { k: 'tok123' } } } });
  console.assert(r.out[0].json.precisa === false && r.out[0].json.token === 'ABC', 'token cache hit');

  // criar: preparar
  r = await run(N('criar_preparar.js'), { input: { cfg }, nodes: { 'Criar: Requisição': { body: checkout } }, http: async () => ({ ok: true, token: 'ABC', base: 'https://cdpj.partners.bancointer.com.br' }) });
  const prep = r.out[0].json;
  console.assert(prep.via_inter === true, 'prep via_inter');
  console.assert(prep.cents === 34690 && prep.cob.valor.original === '346.90', 'prep valor ' + prep.cents);
  console.assert(/^[a-zA-Z0-9]{26,35}$/.test(prep.txid), 'txid formato ' + prep.txid);
  console.assert(prep.cob.devedor.cpf === '12345678901' && prep.cob.chave === 'pix@americanutrition.com', 'devedor/chave');
  console.assert(prep.email === 'maria@ex.com' && prep.telefone === '11999998888', 'email/telefone');
  r = await run(N('criar_preparar.js'), { input: { cfg: Object.assign({}, cfg, { pix_provider: 'pagarme' }) }, nodes: { 'Criar: Requisição': { body: checkout } } });
  console.assert(r.out[0].json.via_inter === false, 'prep provider pagarme');
  r = await run(N('criar_preparar.js'), { input: { cfg }, nodes: { 'Criar: Requisição': { body: Object.assign({}, checkout, { payment_method: 'credit_card' }) } } });
  console.assert(r.out[0].json.via_inter === false, 'prep nao pix');

  // criar: resposta
  const copia = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5925AMERICA NUTRITION LTDA6009SAO PAULO62070503***6304ABCD';
  r = await run(N('criar_resposta.js'), { withQr: true, input: { statusCode: 201, body: { txid: prep.txid, status: 'ATIVA', pixCopiaECola: copia, location: 'pix.inter.co/abc', loc: { id: 1 } } }, nodes: { 'Criar: Preparar cobrança': prep } });
  const resp = r.out[0].json;
  console.assert(resp.gravar === true && resp.resposta.pix_qr_code === copia && resp.resposta.order_id === 'inter_' + prep.txid, 'resposta campos');
  console.assert(String(resp.resposta.pix_qr_code_url).startsWith('data:image/gif;base64,'), 'qr data url');
  console.assert(Object.keys(resp.resposta).length === 14, 'resposta 13 campos + provider: ' + Object.keys(resp.resposta).length);
  r = await run(N('criar_resposta.js'), { withQr: true, input: { statusCode: 400, body: { title: 'erro' } }, nodes: { 'Criar: Preparar cobrança': prep } });
  console.assert(r.out[0].json.via_inter === false && r.out[0].json.gravar === false, 'resposta erro');
  r = await run(N('criar_final.js'), { input: {}, nodes: { 'Criar: Resposta ao checkout': resp } });
  console.assert(r.out[0].json.order_id === 'inter_' + prep.txid, 'final ok');

  // confirmar
  const cob = { txid: prep.txid, order_code: 'AN-123', status: 'ATIVA', valor_centavos: 34690, nome: prep.nome, email: prep.email, checkout: checkout, confirmado_em: null, pedido_shopify: null };
  r = await run(N('confirmar_preparar.js'), { input: { cfg, cobranca: cob }, nodes: { 'Confirmar: Requisição': { body: { txid: prep.txid } } }, http: async () => ({ ok: true, token: 'ABC', base: 'https://x' }) });
  console.assert(r.out[0].json.fim === false && r.out[0].json.token === 'ABC', 'confirmar preparar');
  r = await run(N('confirmar_preparar.js'), { input: { cfg, cobranca: cob }, nodes: { 'Confirmar: Requisição': { body: { txid: prep.txid } } }, http: async () => ({ ok: true, token: 'ABC', base: 'https://x' }) });
  console.assert(r.out[0].json.throttled === true, 'confirmar throttle');
  r = await run(N('confirmar_preparar.js'), { input: { cfg, cobranca: cob }, nodes: { 'Confirmar: Requisição': { body: { txid: prep.txid, force: true } } }, http: async () => ({ ok: true, token: 'ABC', base: 'https://x' }) });
  console.assert(r.out[0].json.fim === false, 'confirmar force ignora throttle');
  r = await run(N('confirmar_preparar.js'), { input: { cfg, cobranca: null }, nodes: { 'Confirmar: Requisição': { body: { txid: 'x' } } } });
  console.assert(r.out[0].json.status === 'not_found', 'confirmar not found');
  r = await run(N('confirmar_avaliar.js'), { input: { statusCode: 200, body: { status: 'ATIVA' } }, nodes: { 'Confirmar: Preparar consulta': { txid: prep.txid } } });
  console.assert(r.out[0].json.paid === false && r.out[0].json.fim === true, 'avaliar ativa');
  r = await run(N('confirmar_avaliar.js'), { input: { statusCode: 200, body: { status: 'CONCLUIDA', valor: { original: '346.90' }, pix: [{ endToEndId: 'E123', txid: prep.txid, valor: '346.90', horario: '2026-09-18T12:00:00Z' }] } }, nodes: { 'Confirmar: Preparar consulta': { txid: prep.txid } } });
  const av = r.out[0].json;
  console.assert(av.paid === true && av.fim === false && av.e2e === 'E123' && av.valor === 346.9, 'avaliar concluida');
  let posted = null;
  r = await run(N('confirmar_pedido.js'), { input: { txid: prep.txid }, nodes: { 'Confirmar: Config + cobrança': { cfg, cobranca: cob }, 'Confirmar: Avaliar pagamento': av }, http: async (o) => { posted = o.body; return {}; } });
  console.assert(r.out[0].json.paid === true && r.out[0].json.erro === '', 'pedido ok');
  console.assert(posted.type === 'order.paid' && posted.data.id === 'inter_' + prep.txid, 'payload tipo/id');
  console.assert(posted.data.charges[0].amount === 34690 && posted.data.amount === 34690, 'payload total');
  const somaItens = posted.data.items.reduce((a, it) => a + it.amount * it.quantity, 0);
  console.assert(somaItens === 34690 && posted.data.items.some(i => i.code === 'FRETE'), 'itens + frete');
  console.assert(JSON.parse(posted.data.metadata.shopify_items)[0].variant_id === '44436756234412', 'metadata shopify_items');
  console.assert(posted.data.customer.document === '12345678901' && posted.data.customer.phones.mobile_phone.area_code === '11', 'customer');
  console.assert(posted.data.metadata.gateway === 'Banco Inter' && posted.data.charges[0].payment_method === 'pix', 'gateway/pm');
  r = await run(N('confirmar_pedido.js'), { input: {}, nodes: { 'Confirmar: Config + cobrança': { cfg, cobranca: cob }, 'Confirmar: Avaliar pagamento': av }, http: async () => { throw new Error('nao deveria postar'); } });
  console.assert(r.out[0].json.ja_confirmado === true && r.calls.length === 0, 'pedido ja confirmado nao reposta');

  // status
  r = await run(N('status_avaliar.js'), { input: { cobranca: cob }, nodes: { 'Status: Requisição': { query: { order_id: 'inter_' + prep.txid } } }, http: async (o) => o.url.includes('confirmar') ? { paid: true } : { dados: { data: { orders: { nodes: [{ name: 'AN-9999-BR', customAttributes: [{ key: 'pagarme_order', value: 'inter_' + prep.txid }] }] } } } } });
  console.assert(r.out[0].json.paid === true && r.out[0].json.order_number === 'AN-9999-BR' && r.out[0].json.salvar === 'AN-9999-BR', 'status pago + numero');
  r = await run(N('status_avaliar.js'), { input: { cobranca: cob }, nodes: { 'Status: Requisição': { query: { order_id: 'inter_' + prep.txid } } }, http: async () => ({ paid: false }) });
  console.assert(r.out[0].json.paid === false && r.out[0].json.status === 'pending', 'status pendente');
  r = await run(N('status_avaliar.js'), { input: { cobranca: null }, nodes: { 'Status: Requisição': { query: { order_id: 'inter_x' } } } });
  console.assert(r.out[0].json.status === 'not_found', 'status not found');

  // webhook
  r = await run(N('webhook_processar.js'), { input: { body: { pix: [{ txid: prep.txid, endToEndId: 'E1' }, { txid: '' }] } }, http: async () => ({ paid: true, status: 'paid' }) });
  console.assert(r.out[0].json.recebidos === 2 && r.out[0].json.resultados.length === 1 && r.calls[0].body.force === true, 'webhook pix[]');
  r = await run(N('webhook_processar.js'), { input: { body: [{ txid: prep.txid }] }, http: async () => ({ paid: false }) });
  console.assert(r.out[0].json.resultados.length === 1, 'webhook array');

  // provedor
  r = await run(N('provedor_decidir.js'), { input: { cfg }, nodes: { 'Provedor: Requisição': { query: { t: 'tok123', set: 'pagarme' } } } });
  console.assert(r.out[0].json.mudar === 'pagarme' && r.out[0].json.novo === 'pagarme' && r.out[0].json.aviso.includes('Pagar.me'), 'provedor troca');
  r = await run(N('provedor_decidir.js'), { input: { cfg }, nodes: { 'Provedor: Requisição': { query: { t: 'tok123' } } } });
  console.assert(r.out[0].json.mudar === '' && r.out[0].json.html.includes('Voltar ao Pagar.me'), 'provedor painel');
  r = await run(N('provedor_decidir.js'), { input: { cfg }, nodes: { 'Provedor: Requisição': { query: { t: 'nope', set: 'pagarme' } } } });
  console.assert(r.out[0].json.mudar === '' && r.out[0].json.html.includes('Acesso negado'), 'provedor negado');
  fs.writeFileSync(path.join(__dirname, 'painel-preview.html'), r.out[0].json.html);

  // setup
  r = await run(N('setup_preparar.js'), { input: { cfg }, nodes: { 'Setup: Requisição': { query: { t: 'tok123' } } }, http: async () => ({ ok: true, token: 'ABC', base: 'https://x' }) });
  console.assert(r.out[0].json.registrar === true && r.out[0].json.webhookUrl.endsWith('/webhook/pix-inter-webhook'), 'setup preparar');
  r = await run(N('setup_resultado.js'), { input: { statusCode: 204, body: '' }, nodes: { 'Setup: Preparar registro': r.out[0].json } });
  console.assert(r.out[0].json.ok === true, 'setup resultado');
  console.log('TESTES OK');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
