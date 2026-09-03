const acao = $('Montar SQL').first().json.acao;
const linhas = $input.all().map(i => i.json).filter(r => r && Object.keys(r).length);
const post = async (url, body, t) => { try { return await this.helpers.httpRequest({ method: 'POST', url: url, json: true, timeout: t || 25000, body: body }); } catch (e) { return null; } };
const LOJA = 'https://admin.shopify.com/store/39c4f8-2';
const TRACK = 'https://track.americanutrition.com/';

if (acao === 'ficha360') {
  const d = linhas[0];
  if (!d) return [{ json: { ok: false, acao: acao, erro: 'contato nao encontrado' } }];

  // 1) cliente Shopify: por telefone (com variacoes de 9o digito), depois por email
  const tel = String(d.tel_digits || '');
  let busca = null;
  if (tel.length >= 10) busca = await post('https://n8n.americanutrition.com/webhook/buscar-pedidos-telefone', { telefone: tel });
  if ((!busca || !busca.encontrado) && d.email) busca = await post('https://n8n.americanutrition.com/webhook/buscar-cliente-email', { email: d.email });
  const cid = (busca && busca.encontrado && busca.customer_id) || d.shopify_customer_id || null;

  // 2) ficha completa do cliente + pedidos com ids e rastreio (tudo direto da Shopify)
  let shopify = null, pedidos = [], cadastro = null;
  if (cid) {
    const rs = await Promise.all([
      post('https://n8n.americanutrition.com/webhook/shopify-admin', { acao: 'consultar', endpoint: 'customers/' + cid + '.json' }),
      post('https://n8n.americanutrition.com/webhook/shopify-admin', { acao: 'consultar', endpoint: 'customers/' + cid + '/orders.json', params: { status: 'any', limit: 8 } })
    ]);
    const cu = rs[0] && rs[0].ok && rs[0].dados && rs[0].dados.customer;
    if (cu) {
      const ad = cu.default_address || {};
      shopify = { id: cu.id, nome: [cu.first_name, cu.last_name].filter(Boolean).join(' '), email: cu.email, telefone: cu.phone, pedidos: cu.orders_count, total_gasto: cu.total_spent, tags: cu.tags, criado_em: cu.created_at, cidade: [ad.city, ad.province_code].filter(Boolean).join('/') || null, nota: cu.note, admin_url: LOJA + '/customers/' + cu.id };
      cadastro = { endereco: [ad.address1, ad.address2].filter(Boolean).join(', ') || null, bairro: null, cep: ad.zip || null, cidade: ad.city || null, estado: ad.province || null, pais: ad.country || null, email_marketing: cu.email_marketing_consent ? cu.email_marketing_consent.state : null, sms_marketing: cu.sms_marketing_consent ? cu.sms_marketing_consent.state : null, cliente_desde: cu.created_at, ultima_atualizacao: cu.updated_at };
    }
    const orders = (rs[1] && rs[1].ok && rs[1].dados && rs[1].dados.orders) || [];
    pedidos = orders.map(o => {
      const f = (o.fulfillments || []).find(x => x.tracking_number) || (o.fulfillments || [])[0] || {};
      let st = 'Aguardando';
      if (o.cancelled_at) st = 'Cancelado';
      else if (o.financial_status === 'refunded') st = 'Reembolsado';
      else if (o.fulfillment_status === 'fulfilled') st = 'Enviado';
      else if (o.fulfillment_status === 'partial') st = 'Envio parcial';
      else if (o.financial_status === 'paid') st = 'Pago, em separacao';
      else if (o.financial_status === 'pending') st = 'Aguardando pagamento';
      const na = {};
      (o.note_attributes || []).forEach(x => { if (x && x.name) na[String(x.name).toLowerCase()] = x.value; });
      return { id: o.id, numero: o.name, data: o.created_at, status: st, financeiro: o.financial_status, valor: o.total_price, itens: (o.line_items || []).map(i => i.quantity + 'x ' + i.title), rastreio: f.tracking_number || null, transportadora: f.tracking_company || null, link_rastreio: f.tracking_number ? TRACK + encodeURIComponent(f.tracking_number) : null, admin_url: LOJA + '/orders/' + o.id, cidade: o.shipping_address ? [o.shipping_address.city, o.shipping_address.province_code].filter(Boolean).join('/') : null, cupom: (o.discount_codes || []).map(x => x.code).join(', ') || null, gateway: o.gateway || (o.payment_gateway_names || [])[0] || null, note_attributes: na };
    });
    if (cadastro && pedidos.length) {
      const u = pedidos[0];
      const optin = Object.keys(u.note_attributes || {}).find(k => /whats|opt/.test(k));
      cadastro.optin_whatsapp = optin ? String(u.note_attributes[optin]) : null;
      cadastro.ultimo_pedido = { numero: u.numero, data: u.data, valor: u.valor, itens: u.itens, cupom: u.cupom, pagamento: u.gateway };
    }
  } else if (busca && busca.encontrado && Array.isArray(busca.pedidos)) {
    pedidos = busca.pedidos.map(p => ({ numero: p.numero, data: p.data, status: p.status, valor: p.valor_total, itens: [p.itens], rastreio: p.rastreio, transportadora: p.transportadora, link_rastreio: p.rastreio ? TRACK + encodeURIComponent(p.rastreio) : null }));
  }

  // 3) rastreio ao vivo do ultimo pedido com codigo (mesmo motor do track.americanutrition.com)
  let rastreio = null;
  const pr = pedidos.find(p => p.rastreio);
  if (pr) {
    const rr0 = await post('https://n8n.americanutrition.com/webhook/rastreio/buscar', { modo: 'codigo', codigo: pr.rastreio }, 30000);
    const rr = rr0 && (rr0.body || rr0);
    const x = (rr && rr.sucesso && rr.rastreio) || null;
    const ev = (x && Array.isArray(x.eventos) ? x.eventos : []).filter(e => !e.eh_importacao);
    rastreio = { pedido: pr.numero, codigo: pr.rastreio, transportadora: pr.transportadora, link: pr.link_rastreio, status: x ? (x.status_atual || null) : 'Sem movimentacao ainda', status_chave: x ? (x.status_chave || null) : null, entregue: !!(x && (x.status_chave === 'delivered' || /entreg/i.test(x.status_atual || ''))), atrasado: !!(x && x.atrasado), previsao: x ? (x.previsao_entrega || null) : null, onde: ev[0] ? (ev[0].local_destino || ev[0].local_origem || null) : null, ultimo_evento: ev[0] ? { data: ev[0].data, status: ev[0].status } : null, recebido_por: (x && x.comprovante && x.comprovante.recebido_por) || null };
  }

  const clube = d.clube || null;
  if (clube) { const lt = Number(clube.lifetime || 0); clube.nivel = lt >= 5000 ? 'BLACK' : (lt >= 2500 ? 'GOLD' : (lt >= 1000 ? 'SILVER' : 'BLUE')); }

  const contato = { id: d.id, nome: d.nome, sobrenome: d.sobrenome, telefone: d.telefone, email: d.email, lifecycle: d.lifecycle, tags: d.tags, criado_em: d.criado_em, canal_atual: d.canal_atual, ia_pausada: d.ia_pausada, pausa_wpp: d.pausa_wpp, bloqueado: !!d.bloqueado, msgs_cliente: d.msgs_cliente, msgs_serena: d.msgs_serena, msgs_humano: d.msgs_humano, primeira_msg: d.primeira_msg, ultima_msg: d.ultima_msg };
  return [{ json: { ok: true, acao: acao, dados: { contato: contato, shopify: shopify, cadastro: cadastro, pedidos: pedidos, rastreio: rastreio, assinatura: d.assinatura || null, clube: clube, carrinho: d.carrinho || null, popup: d.popup || null, reviews: d.reviews || [], disparos: d.disparos || [], optout: !!d.optout, bloqueado: !!d.bloqueado, origem: d.origem || null, fatos: d.fatos || [], etiquetas: d.etiquetas || [], canais: d.canais || [], atribuicao: d.atribuicao || null, correcoes: d.correcoes || [], trocas: d.trocas || [], lacunas: d.lacunas || [] } } }];
}

