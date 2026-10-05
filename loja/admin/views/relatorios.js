// Relatórios: vendas por produto (com custo e margem), afiliado, cupom, origem e estado, no período escolhido.
import { db } from '../db.js';
import { esc, brl, $, $$, toast } from '../ui.js';

const PERIODOS = [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado'], ['ano', 'Este ano']];
function intervalo(k) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje.getTime() + 864e5);
  if (k === 'mes') return [new Date(hoje.getFullYear(), hoje.getMonth(), 1), amanha];
  if (k === 'mes_ant') return [new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), new Date(hoje.getFullYear(), hoje.getMonth(), 1)];
  if (k === 'ano') return [new Date(hoje.getFullYear(), 0, 1), amanha];
  return [new Date(hoje.getTime() - (Number(k) - 1) * 864e5), amanha];
}
const ORIGENS = { checkout: 'Site', pix: 'PIX', manual: 'Manual (painel)', serena: 'WhatsApp (Serena)', assinatura: 'Assinatura', us: 'EUA', shopify: 'Shopify (histórico)' };
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0).toLocaleString('pt-BR') + '%';
const n = (v) => Number(v || 0).toLocaleString('pt-BR');

// custo de uma variante (kit = soma dos componentes)
function custoDe(vid, mapa) {
  const v = mapa.get(String(vid)); if (!v) return null;
  if ((v.componentes || []).length) { let t = 0; for (const c of v.componentes) { const cc = custoDe(c.variante_id, mapa); if (cc == null) return null; t += cc * (Number(c.qtd) || 1); } return t; }
  return v.custo != null && v.custo !== '' ? Number(v.custo) : null;
}

export function agregar(pedidos, produtos) {
  const mapa = new Map(produtos.flatMap((p) => (p.variantes || []).map((v) => [String(v.id), { ...v, _p: p }])));
  const pagos = pedidos.filter((p) => ['pago', 'parcial'].includes(p.status_pagamento));
  const r = { pedidos: pagos.length, todos: pedidos.length, receita: 0, produtos_receita: 0, descontos: 0, frete: 0, custo: 0, sem_custo: 0, unidades: 0, clientes: new Set(), dias: {}, porProduto: {}, porAfiliado: {}, porCupom: {}, porOrigem: {}, porUF: {}, cancelados: 0, pendentes: 0 };
  for (const p of pedidos) { if (p.status_pagamento === 'cancelado' || p.status_pagamento === 'reembolsado') r.cancelados += Number(p.total || 0); if (p.status_pagamento === 'pendente') r.pendentes += Number(p.total || 0); }
  const soma = (obj, k, rot, total, extra = {}) => { const o = obj[k] = obj[k] || { k, rot, pedidos: 0, receita: 0, ...extra }; o.pedidos++; o.receita += total; return o; };
  for (const p of pagos) {
    const total = Number(p.total || 0);
    r.receita += total; r.descontos += Number(p.desconto || 0); r.frete += Number(p.frete || 0); r.clientes.add(p.cliente);
    const dia = new Date(p.criado_em).toLocaleDateString('sv-SE'); r.dias[dia] = (r.dias[dia] || 0) + total;
    // desconto do pedido rateado pelos itens, para a receita por produto bater com o total
    const bruto = (p.itens || []).reduce((s, i) => s + Number(i.preco || 0) * Number(i.qtd || 0), 0) || 1;
    const fator = Math.max(0, (bruto - Number(p.desconto || 0)) / bruto);
    for (const i of p.itens || []) {
      const q = Number(i.qtd || 0), rec = Number(i.preco || 0) * q * fator, c = custoDe(i.variante_id, mapa);
      const v = mapa.get(String(i.variante_id));
      const nome = (v?._p?.titulo || i.titulo) + (i.variante && i.variante !== 'Default Title' ? ' · ' + i.variante : '');
      const o = r.porProduto[i.variante_id] = r.porProduto[i.variante_id] || { k: i.variante_id, rot: nome, img: v?._p?.imagens?.[0]?.url, unidades: 0, receita: 0, custo: 0, semCusto: false, pedidos: 0 };
      o.unidades += q; o.receita += rec; o.pedidos++;
      if (c == null) { o.semCusto = true; r.sem_custo += rec; } else { o.custo += c * q; r.custo += c * q; }
      r.unidades += q; r.produtos_receita += rec;
    }
    if (p.ref) soma(r.porAfiliado, p.ref, p.ref, total);
    if (p.cupom) soma(r.porCupom, p.cupom, p.cupom, total, { desconto: 0 }).desconto += Number(p.desconto || 0);
    soma(r.porOrigem, p.origem || 'checkout', ORIGENS[p.origem] || p.origem || 'Site', total);
    soma(r.porUF, p.uf || p.endereco?.uf || '—', p.uf || p.endereco?.uf || '—', total);
  }
  r.clientes = r.clientes.size;
  return r;
}

