const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const b = r.body || {};
const p = $('Confirmar: Preparar consulta').first().json;
if (!(st >= 200 && st < 300)) return [{ json: { fim: true, paid: false, status: 'erro', erro: 'Inter GET cob HTTP ' + st + ': ' + JSON.stringify(b).slice(0, 300) } }];
const status = String(b.status || '');
const pix = (Array.isArray(b.pix) && b.pix.length) ? b.pix[0] : null;
if (status !== 'CONCLUIDA' || !pix) {
  return [{ json: { fim: true, paid: false, status: status || 'ATIVA' } }];
}
return [{ json: {
  fim: false, paid: true, txid: p.txid,
  e2e: String(pix.endToEndId || ''),
  horario: pix.horario || new Date().toISOString(),
  valor: Number(pix.valor || (b.valor && b.valor.original) || 0)
} }];
