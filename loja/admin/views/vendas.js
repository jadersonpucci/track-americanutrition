// Início, pedidos, clientes e descontos (visual no estilo do admin da Shopify).
import { db } from '../db.js';
import { esc, brl, num, dataBR, norm, $, $$, toast, abrirPainel, confirmar, fld, inp, area, sel, chk, lerForm, thumb } from '../ui.js';

const PAG = { pago: ['', 'Pago', 'dot'], pendente: ['amber', 'Pendente', 'ring'], cancelado: ['red', 'Cancelado', 'dot'], reembolsado: ['', 'Reembolsado', 'dot'], parcial: ['amber', 'Reembolso parcial', 'dot'] };
const ENT = { nao_enviado: ['amber', 'Não processado', 'ring'], preparando: ['blue', 'Em andamento', 'ring'], enviado: ['', 'Processado', 'dot'], entregue: ['green', 'Entregue', 'dot'], devolvido: ['red', 'Devolvido', 'dot'] };
const pill = (m, k) => { const [c, t, ic] = m[k] || ['', k || '—', 'dot']; return `<span class="badge ${c}"><span class="${ic}"></span>${esc(t)}</span>`; };
export const nomePedido = (p) => 'AN-' + p.numero;
const aviso = () => db.demo ? '<div class="help amber" style="margin-bottom:12px"><b>Pedidos fictícios.</b> Modo demonstração: clientes, endereços e CPFs são inventados para mostrar como o painel fica. Os produtos e preços são os reais. Quando o painel for ligado ao banco, aparecem os pedidos de verdade.</div>' : '';

