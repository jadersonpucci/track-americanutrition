// No 'Normalizar USA' do workflow America Nutrition - Rastreio Personalizado v3 (Pobps91zvSWe9wCA),
// depois de 'Supabase - Buscar Rastreio USA' (que agora tem alwaysOutputData nas configuracoes do no).
//
// 03/11/2026 (AN-16353, UPS 1Z212B90YW25124077): a pagina respondia vazio para codigo dos EUA. A tabela
// rastreios_logistica (que a Shippo alimentaria) so tem linhas de teste de junho, e o no do Supabase tinha o
// "alwaysOutputData" dentro dos parametros, onde nao vale: sem linha, o fluxo parava sem resposta.
// As etiquetas dos EUA hoje sao compradas pelo Shopify Shipping (UPS/USPS), e a Shopify recebe da transportadora
// os eventos do envio. Fonte agora: 1) linha da rastreios_logistica, se existir; 2) fulfillment da Shopify
// (displayStatus, events, estimatedDeliveryAt, deliveredAt).
const self = this;
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const items = $input.all();
let row = null;
if (items.length && items[0].json) {
  const j = items[0].json;
  if (Array.isArray(j)) row = j[0] || null;
  else if (j.codigo_rastreio) row = j;
  else if (j.body && Array.isArray(j.body)) row = j.body[0] || null;
}
const prep = $('Preparar chamada Envia').first().json;
const codigo = String(prep.codigo || '').toUpperCase().trim();
const pedidoIn = prep.pedido;

if (row && row.codigo_rastreio) {
  const eventos = Array.isArray(row.eventos_recentes) ? row.eventos_recentes : [];
  return [{ json: {
    sucesso: true,
    pedido: pedidoIn || (row.pedido_numero ? { numero: row.pedido_numero, data: row.pedido_data, produtos: row.produtos || [] } : null),
    rastreio: {
      codigo: row.codigo_rastreio || codigo,
      transportadora: row.transportadora || 'USPS',
      servico: row.servico || null,
      status_atual: row.status_atual || 'Em transito',
      status_chave: row.status_chave || 'in_transit',
      detalhe_atual: '',
      atrasado: !!row.atrasado,
      previsao_entrega: row.previsao_entrega || null,
      entregue_em: row.entregue_em || null,
      postado_em: row.postado_em || null,
      ultima_atualizacao: row.ultima_atualizacao || null,
      track_url_correios: null,
      destino: { nome: row.cliente_nome || null, cidade: row.cliente_cidade || null, bairro: null, cep: row.destino_cep || null, endereco_completo: row.destino_endereco || null },
      eventos: eventos
    }
  } }];
}

const semDados = () => [{ json: {
  sucesso: false,
  mensagem: 'Seu envio internacional foi registrado. O rastreio sera atualizado assim que a transportadora informar o primeiro evento.',
  rastreio: { codigo: codigo, transportadora: /^1Z/.test(codigo) ? 'UPS' : 'USPS' }
} }];

// ---------- Shopify: fulfillment com este codigo ----------
// Com o numero do pedido busca direto; sem ele (a busca por codigo do inicio do fluxo so ve os 250 pedidos enviados
// mais recentes, umas 2 semanas), procura entre os pedidos dos EUA (tag USA), do mais novo para o mais antigo.
const num = String((pedidoIn && pedidoIn.numero) || '').replace(/\D/g, '');
const CAMPOS = 'name createdAt lineItems(first:10){ nodes{ title quantity sku variantTitle product{ legacyResourceId } variant{ legacyResourceId } } } shippingAddress{ name city provinceCode zip address1 address2 countryCodeV2 } fulfillments{ createdAt displayStatus estimatedDeliveryAt inTransitAt deliveredAt trackingInfo{ company number url } events(first:50){ nodes{ status happenedAt message city province } } }';
async function buscar(q, n, after) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: {
      query: 'query($q:String!,$n:Int!,$a:String){ orders(first:$n, after:$a, query:$q, sortKey:CREATED_AT, reverse:true){ pageInfo{ hasNextPage endCursor } nodes{ ' + CAMPOS + ' } } }',
      variables: { q: q, n: n, a: after || null } } } });
  return (((r || {}).dados || {}).data || {}).orders || { nodes: [], pageInfo: {} };
}
let ped = null, ful = null;
const acha = (nodes) => {
  for (const o of nodes) for (const f of (o.fulfillments || [])) {
    if ((f.trackingInfo || []).some((t) => String(t.number || '').toUpperCase().trim() === codigo)) { ped = o; ful = f; }
  }
};
try {
  if (num) acha((await buscar('name:AN-' + num, 3)).nodes || []);
  let cursor = null;
  for (let pg = 0; !ful && pg < 4; pg++) {
    const res = await buscar('tag:USA', 50, cursor);
    acha(res.nodes || []);
    if (!res.pageInfo || !res.pageInfo.hasNextPage) break;
    cursor = res.pageInfo.endCursor;
  }
} catch (e) { return semDados(); }
if (!ful) return semDados();

