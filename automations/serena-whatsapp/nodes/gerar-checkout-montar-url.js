const dados = $input.first().json;
const BASE = 'https://checkout.americanutrition.com/';

const itens = dados.itens_norm || [];
if (!itens.length) {
  return [{ json: { erro: true, motivo: 'sem_itens', mensagem: 'Nenhum item para montar o checkout.' }}];
}

// Canal da conversa (vem do Core via Router). Define o ref do link e, la na frente,
// a tag do pedido na Shopify: serena => WPP, serena-ig => SERENA-IG, serena-msg => SERENA-MSG.
// (Pagar.me — Confirmacao Pago -> Shopify le o ref e aplica a tag. Afiliada continua SERENA.)
let canal = '';
try { const wb = $('Webhook').first().json; const b = wb.body || wb; canal = String(b.canal || '').toLowerCase().trim(); } catch (e) { canal = ''; }
const REF_POR_CANAL = { whatsapp: 'serena', instagram: 'serena-ig', messenger: 'serena-msg' };
const ref = REF_POR_CANAL[canal] || 'serena';

// items=variant_id:quantidade (checkout busca o preco sozinho)
const segs = itens.map(i => i.variant_id + ':' + (i.quantity || 1));
let url = BASE + '?items=' + segs.join(',') + '&ref=' + ref;

// cupom (opcional): so quando o cliente pediu desconto
const cupom = (dados.cupom || '').toString().trim();
if (cupom) { url += '&discount=' + encodeURIComponent(cupom); }

return [{ json: {
  erro: false,
  checkout_url: url,
  cupom: cupom || null,
  canal: canal || 'whatsapp',
  ref: ref,
  itens_norm: itens,
  fallback_aplicado: dados.fallback_aplicado === true,
  variant_resolvida: dados.variant_resolvida,
  nome_buscado_fallback: dados.nome_buscado_fallback,
  estrategia_match: dados.estrategia_match || ''
}}];