// "Hoje às 15:33", "Ontem às 22:50", "2 de out. às 10:17"
function quando(iso) {
  const d = new Date(iso), h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  const dias = Math.floor((ini - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (dias <= 0) return `Hoje às ${h}`;
  if (dias === 1) return `Ontem às ${h}`;
  if (dias < 7) return `${d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())} às ${h}`;
  return `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')} às ${h}`;
}
const qtdItens = (p) => (p.itens || []).reduce((s, i) => s + Number(i.qtd || 0), 0);
const tagsDe = (p) => [...(p.ref ? ['AF: ' + p.ref] : []), ...(p.origem && !['checkout', 'manual'].includes(p.origem) ? [p.origem === 'serena' ? 'WPP' : p.origem.toUpperCase()] : []), ...(p.tags || []).filter((t) => t !== 'demonstração')];

// ------------------------------------------------------------------ métricas (faixa do topo)
function spark(vals, cor = '#4b9bff') {
  const max = Math.max(1, ...vals), w = 100, h = 24;
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function variacao(a, b) {
  if (!b) return a ? '<span class="up">↗</span>' : '';
  const pct = Math.round((a / b - 1) * 100);
  return pct === 0 ? '' : `<span class="${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '↗' : '↘'} ${Math.abs(pct)}%</span>`;
}
const PERIODOS = [['hoje', 'Hoje', 1], ['7', 'Últimos 7 dias', 7], ['30', 'Últimos 30 dias', 30]];
async function metricas(per) {
  const dias = PERIODOS.find((x) => x[0] === per)[2];
  const ini = new Date(); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - (dias - 1));
  const antes = new Date(ini.getTime() - dias * 864e5);
  const lista = await db.backend.pedidos({ desde: antes.toISOString(), limite: 2000 });
  const atual = lista.filter((p) => new Date(p.criado_em) >= ini), ant = lista.filter((p) => new Date(p.criado_em) < ini);
  // série: por hora (hoje) ou por dia
  const buckets = dias === 1 ? 24 : dias;
  const serie = (fn) => { const a = Array(buckets).fill(0); for (const p of atual) { const d = new Date(p.criado_em); const k = dias === 1 ? d.getHours() : Math.floor((d - ini) / 864e5); if (k >= 0 && k < buckets) a[k] += fn(p); } return a; };
  const pago = (p) => p.status_pagamento === 'pago';
  const m = (arr, fn) => arr.reduce((s, p) => s + fn(p), 0);
  return [
    { l: 'Pedidos', v: atual.length, d: variacao(atual.length, ant.length), s: serie(() => 1) },
    { l: 'Vendas', v: brl(m(atual.filter(pago), (p) => p.total)), d: variacao(m(atual.filter(pago), (p) => p.total), m(ant.filter(pago), (p) => p.total)), s: serie((p) => (pago(p) ? p.total : 0)) },
    { l: 'Itens pedidos', v: m(atual, qtdItens), d: variacao(m(atual, qtdItens), m(ant, qtdItens)), s: serie(qtdItens) },
    { l: 'Estornos de vendas', v: brl(m(atual.filter((p) => ['reembolsado', 'cancelado', 'parcial'].includes(p.status_pagamento)), (p) => p.total)), s: serie((p) => (['reembolsado', 'cancelado'].includes(p.status_pagamento) ? p.total : 0)) },
    { l: 'Pedidos processados', v: atual.filter((p) => ['enviado', 'entregue'].includes(p.status_entrega)).length, s: serie((p) => (['enviado', 'entregue'].includes(p.status_entrega) ? 1 : 0)) },
    { l: 'Pedidos entregues', v: atual.filter((p) => p.status_entrega === 'entregue').length, s: serie((p) => (p.status_entrega === 'entregue' ? 1 : 0)) },
  ];
}
async function faixaMetricas(box, per = 'hoje') {
  box.innerHTML = `<div class="per"><i class="ti ti-calendar"></i><select>${PERIODOS.map(([k, t]) => `<option value="${k}"${k === per ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` + '<div class="metric"><span class="l">Carregando…</span></div>';
  const ms = await metricas(per);
  box.innerHTML = box.querySelector('.per').outerHTML + ms.map((x) => `<div class="metric"><span class="l">${esc(x.l)}</span><span class="v">${x.v}${x.d || ''}</span>${spark(x.s)}</div>`).join('');
  $('select', box).value = per;
  $('select', box).onchange = (e) => faixaMetricas(box, e.target.value);
}

// ------------------------------------------------------------------ início
export async function painel(view, { crumb }) {
  crumb('<i class="ti ti-home"></i> Início');
  const s = db.state;
  const ativos = s.produtos.filter((p) => (p.status || 'ativo') === 'ativo');
  const esgotados = ativos.filter((p) => !(p.variantes || []).some((v) => v.disponivel));
  let r = null; try { r = await db.backend.resumo(); } catch (e) { toast(e.message, true); }
  view.innerHTML = `<div class="page">${aviso()}
  <div class="metrics" id="mx"></div>
  <div class="grid2">
    <div class="stack">
      <div class="card"><div class="card-h"><h2 class="grow">Últimos pedidos</h2><a class="btn" href="#/pedidos">Ver todos</a></div>
      <table class="t"><tbody>${(r?.ultimos || []).map((p) => `<tr class="click" onclick="location.hash='#/pedidos/${esc(p.id)}'"><td><span class="lnk">${nomePedido(p)}</span></td><td class="soft">${quando(p.criado_em)}</td><td>${esc(p.cliente?.nome || '')}</td><td>${pill(PAG, p.status_pagamento)}</td><td class="r amt">${brl(p.total)}</td></tr>`).join('') || '<tr><td class="soft">Nenhum pedido ainda.</td></tr>'}</tbody></table></div>
      <div class="card"><div class="card-h"><h2 class="grow">Catálogo</h2><a class="btn" href="#/produtos">Produtos</a></div><div class="kpis" style="margin:0;gap:0">
        <div class="kpi"><div class="l">Produtos ativos</div><div class="v">${ativos.length}</div></div>
        <div class="kpi"><div class="l">Variantes</div><div class="v">${ativos.reduce((n, p) => n + (p.variantes || []).length, 0)}</div></div>
        <div class="kpi"><div class="l">Coleções</div><div class="v">${s.colecoes.length}</div></div>
        <div class="kpi"><div class="l">Artigos</div><div class="v">${s.artigos.length}</div></div></div></div>
    </div>
    <div class="stack">
      ${r ? `<div class="card card-b"><a href="#/pedidos/?aba=nao_processados" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px"><span class="badge amber"><span class="ring"></span>${r.a_enviar}</span><b style="flex:1">pedidos para processar</b><i class="ti ti-chevron-right soft"></i></a></div>` : ''}
      <div class="card"><div class="card-h"><h2 class="grow">Precisa de atenção</h2></div><div class="card-b stack" style="gap:10px">
        ${esgotados.map((p) => `<a class="cell" href="#/produtos/${esc(p.id)}" style="color:inherit"><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt=""><div><b>${esc(p.titulo)}</b><span class="badge red">Esgotado</span></div></a>`).join('')}
        ${s.paginas.filter((g) => g.legado).length ? `<a href="#/paginas"><i class="ti ti-alert-triangle"></i> ${s.paginas.filter((g) => g.legado).length} páginas de campanha antigas para revisar</a>` : ''}
        ${!esgotados.length ? '<p class="soft" style="margin:0">Tudo certo com o catálogo.</p>' : ''}
      </div></div>
    </div>
  </div></div>`;
  faixaMetricas($('#mx', view));
}

// ------------------------------------------------------------------ pedidos
const ABAS = [
  ['todos', 'Todos', () => true],
  ['nao_processados', 'Não processados', (p) => p.status_pagamento === 'pago' && ['nao_enviado', 'preparando'].includes(p.status_entrega)],
  ['nao_pagos', 'Não pagos', (p) => p.status_pagamento === 'pendente'],
  ['enviados', 'Enviados', (p) => p.status_entrega === 'enviado'],
  ['entregues', 'Entregues', (p) => p.status_entrega === 'entregue'],
  ['cancelados', 'Cancelados', (p) => ['cancelado', 'reembolsado'].includes(p.status_pagamento)],
];
const POR_PAG = 50;

export async function pedidos(view, { args, crumb, acts }) {
  crumb('<i class="ti ti-inbox"></i> Pedidos');
  const qs = new URLSearchParams((args[0] || '').replace(/^\?/, ''));
  const abrirId = args[0] && !args[0].startsWith('?') ? args[0] : null;
  const st = { aba: qs.get('aba') || 'todos', q: qs.get('q') || '', pag: 0, sel: new Set(), lista: [] };
  const top = acts('<button class="btn" id="exp">Exportar</button><button class="btn pri" id="novo">Criar pedido</button>');
  $('#novo', top).onclick = () => criarPedido(() => carregar());
  $('#exp', top).onclick = () => exportar(filtrados());

  view.innerHTML = `<div class="page">${aviso()}
  <div class="metrics" id="mx"></div>
  <div class="card">
    <div class="tabbar"><div class="seg" id="abas">${ABAS.map(([k, t]) => `<button data-a="${k}" class="${k === st.aba ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="search" style="margin-left:auto"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Pesquisar e filtrar" value="${esc(st.q)}"></div></div>
    <div class="bulk" id="bulk" hidden><b id="nsel"></b><button class="btn sm" data-bulk="enviado">Marcar como processados</button><button class="btn sm" data-bulk="entregue">Marcar como entregues</button><button class="btn sm ghost" id="limpa">Limpar seleção</button></div>
    <div class="table-wrap" id="lista"><div class="empty">Carregando…</div></div>
    <div class="pager" id="pager"></div>
  </div></div>`;
  faixaMetricas($('#mx', view));

  function filtrados() {
    const fn = ABAS.find((a) => a[0] === st.aba)[2];
    return st.lista.filter(fn);
  }
  async function carregar() {
    st.lista = await db.backend.pedidos({ q: st.q, limite: 2000 });
    st.sel.clear(); draw(); window.__contadores?.();
  }
  function draw() {
    const todos = filtrados();
    const pags = Math.max(1, Math.ceil(todos.length / POR_PAG)); st.pag = Math.min(st.pag, pags - 1);
    const lista = todos.slice(st.pag * POR_PAG, (st.pag + 1) * POR_PAG);
    $('#lista', view).innerHTML = lista.length ? `<table class="t"><thead><tr><th style="width:28px"><input type="checkbox" id="selall"></th><th>Pedido</th><th>Data</th><th>Cliente</th><th class="r">Total</th><th>Itens</th><th>Status do pagamento</th><th>Status de processamento do pedido</th><th class="hide-sm">Tags</th></tr></thead><tbody>${lista.map((p) => `<tr class="click" data-id="${esc(p.id)}">
      <td data-stop><input type="checkbox" data-sel="${esc(p.id)}"${st.sel.has(p.id) ? ' checked' : ''}></td>
      <td><span class="lnk">${nomePedido(p)}</span>${p.notas ? '<i class="ti ti-note ico-note" title="Tem observação"></i>' : ''}</td>
      <td>${quando(p.criado_em)}</td>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${esc(p.cliente?.nome || '')}</td>
      <td class="r amt">${brl(p.total)}</td>
      <td data-stop><button class="btn ghost sm" data-itens="${esc(p.id)}">${qtdItens(p)} ${qtdItens(p) === 1 ? 'item' : 'itens'} <i class="ti ti-chevron-down"></i></button></td>
      <td>${pill(PAG, p.status_pagamento)}</td>
      <td>${pill(ENT, p.status_entrega)}</td>
      <td class="hide-sm">${tagsDe(p).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty"><i class="ti ti-inbox"></i>${st.q ? 'Nenhum pedido encontrado para essa busca.' : 'Nenhum pedido nesta aba.'}</div>`;
    $('#pager', view).innerHTML = todos.length > POR_PAG ? `<button class="btn ico" id="ant"${st.pag ? '' : ' disabled'}><i class="ti ti-chevron-left"></i></button><span style="padding:0 10px">${st.pag * POR_PAG + 1}-${Math.min(todos.length, (st.pag + 1) * POR_PAG)} de ${todos.length}</span><button class="btn ico" id="prox"${st.pag < pags - 1 ? '' : ' disabled'}><i class="ti ti-chevron-right"></i></button>` : `<span>${todos.length} pedido${todos.length === 1 ? '' : 's'}</span>`;
    const ant = $('#ant', view), prox = $('#prox', view);
    if (ant) ant.onclick = () => { st.pag--; draw(); }; if (prox) prox.onclick = () => { st.pag++; draw(); };
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = (e) => { if (e.target.closest('[data-stop]')) return; abrirPedido(tr.dataset.id, carregar); });
    $$('[data-sel]', view).forEach((c) => c.onchange = () => { c.checked ? st.sel.add(c.dataset.sel) : st.sel.delete(c.dataset.sel); bulk(); });
    const all = $('#selall', view); if (all) all.onchange = () => { lista.forEach((p) => (all.checked ? st.sel.add(p.id) : st.sel.delete(p.id))); draw(); };
    $$('[data-itens]', view).forEach((b) => b.onclick = (e) => { e.stopPropagation(); popItens(b, st.lista.find((p) => p.id === b.dataset.itens)); });
    bulk();
  }
  function bulk() { $('#bulk', view).hidden = !st.sel.size; $('#nsel', view).textContent = `${st.sel.size} selecionado${st.sel.size === 1 ? '' : 's'}`; }
  $$('[data-bulk]', view).forEach((b) => b.onclick = async () => {
    for (const id of st.sel) await db.backend.pedidoAtualizar(id, { status_entrega: b.dataset.bulk });
    toast(`${st.sel.size} pedido(s) atualizados.`); carregar(); faixaMetricas($('#mx', view));
  });
  $('#limpa', view).onclick = () => { st.sel.clear(); draw(); };
  $$('#abas button', view).forEach((b) => b.onclick = () => { st.aba = b.dataset.a; st.pag = 0; $$('#abas button', view).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  let tm; $('#q', view).oninput = (e) => { st.q = e.target.value; clearTimeout(tm); tm = setTimeout(carregar, 250); };
  await carregar();
  if (abrirId) abrirPedido(abrirId, carregar);
}

function popItens(btn, p) {
  document.querySelectorAll('.pop').forEach((x) => x.remove());
  const r = btn.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'pop';
  el.style.top = (r.bottom + window.scrollY + 4) + 'px'; el.style.left = Math.max(8, r.left + window.scrollX - 120) + 'px';
  el.innerHTML = (p.itens || []).map((i) => `<div class="it"><img class="thumb" src="${esc(thumb(i.imagem, 80))}" alt=""><div style="flex:1;min-width:0"><b style="display:block">${esc(i.titulo)}</b><span class="soft xs">${esc(i.variante && i.variante !== 'Default Title' ? i.variante + ' · ' : '')}${esc(i.sku || '')}</span></div><span class="amt">${i.qtd} × ${brl(i.preco)}</span></div>`).join('');
  document.body.appendChild(el);
  setTimeout(() => document.addEventListener('click', function f(e) { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('click', f); } }), 0);
}

function exportar(lista) {
  const cab = ['Pedido', 'Data', 'Cliente', 'E-mail', 'Telefone', 'CPF', 'Cidade', 'UF', 'Itens', 'Subtotal', 'Desconto', 'Frete', 'Total', 'Cupom', 'Pagamento', 'Status pagamento', 'Status entrega', 'Rastreio', 'Afiliado'];
  const linhas = lista.map((p) => [nomePedido(p), new Date(p.criado_em).toLocaleString('pt-BR'), p.cliente?.nome, p.cliente?.email, p.cliente?.telefone, p.cliente?.cpf, p.endereco?.cidade, p.endereco?.uf,
    (p.itens || []).map((i) => `${i.qtd}x ${i.titulo}${i.variante && i.variante !== 'Default Title' ? ' (' + i.variante + ')' : ''}`).join(' | '), p.subtotal, p.desconto, p.frete, p.total, p.cupom, p.pagamento?.metodo, p.status_pagamento, p.status_entrega, p.rastreio, p.ref]);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

// ------------------------------------------------------------------ detalhe do pedido (duas colunas, como na Shopify)
async function abrirPedido(id, redraw) {
  const p = await db.backend.pedido(id);
  if (!p) return toast('Pedido não encontrado.', true);
  const c = p.cliente || {}, e = p.endereco || {};
  const demo = (p.tags || []).includes('demonstração');
  const proximo = { nao_enviado: ['preparando', 'Iniciar processamento'], preparando: ['enviado', 'Marcar como enviado'], enviado: ['entregue', 'Marcar como entregue'] }[p.status_entrega];
  const corpo = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${pill(PAG, p.status_pagamento)} ${pill(ENT, p.status_entrega)} ${tagsDe(p).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="soft" style="margin-left:auto">${quando(p.criado_em)} · ${esc(p.origem || '')}</span></div>
  <div class="grid2" style="grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr)">
    <div class="stack" style="gap:12px">
      <div class="card"><div class="card-h">${pill(ENT, p.status_entrega)}<span class="grow"></span>${p.rastreio ? `<a class="btn sm" target="_blank" href="https://track.americanutrition.com/${esc(p.rastreio)}"><i class="ti ti-truck"></i> ${esc(p.rastreio)}</a>` : ''}</div>
        <table class="t"><tbody>${(p.itens || []).map((i) => `<tr><td class="wrap"><div class="cell"><img class="thumb" src="${esc(thumb(i.imagem))}" alt=""><div><b style="white-space:normal">${esc(i.titulo)}</b><small>${esc(i.variante && i.variante !== 'Default Title' ? i.variante : '')} ${i.sku ? 'SKU: ' + esc(i.sku) : ''}</small></div></div></td><td class="r soft">${brl(i.preco)} × ${i.qtd}</td><td class="r amt">${brl(i.qtd * i.preco)}</td></tr>`).join('')}</tbody></table>
        <div class="card-b" style="border-top:1px solid var(--line2)"><div class="row">${fld('Código de rastreio', inp('rastreio', p.rastreio || '', 'style="text-transform:uppercase" placeholder="Ex.: AD123456789BR"'))}${fld('Status de processamento', sel('status_entrega', p.status_entrega, Object.entries(ENT).map(([k, [, t]]) => [k, t])))}</div>
        ${proximo ? `<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn pri" id="avancar" data-para="${proximo[0]}">${proximo[1]}</button></div>` : ''}</div></div>
      <div class="card"><div class="card-h">${pill(PAG, p.status_pagamento)}</div><div class="card-b"><dl class="kv" style="grid-template-columns:1fr auto">
        <dt>Subtotal <span class="soft">· ${qtdItens(p)} ${qtdItens(p) === 1 ? 'item' : 'itens'}</span></dt><dd class="amt">${brl(p.subtotal)}</dd>
        ${p.desconto ? `<dt>Desconto ${p.cupom ? `<span class="tag">${esc(p.cupom)}</span>` : ''}</dt><dd class="amt">− ${brl(p.desconto)}</dd>` : ''}
        <dt>Frete <span class="soft">· ${esc(p.frete_servico || '')}</span></dt><dd class="amt">${brl(p.frete)}</dd>
        <dt><b>Total</b></dt><dd class="amt"><b>${brl(p.total)}</b></dd>
        <dt>Pago pelo cliente</dt><dd class="amt">${p.status_pagamento === 'pago' ? brl(p.total) : brl(0)}</dd></dl>
        <p class="soft xs" style="margin:10px 0 0">${esc(p.pagamento?.metodo || '')}${p.pagamento?.parcelas > 1 ? ` · ${p.pagamento.parcelas}x` : ''} · ${esc(p.pagamento?.gateway || '')} · <span class="mono">${esc(p.pagamento?.transacao || '')}</span></p>
        <div style="margin-top:12px">${fld('Status do pagamento', sel('status_pagamento', p.status_pagamento, Object.entries(PAG).map(([k, [, t]]) => [k, t])))}</div></div></div>
      <div class="card"><div class="card-h"><h2 class="grow">Linha do tempo</h2></div><div class="card-b"><div class="timeline">${(p.eventos || []).slice().reverse().map((ev) => `<div class="ev"><span class="dot"></span><div>${esc(ev.texto)}<div class="xs soft">${dataBR(ev.em, true)}${ev.por ? ' · ' + esc(ev.por) : ''}</div></div></div>`).join('') || '<span class="soft">Sem eventos.</span>'}</div></div></div>
    </div>
    <div class="stack" style="gap:12px">
      <div class="card"><div class="card-h"><h2 class="grow">Observações</h2></div><div class="card-b">${area('notas', p.notas || '', 'rows="3" placeholder="Sem observações"')}</div></div>
      <div class="card"><div class="card-h"><h2 class="grow">Cliente</h2></div><div class="card-b stack" style="gap:12px">
        <div><a class="lnk" href="#/clientes/?q=${encodeURIComponent(c.email || c.nome || '')}">${esc(c.nome || '')}</a></div>
        <div><h5 style="margin:0 0 4px">Informações de contato</h5><div>${esc(c.email || '')}</div><div>${esc(c.telefone || '')}</div><div class="soft">CPF ${esc(c.cpf || '—')}</div>
          ${c.telefone && !demo ? `<a class="btn sm" style="margin-top:8px" target="_blank" href="https://wa.me/${esc(String(c.telefone).replace(/\D/g, ''))}"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>` : ''}</div>
        <div><h5 style="margin:0 0 4px">Endereço de entrega</h5><div>${esc(c.nome || '')}<br>${esc([e.logradouro, e.numero].filter(Boolean).join(', '))}${e.complemento ? ' – ' + esc(e.complemento) : ''}<br>${esc(e.bairro || '')}<br>${esc(e.cep || '')} ${esc(e.cidade || '')}${e.uf ? ' ' + esc(e.uf) : ''}</div></div>
      </div></div>
      <div class="card"><div class="card-h"><h2 class="grow">Tags</h2></div><div class="card-b">${inp('tags', (p.tags || []).join(', '), 'placeholder="Separe por vírgula"')}</div></div>
    </div>
  </div>`;
  const pn = abrirPainel({ titulo: nomePedido(p), largo: true, corpo, rodape: '<button class="btn" id="cancelar">Cancelar</button><button class="btn pri" id="salvar">Salvar</button>' });
  const salvar = async (extra = {}) => {
    const f = lerForm(pn.el);
    await db.backend.pedidoAtualizar(p.id, { rastreio: f.rastreio.trim().toUpperCase() || null, status_entrega: f.status_entrega, status_pagamento: f.status_pagamento, notas: f.notas, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), ...extra });
    toast('Pedido atualizado.'); pn.fechar(); redraw?.();
  };
  $('#salvar', pn.el).onclick = () => salvar();
  $('#cancelar', pn.el).onclick = () => pn.fechar();
  const av = $('#avancar', pn.el);
  if (av) av.onclick = () => {
    if (av.dataset.para === 'enviado' && !$('[name=rastreio]', pn.el).value.trim()) { toast('Informe o código de rastreio para marcar como enviado.', true); $('[name=rastreio]', pn.el).focus(); return; }
    $('[name=status_entrega]', pn.el).value = av.dataset.para; salvar();
  };
}

// ------------------------------------------------------------------ criar pedido (manual)
function criarPedido(depois) {
  const vars = db.all('produtos').filter((p) => (p.status || 'ativo') === 'ativo').flatMap((p) => (p.variantes || []).map((v) => ({ p, v })));
  const itens = [];
  const corpo = `<form id="fcp" class="grid2" style="grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr)" onsubmit="return false"><div class="stack" style="gap:12px">
    <div class="card"><div class="card-h"><h2 class="grow">Produtos</h2></div><div class="card-b"><select class="in" id="addp" data-skip><option value="">Pesquisar produtos…</option>${vars.map(({ p, v }, i) => `<option value="${i}">${esc(p.titulo)}${v.titulo !== 'Default Title' ? ' — ' + esc(v.titulo) : ''} · R$ ${v.preco.toFixed(2).replace('.', ',')}</option>`).join('')}</select><div id="its" style="margin-top:10px"></div></div></div>
    <div class="card"><div class="card-h"><h2 class="grow">Pagamento</h2></div><div class="card-b stack" style="gap:10px"><div class="row" style="--c:3">${fld('Desconto (R$)', inp('desconto', '', 'inputmode="decimal" placeholder="0,00"'))}${fld('Frete (R$)', inp('frete', '', 'inputmode="decimal" placeholder="0,00"'))}${fld('Cupom', inp('cupom', ''))}</div>
      <div id="tot" class="kv" style="grid-template-columns:1fr auto"></div>
      <div class="row">${fld('Forma', sel('metodo', 'pix', [['pix', 'PIX'], ['cartao', 'Cartão'], ['boleto', 'Boleto'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']]))}${fld('Status', sel('pago', '1', [['1', 'Pago'], ['', 'Pendente']]))}</div></div></div>
  </div><div class="stack" style="gap:12px">
    <div class="card"><div class="card-h"><h2 class="grow">Cliente</h2></div><div class="card-b stack" style="gap:10px">${fld('Nome', inp('nome', '', 'required'))}${fld('E-mail', inp('email', '', 'type="email"'))}${fld('Telefone', inp('telefone', ''))}${fld('CPF', inp('cpf', ''))}</div></div>
    <div class="card"><div class="card-h"><h2 class="grow">Endereço</h2></div><div class="card-b stack" style="gap:10px"><div class="row">${fld('CEP', inp('cep', ''))}${fld('UF', inp('uf', '', 'maxlength="2"'))}</div>${fld('Rua', inp('logradouro', ''))}<div class="row">${fld('Número', inp('numero', ''))}${fld('Bairro', inp('bairro', ''))}</div>${fld('Cidade', inp('cidade', ''))}</div></div>
    <div class="card"><div class="card-h"><h2 class="grow">Observações</h2></div><div class="card-b">${area('nota', '', 'rows="2"')}</div></div>
  </div></form>`;
  const pn = abrirPainel({ titulo: 'Criar pedido', largo: true, corpo, rodape: '<button class="btn" id="canc">Cancelar</button><button class="btn pri" id="criar">Criar pedido</button>' });
  const el = pn.el;
  const draw = () => {
    $('#its', el).innerHTML = itens.map((it, k) => `<div class="cell" style="padding:6px 0;border-bottom:1px solid var(--line2)"><img class="thumb" src="${esc(thumb(it.p.imagens?.[0]?.url))}" alt=""><div style="flex:1;min-width:0"><b>${esc(it.p.titulo)}</b><small>${esc(it.v.titulo !== 'Default Title' ? it.v.titulo : '')}</small></div><input class="in" type="number" min="1" value="${it.qtd}" data-q="${k}" style="width:64px"><span class="amt" style="width:90px;text-align:right">${brl(it.v.preco * it.qtd)}</span><button type="button" class="btn sm ico ghost" data-rm="${k}"><i class="ti ti-x"></i></button></div>`).join('') || '<p class="soft" style="margin:0">Nenhum produto adicionado.</p>';
    $$('[data-q]', el).forEach((i) => i.oninput = () => { itens[+i.dataset.q].qtd = Math.max(1, +i.value || 1); tot(); });
    $$('[data-rm]', el).forEach((b) => b.onclick = () => { itens.splice(+b.dataset.rm, 1); draw(); });
    tot();
  };
  const tot = () => {
    const sub = itens.reduce((s, i) => s + i.v.preco * i.qtd, 0), d = num($('[name=desconto]', el).value), fr = num($('[name=frete]', el).value);
    $('#tot', el).innerHTML = `<dt>Subtotal</dt><dd class="amt">${brl(sub)}</dd><dt>Desconto</dt><dd class="amt">− ${brl(d)}</dd><dt>Frete</dt><dd class="amt">${brl(fr)}</dd><dt><b>Total</b></dt><dd class="amt"><b>${brl(sub - d + fr)}</b></dd>`;
  };
  $('#addp', el).onchange = (e) => { const x = vars[+e.target.value]; if (x) { const ja = itens.find((i) => i.v.id === x.v.id); ja ? ja.qtd++ : itens.push({ ...x, qtd: 1 }); } e.target.value = ''; draw(); };
  ['desconto', 'frete'].forEach((n) => $(`[name=${n}]`, el).oninput = tot);
  $('#canc', el).onclick = () => pn.fechar();
  $('#criar', el).onclick = async () => {
    const f = lerForm($('#fcp', el));
    if (!itens.length) return toast('Adicione pelo menos um produto.', true);
    if (!f.nome.trim()) return toast('Informe o nome do cliente.', true);
    const sub = itens.reduce((s, i) => s + i.v.preco * i.qtd, 0);
    const payload = { origem: 'manual', paid: !!f.pago, customer: { name: f.nome, email: f.email, phone: f.telefone, cpf: f.cpf }, shipping_address: { zip: f.cep, address1: f.logradouro, number: f.numero, neighborhood: f.bairro, city: f.cidade, province_code: f.uf.toUpperCase() },
      shopify_items: itens.map((i) => ({ variant_id: i.v.id, quantity: i.qtd, price: i.v.preco })), discount_code: f.cupom || null, discount_amount: num(f.desconto), shipping_price: num(f.frete), total: sub - num(f.desconto) + num(f.frete), payment: { method: f.metodo, gateway: 'manual' }, note: f.nota || null };
    const r = await db.backend.pedidoCriar(payload);
    toast(`Pedido ${'AN-' + r.numero} criado.`); pn.fechar(); depois?.();
  };
  draw();
}

// ------------------------------------------------------------------ clientes
export async function clientes(view, { args, crumb }) {
  crumb('<i class="ti ti-user"></i> Clientes');
  const f = { q: new URLSearchParams((args[0] || '').replace(/^\?/, '')).get('q') || '' };
  view.innerHTML = `<div class="page">${aviso()}
  <div class="card"><div class="tabbar"><div class="seg"><button class="on">Todos</button></div><div class="search" style="margin-left:auto"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Pesquisar clientes" value="${esc(f.q)}"></div></div><div class="table-wrap" id="lista"></div></div></div>`;
  const draw = async () => {
    const lista = await db.backend.clientes(f);
    $('#lista', view).innerHTML = lista.length ? `<table class="t"><thead><tr><th>Nome do cliente</th><th class="hide-sm">E-mail</th><th class="hide-sm">Telefone</th><th>Localização</th><th class="r">Pedidos</th><th class="r">Valor gasto</th><th class="hide-sm">Último pedido</th></tr></thead><tbody>${lista.map((c) => `<tr class="click" data-q="${esc(c.email || c.nome)}"><td><span class="lnk">${esc(c.nome)}</span></td><td class="hide-sm">${esc(c.email || '')}</td><td class="hide-sm soft">${esc(c.telefone || '')}</td><td class="soft">${esc(c.cidade || '')}</td><td class="r">${c.pedidos} ${c.pedidos === 1 ? 'pedido' : 'pedidos'}</td><td class="r amt">${brl(c.total)}</td><td class="hide-sm soft">${dataBR(c.ultimo)}</td></tr>`).join('')}</tbody></table><div class="pager">${lista.length} cliente${lista.length === 1 ? '' : 's'}</div>` : '<div class="empty"><i class="ti ti-users"></i>Nenhum cliente encontrado.</div>';
    $$('tr[data-q]', view).forEach((tr) => tr.onclick = () => { location.hash = '#/pedidos/?q=' + encodeURIComponent(tr.dataset.q); });
  };
  let tm; $('#q', view).oninput = (e) => { f.q = e.target.value; clearTimeout(tm); tm = setTimeout(draw, 250); };
  draw();
}

// ------------------------------------------------------------------ descontos
export function cupons(view, { crumb, acts }) {
  crumb('<i class="ti ti-discount-2"></i> Descontos');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Criar cupom</button>').querySelector('#novo').onclick = () => editarCupom(null, draw);
  function draw() {
    const lista = db.all('cupons').sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><p class="muted sm" style="margin:0">O checkout valida pelo <code>loja_cupom_validar</code> (mesma resposta do fluxo "Shopify — Validar Cupom": <code>{valid, kind, value, code}</code>).</p></div></div>
    <div class="card">${lista.length ? `<table class="t"><thead><tr><th>Código</th><th>Desconto</th><th class="hide-sm">Validade</th><th class="r">Usos</th><th>Status</th></tr></thead><tbody>${lista.map((c) => `<tr class="click" data-id="${esc(c.id)}"><td><b class="mono">${esc(c.codigo)}</b><div class="xs soft">${esc(c.descricao || '')}</div></td><td>${c.tipo === 'percentual' ? `${c.valor}%` : c.tipo === 'frete' ? 'Frete grátis' : brl(c.valor)}${c.minimo ? `<div class="xs soft">acima de ${brl(c.minimo)}</div>` : ''}</td><td class="hide-sm soft">${c.fim ? 'até ' + dataBR(c.fim) : 'sem prazo'}</td><td class="r">${c.usos || 0}${c.limite ? ' / ' + c.limite : ''}</td><td>${c.ativo === false ? '<span class="badge">Inativo</span>' : c.fim && new Date(c.fim) < new Date() ? '<span class="badge amber">Expirado</span>' : '<span class="badge green">Ativo</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="ti ti-discount-2"></i>Nenhum cupom ainda. Importe os da Shopify com <code>scripts/loja-importar-pedidos.py</code> ou crie um.</div>'}</div></div>`;
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarCupom(db.get('cupons', tr.dataset.id), draw));
  }
  draw();
}

function editarCupom(orig, redraw) {
  const c = structuredClone(orig || { codigo: '', tipo: 'percentual', valor: 10, minimo: null, inicio: null, fim: null, limite: null, uso_por_cliente: null, ativo: true, usos: 0, descricao: '', criado_em: new Date().toISOString() });
  const corpo = `<form id="fcu" class="stack" onsubmit="return false">
    <div class="row">${fld('Código', inp('codigo', c.codigo, 'style="text-transform:uppercase" required'))}${fld('Descrição interna', inp('descricao', c.descricao))}</div>
    <div class="row">${fld('Tipo', sel('tipo', c.tipo, [['percentual', 'Porcentagem'], ['fixo', 'Valor fixo (R$)'], ['frete', 'Frete grátis']]))}${fld('Valor', inp('valor', c.valor ?? '', 'inputmode="decimal"'))}</div>
    <div class="row">${fld('Compra mínima (R$)', inp('minimo', c.minimo ?? '', 'inputmode="decimal"'))}${fld('Limite total de usos', inp('limite', c.limite ?? '', 'type="number"'))}</div>
    <div class="row">${fld('Início', inp('inicio', (c.inicio || '').slice(0, 16), 'type="datetime-local"'))}${fld('Fim', inp('fim', (c.fim || '').slice(0, 16), 'type="datetime-local"'))}</div>
    ${fld('Um uso por cliente?', sel('uso_por_cliente', c.uso_por_cliente ? '1' : '', [['', 'Não'], ['1', 'Sim (por e-mail/CPF)']]))}
    ${chk('ativo', c.ativo !== false, 'Ativo')}</form>`;
  const pn = abrirPainel({ titulo: orig ? 'Cupom ' + c.codigo : 'Novo cupom', corpo, central: true, rodape: `${orig ? '<button class="btn red" id="excluir" style="margin-right:auto"><i class="ti ti-trash"></i></button>' : ''}<button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  $('#salvar', pn.el).onclick = async () => {
    const f = lerForm($('#fcu', pn.el));
    const codigo = f.codigo.trim().toUpperCase().replace(/\s+/g, '');
    if (!codigo) return toast('Informe o código.', true);
    if (db.all('cupons').some((x) => x.codigo === codigo && x.id !== c.id)) return toast('Já existe um cupom com esse código.', true);
    await db.upsert('cupons', { ...c, codigo, descricao: f.descricao, tipo: f.tipo, valor: num(f.valor), minimo: num(f.minimo) || null, limite: f.limite ? Number(f.limite) : null, inicio: f.inicio ? new Date(f.inicio).toISOString() : null, fim: f.fim ? new Date(f.fim).toISOString() : null, uso_por_cliente: !!f.uso_por_cliente, ativo: f.ativo });
    toast('Cupom salvo.'); pn.fechar(); redraw();
  };
  const ex = $('#excluir', pn.el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir este cupom?', { ok: 'Excluir', perigo: true })) { await db.remove('cupons', c.id); pn.fechar(); redraw(); } };
}
