// Regras de estoque no modelo da Shopify (o mesmo que supabase/loja.sql faz no servidor):
//  - cada variante tem, por local: em mãos e comprometido; disponível = em mãos − comprometido
//  - pedido pago e ainda não enviado → comprometido (reserva); enviado → sai de em mãos e da reserva;
//    cancelado antes de enviar → reserva liberada; devolvido depois de enviado → volta para em mãos
//  - a loja online vende o disponível dos locais marcados "online"; esgotado quando chega a zero,
//    a não ser que a variante esteja como "vender sem estoque"
export const MOTIVOS = {
  correcao: 'Correção', contagem: 'Contagem de estoque', recebido: 'Recebimento', danificado: 'Danificado', perda: 'Roubo ou perda',
  promocao: 'Promoção ou doação', transferencia: 'Transferência', devolucao: 'Devolução', pedido: 'Pedido', importado: 'Importado da Shopify', outro: 'Outro',
};
// efeito de cada estado do pedido sobre o estoque, em relação a "nada" ([em mãos, comprometido] por unidade)
const EFEITO = { '': [0, 0], reservado: [0, 1], baixado: [-1, 0], devolvido: [0, 0] };
const TEXTO = { 'reservado': 'Reservado para o pedido', 'reservado>baixado': 'Pedido enviado', '>baixado': 'Pedido enviado', 'reservado>': 'Reserva liberada (pedido cancelado)', 'baixado>devolvido': 'Pedido devolvido', 'devolvido>baixado': 'Pedido reenviado' };

export const nivel = (s, vid, lid) => (s.estoque || []).find((n) => n.variante_id === String(vid) && n.local_id === lid);
export const niveisDe = (s, vid) => (s.estoque || []).filter((n) => n.variante_id === String(vid));
export const disp = (n) => (n?.em_maos || 0) - (n?.comprometido || 0);
export const locaisOnline = (s) => (s.locais || []).filter((l) => l.ativo !== false && l.online).map((l) => l.id);
// controla quantidade? (explícito na variante; sem a marcação, só se já tem posição de estoque).
// Kit (variante com "componentes") não tem estoque próprio: segue o dos componentes.
export const ehKit = (v) => (v.componentes || []).length > 0;
export const rastreia = (s, v) => !ehKit(v) && (v.rastrear ?? niveisDe(s, v.id).length > 0);
export const dispOnline = (s, vid) => { const on = locaisOnline(s); return niveisDe(s, vid).filter((n) => on.includes(n.local_id)).reduce((t, n) => t + disp(n), 0); };
// itens de pedido "abertos": kit vira os componentes
export function expandir(s, itens) {
  const out = [];
  for (const it of itens || []) {
    const vi = variantes(s).find((x) => String(x.v.id) === String(it.variante_id));
    if (vi && ehKit(vi.v)) for (const c of vi.v.componentes) out.push({ variante_id: String(c.variante_id), qtd: (Number(it.qtd) || 0) * (Number(c.qtd) || 1), kit: it.variante_id, item: it });
    else out.push({ variante_id: String(it.variante_id), qtd: Number(it.qtd) || 0, item: it });
  }
  return out;
}

export function variantes(s) {
  const out = [];
  for (const p of s.produtos || []) for (const v of p.variantes || []) out.push({ p, v });
  return out;
}

// recalcula estoque/disponível das variantes (o que a vitrine usa); devolve as que mudaram de disponibilidade
export function sincronizar(s, ids = null) {
  const on = locaisOnline(s), mudou = [];
  for (const { p, v } of variantes(s)) {
    let q;
    if (ehKit(v)) {   // quantos kits completos dá para montar
      if (ids && !ids.includes(String(v.id)) && !v.componentes.some((c) => ids.includes(String(c.variante_id)))) continue;
      q = Math.max(0, Math.min(...v.componentes.map((c) => Math.floor(niveisDe(s, c.variante_id).filter((n) => on.includes(n.local_id)).reduce((t, n) => t + disp(n), 0) / (Number(c.qtd) || 1)))));
    } else {
      if (ids && !ids.includes(String(v.id))) continue;
      if (!rastreia(s, v)) continue;
      q = niveisDe(s, v.id).filter((n) => on.includes(n.local_id)).reduce((t, n) => t + disp(n), 0);
    }
    const ok = !!v.vender_sem_estoque || q > 0;
    if (ok !== v.disponivel) mudou.push({ produto: p.titulo, variante: v.titulo, disponivel: ok });
    v.estoque = q; v.disponivel = ok;
  }
  return mudou;
}

export function mover(s, { variante_id, local_id, em_maos = 0, comprometido = 0, motivo = 'correcao', nota = null, pedido = null, usuario = null }) {
  if (!em_maos && !comprometido) return null;
  s.estoque = s.estoque || []; s.estoque_mov = s.estoque_mov || [];
  let n = nivel(s, variante_id, local_id);
  if (!n) { n = { variante_id: String(variante_id), local_id, em_maos: 0, comprometido: 0 }; s.estoque.push(n); }
  n.em_maos += em_maos; n.comprometido = Math.max(0, n.comprometido + comprometido); n.atualizado_em = new Date().toISOString();
  const m = { id: Date.now() + Math.random(), criado_em: n.atualizado_em, variante_id: String(variante_id), local_id, em_maos, comprometido, saldo_em_maos: n.em_maos, saldo_comprometido: n.comprometido, motivo, nota, pedido_id: pedido?.id || null, pedido_numero: pedido?.numero || null, usuario };
  s.estoque_mov.unshift(m);
  if (s.estoque_mov.length > 5000) s.estoque_mov.length = 5000;
  return m;
}

