// Shell do app: layout, roteador, seletor de empresa, paleta de comandos, atalhos, tema, onboarding.
import { db, prefs } from './db.js';
import { h, icon, modal, toast, avatar, bankIcon, catIcon, closeAll, menu, on } from './ui.js';
import { esc, money, norm, today, fmtDate } from './utils.js';
import { seedEmpresa, seedCadastros, seedLancamentos } from './seed.js';
import { statusOf, emAberto } from './model.js';
import { ctx as mkCtx } from './model.js';

export const app = {
  empresaId: null, userName: prefs.get('nome', ''), view: null, root: null,
  ctx() { return mkCtx(this.empresaId); },
  lanc(id) { return db.get('lancamentos', id); },
  setEmpresa(id) { this.empresaId = id; prefs.set('empresa', id); paintSidebar(); route(true); },
  applyTheme() { const t = prefs.get('tema', 'auto'); const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0B1220' : '#F3F6FB'); },
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => app.applyTheme());

const NAV = [
  { hash: '#/', label: 'Visão geral', icon: 'ti-layout-dashboard', key: 'h' },
  { hash: '#/pagar', label: 'Contas a pagar', icon: 'ti-arrow-up-right', key: 'p' },
  { hash: '#/receber', label: 'Contas a receber', icon: 'ti-arrow-down-left', key: 'r' },
  { hash: '#/extrato', label: 'Contas e extrato', icon: 'ti-building-bank', key: 'e' },
  { hash: '#/fluxo', label: 'Fluxo de caixa', icon: 'ti-chart-area-line', key: 'f' },
  { hash: '#/dre', label: 'DRE', icon: 'ti-report-analytics', key: 'd' },
  { hash: '#/relatorios', label: 'Relatórios', icon: 'ti-chart-pie', key: 'l' },
  { hash: '#/cadastros', label: 'Cadastros', icon: 'ti-address-book', key: 'c' },
  { hash: '#/config', label: 'Configurações', icon: 'ti-settings', key: ',' },
];
const VIEWS = { '': 'dashboard', pagar: 'lancamentos', receber: 'lancamentos', extrato: 'extrato', fluxo: 'fluxo', dre: 'dre', relatorios: 'relatorios', cadastros: 'cadastros', config: 'config' };

async function boot() {
  app.applyTheme(); document.documentElement.dataset.dens = prefs.get('densidade', 'normal');
  await db.init();
  if (db.loadError && db.backend.name === 'supabase') { toast('Não consegui carregar do Supabase: ' + db.loadError.message, 'err', 8000); }
  document.getElementById('splash')?.remove();
  let emp = db.all('empresas').find(e => e.id === prefs.get('empresa')) || db.all('empresas')[0];
  if (!emp) { emp = await onboarding(); }
  app.empresaId = emp.id; prefs.set('empresa', emp.id);
  layout(); paintSidebar();
  window.addEventListener('hashchange', () => route());
  if (!location.hash || location.hash === '#') location.hash = prefs.get('inicio', '#/');
  route(true);
  db.onChange(() => { if (app._renderTimer) return; app._renderTimer = setTimeout(() => { app._renderTimer = null; paintSidebar(); route(false, true); }, 30); });
  document.getElementById('splash')?.remove();
}

async function onboarding() {
  return new Promise(res => {
    const m = modal({ title: 'Bem-vindo ao Financeiro', size: 'md', cls: 'onb', footer: null, body: `<p class="muted">Vou criar a empresa <b>America Nutrition</b> com o plano de contas e as contas bancárias já configuradas (Inter, BTG, Stone, Pagar.me, Caixa). Como quer começar?</p>
      <div class="modes col"><button class="mode on" data-ex="1"><div>${icon('ti-sparkles')}<b>Com lançamentos de exemplo</b><p>Cinco meses de movimentação realista pra explorar telas, gráficos e a conciliação. Dá pra remover em um clique depois.</p></div></button><button class="mode" data-ex="0"><div>${icon('ti-file-plus')}<b>Do zero</b><p>Só os cadastros. Ideal pra importar do Nibo ou começar a lançar de verdade.</p></div></button></div>` });
    m.el.querySelector('.ov-x').remove(); m.el.querySelector('.ov-bg').onclick = null;
    m.body.querySelectorAll('[data-ex]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.innerHTML = `<div>${icon('ti-loader-2', 'spin')}<b>Preparando…</b></div>`;
      const e = seedEmpresa(); await db.upsert('empresas', e);
      const s = seedCadastros(e.id); await db.upsert('contas', s.contas); await db.upsert('categorias', s.categorias); await db.upsert('centros', s.centros); await db.upsert('contatos', s.contatos); await db.upsert('tags', s.tags);
      if (b.dataset.ex === '1') await db.upsert('lancamentos', seedLancamentos(e.id, s));
      m.close(); res(e);
    });
  });
}

