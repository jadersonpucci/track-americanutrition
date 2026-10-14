// No 'Marcar Pedido' do workflow [Serena] Nota Fiscal no Pedido (cron 10 min).
// Cliente pediu nota fiscal na conversa -> tag NOTA FISCAL no pedido da Shopify, para a equipe filtrar
// os pedidos que precisam de nota sem ler conversa por conversa.
//
// Qual pedido recebe a tag:
//   1. o numero que o cliente citou (AN-15902, #15902);
//   2. senao, o pedido mais recente dele, nao cancelado, feito nos ultimos 30 dias;
//   3. senao (cliente pediu nota ANTES de comprar: "preciso de nota com CNPJ"), fica aguardando_pedido
//      por 7 dias e marca o primeiro pedido que ele fizer depois do pedido de nota.
// A descricao que a Entrada escreve para foto/PDF ("[Cliente enviou uma imagem: ... nao e nota fiscal ...]")
// nao e o cliente falando: so conta a legenda. Audio transcrito conta.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const novos = Array.isArray(d.novos) ? d.novos : [];
const pendentes = Array.isArray(d.pendentes) ? d.pendentes : [];
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const BUSCAR_TEL = 'https://n8n.americanutrition.com/webhook/buscar-pedidos-telefone';
const TAG = String(cfg.tag || 'NOTA FISCAL').trim();
const JANELA_DIAS = 30;
const self = this;
const saida = [];
if (String(cfg.ativo || 'on') !== 'on') return [{ json: { payload: '[]', desligado: true } }];

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function falaDoCliente(texto) {
  let t = String(texto || '');
  if (/^\s*\[\s*(cliente|contato)\s+enviou/i.test(t)) {
    const i = t.toLowerCase().lastIndexOf('legenda do cliente:');
    t = i >= 0 ? t.slice(i + 'legenda do cliente:'.length) : '';
  }
  return t.replace(/^\s*\[audio do cliente[^\]]*\]\s*:?/i, '').trim();
}
function pedeNota(texto) {
  const t = norm(falaDoCliente(texto));
  if (!t) return false;
  if (/nota fiscal|cupom fiscal|\bdanfe\b|\bnfs?-?e?\b/.test(t)) return true;
  return /\bnota\b.{0,25}\b(da compra|do pedido|do produto|para reembolso|pra reembolso|reembolso|imposto|cnpj|cpf|empresa)\b/.test(t);
}
function pedidoCitado(texto) {
  const t = falaDoCliente(texto);
  const m = t.match(/\bAN[-\s]?(\d{4,6})(-BR)?\b/i) || t.match(/#\s?(\d{4,6})\b/);
  return m ? ('AN-' + m[1] + (m[2] ? '-BR' : '')) : null;
}

const gql = async (query, variables) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const dd = r && r.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 200));
  return dd.data;
};
const CAMPOS = 'id name createdAt cancelledAt tags';
async function customerDe(it) {
  if (it.customer_id) return String(it.customer_id);
  if (!it.telefone) return null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: BUSCAR_TEL, json: true, timeout: 20000, body: { telefone: it.telefone } });
    return (r && r.encontrado && r.customer_id) ? String(r.customer_id) : null;
  } catch (e) { return null; }
}
async function escolherPedido(it, soDepoisDoPedido) {
  const citado = pedidoCitado(it.texto);
  if (citado) {
    const o = await gql('query($q:String!){ orders(first:1, query:$q){ nodes { ' + CAMPOS + ' } } }', { q: 'name:' + citado });
    const n = o && o.orders && o.orders.nodes && o.orders.nodes[0];
    if (n) return { pedido: n, como: 'citado' };
  }
  const cid = await customerDe(it);
  if (!cid) return { pedido: null, como: 'sem_cliente' };
  const o = await gql('query($q:String!){ orders(first:10, sortKey:CREATED_AT, reverse:true, query:$q){ nodes { ' + CAMPOS + ' } } }', { q: 'customer_id:' + cid });
  const lista = ((o && o.orders && o.orders.nodes) || []).filter(n => !n.cancelledAt);
  const pedidoEm = new Date(it.criado_em).getTime();
  // margem de 1h: quem paga e logo pede a nota tem o pedido criado minutos antes da mensagem
  const desde = soDepoisDoPedido ? pedidoEm - 3600000 : pedidoEm - JANELA_DIAS * 86400000;
  const recente = lista.find(n => new Date(n.createdAt).getTime() >= desde);
  return recente ? { pedido: recente, como: soDepoisDoPedido ? 'pedido_novo' : 'mais_recente' } : { pedido: null, como: 'sem_pedido_recente' };
}
async function marcar(p) {
  if ((p.tags || []).indexOf(TAG) >= 0) return 'ja_tinha';
  const r = await gql('mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors { message } } }', { id: p.id, tags: [TAG] });
  const ue = r && r.tagsAdd && r.tagsAdd.userErrors;
  if (ue && ue.length) throw new Error('tagsAdd: ' + ue.map(e => e.message).join('; '));
  return 'marcado';
}

// pedidos novos de nota
for (const it of novos) {
  if (!pedeNota(it.texto)) { saida.push({ acao: 'registrar', msg_id: it.msg_id, contato_id: it.contato_id, telefone: it.telefone, texto: String(it.texto || '').slice(0, 300), status: 'ignorado', detalhe: 'nao pede nota' }); continue; }
  const reg = { acao: 'registrar', msg_id: it.msg_id, contato_id: it.contato_id, telefone: it.telefone, texto: falaDoCliente(it.texto).slice(0, 300) };
  try {
    const e = await escolherPedido(it, false);
    if (e.pedido) {
      const r = await marcar(e.pedido);
      Object.assign(reg, { status: 'marcado', pedido: e.pedido.name, pedido_gid: e.pedido.id, detalhe: e.como + (r === 'ja_tinha' ? ', tag ja existia' : '') });
    } else {
      Object.assign(reg, { status: 'aguardando_pedido', detalhe: e.como });
    }
  } catch (err) {
    // erro de Shopify: fica aguardando e o proximo ciclo tenta de novo
    Object.assign(reg, { status: 'aguardando_pedido', detalhe: 'erro: ' + String(err.message || err).slice(0, 200) });
  }
  saida.push(reg);
}

// pediu nota antes de comprar: marca o primeiro pedido feito depois
for (const it of pendentes) {
  const upd = { acao: 'atualizar', id: it.id };
  try {
    const e = await escolherPedido(it, true);
    if (e.pedido) {
      const r = await marcar(e.pedido);
      Object.assign(upd, { status: 'marcado', pedido: e.pedido.name, pedido_gid: e.pedido.id, detalhe: e.como + (r === 'ja_tinha' ? ', tag ja existia' : '') });
    } else {
      Object.assign(upd, { status: 'aguardando_pedido', detalhe: e.como });
    }
  } catch (err) {
    Object.assign(upd, { status: 'aguardando_pedido', detalhe: 'erro: ' + String(err.message || err).slice(0, 200) });
  }
  saida.push(upd);
}

return [{ json: {
  payload: JSON.stringify(saida),
  marcados: saida.filter(s => s.status === 'marcado').map(s => s.pedido),
  aguardando: saida.filter(s => s.status === 'aguardando_pedido').length,
  ignorados: saida.filter(s => s.status === 'ignorado').length
} }];
