// Lanca o recebimento no Nibo (POST /empresas/v1/receipts) via proxy interno. Dedupe ja garantido pelo insert (chave unica).
// Com nibo_lancar=off o registro e descartado (apagado) para poder ser lancado depois, quando ligar.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const reg = $input.first().json || {};
const cfg = reg.cfg || {};
const ev = $('Nibo Lançar: Validar').first().json;
const cob = reg.cobranca || null;
const base = { chave: ev.chave, status: 'ignorado', nibo_receipt_id: '', erro: '', descricao: ev.descricao };
if (!reg.nova) return [{ json: Object.assign(base, { status: 'duplicado', resposta: { ok: true, duplicado: true, chave: ev.chave } }) }];
if (String(cfg.nibo_lancar || 'off') !== 'on') return [{ json: Object.assign(base, { status: 'descartar', erro: 'nibo_lancar=off', resposta: { ok: true, ignorado: true, motivo: 'nibo_lancar=off' } }) }];
const tiposRe = new RegExp(String(cfg.nibo_tipos_lancar || 'PIX|TED|DOC|BOLETO|TRANSFER|DEPOSITO'), 'i');
if (!tiposRe.test(ev.tipo)) return [{ json: Object.assign(base, { erro: 'tipo fora de nibo_tipos_lancar', resposta: { ok: true, ignorado: true, motivo: 'tipo ' + ev.tipo } }) }];
if (!cfg.nibo_conta_inter_id || !cfg.nibo_cliente_id || !cfg.nibo_categoria_id) return [{ json: Object.assign(base, { status: 'erro', erro: 'config Nibo incompleta (nibo_conta_inter_id, nibo_cliente_id, nibo_categoria_id) - rode /webhook/inter-nibo-setup', resposta: { ok: false, erro: 'config Nibo incompleta' } }) }];

const nome = ev.nome || (cob && cob.nome) || '';
const pedido = (cob && (cob.pedido_shopify || cob.order_code)) || '';
// Descricao: so "Pedido AN-...". Sem pedido (PIX fora do checkout, TED etc.): tipo + nome do pagador.
let descricao;
if (pedido) descricao = 'Pedido ' + pedido;
else {
  const partes = [ev.tipo === 'PIX' ? 'PIX recebido' : (ev.tipo + ' recebido')];
  if (nome) partes.push(nome); else if (ev.descricao) partes.push(ev.descricao);
  descricao = partes.join(' · ');
}
descricao = descricao.slice(0, 200);
const referencia = (ev.end_to_end_id || ev.id_transacao || ev.chave).slice(0, 100);
const corpo = {
  accountId: cfg.nibo_conta_inter_id,
  stakeholderId: cfg.nibo_cliente_id,
  date: ev.data,
  accrualDate: ev.data,
  description: descricao,
  reference: referencia,
  categories: [{ categoryid: cfg.nibo_categoria_id, value: ev.valor, description: (ev.tipo + ' ' + referencia).slice(0, 100) }]
};
let r = null;
try {
  r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/nibo-api', json: true, timeout: 30000, body: { k: cfg.pix_admin_token, method: 'POST', path: 'receipts', body: corpo } });
} catch (e) { r = { ok: false, statusCode: 0, body: String(e && e.message || e) }; }
const ok = !!(r && r.ok);
const id = ok ? String(typeof r.body === 'string' ? r.body : (r.body && (r.body.id || r.body.receiptId || r.body.entryId)) || '').replace(/"/g, '').slice(0, 80) : '';
return [{ json: {
  chave: ev.chave, descricao: descricao,
  status: ok ? 'lancado' : 'erro',
  nibo_receipt_id: id,
  erro: ok ? '' : ('Nibo HTTP ' + (r && r.statusCode) + ': ' + JSON.stringify(r && r.body).slice(0, 300)),
  resposta: ok ? { ok: true, lancado: true, chave: ev.chave, nibo_receipt_id: id, descricao: descricao, valor: ev.valor } : { ok: false, erro: 'Nibo HTTP ' + (r && r.statusCode), detalhe: r && r.body }
} }];
