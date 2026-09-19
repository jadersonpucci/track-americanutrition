// Testes locais dos nos do boleto hibrido (Inter Cobranca v3) com mocks de $input, $() e httpRequest
const fs = require('fs');
const path = require('path');
const N = p => fs.readFileSync(path.join(__dirname, 'nodes', p), 'utf8');
function run(code, { input, nodes = {}, http = async () => ({}) }) {
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = name => { if (!(name in nodes)) throw new Error('node nao mockado: ' + name); return { first: () => ({ json: nodes[name] }) }; };
  const fn = new Function('$input', '$', 'return (async function(){\n' + code + '\n}).call(this)');
  const calls = [];
  return fn.call({ helpers: { httpRequest: async (o) => { calls.push(o); return http(o); }, prepareBinaryData: async (buf, name, mime) => ({ data: buf.toString('base64'), fileName: name, mimeType: mime }) } }, $input, $).then(out => ({ out, calls }));
}
const cfg = { pix_admin_token: 'tok', inter_client_id: 'id', inter_client_secret: 'sec', boleto_provider: 'inter', inter_boleto_dias_vencimento: '3', inter_boleto_dias_agenda: '0', inter_boleto_mensagem: 'Pague ate o vencimento.' };
const checkout = { payment_method: 'boleto', order_ref: 'AN-1', customer: { name: 'Maria da Silva', email: 'm@x.com', document: '111.444.777-35', ddd: '11', phone: '999990000' },
  shipping: { zip: '01001-000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' },
  items: [{ code: '1', description: 'Produto', quantity: 2, amount: 15000 }], freight: { price_cents: 2500, label: 'PAC' }, shopify_items: [{ variant_id: '1', quantity: 2 }] };
