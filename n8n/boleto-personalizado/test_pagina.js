// Testes locais dos nos da pagina personalizada (HTML e PDF) em modo Pagar.me e modo Inter (bolepix)
const fs = require('fs'); const path = require('path');
const LIB = fs.readFileSync(path.join(__dirname, '..', 'pix-inter', 'nodes', '_qrcode_lib.min.js'), 'utf8');
const LINHA_INTER = '07790001161208782139808572370966215760000032500';
const LINHA_STONE = '19790000012345678901234567890123456781760000032500'.slice(0,47);
const PIX = '00020101021226990014br.gov.bcb.pix2577pix.inter.co/qr/cobv/AbCdEf1234567890xyz5204000053039865802BR5925AMERICA NUTRITION COMERCIA6009SAO PAULO62070503***6304ABCD';
function run(code, { query, sqlRows = () => [], http = async () => ({}), lib = false }) {
  const $input = { first: () => ({ json: { query } }), all: () => [{ json: { query } }] };
  const $ = () => { throw new Error('nao mockado'); };
  const staticData = {};
  const $getWorkflowStaticData = () => staticData;
  const calls = [];
  const helpers = {
    httpRequest: async (o) => { calls.push(o); if (o.url && o.url.endsWith('/pg/query')) return sqlRows(o.body.query); if (o.url && /\.(jpg|png)$/.test(o.url)) return Buffer.from('ffd8ffe0', 'hex'); return http(o); },
    prepareBinaryData: async (buf, name, mime) => ({ data: buf, fileName: name, mimeType: mime })
  };
  const fn = new Function('$input', '$', '$getWorkflowStaticData', 'return (async function(){\n' + (lib ? LIB + '\n' : '') + code + '\n}).call(this)');
  return fn.call({ helpers }, $input, $, $getWorkflowStaticData).then(out => ({ out, calls }));
}
const regInter = (q) => /checkout_boleto_inter/.test(q) ? [{ codigo_solicitacao: 'COD1', nosso_numero: '00000012345', pix_copia_cola: PIX, status: 'A_RECEBER', pago: false, pago_em: null, pedido_shopify: null }] : (/boletos_emitidos WHERE codigo/.test(q) ? [{ codigo: 'ABCD2345', linha: LINHA_INTER, pedido: 'AN-1', nome: 'Maria da Silva', documento: '11144477735', valor: 325, venc: '22/09/2026', emitido: '19/09/2026 10:00' }] : []);
(async () => {
  const HTML = fs.readFileSync(path.join(__dirname, 'gerar_documento.js'), 'utf8');
  const PDF = fs.readFileSync(path.join(__dirname, 'gerar_pdf.js'), 'utf8');
  const q = { l: LINHA_INTER, n: 'Maria da Silva', d: '11144477735', p: 'AN-1', it: '2x Imunofosfo=200,00|Frete - PAC=125,00', end: 'Rua A, 1 - Centro - Sao Paulo/SP - CEP 01000-000', b: 'inter' };
  // 1) HTML modo Inter, aguardando
  let r = await run(HTML, { query: q, sqlRows: regInter, http: async (o) => o.url.includes('boleto-inter-status') ? { paid: false } : (o.url.includes('encurtar') ? { shortLink: 'https://seguro.americanutrition.com/abc' } : {}) });
  let h = r.out[0].json.html;
  
  console.assert(h.includes('20260919-96m6vu56.png') && !h.includes('banco-stone'), 'logo inter');
  console.assert(h.includes('AMERICA NUTRITION COMERCIAL LTDA') && h.includes('11.298.909/0001-94') && h.includes('00019 / 305653768') && !h.includes('Pagar.me'), 'beneficiario inter');
  console.assert(h.includes('077-9'), 'banco 077-9');
  console.assert(h.includes('00000012345'), 'nosso numero do Inter');
  console.assert(h.includes('class="pixbox"') && h.includes('COPIAR CÓDIGO PIX') && h.includes('var PIX = "000201'), 'bloco pix');
  console.assert(h.includes('Aguardando pagamento') && h.includes('seguro.americanutrition.com/abc'), 'situacao + link curto');
  console.assert(r.calls.some(c => c.url.includes('boleto-inter-status?order_id=interb_COD1')), 'consulta status inter');
  // 2) HTML modo Inter, pago (sem consultar status)
  r = await run(HTML, { query: q, sqlRows: (s) => regInter(s).map(x => Object.assign({}, x, { pago: true, pago_em: '19/09/2026' })), http: async (o) => o.url.includes('encurtar') ? { shortLink: 'https://seguro.americanutrition.com/abc' } : {} });
  h = r.out[0].json.html;
  console.assert(h.includes('Pago em 19/09/2026') && h.includes('já foi pago') && !r.calls.some(c => c.url.includes('boleto-inter-status')), 'pago sem consultar');
  // 3) HTML modo Inter sem registro ainda (fallback pix pela URL)
  r = await run(HTML, { query: Object.assign({}, q, { pix: PIX, nn: '777' }), sqlRows: () => [], http: async () => ({}) });
  h = r.out[0].json.html;
  console.assert(h.includes('class="pixbox"') && h.includes('>777<') && h.includes('AMERICA NUTRITION COMERCIAL LTDA'), 'fallback por url');
  // 4) HTML modo Pagar.me (Stone) inalterado
  r = await run(HTML, { query: { l: LINHA_STONE, n: 'Joao', d: '11144477735', p: 'AN-2' }, sqlRows: (s) => /pagarme_orders/.test(s) ? [{ status: 'pending' }] : [], http: async () => ({}) });
  h = r.out[0].json.html;
  console.assert(h.includes('banco-stone-197.png') && h.includes('Pagar.me Pagamentos S/A') && h.includes('197-1') && !h.includes('class="pixbox"') && h.includes('var PIX = ""'), 'modo pagarme');
  console.assert(!r.calls.some(c => /checkout_boleto_inter/.test(c.body && c.body.query || '')), 'pagarme nao consulta tabela inter');
  // 5) conferencia de boleto Inter
  r = await run(HTML, { query: { c: 'ABCD2345' }, sqlRows: (s) => /checkout_boleto_inter/.test(s) ? [{ codigo_solicitacao: 'COD1', pago: true, pago_em: '19/09/2026' }] : regInter(s), http: async () => ({}) });
  h = r.out[0].json.html;
  
  console.assert(h.includes('Boleto legítimo') && h.includes('Pago em 19/09/2026') && h.includes('Banco Inter (077)'), 'conferencia inter');
  // 6) PDF modo Inter com QR
  r = await run(PDF, { query: Object.assign({}, q, { pdf: '1' }), sqlRows: regInter, http: async (o) => o.url.includes('encurtar') ? { shortLink: 'https://seguro.americanutrition.com/abc' } : {}, lib: true });
  const pdf = r.out[0].binary.data.data;
  
  const txt = pdf.toString('latin1');
  console.assert(txt.startsWith('%PDF-1.4') && txt.includes('AMERICA NUTRITION COMERCIAL LTDA') && txt.includes('077-9') && txt.includes('COMO PAGAR: PIX') && txt.includes('00000012345') && !txt.includes('Pagar.me'), 'pdf inter');
  console.assert((txt.match(/ re f/g) || []).length > 800, 'qr desenhado (' + (txt.match(/ re f/g) || []).length + ' rects)');
  console.assert(r.calls.some(c => c.url.includes('20260919-ife4wh99.jpg')), 'baixa logo inter jpg');
  // 7) PDF modo Pagar.me inalterado
  r = await run(PDF, { query: { l: LINHA_STONE, n: 'Joao', d: '11144477735', p: 'AN-2', pdf: '1' }, sqlRows: () => [], http: async () => ({}), lib: true });
  const t2 = r.out[0].binary.data.data.toString('latin1');
  console.assert(t2.includes('Pagar.me Pagamentos S/A') && t2.includes('197-1') && t2.includes('COMO PAGAR') && !t2.includes('COMO PAGAR: PIX'), 'pdf pagarme');
  console.assert(r.calls.some(c => c.url.includes('banco-stone-197-branco.jpg')), 'baixa logo stone');
  console.log('TESTES PAGINA OK');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
