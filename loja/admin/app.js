import { db, pref, CONFIG } from './db.js';
import { esc, toast, $, $$ } from './ui.js';
import * as vendas from './views/vendas.js';
import * as catalogo from './views/catalogo.js';
import * as conteudo from './views/conteudo.js';
import * as tema from './views/tema.js';

const LOGO = 'https://www.americanutrition.com/cdn/shop/files/LOGOTIPO_COLORIDO_FUNDO_TRANSPARENTE.png?width=300';
const NAV = [
  ['painel', 'layout-dashboard', 'Visão geral', vendas.painel],
  ['pedidos', 'receipt', 'Pedidos', vendas.pedidos],
  ['clientes', 'users', 'Clientes', vendas.clientes],
  ['cupons', 'discount-2', 'Cupons', vendas.cupons],
  null,
  ['produtos', 'package', 'Produtos', catalogo.produtos],
  ['colecoes', 'category', 'Coleções', catalogo.colecoes],
  null,
  ['loja', 'layout-board', 'Página inicial', tema.home],
  ['paginas', 'file-text', 'Páginas', conteudo.paginas],
  ['blog', 'news', 'Blog', conteudo.artigos],
  ['depoimentos', 'message-heart', 'Depoimentos', conteudo.depoimentos],
  ['navegacao', 'menu-2', 'Cabeçalho e rodapé', tema.navegacao],
  ['config', 'settings', 'Configurações', tema.config],
  ['redirects', 'arrows-right-left', 'Redirecionamentos', tema.redirects],
];
const ROTAS = Object.fromEntries(NAV.filter(Boolean).map(([k, , , fn]) => [k, fn]));

(function () { try { const t = pref.get('tema', 'auto'); document.documentElement.dataset.theme = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch {} })();

function shell() {
  document.body.innerHTML = `
<aside class="sb" id="sb">
  <a class="logo" href="#/painel"><img src="${LOGO}" alt="America Nutrition"><span>LOJA</span></a>
  <nav class="sb-nav">${NAV.map((n) => n ? `<a href="#/${n[0]}" data-r="${n[0]}"><i class="ti ti-${n[1]}"></i>${n[2]}</a>` : '<div class="sep"></div>').join('')}</nav>
  <div class="sb-foot">
    <a class="btn pri" href="#/publicar"><i class="ti ti-rocket"></i> Publicar loja</a>
    <a class="btn sm ghost" href="/" target="_blank"><i class="ti ti-external-link"></i> Ver loja</a>
    <div class="modo${db.demo ? '' : ' on'}" title="${db.demo ? 'Alterações ficam neste navegador. Para gravar no servidor, configure o webhook loja-api.' : 'Conectado ao banco'}"><i class="ti ti-${db.demo ? 'device-laptop' : 'cloud-check'}"></i>${db.demo ? 'Modo demonstração' : 'Servidor'}</div>
    <div class="sb-user"><i class="ti ti-user-circle"></i><span style="flex:1">${esc(db.backend.user?.nome || db.backend.user?.email || '')}</span><button class="btn sm ico ghost" id="tema" title="Tema claro/escuro"><i class="ti ti-moon"></i></button>${db.demo ? '' : '<button class="btn sm ico ghost" id="sair" title="Sair"><i class="ti ti-logout"></i></button>'}</div>
  </div>
</aside>
<main><div class="top"><button class="btn ico ghost burger" id="burger"><i class="ti ti-menu-2"></i></button><div class="grow" id="crumb"></div><div id="top-acts"></div></div><div id="view"></div></main>`;
  $('#burger').onclick = () => $('#sb').classList.toggle('open');
  $('#tema').onclick = () => { const d = document.documentElement.dataset.theme === 'dark'; document.documentElement.dataset.theme = d ? 'light' : 'dark'; pref.set('tema', d ? 'light' : 'dark'); };
  const s = $('#sair'); if (s) s.onclick = async () => { await db.backend.logout(); location.reload(); };
}

async function rota() {
  const [nome, ...resto] = (location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  $$('.sb-nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === nome));
  $('#sb').classList.remove('open');
  const view = $('#view'); $('#top-acts').innerHTML = ''; $('#crumb').innerHTML = '';
  const fn = nome === 'publicar' ? tema.publicar : ROTAS[nome] || vendas.painel;
  view.innerHTML = '';
  try { await fn(view, { args: resto.map(decodeURIComponent), crumb: (h) => { $('#crumb').innerHTML = h; }, acts: (h) => { $('#top-acts').innerHTML = h; return $('#top-acts'); } }); }
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
