import { db, pref, CONFIG } from './db.js';
import { esc, toast, $, $$ } from './ui.js';
import * as vendas from './views/vendas.js';
import * as catalogo from './views/catalogo.js';
import * as conteudo from './views/conteudo.js';
import * as tema from './views/tema.js';
import * as estoque from './views/estoque.js';
import * as relatorios from './views/relatorios.js';
import * as equipe from './views/equipe.js';

const LOGO = 'https://cdn.americanutrition.com/imagens/loja/w300/files/LOGOTIPO_COLORIDO_FUNDO_TRANSPARENTE.webp';
const NAV = [
  ['painel', 'home', 'Início', vendas.painel],
  ['pedidos', 'inbox', 'Pedidos', vendas.pedidos, 'pend'],
  ['produtos', 'tag', 'Produtos', catalogo.produtos],
  ['estoque', 'building-warehouse', 'Estoque', estoque.estoque, 'esg'],
  ['colecoes', 'category', 'Coleções', catalogo.colecoes],
  ['clientes', 'user', 'Clientes', vendas.clientes],
  ['cupons', 'discount-2', 'Descontos', vendas.cupons],
  ['relatorios', 'chart-bar', 'Relatórios', relatorios.relatorios],
  'Loja virtual',
  ['loja', 'building-store', 'Página inicial', tema.home],
  ['paginas', 'file-text', 'Páginas', conteudo.paginas],
  ['blog', 'news', 'Blog', conteudo.artigos],
  ['depoimentos', 'message-heart', 'Depoimentos', conteudo.depoimentos],
  ['navegacao', 'layout-navbar', 'Cabeçalho e rodapé', tema.navegacao],
  ['redirects', 'arrows-right-left', 'Redirecionamentos', tema.redirects],
  null,
  ['equipe', 'users', 'Equipe e atividade', equipe.equipe],
  ['config', 'settings', 'Configurações', tema.config],
];
const ROTAS = Object.fromEntries(NAV.filter(Array.isArray).map(([k, , , fn]) => [k, fn]));
// o que cada papel vê (o servidor confere cada operação de novo)
const ACESSO = {
  expedicao: ['pedidos', 'estoque'],
  conteudo: ['produtos', 'colecoes', 'estoque', 'loja', 'paginas', 'blog', 'depoimentos', 'navegacao', 'redirects', 'publicar'],
  gerente: Object.keys(ROTAS).filter((k) => k !== 'equipe').concat('publicar'),
};
const pode = (rota) => !ACESSO[db.papel] || ACESSO[db.papel].includes(rota);
const inicial = () => (pode('painel') ? 'painel' : (ACESSO[db.papel] || ['painel'])[0]);

