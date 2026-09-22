// Aviso WhatsApp para o Paulo (linha Samuel) — texto + PDF da etiqueta
let created = null;
try { created = $('Create Shopify Order').item.json; } catch(e) { created = null; }
const o = created && (created.order || created);
if (!o || !o.id) { return []; }
const br = $('Build Row').item.json;
let md = {}; try { md = $('Get PI').item.json.metadata || {}; } catch(e) {}
let label = ''; try { label = $('Derive Label').item.json.order_label || ''; } catch(e) {}
let et = {}; try { et = $('Etiqueta US').item.json || {}; } catch(e) {}
let mv = {}; try { mv = $('Mover p/ Estados Unidos').item.json || {}; } catch(e) {}
const nome = ((md.first_name||'')+' '+(md.last_name||'')).trim();
const fone = ((md.ddi||'')+' '+(md.phone||'')).trim();
const total = o.total_price ? Number(o.total_price).toFixed(2) : (((Number(br.subtotal_usd)||0)-(Number(br.discount_usd)||0)+(Number(br.shipping_usd)||0)).toFixed(2));
const ship = (o.shipping_lines && o.shipping_lines[0] && o.shipping_lines[0].title) || 'Standard Shipping';
const sa = o.shipping_address || {};
const local = [sa.city||md.city||'', sa.province_code||sa.province||md.state||'', sa.zip||md.zip||''].filter(Boolean).join(', ');
const pedido = label || o.name || '';
const L = [];
L.push('Olá, *Paulo*! 👋');
L.push('');
L.push('🇺🇸 *NOVA COMPRA — USA*');
L.push('');
L.push('📦 Pedido: *'+pedido+'*');
if (nome) L.push('👤 Cliente: '+nome);
if (o.email || md.email) L.push('✉️ '+(o.email||md.email));
if (fone) L.push('📱 '+fone);
L.push('🧴 Qtd: '+(br.qty||1)+' un');
L.push('💵 Total: *US$ '+total+'*');
L.push('🚚 '+ship);
if (local) L.push('📍 '+local);
if (br.coupon) L.push('🎟️ Cupom: '+br.coupon);
if (br.aff_ref) L.push('🤝 Afiliado: '+br.aff_ref);
if (br.addr_missing) { L.push(''); L.push('⚠️ *ENDERECO INCOMPLETO* — confirmar com o cliente antes de enviar.'); }
if (mv.movido === false && mv.motivo) {
  L.push('');
  L.push('⚠️ *Pedido não foi movido pro local Estados Unidos*: '+mv.motivo);
  L.push('_Mudar o local de processamento na Shopify antes de gerar a etiqueta._');
} else if (mv.movido && !mv.ja_estava) {
  L.push('🏬 Local: Estados Unidos (movido automaticamente'+(mv.local_origem?' de '+mv.local_origem:'')+')');
}
if (et.tracking_number) {
  L.push('');
  L.push('🏷️ *Etiqueta emitida* — segue em PDF');
  L.push('📮 '+((et.tracking_company||'')+' '+et.tracking_number).trim());
} else if (et.motivo) {
  L.push('');
  L.push('⚠️ Etiqueta não emitida automaticamente: '+et.motivo);
  L.push('_Gerar manualmente no painel da Shopify._');
}
if (et.carrier_aviso) {
  L.push('');
  L.push('🚚 '+et.carrier_aviso);
}
if (et.customs_aviso) {
  L.push('');
  L.push('🛃 '+et.customs_aviso);
}
L.push('');
L.push('🧬 America Nutrition');
const texto = L.join('\n');
const numero = '14076401173';
if (et.label_url) {
  return [{ json: { endpoint: 'sendMedia', body: { number: numero, mediatype: 'document', mimetype: 'application/pdf', media: et.label_url, fileName: 'etiqueta-'+(pedido||'US')+'.pdf', caption: texto, delay: 800 } } }];
}
return [{ json: { endpoint: 'sendText', body: { number: numero, text: texto, delay: 800 } } }];

