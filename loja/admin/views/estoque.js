// Estoque (no modelo da Shopify): em mãos, comprometido e disponível por local, ajustes com motivo,
// recebimento de mercadoria, transferência entre locais e histórico de cada movimentação.
import { db } from '../db.js';
import { esc, brl, num, norm, $, $$, toast, abrirPainel, fld, inp, sel, chk, thumb } from '../ui.js';
import { MOTIVOS, nivel, niveisDe, disp, locaisOnline, rastreia } from '../estoque-logica.js';

const MINIMO_PADRAO = 10;
const nomeVar = (v) => (v.titulo && v.titulo !== 'Default Title' ? v.titulo : '');
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const sinal = (n) => (n > 0 ? '+' : '') + fmt(n);
const minimo = (v) => v.estoque_minimo ?? MINIMO_PADRAO;

// linhas da tabela: uma por variante, com as somas do local escolhido ('' = todos)
function linhas(local) {
  const s = db.state, on = locaisOnline(s), out = [];
  for (const p of s.produtos) {
    if ((p.status || 'ativo') === 'arquivado') continue;
    for (const v of p.variantes || []) {
      const ns = niveisDe(s, v.id).filter((n) => !local || n.local_id === local);
      const em = ns.reduce((t, n) => t + n.em_maos, 0), com = ns.reduce((t, n) => t + n.comprometido, 0);
      const online = niveisDe(s, v.id).filter((n) => on.includes(n.local_id)).reduce((t, n) => t + disp(n), 0);
      out.push({ p, v, em, com, d: em - com, online, rastreia: rastreia(s, v) });
    }
  }
  return out;
}
const ABAS = [
  ['todos', 'Todos', () => true],
  ['baixo', 'Estoque baixo', (r) => r.rastreia && r.d > 0 && r.d <= minimo(r.v)],
  ['esgotados', 'Esgotados', (r) => r.rastreia && r.d <= 0],
  ['sem_estoque', 'Vendendo sem estoque', (r) => r.rastreia && r.v.vender_sem_estoque],
  ['sem_controle', 'Sem controle', (r) => !r.rastreia],
];

