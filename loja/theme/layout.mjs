// Moldura de todas as páginas: <head>, barra de anúncio, cabeçalho, gavetas e rodapé.
import { esc, img, icon, brl } from './util.mjs';

const FONTES = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&family=Barlow+Semi+Condensed:wght@600;700&display=swap';

function anuncio(cfg) {
  const a = cfg.anuncio || {};
  const msgs = (a.mensagens || []).filter(Boolean);
  if (!msgs.length) return '';
  const s = cfg.social || {};
  const redes = ['facebook', 'instagram', 'youtube', 'tiktok'].filter((k) => s[k])
    .map((k) => `<a href="${esc(s[k])}" target="_blank" rel="noopener" aria-label="${k}">${icon[k]}</a>`).join('');
  return `<div class="topbar" style="--tb-bg:${esc(a.cor_fundo || '#07388E')};--tb-fg:${esc(a.cor_texto || '#FAFAFA')}">
  <div class="topbar__inner page-width">
    <div class="topbar__social">${redes}</div>
    <div class="topbar__slides" data-announcement data-speed="${Number(a.velocidade) || 5}">
      ${msgs.length > 1 ? `<button class="topbar__arrow" data-dir="-1" aria-label="Anterior">${icon.chevL}</button>` : ''}
      <div class="topbar__track">${msgs.map((m, i) => `<p class="topbar__msg${i ? '' : ' is-on'}">${icon.truck}<span>${esc(m)}</span></p>`).join('')}</div>
      ${msgs.length > 1 ? `<button class="topbar__arrow" data-dir="1" aria-label="Próximo">${icon.chevR}</button>` : ''}
    </div>
    <div class="topbar__spacer"></div>
  </div>
</div>`;
}

function header(cfg, ctx) {
  const menu = cfg.menu_principal || [];
  return `<header class="site-header" data-header>
  <div class="header__row page-width">
    <div class="header__left">
      <button class="header__icon" data-open="menu" aria-label="Menu">${icon.menu}</button>
    </div>
    <a class="header__logo" href="/" aria-label="${esc(cfg.nome)}">
      <img src="${esc(img(cfg.logo, 460))}" alt="${esc(cfg.nome)}" width="230" height="48" fetchpriority="high">
    </a>
    <div class="header__right">
      <button class="header__icon" data-open="search" aria-label="Procurar">${icon.search}</button>
      <a class="header__icon hide-sm" href="/account" aria-label="Meus pedidos">${icon.user}</a>
      <button class="header__icon header__cart" data-open="cart" aria-label="Carrinho">${icon.cart}<span class="cart-count" data-cart-count hidden>0</span></button>
    </div>
  </div>
  <div class="header__extra">${cfg.header_html || `<nav class="header__nav page-width">${menu.map((m) => `<a href="${esc(m.url)}"${ctx.url === m.url ? ' class="active"' : ''}>${esc(m.titulo)}</a>`).join('')}</nav>`}</div>
</header>`;
}

