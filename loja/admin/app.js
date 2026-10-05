import { db, pref, CONFIG } from './db.js';
import { esc, toast, $, $$ } from './ui.js';
import * as vendas from './views/vendas.js';
import * as catalogo from './views/catalogo.js';
import * as conteudo from './views/conteudo.js';
import * as tema from './views/tema.js';

const LOGO = 'https://www.americanutrition.com/cdn/shop/files/LOGOTIPO_COLORIDO_FUNDO_TRANSPARENTE.png?width=300';
const NAV = [
  ['painel', 'home', 'Início', vendas.painel],
  ['pedidos', 'inbox', 'Pedidos', vendas.pedidos, 'pend'],
  ['produtos', 'tag', 'Produtos', catalogo.produtos],
  ['colecoes', 'category', 'Coleções', catalogo.colecoes],
  ['clientes', 'user', 'Clientes', vendas.clientes],
  ['cupons', 'discount-2', 'Descontos', vendas.cupons],
  'Loja virtual',
  ['loja', 'building-store', 'Página inicial', tema.home],
  ['paginas', 'file-text', 'Páginas', conteudo.paginas],
  ['blog', 'news', 'Blog', conteudo.artigos],
  ['depoimentos', 'message-heart', 'Depoimentos', conteudo.depoimentos],
  ['navegacao', 'layout-navbar', 'Cabeçalho e rodapé', tema.navegacao],
  ['redirects', 'arrows-right-left', 'Redirecionamentos', tema.redirects],
  null,
  ['config', 'settings', 'Configurações', tema.config],
];
const ROTAS = Object.fromEntries(NAV.filter(Array.isArray).map(([k, , , fn]) => [k, fn]));

(function () { try { const t = pref.get('tema', 'auto'); document.documentElement.dataset.theme = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch {} })();

function shell() {
  const nome = db.backend.user?.nome || db.backend.user?.email || 'America Nutrition';
  const ini = nome.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  document.body.innerHTML = `
<aside class="sb" id="sb">
  <a class="logo" href="#/painel"><img src="${LOGO}" alt="America Nutrition"><span>LOJA</span></a>
  <div class="sb-search" id="busca-global"><i class="ti ti-search"></i><span>Pesquisar</span><kbd>⌘K</kbd></div>
  <nav class="sb-nav">${NAV.map((n) => !n ? '<div style="flex:1"></div>' : typeof n === 'string' ? `<div class="grp">${esc(n)}</div>` : `<a href="#/${n[0]}" data-r="${n[0]}"><i class="ti ti-${n[1]}"></i>${n[2]}${n[4] ? `<span class="cnt" data-cnt="${n[4]}" hidden></span>` : ''}</a>`).join('')}</nav>
  <div class="sb-foot">
    <a class="btn pri" href="#/publicar"><i class="ti ti-rocket"></i> Publicar loja</a>
    <a class="btn ghost" href="/" target="_blank"><i class="ti ti-external-link"></i> Ver loja</a>
    <div class="modo${db.demo ? '' : ' on'}" title="${db.demo ? 'Alterações ficam neste navegador. Para gravar no servidor, configure o webhook loja-api.' : 'Conectado ao banco'}"><i class="ti ti-${db.demo ? 'device-laptop' : 'cloud-check'}"></i>${db.demo ? 'Modo demonstração' : 'Conectado ao servidor'}</div>
    <div class="sb-user"><span class="av">${esc(ini)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</span><button class="btn sm ico ghost" id="tema" title="Tema claro/escuro"><i class="ti ti-moon"></i></button>${db.demo ? '' : '<button class="btn sm ico ghost" id="sair" title="Sair"><i class="ti ti-logout"></i></button>'}</div>
  </div>
</aside>
<main><div class="main-in"><div class="top"><button class="btn ico ghost burger" id="burger"><i class="ti ti-menu-2"></i></button><div class="grow" id="crumb"></div><div id="top-acts" style="display:flex;gap:8px"></div></div><div id="view"></div></div></main>`;
  $('#burger').onclick = () => $('#sb').classList.toggle('open');
  $('#tema').onclick = () => { const d = document.documentElement.dataset.theme === 'dark'; document.documentElement.dataset.theme = d ? 'light' : 'dark'; pref.set('tema', d ? 'light' : 'dark'); };
  const s = $('#sair'); if (s) s.onclick = async () => { await db.backend.logout(); location.reload(); };
  // busca global: ⌘K leva à lista de pedidos com o termo
  const buscar = () => { const q = prompt('Pesquisar pedidos (número, cliente, e-mail, CPF ou rastreio):'); if (q) location.hash = '#/pedidos/?q=' + encodeURIComponent(q); };
  $('#busca-global').onclick = buscar;
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); buscar(); } });
  contadores();
}

