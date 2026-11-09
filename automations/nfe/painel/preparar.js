// Painel de NF-e (POST /webhook/nfe-painel-api), no 'Preparar'. Sem senha para digitar: o card da Central
// Administrativa abre o painel com ?k=CHAVE e a pagina manda a chave no corpo. Aqui confere a chave e normaliza o pedido.
const CHAVE = '<NFE_PAINEL_CHAVE>';
const b = ($input.first().json.body) || {};
let ped = String(b.pedido || '').toUpperCase().replace(/\s+/g, '').replace(/^#/, '');
if (/^\d+$/.test(ped)) ped = 'AN-' + ped;
const acao = /^(ver|emitir)$/.test(String(b.acao || '')) ? b.acao : 'ver';
let erro = '';
if (String(b.k || '') !== CHAVE) erro = 'Acesso negado. Abra o painel pela Central Administrativa.';
else if (!/^AN-\d{3,7}$/.test(ped)) erro = 'Número de pedido inválido. Use 16477 ou AN-16477.';
return [{ json: { ok: !erro, erro, pedido: ped, acao,
  documento: String(b.documento || '').replace(/\D/g, ''),
  ie: String(b.ie || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '') } }];
