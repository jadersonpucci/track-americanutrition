// Painel de NF-e, no 'Avaliar reenvio': resposta da Focus ao POST corrigido -> o que gravar na nfe_emissoes.
const A = $('Agir').first().json;
const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const b = (r.body && typeof r.body === 'object') ? r.body : {};
const aceito = st === 201 || st === 202 || /processando|autorizado/.test(String(b.status || '')) || /already_processed|pending_operation/.test(String(b.codigo || ''));
return [{ json: { pedido: A.pedido, aceito, http: st,
  status: aceito ? 'processando' : 'erro',
  payload: JSON.stringify(A.nf),
  mensagem: (aceito ? 'reenviada pelo painel (' + A.correcao + ')' : ('painel: Focus recusou (' + A.correcao + ') HTTP ' + st + ' ' + (b.mensagem || '') + ' ' + JSON.stringify(b.erros || '')).slice(0, 500)) } }];
