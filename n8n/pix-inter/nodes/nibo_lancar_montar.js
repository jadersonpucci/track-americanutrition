// Lanca o recebimento no Nibo (POST /empresas/v1/receipts) via proxy interno. Dedupe ja garantido pelo insert (chave unica).
// Com nibo_lancar=off o registro e descartado (apagado) para poder ser lancado depois, quando ligar.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const reg = $input.first().json || {};
const cfg = reg.cfg || {};
const ev = $('Nibo Lançar: Validar').first().json;
const cob = reg.cobranca || null;
const base = { chave: ev.chave, status: 'ignorado', nibo_receipt_id: '', erro: '', descricao: ev.descricao, pedido_shopify: '', txid: ev.txid };
if (!reg.nova) return [{ json: Object.assign(base, { status: 'duplicado', resposta: { ok: true, duplicado: true, chave: ev.chave } }) }];
if (String(cfg.nibo_lancar || 'off') !== 'on') return [{ json: Object.assign(base, { status: 'descartar', erro: 'nibo_lancar=off', resposta: { ok: true, ignorado: true, motivo: 'nibo_lancar=off' } }) }];
const tiposRe = new RegExp(String(cfg.nibo_tipos_lancar || 'PIX|TED|DOC|BOLETO|TRANSFER|DEPOSITO'), 'i');
if (!tiposRe.test(ev.tipo)) return [{ json: Object.assign(base, { erro: 'tipo fora de nibo_tipos_lancar', resposta: { ok: true, ignorado: true, motivo: 'tipo ' + ev.tipo } }) }];
if (!cfg.nibo_conta_inter_id || !cfg.nibo_cliente_id || !cfg.nibo_categoria_id) return [{ json: Object.assign(base, { status: 'erro', erro: 'config Nibo incompleta (nibo_conta_inter_id, nibo_cliente_id, nibo_categoria_id) - rode /webhook/inter-nibo-setup', resposta: { ok: false, erro: 'config Nibo incompleta' } }) }];

const nome = ev.nome || (cob && cob.nome) || '';
let pedido = (cob && cob.pedido_shopify) || '';
// PIX do checkout: a descricao usa o numero do pedido Shopify (AN-15527), que e criado logo apos a confirmacao.
// Se ainda nao existe, procura na Shopify (mesma busca do status) por ate ~20s; se nao achar, deixa em 'erro' para reenvio automatico.
if (cob && !pedido) {
  const desde = new Date(Date.now() - 12 * 3600000).toISOString();
  const email = String(cob.email || '').replace(/["\\]/g, '');
  const filtro = 'created_at:>' + desde + (email ? ' email:' + email : '');
  const query = '{ orders(first: 25, sortKey: CREATED_AT, reverse: true, query: ' + JSON.stringify(filtro) + ') { nodes { name customAttributes { key value } } } }';
  for (let tent = 0; tent < 5 && !pedido; tent++) {
    if (tent) await new Promise(r => setTimeout(r, 4000));
    try {
      const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/shopify-admin', json: true, timeout: 15000, body: { acao: 'atualizar_pedido', endpoint: 'graphql.json', metodo: 'POST', payload: { query: query } } });
      const nodes = (r && r.dados && r.dados.data && r.dados.data.orders && r.dados.data.orders.nodes) || [];
      const hit = nodes.find(o => (o.customAttributes || []).some(a => a.key === 'pagarme_order' && a.value === 'inter_' + cob.txid));
      if (hit && hit.name) pedido = String(hit.name);
    } catch (e) { }
  }
  if (!pedido) return [{ json: Object.assign(base, { status: 'erro', erro: 'aguardando numero do pedido Shopify (reenvio automatico)', resposta: { ok: false, erro: 'pedido Shopify ainda nao criado; sera reenviado' } }) }];
}
// Descricao: so "Pedido AN-...". Sem pedido (PIX fora do checkout, TED etc.): tipo + nome do pagador.
let descricao;
if (pedido) descricao = 'Pedido ' + pedido;
else {
  const partes = [ev.tipo === 'PIX' ? 'PIX recebido' : (ev.tipo + ' recebido')];
  if (nome) partes.push(nome); else if (ev.descricao) partes.push(ev.descricao);
  descricao = partes.join(' · ');
}
descricao = descricao.slice(0, 200);
const corpo = {
  accountId: cfg.nibo_conta_inter_id,
  stakeholderId: cfg.nibo_cliente_id,
  date: ev.data,
  accrualDate: ev.data,
  description: descricao,
  categories: [{ categoryid: cfg.nibo_categoria_id, value: ev.valor, description: descricao }]
};
let r = null;
try {
  r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/nibo-api', json: true, timeout: 30000, body: { k: cfg.pix_admin_token, method: 'POST', path: 'receipts', body: corpo } });
} catch (e) { r = { ok: false, statusCode: 0, body: String(e && e.message || e) }; }
const ok = !!(r && r.ok);
const id = ok ? String(typeof r.body === 'string' ? r.body : (r.body && (r.body.id || r.body.receiptId || r.body.entryId)) || '').replace(/"/g, '').slice(0, 80) : '';
return [{ json: {
  chave: ev.chave, descricao: descricao, pedido_shopify: pedido, txid: ev.txid,
  status: ok ? 'lancado' : 'erro',
  nibo_receipt_id: id,
  erro: ok ? '' : ('Nibo HTTP ' + (r && r.statusCode) + ': ' + JSON.stringify(r && r.body).slice(0, 300)),
  resposta: ok ? { ok: true, lancado: true, chave: ev.chave, nibo_receipt_id: id, descricao: descricao, valor: ev.valor } : { ok: false, erro: 'Nibo HTTP ' + (r && r.statusCode), detalhe: r && r.body }
} }];