function layout() {
  document.body.insertAdjacentHTML('afterbegin', `
  <aside class="sb" id="sidebar"><div class="sb-top"><a href="#/" class="logo"><img src="https://cdn.shopify.com/s/files/1/0643/9000/4908/t/26/assets/logo-america-nutrition.png" alt="America Nutrition"><span>Financeiro</span></a><button class="ibtn sb-close" data-sb-close>${icon('ti-x')}</button></div>
    <button class="emp" data-emp></button>
    <nav class="sb-nav">${NAV.map(n => `<a href="${n.hash}" data-nav="${n.hash}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}</nav>
    <div class="sb-foot"><button class="sb-cmd" data-cmd>${icon('ti-search')}<span>Buscar</span><kbd>⌘K</kbd></button><div class="sb-mode" data-mode></div></div></aside>
  <div class="sb-bg" data-sb-close></div>
  <header class="topbar" id="topbar"><button class="ibtn" data-sb-open>${icon('ti-menu-2')}</button><a href="#/" class="top-logo"><img src="https://cdn.shopify.com/s/files/1/0643/9000/4908/t/26/assets/logo-america-nutrition.png" alt=""></a><span class="grow"></span><button class="ibtn" data-cmd>${icon('ti-search')}</button><button class="btn primary sm" data-new>${icon('ti-plus')}Novo</button></header>
  <main id="main"></main>
  <nav class="tabbar" id="tabbar"><a href="#/" data-nav="#/">${icon('ti-layout-dashboard')}<span>Início</span></a><a href="#/pagar" data-nav="#/pagar">${icon('ti-arrow-up-right')}<span>Pagar</span></a><button class="fab" data-new>${icon('ti-plus')}</button><a href="#/receber" data-nav="#/receber">${icon('ti-arrow-down-left')}<span>Receber</span></a><a href="#/extrato" data-nav="#/extrato">${icon('ti-building-bank')}<span>Contas</span></a></nav>`);
  app.root = document.getElementById('main');
  on(document.body, 'click', '[data-sb-open]', () => document.body.classList.add('sb-open'));
  on(document.body, 'click', '[data-sb-close]', () => document.body.classList.remove('sb-open'));
  on(document.body, 'click', '[data-cmd]', () => cmdk());
  on(document.body, 'click', '[data-new]', (e, b) => novoMenu(b));
  on(document.body, 'click', '[data-emp]', (e, b) => empresaMenu(b));
  on(document.body, 'click', '.sb-nav a', () => document.body.classList.remove('sb-open'));
  document.addEventListener('keydown', keys);
}
function paintSidebar() {
  const e = db.get('empresas', app.empresaId); if (!e) return;
  const b = document.querySelector('[data-emp]'); b.innerHTML = `${avatar(e.nome, 30, e.cor)}<span class="emp-n">${esc(e.nome)}</span>${icon('ti-selector')}`;
  const m = document.querySelector('[data-mode]'); m.innerHTML = db.backend.name === 'supabase' ? `${icon('ti-cloud')}<span>Supabase${db.backend.user ? ' · ' + esc(db.backend.user.email.split('@')[0]) : ''}</span>` : `${icon('ti-device-laptop')}<span>Dados neste navegador</span>`;
  m.onclick = () => location.hash = '#/config/conexao';
  document.title = `${e.nome} · Financeiro`;
}
function empresaMenu(anchor) {
  const emps = db.all('empresas');
  menu(anchor, [...emps.map(e => ({ label: `${e.nome}${e.id === app.empresaId ? '  ✓' : ''}`, icon: 'ti-building', onClick: () => app.setEmpresa(e.id) })), '-', { label: 'Nova empresa', icon: 'ti-plus', onClick: async () => { const { editarEmpresa } = await import('./views/config.js'); editarEmpresa(null); } }, { label: 'Gerenciar empresas', icon: 'ti-settings', onClick: () => location.hash = '#/config/empresa' }], { align: 'left' });
}
async function novoMenu(anchor) {
  const { abrirLancamento } = await import('./views/form-lancamento.js');
  menu(anchor, [{ label: 'Despesa', icon: 'ti-arrow-up-right', kbd: 'N', onClick: () => abrirLancamento(null, { tipo: 'pagar' }) }, { label: 'Receita', icon: 'ti-arrow-down-left', kbd: 'R', onClick: () => abrirLancamento(null, { tipo: 'receber' }) }, { label: 'Transferência entre contas', icon: 'ti-arrows-exchange', kbd: 'T', onClick: () => abrirLancamento(null, { tipo: 'transferencia' }) }, '-', { label: 'Contato', icon: 'ti-user-plus', onClick: async () => (await import('./views/cadastros.js')).abrirContato() }, { label: 'Conta bancária', icon: 'ti-building-bank', onClick: async () => (await import('./views/cadastros.js')).abrirConta() }]);
}

let lastHash = null; let scrollMem = {};
async function route(force = false, refresh = false) {
  const hash = location.hash || '#/'; const [path, qs] = hash.slice(1).split('?'); const parts = path.split('/').filter(Boolean); const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const key = parts[0] || ''; const viewName = VIEWS[key] || 'dashboard';
  if (parts[1] === 'novo' && (key === 'pagar' || key === 'receber')) { const { abrirLancamento } = await import('./views/form-lancamento.js'); location.replace('#/' + key); abrirLancamento(null, { tipo: key }); return; }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === '#/' + key || (a.dataset.nav === '#/' && key === '')));
  const mod = await import(`./views/${viewName}.js`);
  const y = refresh ? app.root.scrollTop || window.scrollY : 0;
  if (!refresh && lastHash !== hash) window.scrollTo(0, 0);
  const opts = { tipo: key === 'receber' ? 'receber' : 'pagar', params, sub: parts[1] || null, contaId: key === 'extrato' ? parts[1] || null : null };
  try { mod.render(app.root, opts); } catch (e) { console.error(e); app.root.innerHTML = `<div class="page"><div class="alert red">${icon('ti-bug')}Erro ao abrir a tela: ${esc(e.message)}</div></div>`; }
  if (refresh) window.scrollTo(0, y);
  lastHash = hash; app.view = viewName;
}

// ---------- paleta de comandos ----------
let cmdOpen = false;
async function cmdk() {
  if (cmdOpen) return; cmdOpen = true;
  const { abrirLancamento, abrirDetalhe } = await import('./views/form-lancamento.js');
  const C = app.ctx();
  const acoes = [
    { label: 'Nova despesa', icon: 'ti-arrow-up-right', kbd: 'N', run: () => abrirLancamento(null, { tipo: 'pagar' }) }, { label: 'Nova receita', icon: 'ti-arrow-down-left', kbd: 'R', run: () => abrirLancamento(null, { tipo: 'receber' }) }, { label: 'Transferência', icon: 'ti-arrows-exchange', kbd: 'T', run: () => abrirLancamento(null, { tipo: 'transferencia' }) },
    ...NAV.map(n => ({ label: 'Ir para ' + n.label, icon: n.icon, run: () => location.hash = n.hash })),
    { label: 'Exportar backup', icon: 'ti-download', run: () => location.hash = '#/config/dados' }, { label: 'Tema escuro / claro', icon: 'ti-moon', run: () => { prefs.set('tema', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); app.applyTheme(); } },
  ];
  const m = modal({ title: '', size: 'cmd', cls: 'cmdk', footer: null, body: `<div class="cmd-s">${icon('ti-search')}<input placeholder="Buscar lançamentos, contatos, contas… ou digitar um comando" autofocus><kbd>esc</kbd></div><div class="cmd-l"></div>`, onClose: () => cmdOpen = false });
  m.el.querySelector('.ov-h').remove();
  const inp = m.body.querySelector('input'), list = m.body.querySelector('.cmd-l'); let hi = 0; let items = [];
  const paint = () => {
    const q = norm(inp.value); items = [];
    if (!q) items = acoes.slice(0, 8).map(a => ({ ...a, group: 'Ações' }));
    else {
      items.push(...acoes.filter(a => norm(a.label).includes(q)).slice(0, 4).map(a => ({ ...a, group: 'Ações' })));
      items.push(...C.contas.filter(c => norm(c.nome).includes(q)).slice(0, 3).map(c => ({ label: c.nome, sub: 'Conta', icon: bankIcon(c, 24), group: 'Contas', run: () => location.hash = '#/extrato/' + c.id })));
      items.push(...C.contatos.filter(c => norm(c.nome).includes(q)).slice(0, 4).map(c => ({ label: c.nome, sub: 'Contato', icon: avatar(c.nome, 24), group: 'Contatos', run: async () => (await import('./views/cadastros.js')).abrirContato(c) })));
      items.push(...C.categorias.filter(c => norm(c.nome).includes(q)).slice(0, 3).map(c => ({ label: c.nome, sub: 'Categoria', icon: catIcon(c, 24), group: 'Categorias', run: () => location.hash = `#/relatorios?categoria=${c.id}` })));
      const ls = C.lancamentos.filter(l => norm(l.descricao + ' ' + (C.contato(l.contato_id)?.nome || '') + ' ' + l.valor + ' ' + (l.referencia || '')).includes(q)).sort((a, b) => b.vencimento.localeCompare(a.vencimento)).slice(0, 8);
      items.push(...ls.map(l => ({ label: l.descricao, sub: `${fmtDate(l.vencimento)} · ${money(l.valor)} · ${statusOf(l)}`, icon: catIcon(C.cat(l.categoria_id), 24), group: 'Lançamentos', run: () => abrirDetalhe(l) })));
    }
    let g = null; list.innerHTML = items.map((it, i) => (it.group !== g ? `<div class="cmd-g">${(g = it.group)}</div>` : '') + `<button class="cmd-it ${i === hi ? 'hi' : ''}" data-i="${i}">${it.icon?.startsWith('<') ? it.icon : icon(it.icon)}<span class="t">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`).join('') || '<div class="combo-none">Nada encontrado</div>';
    list.querySelector('.hi')?.scrollIntoView({ block: 'nearest' });
  };
  paint(); inp.oninput = () => { hi = 0; paint(); };
  inp.onkeydown = e => { if (e.key === 'ArrowDown') { hi = Math.min(items.length - 1, hi + 1); paint(); e.preventDefault(); } else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); paint(); e.preventDefault(); } else if (e.key === 'Enter' && items[hi]) { m.close(); items[hi].run(); } };
  list.onclick = e => { const b = e.target.closest('.cmd-it'); if (!b) return; m.close(); items[Number(b.dataset.i)].run(); };
  setTimeout(() => inp.focus(), 30);
}

// ---------- atalhos ----------
let gPending = false;
async function keys(e) {
  const tag = (e.target.tagName || '').toLowerCase(); const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdk(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.ov.on')) return;
  const k = e.key.toLowerCase();
  if (gPending) { gPending = false; const n = NAV.find(x => x.key === k); if (n) location.hash = n.hash; return; }
  if (k === 'g') { gPending = true; setTimeout(() => gPending = false, 1200); return; }
  if (['n', 'r', 't'].includes(k)) { const { abrirLancamento } = await import('./views/form-lancamento.js'); abrirLancamento(null, { tipo: { n: 'pagar', r: 'receber', t: 'transferencia' }[k] }); e.preventDefault(); }
  if (k === '/') { e.preventDefault(); cmdk(); }
}

boot().catch(e => { console.error(e); document.getElementById('splash')?.remove(); document.body.insertAdjacentHTML('beforeend', `<div class="page"><div class="alert red">Erro ao iniciar: ${esc(e.message)}</div></div>`); });