(function () { try { const t = pref.get('tema', 'auto'); document.documentElement.dataset.theme = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch {} })();

function shell() {
  const nome = db.backend.user?.nome || db.backend.user?.email || 'America Nutrition';
  const ini = nome.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  document.body.innerHTML = `
<aside class="sb" id="sb">
  <a class="logo" href="#/painel"><img src="${LOGO}" alt="America Nutrition"><span>LOJA</span></a>
  <div class="sb-search" id="busca-global"><i class="ti ti-search"></i><span>Pesquisar</span><kbd>⌘K</kbd></div>
  <nav class="sb-nav">${NAV.filter((n) => !Array.isArray(n) || pode(n[0])).map((n) => !n ? '<div style="flex:1"></div>' : typeof n === 'string' ? `<div class="grp">${esc(n)}</div>` : `<a href="#/${n[0]}" data-r="${n[0]}"><i class="ti ti-${n[1]}"></i>${n[2]}${n[4] ? `<span class="cnt" data-cnt="${n[4]}" hidden></span>` : ''}</a>`).join('')}</nav>
  <div class="sb-foot">
    ${pode('publicar') ? '<a class="btn pri" href="#/publicar"><i class="ti ti-rocket"></i> Publicar loja</a>' : ''}
    <a class="btn ghost" href="/" target="_blank"><i class="ti ti-external-link"></i> Ver loja</a>
    <div class="modo${db.demo ? '' : ' on'}" title="${db.demo ? 'Alterações ficam neste navegador. Para gravar no servidor, configure o webhook loja-api.' : 'Conectado ao banco'}"><i class="ti ti-${db.demo ? 'device-laptop' : 'cloud-check'}"></i>${db.demo ? 'Modo demonstração' : 'Conectado ao servidor'}</div>
    <div class="sb-user"><span class="av">${esc(ini)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</span><button class="btn sm ico ghost" id="avisos" title="Avisos de pedido novo neste aparelho"><i class="ti ti-bell"></i></button><button class="btn sm ico ghost" id="tema" title="Tema claro/escuro"><i class="ti ti-moon"></i></button>${db.demo ? '' : '<button class="btn sm ico ghost" id="sair" title="Sair"><i class="ti ti-logout"></i></button>'}</div>
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
  db.on((t) => { if (t === 'estoque' || t === 'produtos') contadores(); });
  document.body.classList.toggle('sem-valores', db.papel === 'expedicao');
  avisos();
}

// Avisos neste aparelho (painel instalado no iPhone/Mac como app): a cada minuto procura pedidos pagos novos,
// mostra notificação e o número no ícone. Os avisos pelo Telegram chegam mesmo com o painel fechado.
function avisos() {
  const bt = $('#avisos'), ligado = () => pref.get('avisos', false) && 'Notification' in window && Notification.permission === 'granted';
  const pinta = () => { bt.innerHTML = `<i class="ti ti-bell${ligado() ? '-ringing' : ''}"></i>`; bt.title = ligado() ? 'Avisos ligados neste aparelho (clique para desligar)' : 'Ligar avisos de pedido novo neste aparelho'; };
  bt.onclick = async () => {
    if (ligado()) { pref.set('avisos', false); pinta(); return toast('Avisos desligados neste aparelho.'); }
    if (!('Notification' in window)) return toast('No iPhone, instale o painel primeiro: Compartilhar → Adicionar à Tela de Início.', true);
    const r = await Notification.requestPermission();
    pref.set('avisos', r === 'granted'); pinta();
    toast(r === 'granted' ? 'Avisos ligados: você recebe uma notificação a cada pedido pago.' : 'Permissão negada pelo navegador.', r !== 'granted');
  };
  pinta();
  let visto = pref.get('ultimo_pedido_visto', null);
  const checar = async () => {
    try {
      const lista = await db.backend.pedidos({ pagamento: 'pago', limite: 20 });
      const novos = (lista || []).filter((p) => visto && new Date(p.criado_em) > new Date(visto));
      if (lista?.[0]) { visto = visto && new Date(visto) > new Date(lista[0].criado_em) ? visto : lista[0].criado_em; pref.set('ultimo_pedido_visto', visto); }
      if (novos.length && ligado()) {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        for (const p of novos.slice(0, 3)) {
          const t = `Pedido AN-${p.numero} pago`, o = { body: `${p.cliente?.nome || ''} · ${db.papel === 'expedicao' ? (p.itens || []).length + ' item(ns)' : 'R$ ' + Number(p.total || 0).toFixed(2).replace('.', ',')}`, icon: '/admin/icone-192.png', tag: 'pedido-' + p.id, data: { url: '/admin/#/pedidos/' + p.id } };
          reg ? reg.showNotification(t, o) : new Notification(t, o);
        }
      }
      contadores();
    } catch {}
  };
  if (!db.demo) { checar(); setInterval(checar, 60000); }
}

// contador de pedidos pagos ainda não processados (como o número ao lado de "Pedidos" na Shopify)
export async function contadores() {
  try {
    const lista = await db.backend.pedidos({ entrega: '', limite: 2000 });
    const n = (lista || []).filter((p) => p.status_pagamento === 'pago' && ['nao_enviado', 'preparando'].includes(p.status_entrega)).length;
    $$('[data-cnt=pend]').forEach((el) => { el.textContent = n; el.hidden = !n; });
    try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {}
    // esgotados na loja (produtos ativos que controlam quantidade e não vendem sem estoque)
    const e = db.state.produtos.filter((p) => (p.status || 'ativo') === 'ativo').flatMap((p) => p.variantes || []).filter((v) => v.estoque != null && !v.disponivel).length;
    $$('[data-cnt=esg]').forEach((el) => { el.textContent = e; el.hidden = !e; el.title = 'Variantes esgotadas na loja'; });
  } catch {}
}
window.__contadores = contadores;

async function rota() {
  let [nome, ...resto] = (location.hash.replace(/^#\/?/, '') || inicial()).split('/');
  if (!pode(nome)) nome = inicial();
  $$('.sb-nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === nome));
  $('#sb').classList.remove('open');
  const view = $('#view'); $('#top-acts').innerHTML = ''; $('#crumb').innerHTML = '';
  const fn = nome === 'publicar' ? tema.publicar : ROTAS[nome] || ROTAS[inicial()];
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