function grafico(dias, ini, fim) {
  const pts = [];
  for (let d = new Date(ini); d < fim; d = new Date(d.getTime() + 864e5)) pts.push([d.toLocaleDateString('sv-SE'), dias[d.toLocaleDateString('sv-SE')] || 0]);
  const max = Math.max(1, ...pts.map((x) => x[1])), w = 1000, h = 160, bw = w / Math.max(1, pts.length);
  return `<svg viewBox="0 0 ${w} ${h + 18}" preserveAspectRatio="none" style="width:100%;height:190px;display:block">${pts.map(([d, v], i) => `<rect x="${i * bw + bw * 0.15}" y="${h - (v / max) * h}" width="${bw * 0.7}" height="${Math.max(1, (v / max) * h)}" rx="2" fill="#4b9bff"><title>${new Date(d + 'T12:00').toLocaleDateString('pt-BR')}: ${brl(v)}</title></rect>`).join('')}
  <text x="0" y="${h + 14}" font-size="11" fill="#8a8a8a">${new Date(pts[0]?.[0] + 'T12:00').toLocaleDateString('pt-BR')}</text><text x="${w}" y="${h + 14}" font-size="11" fill="#8a8a8a" text-anchor="end">${new Date(pts.at(-1)?.[0] + 'T12:00').toLocaleDateString('pt-BR')}</text></svg>`;
}