if (acao === 'metricas') {
  const d = linhas[0] || {};
  const contatos = Array.isArray(d.contatos) ? d.contatos : [];
  delete d.contatos;
  const vendas = { n: 0, total: 0, pedidos: [], erro: null };
  if (contatos.length && d.desde) {
    const r = await post('https://n8n.americanutrition.com/webhook/shopify-admin', { acao: 'consultar', endpoint: 'orders.json', params: { status: 'any', financial_status: 'paid', created_at_min: d.desde, limit: 250, fields: 'id,name,created_at,total_price,email,phone,customer,shipping_address,billing_address' } }, 40000);
    const orders = (r && r.ok && r.dados && r.dados.orders) || null;
    if (!orders) vendas.erro = 'nao foi possivel consultar a Shopify';
    else {
      const porTel = {}, porEmail = {};
      for (const c of contatos) { if (c.telefone && c.telefone.length >= 10) { porTel[c.telefone] = c; if (c.telefone.length === 13) porTel[c.telefone.slice(0, 4) + c.telefone.slice(5)] = c; } if (c.email) porEmail[c.email] = c; }
      for (const o of orders) {
        const tels = [o.phone, o.customer && o.customer.phone, o.shipping_address && o.shipping_address.phone, o.billing_address && o.billing_address.phone].filter(Boolean).map(t => String(t).replace(/\D/g, '')).map(t => (t.length >= 10 && t.length <= 11) ? '55' + t : t);
        const em = String(o.email || (o.customer && o.customer.email) || '').toLowerCase();
        let c = null;
        for (const t of tels) { if (porTel[t]) { c = porTel[t]; break; } if (t.length === 13 && porTel[t.slice(0, 4) + t.slice(5)]) { c = porTel[t.slice(0, 4) + t.slice(5)]; break; } }
        if (!c && em && porEmail[em]) c = porEmail[em];
        if (!c) continue;
        const t0 = new Date(c.primeira_serena).getTime(), t1 = new Date(c.ultima_serena).getTime() + 72 * 3600000, tc = new Date(o.created_at).getTime();
        if (tc < t0 - 3600000 || tc > t1) continue;
        vendas.n += 1; vendas.total += Number(o.total_price || 0);
        vendas.pedidos.push({ numero: o.name, valor: o.total_price, data: o.created_at, contato_id: c.id, admin_url: LOJA + '/orders/' + o.id });
      }
      vendas.total = Math.round(vendas.total * 100) / 100;
      vendas.pedidos_analisados = orders.length;
    }
  }
  d.vendas_atribuidas = vendas;
  d.autonomia_pct = d.conversas ? Math.round(100 * Number(d.so_serena || 0) / Number(d.conversas)) : null;
  return [{ json: { ok: true, acao: acao, dados: d } }];
}

