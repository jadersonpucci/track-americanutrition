// Node "Preparar envio imediato" do workflow "Pedido Pago - Confirmação Imediata" (n8n ZIjjSbycPOtiPTQp).
// Chaves reais so no n8n.
// Extrai dados do pedido Shopify e prepara envio IMEDIATO (send_at = agora) de pedido_pago_confirmado.
const order = $input.first().json.body || $input.first().json;

if (!order || !order.id) {
  return [{ json: { erro: true, motivo: 'payload_invalido' } }];
}

let phone = order.customer?.phone || order.billing_address?.phone || order.shipping_address?.phone || order.phone || '';

if (phone) {
  phone = String(phone).replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  if (phone.length < 12 || phone.length > 13) phone = '';
}

if (!phone) {
  return [{ json: { erro: true, motivo: 'sem_phone', order_id: order.id, order_name: order.name } }];
}

const first_name = order.customer?.first_name || 'cliente';
const email = (order.customer?.email || order.email || '').toLowerCase().trim();
const order_name = order.name || ('#' + order.order_number);
const order_id = String(order.id);

// ENVIO IMEDIATO - send_at = momento atual
// O Dispatcher Samuel v3 (roda a cada 1 min) vai pegar este registro na proxima execucao
const send_at = new Date().toISOString();

const template_params = {
  custom_fields: {
    nome: first_name,
    order_name: order_name
  }
};

// ASSINATURA (13/09/2026). O pedido de assinatura (tag ASSINATURA, 1a compra ou renovacao) recebia a mesma
// "Seu pedido foi confirmado!" de uma compra comum. Caso Carlos M.: a renovacao mensal gerou AN-15381 e ele
// respondeu "eu nao fiz nenhum pedido". Agora a confirmacao diz que e assinatura, e se e a primeira (explica
// como funciona) ou uma renovacao (lembra que foi automatica, com desconto, e como pausar/cancelar).
try {
  const tags = String(order.tags || '').split(',').map(t => t.trim().toUpperCase());
  if (tags.indexOf('ASSINATURA') !== -1) {
    const SK = 'SUPABASE_SERVICE_KEY';
    const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''").slice(0, 200) + "'";
    const na = {}; (order.note_attributes || []).forEach(x => { if (x && x.name) na[String(x.name).toLowerCase()] = String(x.value || ''); });
    const pmOrder = na.pagarme_order || '';
    const semPais = d => (d.length >= 12 && d.slice(0, 2) === '55') ? d.slice(2) : d;
    const k = semPais(phone); const ddd = k.slice(0, 2); const fim8 = k.slice(-8);
    const q = "select id, criado_em, ciclo_dias, desconto_pct, proximo_ciclo, metodo, renovacoes, "
      + "exists(select 1 from assinatura_cobrancas c where c.assinatura_id = a.id and (" + (pmOrder ? "c.pagarme_order_id = " + E(pmOrder) + " or c.pix_order_id = " + E(pmOrder) : 'false') + ")) as cobranca_desta "
      + "from assinaturas a where (right(regexp_replace(coalesce(a.whatsapp,''), '\\D', '', 'g'), 8) = " + E(fim8) + " and left(case when length(regexp_replace(coalesce(a.whatsapp,''), '\\D', '', 'g')) >= 12 and left(regexp_replace(coalesce(a.whatsapp,''), '\\D', '', 'g'), 2) = '55' then substr(regexp_replace(coalesce(a.whatsapp,''), '\\D', '', 'g'), 3) else regexp_replace(coalesce(a.whatsapp,''), '\\D', '', 'g') end, 2) = " + E(ddd) + ")"
      + (email ? " or lower(coalesce(a.email,'')) = " + E(email) : '')
      + " order by (a.status = 'ativa') desc, a.atualizado_em desc limit 1";
    const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 15000 });
    const a = (Array.isArray(r) && r[0]) ? r[0] : null;
    let tipo = 'assinatura';
    if (a) {
      const idadeH = (Date.now() - new Date(a.criado_em).getTime()) / 3600000;
      // primeira compra: a assinatura acabou de ser criada (a cobranca inicial nao tem pagarme_order_id na tabela)
      tipo = (idadeH < 48 && !a.cobranca_desta) ? 'primeira' : 'renovacao';
    }
    template_params.custom_fields.assinatura = tipo;
    if (a) {
      template_params.custom_fields.assinatura_ciclo = Number(a.ciclo_dias || 30);
      template_params.custom_fields.assinatura_desconto = Number(a.desconto_pct || 0);
      template_params.custom_fields.assinatura_metodo = String(a.metodo || 'cartao');
      template_params.custom_fields.assinatura_proximo = a.proximo_ciclo ? String(a.proximo_ciclo).slice(0, 10) : '';
    }
  }
} catch (e) { /* sem dado de assinatura: segue com a confirmacao comum */ }

return [{
  json: {
    phone,
    email: email || null,
    first_name,
    template_name: 'pedido_pago_confirmado',
    template_params,
    send_at,
    origem: 'pedido_pago',
    reference_id: 'pago_' + order_id
  }
}];