function tabela(linhas, cols, vazio) {
  if (!linhas.length) return `<div class="empty" style="padding:24px">${vazio}</div>`;
  return `<div class="table-wrap"><table class="t"><thead><tr>${cols.map((c) => `<th${c.r ? ' class="r"' : ''}>${c.t}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${cols.map((c) => `<td${c.r ? ' class="r amt"' : ''}>${c.f(l)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export async function relatorios(view, { crumb, acts }) {
  crumb('<i class="ti ti-chart-bar"></i> Relatórios');
  const st = { per: '30', aba: 'produtos', dados: null };
  const top = acts('<button class="btn" id="csv">Exportar</button>');
  view.innerHTML = `<div class="page">
  ${db.demo ? '<div class="help amber" style="margin-bottom:12px">Relatórios dos <b>pedidos fictícios</b> (modo demonstração). Custos vêm do cadastro de cada produto (Estoque → custo por item).</div>' : ''}
  <div class="metrics" id="mx"></div>
  <div class="card" style="margin-bottom:12px"><div class="card-h"><h2 class="grow">Vendas por dia</h2><select class="in" id="per" style="width:auto">${PERIODOS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div><div class="card-b" id="graf"></div></div>
  <div class="card"><div class="tabbar"><div class="seg" id="abas">${[['produtos', 'Produtos'], ['afiliados', 'Afiliados'], ['cupons', 'Cupons'], ['origem', 'Origem'], ['uf', 'Estados']].map(([k, t]) => `<button data-a="${k}" class="${k === st.aba ? 'on' : ''}">${t}</button>`).join('')}</div></div><div id="tab"></div></div></div>`;

  async function carregar() {
    const [ini, fim] = intervalo(st.per);
    $('#mx', view).innerHTML = '<div class="metric"><span class="l">Carregando…</span></div>';
    try { st.lista = await db.backend.relatorio({ desde: ini.toISOString(), ate: fim.toISOString() }); } catch (e) { toast(e.message, true); st.lista = []; }
    st.dados = agregar(st.lista, db.state.produtos); st.ini = ini; st.fim = fim;
    draw();
  }
  function draw() {
    const r = st.dados, lucro = r.produtos_receita - r.custo - r.sem_custo;
    const ms = [
      ['Receita (pagos)', brl(r.receita)], ['Pedidos pagos', n(r.pedidos)], ['Ticket médio', brl(r.pedidos ? r.receita / r.pedidos : 0)],
      ['Unidades vendidas', n(r.unidades)], ['Clientes', n(r.clientes)], ['Descontos', brl(r.descontos)],
      ['Lucro bruto', brl(lucro) + (r.sem_custo ? ' <span class="soft xs" title="Produtos sem custo cadastrado ficam fora">*</span>' : '')],
      ['Margem bruta', pct(lucro, r.produtos_receita - r.sem_custo)],
    ];
    $('#mx', view).innerHTML = ms.map(([l, v]) => `<div class="metric"><span class="l">${esc(l)}</span><span class="v">${v}</span></div>`).join('');
    $('#graf', view).innerHTML = grafico(r.dias, st.ini, st.fim) + (r.cancelados || r.pendentes ? `<p class="soft xs" style="margin:8px 0 0">Fora da receita: ${brl(r.pendentes)} aguardando pagamento · ${brl(r.cancelados)} cancelados/reembolsados.</p>` : '');
    const ord = (o) => Object.values(o).sort((a, b) => b.receita - a.receita);
    const part = (x) => pct(x.receita, r.receita);
    const T = {
      produtos: () => tabela(ord(r.porProduto), [
        { t: 'Produto', f: (x) => `<div class="cell">${x.img ? `<img class="thumb" src="${esc(x.img)}" alt="">` : ''}<b style="white-space:normal">${esc(x.rot)}</b></div>` },
        { t: 'Unidades', r: 1, f: (x) => n(x.unidades) }, { t: 'Receita', r: 1, f: (x) => brl(x.receita) },
        { t: 'Custo', r: 1, f: (x) => (x.semCusto ? '<span class="soft" title="Cadastre o custo em Estoque">sem custo</span>' : brl(x.custo)) },
        { t: 'Lucro bruto', r: 1, f: (x) => (x.semCusto ? '—' : brl(x.receita - x.custo)) }, { t: 'Margem', r: 1, f: (x) => (x.semCusto ? '—' : pct(x.receita - x.custo, x.receita)) },
        { t: '% da receita', r: 1, f: part },
      ], 'Nenhuma venda no período.'),
      afiliados: () => tabela(ord(r.porAfiliado), [{ t: 'Afiliado', f: (x) => `<span class="tag">${esc(x.rot)}</span>` }, { t: 'Pedidos', r: 1, f: (x) => n(x.pedidos) }, { t: 'Receita', r: 1, f: (x) => brl(x.receita) }, { t: 'Ticket médio', r: 1, f: (x) => brl(x.receita / x.pedidos) }, { t: '% da receita', r: 1, f: part }], 'Nenhuma venda de afiliado no período.'),
      cupons: () => tabela(ord(r.porCupom), [{ t: 'Cupom', f: (x) => `<span class="tag">${esc(x.rot)}</span>` }, { t: 'Usos', r: 1, f: (x) => n(x.pedidos) }, { t: 'Receita', r: 1, f: (x) => brl(x.receita) }, { t: 'Desconto dado', r: 1, f: (x) => brl(x.desconto) }, { t: '% da receita', r: 1, f: part }], 'Nenhum cupom usado no período.'),
      origem: () => tabela(ord(r.porOrigem), [{ t: 'Origem', f: (x) => esc(x.rot) }, { t: 'Pedidos', r: 1, f: (x) => n(x.pedidos) }, { t: 'Receita', r: 1, f: (x) => brl(x.receita) }, { t: 'Ticket médio', r: 1, f: (x) => brl(x.receita / x.pedidos) }, { t: '% da receita', r: 1, f: part }], 'Sem vendas.'),
      uf: () => tabela(ord(r.porUF), [{ t: 'Estado', f: (x) => esc(x.rot) }, { t: 'Pedidos', r: 1, f: (x) => n(x.pedidos) }, { t: 'Receita', r: 1, f: (x) => brl(x.receita) }, { t: '% da receita', r: 1, f: part }], 'Sem vendas.'),
    };
    $('#tab', view).innerHTML = T[st.aba]();
  }
  $('#per', view).value = st.per;
  $('#per', view).onchange = (e) => { st.per = e.target.value; carregar(); };
  $$('#abas button', view).forEach((b) => b.onclick = () => { st.aba = b.dataset.a; $$('#abas button', view).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('#csv', top).onclick = () => {
    const r = st.dados; if (!r) return;
    const linhas = [['Produto', 'Unidades', 'Receita', 'Custo', 'Lucro bruto'], ...Object.values(r.porProduto).map((x) => [x.rot, x.unidades, x.receita.toFixed(2), x.semCusto ? '' : x.custo.toFixed(2), x.semCusto ? '' : (x.receita - x.custo).toFixed(2)])];
    const csv = linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `relatorio-produtos-${st.per}.csv`; a.click();
  };
  carregar();
}