if (acao === 'stats' || acao === 'setup' || acao === 'contato' || acao === 'pausar' || acao === 'enviar' || acao === 'bloquear' || acao === 'atribuir' || acao === 'nota' || acao === 'corrigir' || acao === 'etiquetar' || acao === 'pronta_salvar' || acao === 'pronta_apagar' || acao === 'push_sub' || acao === 'push_unsub' || acao === 'resumo_salvar' || acao === 'lacuna_resolver' || acao === 'troca_status' || acao === 'desbloquear') {
  const d = linhas[0] || null;
  let aviso = null;
  if (acao === 'enviar' && d && d.entregue === false) {
    aviso = 'Mensagem gravada, mas ainda nao existe adaptador de saida para o canal ' + (d.canal || '?') + '. Ela sera entregue quando o canal for conectado.';
  }
  if (acao === 'setup' && d) { d.etiquetas = String(d.etiquetas || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }
  return [{ json: { ok: true, acao: acao, dados: d, aviso: aviso } }];
}
if (acao === 'thread' ) {
  return [{ json: { ok: true, acao: acao, dados: linhas.slice().reverse() } }];
}
if (acao === 'novas' || acao === 'agentes' || acao === 'prontas') {
  return [{ json: { ok: true, acao: acao, dados: linhas } }];
}
return [{ json: { ok: true, acao: acao, total: linhas.length, dados: linhas } }];
