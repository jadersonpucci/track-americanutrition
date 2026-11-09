// Painel de NF-e (POST /webhook/nfe-painel-api), no 'Preparar'. A senha do painel e conferida pelo proprio webhook
// (Header Auth, credencial "Painel NF-e (senha)", header X-Painel-Senha). Aqui so normaliza o pedido.
const b = ($input.first().json.body) || {};
let ped = String(b.pedido || '').toUpperCase().replace(/\s+/g, '').replace(/^#/, '');
if (/^\d+$/.test(ped)) ped = 'AN-' + ped;
const acao = /^(ver|emitir)$/.test(String(b.acao || '')) ? b.acao : 'ver';
const erro = /^AN-\d{3,7}$/.test(ped) ? '' : 'Número de pedido inválido. Use 16477 ou AN-16477.';
return [{ json: { ok: !erro, erro, pedido: ped, acao,
  documento: String(b.documento || '').replace(/\D/g, ''),
  ie: String(b.ie || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '') } }];
