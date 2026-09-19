// Verifica no Inter se a cobranca (boleto/PIX) foi recebida. Entrada: { cfg, cobranca (linha da tabela), pode (throttle liberado) }.
// Saida: paid/status; quando paga pela primeira vez, reivindicar=true segue para criar o pedido.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const inp = $input.first().json || {};
const cfg = inp.cfg || {};
const row = inp.cobranca || null;
const pode = Number(inp.pode || 0) > 0;
const body = $('BConfirmar: Requisição').first().json.body || {};
const cod = String(body.codigo || '').replace(/[^a-zA-Z0-9-]/g, '');
const force = body.force === true;
if (!row) return [{ json: { paid: false, status: 'not_found', order_id: 'interb_' + cod, reivindicar: false } }];
const oid = 'interb_' + cod;
if (row.confirmado_em) return [{ json: { paid: true, status: 'paid', ja_confirmado: true, order_id: oid, reivindicar: false } }];
if (!pode && !force) return [{ json: { paid: false, status: 'pending', throttled: true, order_id: oid, reivindicar: false } }];
let g;
try {
  g = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-api', json: true, timeout: 60000, body: { k: cfg.pix_admin_token, escopo: 'boleto', method: 'GET', path: 'cobranca/v3/cobrancas/' + cod } });
} catch (e) { return [{ json: { paid: false, status: 'pending', order_id: oid, erro: String(e && e.message || e).slice(0, 200), reivindicar: false } }]; }
if (!g || !g.ok || !g.body || !g.body.cobranca) return [{ json: { paid: false, status: 'pending', order_id: oid, erro: 'Inter GET ' + (g && g.statusCode) + ': ' + JSON.stringify(g && (g.body || g.erro)).slice(0, 200), reivindicar: false } }];
const cb = g.body.cobranca;
const sit = String(cb.situacao || '').toUpperCase();
const pago = sit === 'RECEBIDO' || sit === 'MARCADO_RECEBIDO' || sit === 'PAGO';
if (!pago) return [{ json: { paid: false, status: (sit === 'CANCELADO' || sit === 'EXPIRADO') ? 'canceled' : 'pending', situacao: sit, order_id: oid, reivindicar: false } }];
return [{ json: {
  paid: true, status: 'paid', reivindicar: true, order_id: oid, codigo: cod, situacao: sit,
  origem: String(cb.origemRecebimento || '').toUpperCase(), valor_recebido: Number(cb.valorTotalRecebido || row.valor || 0),
  pago_em: cb.dataSituacao ? (String(cb.dataSituacao).length <= 10 ? cb.dataSituacao + 'T12:00:00-03:00' : cb.dataSituacao) : new Date().toISOString(),
  txid: (g.body.pix && g.body.pix.txid) || row.txid || ''
} }];