const MAPA = {
  CONFIRMED: ['created', 'Envio registrado na transportadora'],
  LABEL_PURCHASED: ['created', 'Etiqueta criada, aguardando a coleta da transportadora'],
  LABEL_PRINTED: ['created', 'Etiqueta criada, aguardando a coleta da transportadora'],
  LABEL_VOIDED: ['exception', 'Etiqueta cancelada'],
  MARKED_AS_FULFILLED: ['created', 'Pedido enviado'],
  CARRIER_PICKED_UP: ['picked_up', 'Pacote coletado pela transportadora'],
  PICKED_UP: ['picked_up', 'Pacote coletado pela transportadora'],
  IN_TRANSIT: ['in_transit', 'Em trânsito'],
  DELAYED: ['in_transit', 'Em trânsito, com atraso informado pela transportadora'],
  READY_FOR_PICKUP: ['out_for_delivery', 'Disponível para retirada na transportadora'],
  OUT_FOR_DELIVERY: ['out_for_delivery', 'Saiu para entrega'],
  ATTEMPTED_DELIVERY: ['exception', 'Tentativa de entrega sem sucesso'],
  NOT_DELIVERED: ['exception', 'Pacote não entregue'],
  DELIVERED: ['delivered', 'Pacote entregue'],
  FAILURE: ['exception', 'Problema na entrega']
};
const traduz = (s) => MAPA[String(s || '').toUpperCase()] || ['in_transit', 'Atualização da transportadora'];
const ondeEv = (e) => [e.city, e.province].filter(Boolean).join('/');

// eventos: mais novo primeiro, como na rota BR
const evs = ((ful.events || {}).nodes || []).slice().sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt)).map((e) => {
  const t = traduz(e.status);
  // na etiqueta a Shopify poe a cidade da cliente: sem cidade, senao parece que o pacote ja esta la
  const onde = t[0] === 'created' ? '' : ondeEv(e);
  return {
    data: e.happenedAt, status: t[1], status_chave: t[0],
    detalhe: t[0] === 'exception' ? String(e.message || '') : '',
    unidade: onde, local_origem: onde.toUpperCase(), local_destino: '', eh_transferencia: false
  };
});
const topo = MAPA[String(ful.displayStatus || '').toUpperCase()] || (evs[0] ? [evs[0].status_chave, evs[0].status] : MAPA.CONFIRMED);
const tracking = (ful.trackingInfo || []).find((t) => String(t.number || '').toUpperCase().trim() === codigo) || {};
const transp = String(tracking.company || (/^1Z/.test(codigo) ? 'UPS' : 'USPS')).replace(/[®™]/g, '').trim();
// a Shopify manda o fim do dia previsto em UTC (05:59:59Z = 23:59 no horario central): volta 6h para pegar o dia certo
let previsao = null;
if (ful.estimatedDeliveryAt && !ful.deliveredAt && topo[0] !== 'exception') {
  const d = new Date(new Date(ful.estimatedDeliveryAt).getTime() - 6 * 3600000);
  if (!isNaN(d)) previsao = d.toISOString().slice(0, 10);
}
const sa = ped.shippingAddress || {};
const coleta = evs.slice().reverse().find((e) => e.status_chave === 'picked_up' || e.status_chave === 'in_transit');
return [{ json: {
  sucesso: true,
  pedido: (pedidoIn && pedidoIn.numero) ? pedidoIn : {
    numero: String(ped.name || '').replace(/\D/g, ''),
    data: ped.createdAt,
    produtos: ((ped.lineItems || {}).nodes || []).map((i) => ({ nome: i.title, quantidade: i.quantity || 1, produto_id: i.product ? Number(i.product.legacyResourceId) : null, variante_id: i.variant ? Number(i.variant.legacyResourceId) : null, variante: i.variantTitle || null, sku: i.sku || null }))
  },
  rastreio: {
    codigo: codigo,
    transportadora: transp,
    servico: null,
    status_atual: topo[1],
    status_chave: topo[0],
    detalhe_atual: topo[0] === 'created' ? 'A etiqueta já foi criada. Assim que a ' + transp + ' coletar o pacote, o rastreio começa a mostrar o caminho até você.' : (topo[0] === 'exception' ? ((evs[0] && evs[0].detalhe) || ('A ' + transp + ' não conseguiu entregar o pacote. Fale com a gente pelo WhatsApp para resolvermos.')) : ''),
    atrasado: String(ful.displayStatus || '') === 'DELAYED',
    previsao_entrega: previsao,
    entregue_em: ful.deliveredAt || null,
    recebido_por: null,
    postado_em: coleta ? coleta.data : (ful.inTransitAt || null),
    ultima_atualizacao: evs[0] ? evs[0].data : ful.createdAt,
    track_url_correios: tracking.url || null,
    destino: {
      nome: sa.name || null,
      cidade: [sa.city, sa.provinceCode].filter(Boolean).join('/') || null,
      bairro: null,
      cep: sa.zip || null,
      endereco_completo: [sa.address1, sa.address2, [sa.city, sa.provinceCode].filter(Boolean).join('/'), sa.zip, sa.countryCodeV2].filter(Boolean).join(' · ')
    },
    eventos: evs
  }
} }];