const det = { cobranca: { situacao: 'A_RECEBER' }, boleto: { nossoNumero: '1', codigoBarras: '077' + '9'.repeat(41), linhaDigitavel: '07790001161208782139808572370966215760000032500' }, pix: { txid: 'TX1', pixCopiaECola: '000201...' } };
(async () => {
  // criar: fluxo feliz
  let posted = [];
  let r = await run(N('boleto_criar.js'), { input: { cfg }, nodes: { 'Boleto: Requisição': { body: checkout } }, http: async (o) => { posted.push(o.body); return o.body.method === 'POST' ? { ok: true, body: { codigoSolicitacao: 'COD1' } } : { ok: true, body: det }; } });
  let j = r.out[0].json;
  console.assert(j.ok && j.gravar === 'COD1' && j.valor === 325 && j.resposta.via_inter && j.resposta.order_id === 'interb_COD1' && j.resposta.boleto_line === det.boleto.linhaDigitavel && j.resposta.pix_qr_code === '000201...', 'criar ok ' + JSON.stringify(j.resposta));
  const corpo = posted[0].body;
  console.assert(corpo.valorNominal === 325 && corpo.pagador.cpfCnpj === '11144477735' && corpo.pagador.tipoPessoa === 'FISICA' && corpo.pagador.cep === '01001000' && corpo.formasRecebimento.length === 2 && corpo.mensagem.linha1 === 'Pague ate o vencimento.' && corpo.numDiasAgenda === 0, 'corpo inter ' + JSON.stringify(corpo));
  console.assert(/\/webhook\/boleto\?l=0779/.test(j.resposta.boleto_url) && /inter-boleto-pdf\?c=COD1/.test(j.resposta.boleto_pdf), 'urls');
  console.assert(JSON.parse(j.checkout).k === undefined, 'checkout gravado sem k');
  // criar: provider pagarme => fail-open
  r = await run(N('boleto_criar.js'), { input: { cfg: Object.assign({}, cfg, { boleto_provider: 'pagarme' }) }, nodes: { 'Boleto: Requisição': { body: checkout } } });
  console.assert(r.out[0].json.ok === false && r.out[0].json.resposta.via_inter === false && r.calls.length === 0, 'fail-open provider');
  // criar: forcar_inter com k
  r = await run(N('boleto_criar.js'), { input: { cfg: Object.assign({}, cfg, { boleto_provider: 'pagarme' }) }, nodes: { 'Boleto: Requisição': { body: Object.assign({ k: 'tok', forcar_inter: true }, checkout) } }, http: async (o) => o.body.method === 'POST' ? { ok: true, body: { codigoSolicitacao: 'COD2' } } : { ok: true, body: det } });
  console.assert(r.out[0].json.ok && r.out[0].json.gravar === 'COD2', 'forcar_inter');
  // criar: sem endereco => fail-open sem chamar o Inter
  r = await run(N('boleto_criar.js'), { input: { cfg }, nodes: { 'Boleto: Requisição': { body: Object.assign({}, checkout, { shipping: {} }) } } });
  console.assert(r.out[0].json.ok === false && /endereco/.test(r.out[0].json.resposta.motivo) && r.calls.length === 0, 'sem endereco');
  // criar: GET nunca fica pronto => cancela e fail-open
  r = await run(N('boleto_criar.js'), { input: { cfg }, nodes: { 'Boleto: Requisição': { body: checkout } }, http: async (o) => o.body.method === 'POST' && o.body.path === 'cobranca/v3/cobrancas' ? { ok: true, body: { codigoSolicitacao: 'COD3' } } : { ok: true, body: { cobranca: { situacao: 'EM_PROCESSAMENTO' } } } });
  console.assert(r.out[0].json.ok === false && r.calls.some(c => /COD3\/cancelar$/.test(c.body.path)), 'cancela quando nao fica pronto');
  // criar: valor minimo
  r = await run(N('boleto_criar.js'), { input: { cfg }, nodes: { 'Boleto: Requisição': { body: Object.assign({}, checkout, { items: [{ code: '1', description: 'x', quantity: 1, amount: 100 }], freight: {} }) } } });
  console.assert(r.out[0].json.ok === false && /2,50/.test(r.out[0].json.resposta.motivo), 'valor minimo');

  // status: pendente, confirma via endpoint
  const row = { codigo_solicitacao: 'COD1', valor: 325, nome: 'Maria da Silva', documento: '11144477735', email: 'm@x.com', order_code: 'AN-1', checkout: checkout, linha_digitavel: det.boleto.linhaDigitavel, codigo_barras: det.boleto.codigoBarras, txid: 'TX1', confirmado_em: null, pedido_shopify: null };
  r = await run(N('boleto_status.js'), { input: { cobranca: row }, nodes: { 'BStatus: Requisição': { query: { order_id: 'interb_COD1' } } }, http: async (o) => o.url.includes('confirmar') ? { paid: false } : {} });
  console.assert(r.out[0].json.paid === false && r.out[0].json.status === 'pending' && r.out[0].json.order_id === 'interb_COD1', 'status pendente');
  r = await run(N('boleto_status.js'), { input: { cobranca: row }, nodes: { 'BStatus: Requisição': { query: { order_id: 'interb_COD1' } } }, http: async (o) => o.url.includes('confirmar') ? { paid: true } : { dados: { data: { orders: { nodes: [{ name: 'AN-15600', customAttributes: [{ key: 'pagarme_order', value: 'interb_COD1' }] }] } } } } });
  console.assert(r.out[0].json.paid === true && r.out[0].json.order_number === 'AN-15600' && r.out[0].json.salvar === 'AN-15600', 'status pago + numero');
  r = await run(N('boleto_status.js'), { input: { cobranca: null }, nodes: { 'BStatus: Requisição': { query: { order_id: 'interb_x' } } } });
  console.assert(r.out[0].json.status === 'not_found', 'status not found');

  // confirmar: throttled, a receber, recebido
  r = await run(N('boleto_confirmar.js'), { input: { cfg, cobranca: row, pode: 0 }, nodes: { 'BConfirmar: Requisição': { body: { codigo: 'COD1' } } } });
  console.assert(r.out[0].json.throttled === true && r.out[0].json.reivindicar === false && r.calls.length === 0, 'throttle');
  r = await run(N('boleto_confirmar.js'), { input: { cfg, cobranca: row, pode: 1 }, nodes: { 'BConfirmar: Requisição': { body: { codigo: 'COD1' } } }, http: async () => ({ ok: true, body: det }) });
  console.assert(r.out[0].json.paid === false && r.out[0].json.situacao === 'A_RECEBER', 'a receber');
  r = await run(N('boleto_confirmar.js'), { input: { cfg, cobranca: row, pode: 0 }, nodes: { 'BConfirmar: Requisição': { body: { codigo: 'COD1', force: true } } }, http: async () => ({ ok: true, body: { cobranca: { situacao: 'RECEBIDO', origemRecebimento: 'PIX', valorTotalRecebido: 325, dataSituacao: '2026-09-19' }, pix: { txid: 'TX1' } } }) });
  const av = r.out[0].json;
  console.assert(av.paid === true && av.reivindicar === true && av.origem === 'PIX' && av.valor_recebido === 325 && av.codigo === 'COD1', 'recebido ' + JSON.stringify(av));
  r = await run(N('boleto_confirmar.js'), { input: { cfg, cobranca: Object.assign({}, row, { confirmado_em: '2026-09-19' }), pode: 1 }, nodes: { 'BConfirmar: Requisição': { body: { codigo: 'COD1' } } } });
  console.assert(r.out[0].json.ja_confirmado === true && r.calls.length === 0, 'ja confirmado');
  r = await run(N('boleto_confirmar.js'), { input: { cfg, cobranca: row, pode: 1 }, nodes: { 'BConfirmar: Requisição': { body: { codigo: 'COD1' } } }, http: async () => ({ ok: true, body: { cobranca: { situacao: 'CANCELADO' } } }) });
  console.assert(r.out[0].json.status === 'canceled', 'cancelado');

  // pedido: order.paid + nibo
  let pagarme = null, nibo = null;
  r = await run(N('boleto_pedido.js'), { input: { codigo_solicitacao: 'COD1' }, nodes: { 'BConfirmar: Buscar': { cfg, cobranca: row }, 'BConfirmar: Processar': av }, http: async (o) => { if (o.url.endsWith('/pagarme-pago')) { pagarme = o.body; return {}; } if (o.url.endsWith('/inter-nibo-lancar')) { nibo = o.body; return { ok: true, lancado: true }; } return {}; } });
  j = r.out[0].json;
  console.assert(j.paid && j.confirmado_agora && j.nibo === 'lancado' && j.erro === '', 'pedido ok ' + JSON.stringify(j));
  console.assert(pagarme.type === 'order.paid' && pagarme.data.id === 'interb_COD1' && pagarme.data.amount === 32500 && pagarme.data.charges[0].payment_method === 'pix' && pagarme.data.metadata.gateway === 'Banco Inter' && pagarme.data.metadata.inter_boleto_hibrido === 'sim' && pagarme.data.items.some(i => i.code === 'FRETE'), 'payload ' + JSON.stringify(pagarme).slice(0, 300));
  console.assert(nibo.chave === 'interb:COD1' && nibo.tipo === 'PIX' && nibo.valor === 325 && nibo.txid === 'COD1' && nibo.k === 'tok', 'nibo ' + JSON.stringify(nibo));
  r = await run(N('boleto_pedido.js'), { input: { codigo_solicitacao: 'COD1' }, nodes: { 'BConfirmar: Buscar': { cfg, cobranca: row }, 'BConfirmar: Processar': Object.assign({}, av, { origem: 'BOLETO' }) }, http: async (o) => { if (o.url.endsWith('/pagarme-pago')) { pagarme = o.body; } return { ok: true, lancado: true }; } });
  console.assert(pagarme.data.charges[0].payment_method === 'boleto' && pagarme.data.charges[0].last_transaction.line === det.boleto.linhaDigitavel, 'payload boleto');
  r = await run(N('boleto_pedido.js'), { input: {}, nodes: { 'BConfirmar: Buscar': { cfg, cobranca: row }, 'BConfirmar: Processar': av }, http: async () => { throw new Error('nao deveria'); } });
  console.assert(r.out[0].json.ja_confirmado === true, 'sem claim nao posta');

  // webhook: lista e objeto
  r = await run(N('boleto_webhook.js'), { input: {}, nodes: { 'BWebhook: Requisição': { body: [{ codigoSolicitacao: 'COD1', situacao: 'RECEBIDO' }, { codigoSolicitacao: '', situacao: 'X' }] } }, http: async () => ({ paid: true, status: 'paid', nibo: 'lancado' }) });
  console.assert(r.out[0].json.recebidos === 2 && r.out[0].json.resultados.length === 1 && r.calls[0].body.force === true && r.out[0].json.resultados[0].paid === true, 'webhook lista');
  r = await run(N('boleto_webhook.js'), { input: {}, nodes: { 'BWebhook: Requisição': { body: { codigoSolicitacao: 'COD9', situacao: 'RECEBIDO' } } }, http: async () => ({ paid: false }) });
  console.assert(r.out[0].json.resultados.length === 1 && r.out[0].json.resultados[0].codigo === 'COD9', 'webhook objeto');

  // pdf
  r = await run(N('boleto_pdf.js'), { input: { cfg }, nodes: { 'BPdf: Requisição': { query: { c: 'COD1' } } }, http: async () => ({ ok: true, body: { pdf: Buffer.from('%PDF-1.4 x').toString('base64') } }) });
  console.assert(r.out[0].json.ok && r.out[0].binary.data.mimeType === 'application/pdf', 'pdf ok');
  r = await run(N('boleto_pdf.js'), { input: { cfg }, nodes: { 'BPdf: Requisição': { query: { c: '../x' } } }, http: async () => ({ ok: false, statusCode: 404, body: {} }) });
  console.assert(r.out[0].json.ok === false, 'pdf erro');

  // roteadores
  r = await run(N('patch_fluxoA_roteador.js'), { input: {}, nodes: { 'Checkout Recebido': { body: checkout } }, http: async (o) => ({ order_id: 'interb_COD1', boleto_url: 'u', boleto_line: 'l' }) });
  console.assert(r.out[0].json.via_inter === true && /checkout-boleto-inter-criar$/.test(r.calls[0].url), 'roteador boleto');
  r = await run(N('patch_fluxoA_roteador.js'), { input: {}, nodes: { 'Checkout Recebido': { body: Object.assign({}, checkout, { payment_method: 'pix' }) } }, http: async () => ({ order_id: 'inter_T', pix_qr_code: 'q' }) });
  console.assert(r.out[0].json.via_inter === true && /checkout-pix-inter-criar$/.test(r.calls[0].url), 'roteador pix');
  r = await run(N('patch_fluxoA_roteador.js'), { input: {}, nodes: { 'Checkout Recebido': { body: Object.assign({}, checkout, { payment_method: 'credit_card' }) } } });
  console.assert(r.out[0].json.via_inter === false && r.calls.length === 0, 'roteador cartao');
  r = await run(N('patch_status_roteador.js'), { input: { query: { order_id: 'interb_COD1' } }, http: async (o) => ({ status: 'paid', paid: true, order_number: 'AN-1' }) });
  console.assert(r.out[0].json.paid === true && /boleto-inter-status$/.test(r.calls[0].url), 'status roteador boleto');
  r = await run(N('patch_status_roteador.js'), { input: { query: { order_id: 'inter_T' } }, http: async (o) => ({ status: 'pending', paid: false }) });
  console.assert(/pix-inter-status$/.test(r.calls[0].url), 'status roteador pix');
  r = await run(N('patch_status_roteador.js'), { input: { query: { order_id: 'or_x' } } });
  console.assert(r.calls.length === 0 && r.out[0].json.query.order_id === 'or_x', 'status roteador pagarme');
  console.log('TESTES BOLETO OK');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
