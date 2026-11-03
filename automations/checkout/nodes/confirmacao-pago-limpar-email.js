// Trecho do no "Truncar Tags (max 40)" do workflow "Pagar.me — Confirmação Pago → Shopify" (dtDYBZJuAbFZV3cB),
// logo antes da criacao do pedido. O no completo carrega a chave do Supabase, por isso aqui fica so o trecho.
// 03/11/2026: e-mail digitado com ".." (veronica2008pb@gmail..com em 01/11, contato@fabianorover..com.br em 27/09) fazia a
// Shopify recusar o pedido: o PIX caia e o pedido nao nascia (so o alerta "cobranca paga SEM pedido"). Limpa o e-mail;
// se continuar invalido, o pedido sai sem e-mail (o cliente segue identificado por nome, CPF e telefone).
if (order) {
  try {
    const limpa = function (e) {
      let s = String(e || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\.{2,}/g, '.').replace(/\.@/g, '@').replace(/@\./g, '@').replace(/^\.+|\.+$/g, '');
      return /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/.test(s) ? s : '';
    };
    const em = limpa(order.email || (order.customer && order.customer.email));
    if (em) { order.email = em; if (order.customer) order.customer.email = em; }
    else { delete order.email; if (order.customer) delete order.customer.email; }
  } catch (eEm) {}
}
