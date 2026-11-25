// No 'Nome do Desconto' do workflow "Pagar.me — Confirmação Pago → Shopify" (dtDYBZJuAbFZV3cB), entre
// 'Truncar Tags (max 40)' e 'Criar Pedido Shopify'. 22/11/2026, pedido do Jaderson ("salvar o nome do cupom real").
// O checkout manda só itens e total; o pedido nascia com discount_codes = [{ code: 'DESCONTO' }] quando o desconto era
// automático (PACK, Kit Mensal, Black Friday). Aqui o pedido pergunta ao mesmo cálculo do checkout
// (POST /webhook/carrinho-calcular, carrinho da Shopify) qual desconto foi aplicado e grava o nome real:
//  - o cálculo devolve o próprio código quando o desconto é de cupom (ESQ15-U5E, promo5): nada muda;
//  - devolve o nome do desconto automático quando é ele que vale ("PACK 6+", "Black Friday 40% OFF"): troca o código,
//    se o valor bater (diferença de até R$ 1). Na Black, com cupom de afiliado (0%), o desconto real é o da Black:
//    o pedido fica "Black Friday 40% OFF" e a representante continua identificada pela anotação "Cupom usado".
// Se o cálculo falhar ou o valor não bater, o pedido segue como antes. Nenhuma chave aqui.
const CARRINHO = 'https://n8n.americanutrition.com/webhook/carrinho-calcular';
const out = [];
for (const it of $input.all()) {
  const j = it.json || {};
  try {
    const order = j.shopifyBody && j.shopifyBody.order;
    const dc = order && Array.isArray(order.discount_codes) ? order.discount_codes : [];
    if (order && dc.length === 1 && dc[0] && dc[0].code) {
      const atual = String(dc[0].code);
      const generico = atual.toUpperCase() === 'DESCONTO';
      const cupom = generico ? String(j.cupom_real || '').split(',')[0].trim() : atual;
      const items = (order.line_items || []).filter((l) => l && l.variant_id).map((l) => ({ variant_id: String(l.variant_id), qty: Number(l.quantity) || 1 }));
      if (items.length) {
        const r = await this.helpers.httpRequest({ method: 'POST', url: CARRINHO, json: true, timeout: 8000, body: { items: items, code: cupom } });
        const label = r && r.ok ? String(r.discount_label || '').trim() : '';
        const bate = r && Math.abs(Number(r.discount || 0) - Number(dc[0].amount || 0)) <= 1;
        if (label && bate && label.toLowerCase() !== atual.toLowerCase()) {
          order.discount_codes = [Object.assign({}, dc[0], { code: label.slice(0, 250) })];
          j.desconto_nome = { antes: atual, depois: label };
        }
      }
    }
  } catch (e) { /* segue com o nome que veio */ }
  out.push({ json: j });
}
return out;
