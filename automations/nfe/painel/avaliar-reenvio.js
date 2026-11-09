// Painel de NF-e, no 'Avaliar reenvio': resposta da Focus ao POST corrigido -> o que gravar na nfe_emissoes.
// Se a chamada nem saiu (credencial "Focus NFe" faltando, rede), nao mexe na nota: status vazio = 'Gravar' mantem tudo.
const A = $('Agir').first().json;
const r = $input.first().json || {};
if (r.error || !r.statusCode) {
  const m = typeof r.error === 'string' ? r.error : String((r.error && (r.error.message || r.error.description)) || r.message || 'sem resposta da Focus');
  return [{ json: { pedido: A.pedido, aceito: false, naoEnviado: true, http: 0, status: '', payload: '{}', mensagem: '',
    aviso: /credential/i.test(m) ? 'A nota não foi enviada: falta cadastrar a credencial "Focus NFe" no n8n.' : 'A nota não foi enviada: ' + m.slice(0, 200) } }];
}
const st = Number(r.statusCode || 0);
const b = (r.body && typeof r.body === 'object') ? r.body : {};
const aceito = st === 201 || st === 202 || /processando|autorizado/.test(String(b.status || '')) || /already_processed|pending_operation/.test(String(b.codigo || ''));
return [{ json: { pedido: A.pedido, aceito, http: st,
  status: aceito ? 'processando' : 'erro',
  payload: JSON.stringify(A.nf),
  mensagem: (aceito ? 'reenviada pelo painel (' + A.correcao + ')' : ('painel: Focus recusou (' + A.correcao + ') HTTP ' + st + ' ' + (b.mensagem || '') + ' ' + JSON.stringify(b.erros || '')).slice(0, 500)) } }];
