// Trecho do no 'Montar Pedido Shopify' do workflow 'Pagar.me — Confirmação Pago → Shopify' (dtDYBZJuAbFZV3cB).
// So a parte alterada em set/2026 para a tag de canal (WPP / SERENA-IG / SERENA-MSG). O no completo tem a chave do Supabase e fica so no n8n.

const bgRef = ship.bg_ref || '';
const refSrc = String(meta.ref || '').toLowerCase();
// ref da Serena por canal: serena (WhatsApp), serena-ig (Instagram), serena-msg (Messenger). Todos = afiliada SERENA.
const refBase = refSrc.split('-')[0];

// ref p/ atribuicao: serena => SERENA (afiliada normal); senao ref da URL (se nao houver bg_ref)
const affRef = (refBase === 'serena') ? 'SERENA' : ((refSrc && !bgRef) ? String(meta.ref) : '');
// ... lookup do afiliado no Supabase (inalterado) ...
const tagList = [];
if (_affRow && _affRow.is_super !== true) {
  const _tag = (_affRow.tag_afiliado && String(_affRow.tag_afiliado).trim()) ? String(_affRow.tag_afiliado).trim() : ('AF: ' + String(_affRow.nome_completo || _affRow.nome || '').trim());
  if (_tag && _tag !== 'AF:') { tagList.push(_tag); }
}
// TAG DE CANAL (set/2026): link gerado pela Serena no WhatsApp (ref=serena) ou link manual ref=whatsapp => WPP;
// Serena no Instagram => SERENA-IG; no Messenger => SERENA-MSG. Facilita filtrar na Shopify o que veio do WhatsApp.
const TAG_CANAL = { 'serena': 'WPP', 'serena-wpp': 'WPP', 'whatsapp': 'WPP', 'serena-ig': 'SERENA-IG', 'serena-msg': 'SERENA-MSG' };
if (TAG_CANAL[refSrc] && tagList.indexOf(TAG_CANAL[refSrc]) === -1) { tagList.push(TAG_CANAL[refSrc]); }
