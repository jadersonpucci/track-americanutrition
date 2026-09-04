const b = $input.first().json.body || $input.first().json;
const modo = String(b.modo || 'cliente').toLowerCase();
const instrucao = String(b.instrucao || '').trim();
const texto = String(b.texto || b.message || '').trim() || (modo === 'proativo' ? instrucao : (modo === 'sugerir' ? (instrucao || 'sugerir') : ''));
if (!texto) { throw new Error('texto obrigatorio'); }
// modo sugerir e uso interno do Inbox: exige o token do painel
if (modo === 'sugerir' && String(b.t || '') !== 'an-serena-9Kx4Lm2Q') { throw new Error('nao autorizado'); }
const contatoId = /^[0-9a-f-]{36}$/i.test(String(b.contato_id || '')) ? String(b.contato_id).toLowerCase() : '';

let tel = String(b.telefone || '').replace(/\D/g, '');
if (tel && tel.length >= 10 && !tel.startsWith('55')) tel = '55' + tel;
// Canonico: celular brasileiro sem o nono digito (JID antigo do WhatsApp) vira o numero com 9, para nao duplicar contato
if (tel.startsWith('55') && tel.length === 12 && '6789'.indexOf(tel.charAt(4)) >= 0) tel = tel.slice(0, 4) + '9' + tel.slice(4);
tel = tel ? '+' + tel : '';

const canal = String(b.canal || 'site').toLowerCase();
const entrada = {
  canal: canal,
  telefone: tel,
  email: String(b.email || '').trim().toLowerCase(),
  session_site: String(b.session_site || b.session || '').trim(),
  nome: String(b.nome || '').trim(),
  texto: texto,
  modo: modo,
  instrucao: instrucao,
  tipo_proativo: String(b.tipo_proativo || '').toLowerCase(),
  contexto: (b.contexto && typeof b.contexto === 'object') ? b.contexto : null,
  contato_id: contatoId
};
if (!entrada.telefone && !entrada.email && !entrada.session_site && !entrada.contato_id) {
  throw new Error('informe telefone, email, session_site ou contato_id');
}
return [{ json: { entrada: entrada, payload: JSON.stringify(entrada) } }];