function gavetas(cfg, ctx) {
  const menu = cfg.menu_principal || [];
  const s = cfg.social || {};
  const sugeridas = (cfg.carrinho_colecoes || []).map((h) => ctx.colecoes.find((c) => c.handle === h)).filter(Boolean);
  return `
<div class="drawer drawer--left" id="drawer-menu" data-drawer="menu" hidden>
  <div class="drawer__panel" role="dialog" aria-label="Navegação no site">
    <div class="drawer__head"><span class="drawer__title">Menu</span><button class="drawer__close" data-close aria-label="Fechar">${icon.close}</button></div>
    <nav class="menu-drawer__nav">${menu.map((m) => `<a href="${esc(m.url)}"${/^https?:/.test(m.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(m.titulo)}<span>${icon.chevR}</span></a>`).join('')}</nav>
    <div class="menu-drawer__foot">
      <a href="/account" class="menu-drawer__account">${icon.user} Meus pedidos</a>
      <div class="menu-drawer__social">${['facebook', 'instagram', 'youtube', 'tiktok'].filter((k) => s[k]).map((k) => `<a href="${esc(s[k])}" target="_blank" rel="noopener" aria-label="${k}">${icon[k]}</a>`).join('')}</div>
    </div>
  </div>
</div>

<div class="drawer drawer--top" id="drawer-search" data-drawer="search" hidden>
  <div class="drawer__panel" role="dialog" aria-label="Procurar">
    <form class="search-form page-width" action="/search" method="get" role="search">
      ${icon.search}
      <input type="search" name="q" placeholder="O que você procura?" autocomplete="off" data-search-input aria-label="Procurar">
      <button type="button" class="drawer__close" data-close aria-label="Fechar">${icon.close}</button>
    </form>
    <div class="search-results page-width" data-search-results></div>
  </div>
</div>

<div class="drawer drawer--right" id="drawer-cart" data-drawer="cart" hidden>
  <div class="drawer__panel cart-drawer" role="dialog" aria-label="Carrinho">
    <div class="drawer__head"><span class="drawer__title">Carrinho <sup data-cart-count-sup>0</sup></span><button class="drawer__close" data-close aria-label="Fechar">${icon.close}</button></div>
    <div class="cart-drawer__ship" data-cart-ship data-free="${Number(cfg.frete_gratis_min) || 0}"></div>
    <div class="cart-drawer__body" data-cart-items></div>
    <div class="cart-drawer__empty" data-cart-empty hidden>
      <p class="cart-drawer__empty-title">Seu carrinho está vazio no momento.</p>
      <p class="cart-drawer__empty-sub">Não sabe por onde começar? Veja abaixo nossas linhas de produtos</p>
      <div class="cart-drawer__collections">${sugeridas.map((c) => `<a href="/collections/${esc(c.handle)}" class="cart-drawer__collection">${c.imagem ? `<img src="${esc(img(c.imagem, 300))}" alt="" loading="lazy">` : ''}<span>${esc(c.titulo)}</span></a>`).join('')}</div>
    </div>
    <div class="cart-drawer__foot" data-cart-foot hidden>
      <div class="cart-drawer__totals"><p class="cart-drawer__note">Cupons poderão ser adicionados na finalização da compra.</p><div><span>Subtotal</span><strong data-cart-subtotal>${brl(0)}</strong></div></div>
      <div class="cart-drawer__buttons">
        <a href="${esc(cfg.checkout_url)}" data-an-checkout class="button button--primary">${icon.lock} Pagar</a>
        <a href="/cart" class="button button--secondary">Ver carrinho</a>
      </div>
    </div>
  </div>
</div>`;
}

export function layout(ctx, { title, description, image, canonical, body, bodyClass = '', head = '', pageType = 'page', jsonld = null }) {
  const cfg = ctx.config;
  const url = cfg.dominio.replace(/\/$/, '') + (canonical || '/');
  const t = title || cfg.titulo_home || cfg.nome;
  const desc = description || cfg.descricao_home || '';
  const og = image || cfg.og_imagem;
  const css = `--c-primary:${cfg.cores?.primaria || '#07388E'};--c-sale:${cfg.cores?.oferta || '#AD0404'}`;
  return `<!doctype html>
<html lang="pt-BR" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
${cfg.favicon ? `<link rel="icon" href="${esc(img(cfg.favicon, 64))}">` : ''}
<meta property="og:site_name" content="${esc(cfg.nome)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:type" content="${pageType === 'product' ? 'product' : pageType === 'article' ? 'article' : 'website'}">
<meta property="og:description" content="${esc(desc)}">
${og ? `<meta property="og:image" content="${esc(img(og, 1200))}">\n<meta name="twitter:image" content="${esc(img(og, 1200))}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#07388E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTES}">
<link rel="stylesheet" href="/assets/theme.css?v=${ctx.versao}">
<script>document.documentElement.classList.replace('no-js','js');window.AN_LOJA=${JSON.stringify({ checkout: cfg.checkout_url, frete: Number(cfg.frete_gratis_min) || 0, v: ctx.versao, page: pageType })};</script>
<script src="/assets/theme.js?v=${ctx.versao}"></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${cfg.scripts_head || ''}
${head}
</head>
<body class="template-${pageType} ${bodyClass}" style="${css}">
<a class="skip-link" href="#MainContent">Pular para o conteúdo</a>
${anuncio(cfg)}
${header(cfg, ctx)}
<main id="MainContent" class="main-content">
${body}
</main>
${cfg.footer_html || ''}
${gavetas(cfg, ctx)}
${cfg.scripts_body || ''}
</body>
</html>`;
}