export async function estoque(view, { args, crumb, acts }) {
  crumb('<i class="ti ti-building-warehouse"></i> Estoque');
  try { await db.recarregarEstoque(); } catch (e) { toast(e.message, true); }
  const st = { local: '', aba: 'todos', q: '', sujo: new Map() };
  const top = acts('<button class="btn" id="locais"><i class="ti ti-map-pin"></i> Locais</button><button class="btn" id="hist">Histórico</button><button class="btn" id="exp">Exportar</button><button class="btn" id="transf">Transferir</button><button class="btn pri" id="receber">Receber mercadoria</button>');
  $('#locais', top).onclick = () => editarLocais(draw);
  $('#hist', top).onclick = () => historico();
  $('#exp', top).onclick = () => exportar(linhas(st.local), st.local);
  $('#transf', top).onclick = () => transferir(draw);
  $('#receber', top).onclick = () => receber(st.local, draw);

  const locais = () => (db.state.locais || []).filter((l) => l.ativo !== false);
  view.innerHTML = `<div class="page">
  ${db.demo ? '<div class="help amber" style="margin-bottom:12px"><b>Quantidades reais da Shopify</b> (em mãos por local, hoje). Em modo demonstração os ajustes ficam só neste navegador; os pedidos fictícios pagos e não enviados aparecem como <b>comprometido</b>.</div>' : ''}
  <div class="metrics" id="mx"></div>
  <div class="card">
    <div class="tabbar"><select class="in" id="loc" style="width:auto;min-width:200px;font-weight:550"><option value="">Todos os locais</option>${locais().map((l) => `<option value="${esc(l.id)}">${esc(l.nome)}${l.online ? ' · loja online' : ''}</option>`).join('')}</select>
      <div class="seg" id="abas">${ABAS.map(([k, t]) => `<button data-a="${k}" class="${k === st.aba ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="search" style="margin-left:auto"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Produto ou SKU"></div></div>
    <div class="bulk" id="salvarbar" hidden><b id="nsujo" style="flex:1"></b><span class="soft">Motivo</span><select class="in" id="motivo" style="width:auto">${['correcao', 'contagem', 'recebido', 'danificado', 'perda', 'promocao', 'outro'].map((k) => `<option value="${k}">${MOTIVOS[k]}</option>`).join('')}</select><button class="btn sm" id="descartar">Descartar</button><button class="btn sm pri" id="salvar">Salvar</button></div>
    <div class="table-wrap" id="lista"></div>
    <div class="pager" id="rodape"></div>
  </div></div>`;

  function metricas() {
    const rs = linhas(st.local).filter((r) => r.rastreia);
    const valor = rs.reduce((t, r) => t + Math.max(0, r.em) * Number(r.v.custo || 0), 0);
    const ms = [
      ['Em mãos', fmt(rs.reduce((t, r) => t + r.em, 0)) + ' un.'],
      ['Comprometido', fmt(rs.reduce((t, r) => t + r.com, 0)) + ' un.'],
      ['Disponível', fmt(rs.reduce((t, r) => t + r.d, 0)) + ' un.'],
      ['Valor em estoque (custo)', brl(valor)],
      ['Estoque baixo', rs.filter(ABAS[1][2]).length],
      ['Esgotados', rs.filter(ABAS[2][2]).length],
    ];
    $('#mx', view).innerHTML = ms.map(([l, v]) => `<div class="metric"><span class="l">${esc(l)}</span><span class="v">${v}</span></div>`).join('');
  }

  function draw() {
    metricas();
    const fn = ABAS.find((a) => a[0] === st.aba)[2];
    const lista = linhas(st.local).filter(fn).filter((r) => !st.q || norm(r.p.titulo + ' ' + r.v.titulo + ' ' + (r.v.sku || '')).includes(norm(st.q)));
    const edita = !!st.local;
    $('#lista', view).innerHTML = lista.length ? `<table class="t"><thead><tr><th>Produto</th><th class="hide-sm">SKU</th><th class="r">Comprometido</th><th class="r">Disponível</th><th class="r" style="width:120px">Em mãos</th>${edita ? '' : '<th>Loja online</th>'}</tr></thead><tbody>${lista.map((r) => {
      const ch = st.sujo.get(r.v.id);
      const alerta = !r.rastreia ? '' : r.d <= 0 ? ' red' : r.d <= minimo(r.v) ? ' amber' : '';
      return `<tr class="click" data-v="${esc(r.v.id)}">
      <td><div class="cell"><img class="thumb" src="${esc(thumb(r.p.imagens?.[0]?.url))}" alt=""><div style="min-width:0"><b>${esc(r.p.titulo)}</b><small>${esc(nomeVar(r.v))}${r.p.status !== 'ativo' && r.p.status ? ` · ${esc(r.p.status)}` : ''}</small></div></div></td>
      <td class="hide-sm mono soft">${esc(r.v.sku || '—')}</td>
      <td class="r">${r.rastreia ? fmt(r.com) : '<span class="soft">—</span>'}</td>
      <td class="r">${r.rastreia ? `<span class="badge${alerta}" style="${alerta ? '' : 'background:none;padding:0'}">${fmt(r.d)}</span>` : '<span class="soft">Sem controle</span>'}</td>
      <td class="r" data-stop>${edita && r.rastreia ? `<input class="in" type="number" data-em="${esc(r.v.id)}" value="${ch ?? r.em}" style="width:96px;text-align:right${ch != null ? ';border-color:#005bd3;box-shadow:0 0 0 1px #005bd3' : ''}">` : r.rastreia ? fmt(r.em) : '<span class="soft">—</span>'}</td>
      ${edita ? '' : `<td>${!r.rastreia ? (r.v.disponivel ? '<span class="badge green"><span class="dot"></span>À venda</span>' : '<span class="badge"><span class="dot"></span>Indisponível</span>') : r.online > 0 ? `<span class="badge green"><span class="dot"></span>${fmt(r.online)} à venda</span>` : r.v.vender_sem_estoque ? '<span class="badge blue"><span class="ring"></span>Vende sem estoque</span>' : '<span class="badge red"><span class="dot"></span>Esgotado</span>'}</td>`}</tr>`;
    }).join('')}</tbody></table>` : `<div class="empty"><i class="ti ti-building-warehouse"></i>${st.q ? 'Nada encontrado.' : 'Nenhum item nesta aba.'}</div>`;
    $('#rodape', view).innerHTML = `<span>${lista.length} ${lista.length === 1 ? 'variante' : 'variantes'}${edita ? '' : ' · escolha um local para editar as quantidades'}</span>`;
    $$('tr[data-v]', view).forEach((tr) => tr.onclick = (e) => { if (e.target.closest('[data-stop]')) return; abrirVariante(tr.dataset.v, draw); });
    $$('[data-em]', view).forEach((i) => i.oninput = () => {
      const orig = linhas(st.local).find((r) => r.v.id === i.dataset.em).em;
      if (i.value === '' || Number(i.value) === orig) st.sujo.delete(i.dataset.em); else st.sujo.set(i.dataset.em, Number(i.value));
      barra();
    });
    barra();
  }
  function barra() { $('#salvarbar', view).hidden = !st.sujo.size; $('#nsujo', view).textContent = `${st.sujo.size} ${st.sujo.size === 1 ? 'alteração não salva' : 'alterações não salvas'} em ${(db.state.locais.find((l) => l.id === st.local) || {}).nome || ''}`; }
  $('#descartar', view).onclick = () => { st.sujo.clear(); draw(); };
  $('#salvar', view).onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await db.estoqueAjustar([...st.sujo].map(([vid, q]) => ({ variante_id: vid, local_id: st.local, em_maos: q, motivo: $('#motivo', view).value })));
      toast(`Estoque atualizado (${st.sujo.size}).`); avisoVitrine(r); st.sujo.clear(); draw();
    } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  };
  $('#loc', view).onchange = (e) => { if (st.sujo.size && !confirm('Descartar as alterações não salvas?')) { e.target.value = st.local; return; } st.sujo.clear(); st.local = e.target.value; draw(); };
  $$('#abas button', view).forEach((b) => b.onclick = () => { st.aba = b.dataset.a; $$('#abas button', view).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('#q', view).oninput = (e) => { st.q = e.target.value; draw(); };
  draw();
  if (args[0]) abrirVariante(args[0], draw);
}

function avisoVitrine(r) {
  for (const m of r?.mudou || []) toast(`${m.produto}${m.variante && m.variante !== 'Default Title' ? ' · ' + m.variante : ''}: ${m.disponivel ? 'voltou ao estoque' : 'esgotou'} na loja. Publique para atualizar o site.`);
}
const acharVar = (vid) => { for (const p of db.state.produtos) { const v = (p.variantes || []).find((x) => String(x.id) === String(vid)); if (v) return { p, v }; } return {}; };
const nomeLocal = (id) => (db.state.locais.find((l) => l.id === id) || {}).nome || id;

// ------------------------------------------------------------------ detalhe de uma variante
async function abrirVariante(vid, redraw) {
  const { p, v } = acharVar(vid); if (!v) return toast('Variante não encontrada.', true);
  const s = db.state;
  const corpo = `<div class="cell" style="margin-bottom:14px"><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt="" style="width:48px;height:48px"><div><b>${esc(p.titulo)}</b><small>${esc(nomeVar(v))} ${v.sku ? '· SKU ' + esc(v.sku) : ''}</small></div></div>
  <div class="stack" style="gap:12px">
    <div class="card"><div class="card-h"><h3 class="grow">Quantidades por local</h3><span class="soft xs">Em mãos é o que existe fisicamente; comprometido está reservado para pedidos pagos ainda não enviados.</span></div>
      <table class="t"><thead><tr><th>Local</th><th class="r">Comprometido</th><th class="r">Disponível</th><th class="r" style="width:120px">Em mãos</th></tr></thead><tbody>${(s.locais || []).filter((l) => l.ativo !== false).map((l) => { const n = nivel(s, v.id, l.id); return `<tr><td>${esc(l.nome)}${l.online ? ' <span class="tag">loja online</span>' : ''}</td><td class="r">${fmt(n?.comprometido)}</td><td class="r">${fmt(disp(n))}</td><td class="r"><input class="in" type="number" data-loc="${esc(l.id)}" value="${n?.em_maos || 0}" style="width:96px;text-align:right"></td></tr>`; }).join('')}</tbody></table>
      <div class="card-b" style="border-top:1px solid var(--line2);display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="soft">Motivo</span>${sel('motivo', 'correcao', ['correcao', 'contagem', 'recebido', 'danificado', 'perda', 'promocao', 'outro'].map((k) => [k, MOTIVOS[k]])).replace('<select class="in"', '<select class="in" style="width:auto"')}<input class="in" name="nota" placeholder="Observação (opcional)" style="flex:1;min-width:160px"><button class="btn pri sm" id="aj">Salvar quantidades</button></div></div>
    <div class="card card-b stack"><h3>Configurações</h3>
      ${chk('rastrear', rastreia(s, v), 'Controlar quantidade (esgota sozinho quando acaba)')}
      ${chk('vender_sem_estoque', !!v.vender_sem_estoque, 'Continuar vendendo quando esgotar')}
      <div class="row">${fld('Custo por item', inp('custo', v.custo ?? '', 'inputmode="decimal" placeholder="R$"'), v.custo && v.preco ? `Margem ${Math.round((1 - v.custo / v.preco) * 100)}% sobre ${brl(v.preco)}` : '')}${fld('Alerta de estoque baixo', inp('estoque_minimo', v.estoque_minimo ?? '', `type="number" min="0" placeholder="${MINIMO_PADRAO}"`), 'Aparece em "Estoque baixo" e no Início.')}</div>
      <div><button class="btn sm" id="cfg">Salvar configurações</button></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Histórico</h3></div><div id="mov"><div class="empty">Carregando…</div></div></div>
  </div>`;
  const pn = abrirPainel({ titulo: 'Estoque', corpo, largo: true });
  const el = pn.el;
  const desenharMov = async () => { $('#mov', el).innerHTML = tabelaMov(await db.backend.estoqueMov({ variante_id: v.id, limite: 100 }), false); };
  desenharMov();
  $('#aj', el).onclick = async (e) => {
    const itens = $$('[data-loc]', el).map((i) => ({ variante_id: v.id, local_id: i.dataset.loc, em_maos: Number(i.value || 0), motivo: $('[name=motivo]', el).value, nota: $('[name=nota]', el).value || null }))
      .filter((x) => x.em_maos !== (nivel(s, v.id, x.local_id)?.em_maos || 0));
    if (!itens.length) return toast('Nada mudou.');
    e.target.disabled = true;
    try { const r = await db.estoqueAjustar(itens); toast('Quantidades salvas.'); avisoVitrine(r); pn.fechar(); redraw?.(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
  $('#cfg', el).onclick = async () => {
    const np = structuredClone(p), nv = np.variantes.find((x) => String(x.id) === String(v.id));
    Object.assign(nv, { rastrear: $('[name=rastrear]', el).checked, vender_sem_estoque: $('[name=vender_sem_estoque]', el).checked, custo: $('[name=custo]', el).value === '' ? null : num($('[name=custo]', el).value), estoque_minimo: $('[name=estoque_minimo]', el).value === '' ? null : Number($('[name=estoque_minimo]', el).value) });
    const antes = nv.disponivel;
    await db.upsert('produtos', np);
    const depois = acharVar(v.id).v?.disponivel;
    toast('Configurações salvas.' + (antes !== depois ? ' A disponibilidade na loja mudou: publique para atualizar o site.' : ''));
    pn.fechar(); redraw?.();
  };
}

function tabelaMov(itens, comProduto = true) {
  if (!itens?.length) return '<div class="empty">Nenhuma movimentação registrada ainda.</div>';
  const d = (n, cls = '') => (n ? `<span class="${n > 0 ? 'up' : 'down'}${cls}" style="font-weight:600;color:${n > 0 ? '#0c5132' : '#8e0b21'}">${sinal(n)}</span>` : '<span class="soft">—</span>');
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Data</th>${comProduto ? '<th>Produto</th>' : ''}<th>Local</th><th>Atividade</th><th class="r">Em mãos</th><th class="r">Comprometido</th><th class="hide-sm">Por</th></tr></thead><tbody>${itens.map((m) => {
    const { p, v } = acharVar(m.variante_id);
    return `<tr><td class="soft" style="white-space:nowrap">${new Date(m.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
    ${comProduto ? `<td class="wrap"><b>${esc(p?.titulo || m.variante_id)}</b>${v && nomeVar(v) ? `<small style="display:block" class="soft">${esc(nomeVar(v))}</small>` : ''}</td>` : ''}
    <td>${esc(nomeLocal(m.local_id))}</td>
    <td class="wrap">${esc(MOTIVOS[m.motivo] || m.motivo)}${m.nota && m.nota !== MOTIVOS[m.motivo] ? ` <span class="soft">· ${esc(m.nota)}</span>` : ''}${m.pedido_numero ? ` <a class="lnk" href="#/pedidos/${esc(m.pedido_id)}">AN-${esc(m.pedido_numero)}</a>` : ''}</td>
    <td class="r">${d(m.em_maos)} <span class="soft xs">→ ${fmt(m.saldo_em_maos)}</span></td><td class="r">${d(m.comprometido)}${m.comprometido ? ` <span class="soft xs">→ ${fmt(m.saldo_comprometido)}</span>` : ''}</td>
    <td class="hide-sm soft">${esc(m.usuario || '')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

async function historico() {
  const pn = abrirPainel({ titulo: 'Histórico de estoque', largo: true, corpo: `<div style="display:flex;gap:8px;margin-bottom:12px"><select class="in" id="hl" style="width:auto"><option value="">Todos os locais</option>${(db.state.locais || []).map((l) => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select></div><div class="card" id="hm"><div class="empty">Carregando…</div></div>` });
  const go = async () => { $('#hm', pn.el).innerHTML = tabelaMov(await db.backend.estoqueMov({ local_id: $('#hl', pn.el).value, limite: 300 })); };
  $('#hl', pn.el).onchange = go; go();
}

// ------------------------------------------------------------------ receber mercadoria (entrada)
function receber(localAtual, redraw) {
  const s = db.state;
  const vs = linhas('').filter((r) => r.rastreia || (r.p.status || 'ativo') === 'ativo');
  const corpo = `<div class="row">${fld('Local que recebe', sel('local', localAtual || (s.locais.find((l) => l.online) || s.locais[0] || {}).id, s.locais.filter((l) => l.ativo !== false).map((l) => [l.id, l.nome])))}${fld('Fornecedor / nota fiscal', inp('nota', '', 'placeholder="Ex.: NF 4521 · laboratório"'))}</div>
  <div class="search" style="margin:12px 0"><i class="ti ti-search"></i><input class="in" id="rq" placeholder="Filtrar produtos"></div>
  <div class="card"><table class="t"><thead><tr><th>Produto</th><th class="r">Em mãos no local</th><th class="r" style="width:110px">Quantidade recebida</th><th class="r" style="width:110px">Custo unit.</th></tr></thead><tbody id="rl">${vs.map((r) => `<tr data-n="${esc(norm(r.p.titulo + ' ' + r.v.titulo + ' ' + (r.v.sku || '')))}"><td><div class="cell"><img class="thumb" src="${esc(thumb(r.p.imagens?.[0]?.url))}" alt=""><div><b>${esc(r.p.titulo)}</b><small>${esc(nomeVar(r.v))} ${esc(r.v.sku || '')}</small></div></div></td><td class="r soft" data-atual="${esc(r.v.id)}"></td>
    <td class="r"><input class="in" type="number" min="0" data-rq="${esc(r.v.id)}" style="width:90px;text-align:right" placeholder="0"></td><td class="r"><input class="in" data-rc="${esc(r.v.id)}" inputmode="decimal" style="width:90px;text-align:right" value="${esc(r.v.custo ?? '')}"></td></tr>`).join('')}</tbody></table></div>`;
  const pn = abrirPainel({ titulo: 'Receber mercadoria', largo: true, corpo, rodape: '<span class="soft sm" style="flex:1" id="rt"></span><button class="btn pri" id="ok"><i class="ti ti-check"></i> Dar entrada</button>' });
  const el = pn.el;
  const atual = () => { const l = $('[name=local]', el).value; $$('[data-atual]', el).forEach((td) => td.textContent = fmt(nivel(s, td.dataset.atual, l)?.em_maos)); };
  const total = () => { const t = $$('[data-rq]', el).reduce((a, i) => a + (Number(i.value) || 0), 0); $('#rt', el).textContent = t ? `${fmt(t)} unidades` : ''; };
  $('[name=local]', el).onchange = atual; atual();
  $$('[data-rq]', el).forEach((i) => i.oninput = total);
  $('#rq', el).oninput = (e) => $$('#rl tr', el).forEach((tr) => tr.hidden = !tr.dataset.n.includes(norm(e.target.value)));
  $('#ok', el).onclick = async (e) => {
    const local = $('[name=local]', el).value, nota = $('[name=nota]', el).value || null;
    const itens = $$('[data-rq]', el).filter((i) => Number(i.value) > 0).map((i) => ({ variante_id: i.dataset.rq, local_id: local, delta: Number(i.value), motivo: 'recebido', nota }));
    if (!itens.length) return toast('Informe a quantidade recebida de pelo menos um produto.', true);
    e.target.disabled = true;
    try {
      const r = await db.estoqueAjustar(itens);
      // custo por item informado no recebimento vai para a variante
      const custos = new Map($$('[data-rc]', el).filter((i) => itens.some((x) => x.variante_id === i.dataset.rc) && i.value !== '').map((i) => [i.dataset.rc, num(i.value)]));
      const prods = db.state.produtos.filter((p) => (p.variantes || []).some((v) => custos.has(String(v.id)) && custos.get(String(v.id)) !== v.custo));
      for (const p of prods) { const np = structuredClone(p); np.variantes.forEach((v) => { if (custos.has(String(v.id))) v.custo = custos.get(String(v.id)); }); await db.upsert('produtos', np); }
      toast(`Entrada de ${fmt(itens.reduce((t, x) => t + x.delta, 0))} unidades em ${nomeLocal(local)}.`); avisoVitrine(r); pn.fechar(); redraw?.();
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}

// ------------------------------------------------------------------ transferência entre locais
function transferir(redraw) {
  const s = db.state, ls = s.locais.filter((l) => l.ativo !== false);
  const corpo = `<div class="row">${fld('Origem', sel('de', (ls[0] || {}).id, ls.map((l) => [l.id, l.nome])))}${fld('Destino', sel('para', (ls[1] || ls[0] || {}).id, ls.map((l) => [l.id, l.nome])))}</div>
  ${fld('Observação', inp('nota', '', 'placeholder="Ex.: reposição da revendedora"'))}
  <div class="card" style="margin-top:12px"><table class="t"><thead><tr><th>Produto</th><th class="r">Disponível na origem</th><th class="r" style="width:110px">Transferir</th></tr></thead><tbody id="tl"></tbody></table></div>`;
  const pn = abrirPainel({ titulo: 'Transferir estoque', largo: true, corpo, rodape: '<button class="btn pri" id="ok"><i class="ti ti-arrows-exchange"></i> Transferir</button>' });
  const el = pn.el;
  const lista = () => {
    const de = $('[name=de]', el).value;
    const rs = linhas(de).filter((r) => r.d > 0);
    $('#tl', el).innerHTML = rs.map((r) => `<tr><td><div class="cell"><img class="thumb" src="${esc(thumb(r.p.imagens?.[0]?.url))}" alt=""><div><b>${esc(r.p.titulo)}</b><small>${esc(nomeVar(r.v))}</small></div></div></td><td class="r">${fmt(r.d)}</td><td class="r"><input class="in" type="number" min="0" max="${r.d}" data-tq="${esc(r.v.id)}" style="width:90px;text-align:right" placeholder="0"></td></tr>`).join('') || '<tr><td colspan="3" class="soft">Nada disponível neste local.</td></tr>';
  };
  $('[name=de]', el).onchange = lista; lista();
  $('#ok', el).onclick = async (e) => {
    const de = $('[name=de]', el).value, para = $('[name=para]', el).value;
    if (de === para) return toast('Origem e destino são o mesmo local.', true);
    const itens = $$('[data-tq]', el).filter((i) => Number(i.value) > 0).map((i) => ({ variante_id: i.dataset.tq, qtd: Math.min(Number(i.value), Number(i.max)) }));
    if (!itens.length) return toast('Informe a quantidade de pelo menos um produto.', true);
    e.target.disabled = true;
    try { const r = await db.estoqueTransferir({ de, para, itens, nota: $('[name=nota]', el).value || null }); toast(`${fmt(itens.reduce((t, x) => t + x.qtd, 0))} unidades transferidas para ${nomeLocal(para)}.`); avisoVitrine(r); pn.fechar(); redraw?.(); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}

// ------------------------------------------------------------------ locais
function editarLocais(redraw) {
  const ls = structuredClone(db.state.locais || []);
  const pn = abrirPainel({ titulo: 'Locais de estoque', largo: true, corpo: `<p class="soft sm" style="margin-top:0">A loja online vende o disponível dos locais marcados como <b>loja online</b> (como o CD). Revendedoras e o Mercado Livre Full ficam com estoque próprio, sem entrar na vitrine.</p><div class="card"><table class="t"><thead><tr><th>Nome</th><th>Loja online</th><th>Ativo</th></tr></thead><tbody id="ll"></tbody></table></div><button class="btn sm" id="add" style="margin-top:10px"><i class="ti ti-plus"></i> Adicionar local</button>`, rodape: '<button class="btn pri" id="ok">Salvar</button>' });
  const el = pn.el;
  const draw = () => {
    $('#ll', el).innerHTML = ls.map((l, i) => `<tr><td><input class="in" data-i="${i}" data-k="nome" value="${esc(l.nome)}"></td><td><input type="checkbox" data-i="${i}" data-k="online"${l.online ? ' checked' : ''}></td><td><input type="checkbox" data-i="${i}" data-k="ativo"${l.ativo !== false ? ' checked' : ''}></td></tr>`).join('');
    $$('[data-k]', el).forEach((x) => x.oninput = x.onchange = () => { ls[+x.dataset.i][x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value; });
  };
  draw();
  $('#add', el).onclick = () => { ls.push({ id: 'local-' + Date.now().toString(36), nome: 'Novo local', ativo: true, online: false, ordem: ls.length }); draw(); };
  $('#ok', el).onclick = async () => {
    try { const r = await db.locaisGravar(ls.map((l, i) => ({ ...l, ordem: i }))); toast('Locais salvos.'); avisoVitrine(r); pn.fechar(); location.reload(); } catch (err) { toast(err.message, true); }
  };
}

function exportar(rs, local) {
  const cab = ['Produto', 'Variante', 'SKU', 'Local', 'Em mãos', 'Comprometido', 'Disponível', 'Custo', 'Valor (custo)', 'Vende sem estoque'];
  const l = local ? nomeLocal(local) : 'Todos';
  const csv = [cab, ...rs.filter((r) => r.rastreia).map((r) => [r.p.titulo, nomeVar(r.v), r.v.sku, l, r.em, r.com, r.d, r.v.custo ?? '', r.v.custo ? (r.em * r.v.custo).toFixed(2) : '', r.v.vender_sem_estoque ? 'sim' : 'não'])]
    .map((x) => x.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