// contador de pedidos pagos ainda não processados (como o número ao lado de "Pedidos" na Shopify)
export async function contadores() {
  try {
    const lista = await db.backend.pedidos({ entrega: '', limite: 2000 });
    const n = (lista || []).filter((p) => p.status_pagamento === 'pago' && ['nao_enviado', 'preparando'].includes(p.status_entrega)).length;
    $$('[data-cnt=pend]').forEach((el) => { el.textContent = n; el.hidden = !n; });
  } catch {}
}
window.__contadores = contadores;

async function rota() {
  const [nome, ...resto] = (location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  $$('.sb-nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === nome));
  $('#sb').classList.remove('open');
  const view = $('#view'); $('#top-acts').innerHTML = ''; $('#crumb').innerHTML = '';
  const fn = nome === 'publicar' ? tema.publicar : ROTAS[nome] || vendas.painel;
  view.innerHTML = '';
  try { await fn(view, { args: resto.map(decodeURIComponent), crumb: (h) => { const ic = (NAV.find((n) => Array.isArray(n) && n[0] === nome) || [])[1]; $('#crumb').innerHTML = (ic && !h.startsWith('<i') ? `<i class="ti ti-${ic}"></i> ` : '') + h.replace(/<\/?b>/g, ''); }, acts: (h) => { $('#top-acts').innerHTML = h; return $('#top-acts'); } }); }
  catch (e) { console.error(e); view.innerHTML = `<div class="page"><div class="card empty"><i class="ti ti-alert-triangle"></i>${esc(e.message)}</div></div>`; }
  window.scrollTo(0, 0);
}

function login(msg = '') {
  document.body.innerHTML = `<div class="login"><form class="login-box" id="lf">
  <img src="${LOGO}" alt=""><h1>Loja</h1><p class="muted">Entre com o mesmo usuário do Financeiro.</p>
  ${msg ? `<div class="login-err">${esc(msg)}</div>` : ''}
  <label class="fld"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
  <label class="fld"><span>Senha</span><input class="in" name="senha" type="password" autocomplete="current-password" required></label>
  <button class="btn pri lg">Entrar</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; f.querySelector('button').disabled = true;
    try { await db.backend.login(f.email.value, f.senha.value); iniciar(); } catch (err) { login(err.message); }
  };
}

async function iniciar() {
  try { await db.init(); }
  catch (e) {
    if (e.code === 'login' || e.code === 'sessao_invalida') { pref.del('sessao'); return login(e.code === 'sessao_invalida' ? 'Sessão expirada.' : ''); }
    document.body.innerHTML = `<div class="login"><div class="login-box"><h1>Não foi possível abrir</h1><p class="muted">${esc(e.message)}</p><button class="btn pri" onclick="location.reload()">Tentar de novo</button></div></div>`;
    return;
  }
  shell();
  window.addEventListener('hashchange', rota);
  rota();
}
window.addEventListener('error', (e) => toast(e.message, true));
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || String(e.reason), true));
iniciar();