// local que atende o item: o online com mais disponível daquela variante
function localPara(s, vid) {
  const on = (s.locais || []).filter((l) => l.ativo !== false && l.online).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  if (!on.length) return (s.locais || [])[0]?.id;
  return on.map((l) => [l.id, disp(nivel(s, vid, l.id))]).sort((a, b) => b[1] - a[1])[0][0];
}

function alvoDo(p) {
  const e = p.estoque_estado || '';
  if (p.status_entrega === 'devolvido') return ['baixado', 'devolvido'].includes(e) ? 'devolvido' : '';
  if (['pago', 'parcial'].includes(p.status_pagamento)) return ['enviado', 'entregue'].includes(p.status_entrega) ? 'baixado' : 'reservado';
  return e === 'baixado' ? 'baixado' : '';   // cancelado depois de enviado: a mercadoria já saiu
}

// aplica no estoque a diferença entre o estado atual do pedido e o que o status pede
export function pedidoEstoque(s, p, usuario = null) {
  if (p.estoque_estado === 'importado') return [];
  const de = p.estoque_estado || '', para = alvoDo(p);
  if (de === para) return [];
  const [a0, c0] = EFEITO[de], [a1, c1] = EFEITO[para];
  const ids = [];
  for (const l of expandir(s, p.itens)) {
    const vi = variantes(s).find((x) => String(x.v.id) === l.variante_id);
    if (!vi || !rastreia(s, vi.v)) continue;
    const it = l.item;
    it.locais = it.locais || (it.local_id ? { [it.variante_id]: it.local_id } : {});
    const loc = it.locais[l.variante_id] || localPara(s, l.variante_id);
    it.locais[l.variante_id] = loc;
    if (!l.kit) it.local_id = loc;
    mover(s, { variante_id: l.variante_id, local_id: loc, em_maos: (a1 - a0) * l.qtd, comprometido: (c1 - c0) * l.qtd, motivo: para === 'devolvido' ? 'devolucao' : 'pedido', nota: (TEXTO[de + '>' + para] || TEXTO[para] || 'Pedido') + (l.kit ? ' (kit)' : ''), pedido: p, usuario });
    ids.push(l.variante_id);
  }
  p.estoque_estado = para || null;
  return sincronizar(s, ids);
}

// ajuste manual: {variante_id, local_id, em_maos (novo total) | delta, motivo, nota}
export function ajustar(s, itens, usuario) {
  const ids = [];
  for (const x of itens) {
    const atual = nivel(s, x.variante_id, x.local_id)?.em_maos || 0;
    const d = x.em_maos != null ? Number(x.em_maos) - atual : Number(x.delta) || 0;
    if (mover(s, { variante_id: x.variante_id, local_id: x.local_id, em_maos: d, motivo: x.motivo || 'correcao', nota: x.nota || null, usuario })) ids.push(String(x.variante_id));
    const vi = variantes(s).find((y) => String(y.v.id) === String(x.variante_id));
    if (vi && vi.v.rastrear == null) vi.v.rastrear = true;
  }
  return sincronizar(s, ids);
}

export function transferir(s, { de, para, itens, nota }, usuario) {
  const ids = [];
  const nde = (s.locais || []).find((l) => l.id === de)?.nome, npara = (s.locais || []).find((l) => l.id === para)?.nome;
  for (const x of itens) {
    const q = Number(x.qtd) || 0; if (!q) continue;
    mover(s, { variante_id: x.variante_id, local_id: de, em_maos: -q, motivo: 'transferencia', nota: `Para ${npara}${nota ? ' · ' + nota : ''}`, usuario });
    mover(s, { variante_id: x.variante_id, local_id: para, em_maos: q, motivo: 'transferencia', nota: `De ${nde}${nota ? ' · ' + nota : ''}`, usuario });
    ids.push(String(x.variante_id));
  }
  return sincronizar(s, ids);
}

// vendas por variante nos últimos N dias (pedidos pagos; kits abertos nos componentes) → previsão de ruptura
export function vendas(s, dias = 30) {
  const desde = Date.now() - dias * 864e5, out = {};
  for (const p of s.pedidos || []) {
    if (!['pago', 'parcial'].includes(p.status_pagamento) || new Date(p.criado_em) < desde) continue;
    for (const l of expandir(s, p.itens)) out[l.variante_id] = (out[l.variante_id] || 0) + l.qtd;
  }
  return out;
}
// dias até acabar no ritmo atual (null = sem vendas)
export function cobertura(disponivel, vendidos30) { return vendidos30 > 0 ? Math.floor(Math.max(0, disponivel) / (vendidos30 / 30)) : null; }
