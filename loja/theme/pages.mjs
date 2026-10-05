// Templates das páginas (produto, coleção, página, blog, artigo, busca, carrinho, conta, 404).
import { esc, img, srcset, icon, brl, resumo, strip } from './util.mjs';
import { productCard, faixaPreco, carousel, sectionHeader } from './components.mjs';
import { galeria, produtoInfo, BLOCOS_PRODUTO } from './product.mjs';
import { layout } from './layout.mjs';

const breadcrumbs = (itens) => `<nav class="breadcrumbs" aria-label="Trilha">${[`<a href="/" aria-label="Início">${icon.home}</a>`, ...itens.map(([t, u]) => u ? `<a href="${esc(u)}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)].join('')}</nav>`;

// ---------------------------------------------------------------- produto
export function paginaProduto(ctx, p) {
  const f = faixaPreco(p);
  const url = `/products/${p.handle}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.titulo, url: ctx.config.dominio + url, sku: p.variantes?.[0]?.sku,
    image: (p.imagens || []).slice(0, 4).map((i) => img(i.url, 1200)), description: strip(p.descricao_html).slice(0, 4000) || undefined,
    brand: { '@type': 'Brand', name: p.fornecedor || ctx.config.nome },
    offers: (p.variantes || []).map((v) => ({ '@type': 'Offer', sku: v.sku, price: v.preco.toFixed(2), priceCurrency: 'BRL', availability: v.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${ctx.config.dominio}${url}?variant=${v.id}` })),
    ...(p.avaliacao?.total ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.avaliacao.nota, reviewCount: p.avaliacao.total } } : {}),
  };
  let body;
  if (p.landing_html) {
    body = `<div class="product-landing" data-product-landing="${esc(p.handle)}">${p.landing_html}</div>`;
  } else {
    const rel = ctx.produtos.filter((x) => x.handle !== p.handle && x.status === 'ativo').slice(0, 8);
    const car = carousel(rel.map((x) => productCard(x)), { cols: 4, colsSm: 2 });
    body = `<section class="section section--product"><div class="page-width">
  ${breadcrumbs([['Produtos', '/collections/all'], [p.titulo]])}
  <div class="product" data-product-form="${esc(p.handle)}">${galeria(p)}${produtoInfo(p, BLOCOS_PRODUTO, ctx)}</div>
</div></section>
${rel.length ? `<section class="section"><div class="page-width">${sectionHeader({ heading: 'Você também pode <em>gostar</em>', highlighted_text: 'scribble', heading_size: 'title-md' }, { botao: car.nav })}${car.html}</div></section>` : ''}`;
  }
  return layout(ctx, {
    title: p.seo?.titulo || `${p.titulo} – ${ctx.config.nome}`, description: p.seo?.descricao || resumo(p.descricao_html, 160),
    image: p.imagens?.[0]?.url, canonical: url, pageType: 'product', body, jsonld,
    head: `<meta property="product:price:amount" content="${f.min.toFixed(2)}"><meta property="product:price:currency" content="BRL">
<script>window.AN_PRODUTO=${JSON.stringify({ id: p.id, handle: p.handle, titulo: p.titulo, variantes: (p.variantes || []).map((v) => ({ id: v.id, titulo: v.titulo, preco: v.preco, disponivel: v.disponivel })) })};</script>`,
  });
}

// ---------------------------------------------------------------- coleção
const ORDENS = [['manual', 'Em destaque'], ['best-selling', 'Mais vendidos'], ['title-ascending', 'Ordem alfabética, A–Z'], ['title-descending', 'Ordem alfabética, Z–A'], ['price-ascending', 'Preço, ordem crescente'], ['price-descending', 'Preço, ordem decrescente'], ['created-descending', 'Data, mais recente primeiro'], ['created-ascending', 'Data, mais antiga primeiro']];

export function paginaColecao(ctx, col) {
  const lista = ctx.produtosDaColecao(col);
  if (col.landing_html) {
    return layout(ctx, { title: col.seo?.titulo || `${col.titulo} – ${ctx.config.nome}`, description: col.seo?.descricao || resumo(col.descricao_html) || ctx.config.descricao_home, image: col.imagem, canonical: `/collections/${col.handle}`, pageType: 'collection', body: `<div class="collection-landing">${col.landing_html}</div>` });
  }
  const banner = col.banner || (col.handle === "all" ? ctx.config.banner_colecoes : null) || col.imagem;
  const precos = lista.map((p) => faixaPreco(p).min);
  const max = Math.ceil(Math.max(0, ...precos));
  const body = `<section class="collection-banner${banner ? '' : ' collection-banner--plain'}">
  ${banner ? `<img class="collection-banner__img" src="${esc(img(banner, 1800))}" srcset="${srcset(banner, [800, 1200, 1800, 2400])}" sizes="100vw" alt="" fetchpriority="high">` : ''}
  <div class="collection-banner__content page-width">
    ${breadcrumbs([['Coleções', '/collections'], [col.titulo]])}
    ${col.mostrar_titulo ? `<h1 class="title-lg">${esc(col.titulo)}</h1>` : `<h1 class="sr-only">${esc(col.titulo)}</h1>`}
    ${col.descricao_html && col.mostrar_titulo ? `<div class="rte">${col.descricao_html}</div>` : ''}
  </div>
</section>
<section class="section section--collection" data-collection="${esc(col.handle)}"><div class="page-width">
  <div class="collection-toolbar">
    <button class="button button--secondary" data-open="filters">${icon.filter} Mostrar filtros</button>
    <span class="collection-toolbar__count" data-count>${lista.length} produto${lista.length === 1 ? '' : 's'}</span>
    <label class="collection-toolbar__sort"><span>Ordenar por:</span>
      <select data-sort>${ORDENS.map(([v, t]) => `<option value="${v}"${v === (col.ordem_padrao || 'title-ascending') ? ' selected' : ''}>${t}</option>`).join('')}</select>
    </label>
  </div>
  <div class="product-grid" data-grid>${lista.map((p, i) => {
    const f = faixaPreco(p);
    return `<div class="product-grid__item" data-title="${esc(p.titulo.toLowerCase())}" data-price="${f.min}" data-created="${esc(p.criado_em || '')}" data-pos="${i}" data-available="${f.disponivel ? 1 : 0}">${productCard(p, { lazy: i > 3 })}</div>`;
  }).join('')}</div>
  ${lista.length ? '' : '<p class="empty-state">Nenhum produto nesta coleção ainda.</p>'}
</div></section>
<div class="drawer drawer--left" data-drawer="filters" hidden><div class="drawer__panel" role="dialog" aria-label="Filtros">
  <div class="drawer__head"><span class="drawer__title">Filtros</span><button class="drawer__close" data-close aria-label="Fechar">${icon.close}</button></div>
  <div class="filters" data-filters>
    <fieldset><legend>Disponibilidade</legend><label class="check"><input type="checkbox" data-f-available> Em estoque</label></fieldset>
    <fieldset><legend>Preço</legend><div class="filters__price"><label>De <input type="number" min="0" step="1" data-f-min placeholder="0"></label><label>Até <input type="number" min="0" step="1" data-f-max placeholder="${max}"></label></div></fieldset>
    <button class="button button--primary" data-close>Ver resultados</button>
    <button class="link" data-f-clear>Limpar filtros</button>
  </div>
</div></div>`;
  return layout(ctx, { title: col.seo?.titulo || `${col.titulo} – ${ctx.config.nome}`, description: col.seo?.descricao || resumo(col.descricao_html) || ctx.config.descricao_home, image: col.imagem, canonical: `/collections/${col.handle}`, pageType: 'collection', body });
}

export function paginaColecoes(ctx) {
  const cols = ctx.colecoes.filter((c) => c.handle !== 'all');
  const body = `<section class="section"><div class="page-width">
  ${breadcrumbs([['Coleções']])}
  <h1 class="title-lg">Coleções</h1>
  <div class="grid-list" style="--cols:3;--cols-sm:1">${cols.map((c) => `<a class="collection-card" href="/collections/${esc(c.handle)}"><div class="collection-card__media">${c.imagem ? `<img src="${esc(img(c.imagem, 900))}" alt="" loading="lazy">` : ''}</div><div class="collection-card__info"><div><h2 class="collection-card__title">${esc(c.titulo)}<sup>${ctx.produtosDaColecao(c).length}</sup></h2></div><span class="collection-card__arrow">${icon.arrowR}</span></div></a>`).join('')}</div>
</div></section>`;
  return layout(ctx, { title: `Coleções – ${ctx.config.nome}`, canonical: '/collections', pageType: 'list-collections', body });
}

// ---------------------------------------------------------------- páginas
export function paginaConteudo(ctx, pg) {
  const body = pg.landing_html
    ? `<div class="page-landing">${pg.landing_html}</div>`
    : `<section class="section section--page"><div class="page-width page-width--narrow">
  <h1 class="title-lg page__title">${esc(pg.titulo)}</h1>
  <div class="rte page__body">${pg.corpo_html || ''}</div>
</div></section>`;
  const url = pg.politica ? `/policies/${pg.handle}` : `/pages/${pg.handle}`;
  return layout(ctx, { title: pg.seo?.titulo || `${pg.titulo} – ${ctx.config.nome}`, description: pg.seo?.descricao || resumo(pg.corpo_html) || ctx.config.descricao_home, canonical: url, pageType: 'page', body });
}

// ---------------------------------------------------------------- blog
const dataBR = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '';

const cardArtigo = (a, lazy = true) => `<article class="article-card">
  <a class="article-card__media" href="/blogs/${esc(a.blog)}/${esc(a.handle)}">${a.imagem ? `<img src="${esc(img(a.imagem, 800))}" srcset="${srcset(a.imagem, [400, 600, 800, 1100])}" sizes="(min-width:1024px) 31vw, 100vw" alt="${esc(a.titulo)}"${lazy ? ' loading="lazy"' : ''}>` : ''}</a>
  <div class="article-card__info">
    ${a.publicado_em ? `<time datetime="${esc(a.publicado_em)}">${dataBR(a.publicado_em)}</time>` : ''}
    <h2 class="article-card__title"><a href="/blogs/${esc(a.blog)}/${esc(a.handle)}">${esc(a.titulo)}</a></h2>
    ${a.resumo ? `<p class="article-card__excerpt">${esc(resumo(a.resumo, 150))}</p>` : ''}
    <a class="link" href="/blogs/${esc(a.blog)}/${esc(a.handle)}">Leia mais</a>
  </div>
</article>`;

export function paginaBlog(ctx, blog, artigos, { pagina = 1, total = 1 } = {}) {
  const base = `/blogs/${blog.handle}`;
  const pag = total > 1 ? `<nav class="pagination" aria-label="Paginação">${pagina > 1 ? `<a href="${base}${pagina > 2 ? `/page/${pagina - 1}` : ''}">${icon.chevL}</a>` : ''}${Array.from({ length: total }, (_, i) => i + 1).map((n) => n === pagina ? `<span class="is-on">${n}</span>` : `<a href="${base}${n > 1 ? `/page/${n}` : ''}">${n}</a>`).join('')}${pagina < total ? `<a href="${base}/page/${pagina + 1}">${icon.chevR}</a>` : ''}</nav>` : '';
  const body = `<section class="section"><div class="page-width">
  ${breadcrumbs([['Blog', base], ...(pagina > 1 ? [[`Página ${pagina}`]] : [])])}
  <h1 class="title-lg">${esc(blog.titulo)}</h1>
  <div class="grid-list blog-grid" style="--cols:3;--cols-sm:1">${artigos.map((a, i) => cardArtigo(a, i > 2)).join('')}</div>
  ${artigos.length ? '' : '<p class="empty-state">Nenhum artigo ainda.</p>'}
  ${pag}
</div></section>`;
  return layout(ctx, { title: `${blog.titulo}${pagina > 1 ? ` – Página ${pagina}` : ''} – ${ctx.config.nome}`, canonical: pagina > 1 ? `${base}/page/${pagina}` : base, pageType: 'blog', body });
}

export function paginaArtigo(ctx, a) {
  const url = `/blogs/${a.blog}/${a.handle}`;
  const blog = ctx.blogs.find((b) => b.handle === a.blog) || { titulo: 'Blog', handle: a.blog };
  const rel = ctx.artigos.filter((x) => x.blog === a.blog && x.handle !== a.handle).slice(0, 3);
  const u = encodeURIComponent(ctx.config.dominio + url);
  const body = `<article class="section article"><div class="page-width page-width--narrow">
  ${breadcrumbs([[blog.titulo, `/blogs/${blog.handle}`], [a.titulo]])}
  <header class="article__header">
    ${a.publicado_em ? `<time datetime="${esc(a.publicado_em)}">${dataBR(a.publicado_em)}</time>` : ''}
    <h1 class="title-lg">${esc(a.titulo)}</h1>
    ${a.autor ? `<p class="article__author">por ${esc(a.autor)}</p>` : ''}
  </header>
  ${a.imagem ? `<img class="article__image" src="${esc(img(a.imagem, 1400))}" srcset="${srcset(a.imagem, [700, 1000, 1400, 2000])}" sizes="(min-width:960px) 900px, 100vw" alt="${esc(a.titulo)}" fetchpriority="high">` : ''}
  <div class="rte article__body">${a.corpo_html || ''}</div>
  ${a.tags?.length ? `<p class="article__tags">${a.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
  <div class="product__share article__share"><span>Compartilhe:</span>
    <a href="https://www.facebook.com/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Facebook">${icon.facebook}</a>
    <a href="https://telegram.me/share/url?url=${u}" target="_blank" rel="noopener" aria-label="Telegram">${icon.telegram}</a>
    <a href="https://api.whatsapp.com/send?text=${u}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon.whatsapp}</a>
  </div>
</div></article>
${rel.length ? `<section class="section"><div class="page-width"><h2 class="title-md">Leia também</h2><div class="grid-list blog-grid" style="--cols:3;--cols-sm:1">${rel.map((x) => cardArtigo(x)).join('')}</div></div></section>` : ''}`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.titulo, image: a.imagem ? [img(a.imagem, 1200)] : undefined, datePublished: a.publicado_em, author: a.autor ? { '@type': 'Person', name: a.autor } : undefined, publisher: { '@type': 'Organization', name: ctx.config.nome, logo: { '@type': 'ImageObject', url: img(ctx.config.logo, 600) } }, mainEntityOfPage: ctx.config.dominio + url };
  return layout(ctx, { title: `${a.titulo} – ${ctx.config.nome}`, description: a.resumo || resumo(a.corpo_html), image: a.imagem, canonical: url, pageType: 'article', body, jsonld });
}

// ---------------------------------------------------------------- busca, carrinho, conta, 404
export function paginaBusca(ctx) {
  const body = `<section class="section"><div class="page-width">
  <h1 class="title-lg">Resultados da busca</h1>
  <form class="search-page__form" action="/search" method="get" role="search">${icon.search}<input type="search" name="q" placeholder="Procurar" data-search-page aria-label="Procurar"><button class="button button--primary">Procurar</button></form>
  <p class="search-page__count" data-search-count></p>
  <div class="product-grid" data-search-grid></div>
  <div class="search-page__articles" data-search-articles></div>
</div></section>`;
  return layout(ctx, { title: `Procurar – ${ctx.config.nome}`, canonical: '/search', pageType: 'search', body, head: '<meta name="robots" content="noindex">' });
}

export function paginaCarrinho(ctx) {
  const body = `<section class="section"><div class="page-width page-width--narrow">
  <h1 class="title-lg">Carrinho</h1>
  <div class="cart-page" data-cart-page>
    <div data-cart-items></div>
    <div class="cart-page__empty" data-cart-empty hidden><p>Seu carrinho está vazio.</p><a class="button button--primary" href="/collections/all">Continuar comprando</a></div>
    <div class="cart-page__foot" data-cart-foot hidden>
      <div class="cart-page__totals"><span>Subtotal</span><strong data-cart-subtotal></strong></div>
      <p class="cart-drawer__note">Frete e cupons são calculados na finalização da compra.</p>
      <a href="${esc(ctx.config.checkout_url)}" data-an-checkout class="button button--primary button--lg">${icon.lock} Finalizar compra</a>
    </div>
  </div>
</div></section>`;
  return layout(ctx, { title: `Carrinho – ${ctx.config.nome}`, canonical: '/cart', pageType: 'cart', body, head: '<meta name="robots" content="noindex">' });
}

export function paginaConta(ctx) {
  const body = `<section class="section"><div class="page-width page-width--narrow account">
  <h1 class="title-lg">Meus pedidos</h1>
  <p class="account__lead">Digite o código de rastreio que enviamos por e-mail e WhatsApp para acompanhar a entrega.</p>
  <form class="account__form" data-track-form action="${esc(ctx.config.rastreio_url)}" method="get">
    <input name="codigo" placeholder="Ex.: AD123456789BR" required autocomplete="off" aria-label="Código de rastreio">
    <button class="button button--primary">Rastrear</button>
  </form>
  <p class="account__help">Não encontrou o código? <a href="https://wa.me/13472225493" target="_blank" rel="noopener">Fale com o atendimento</a>.</p>
</div></section>`;
  return layout(ctx, { title: `Meus pedidos – ${ctx.config.nome}`, canonical: '/account', pageType: 'customers/account', body, head: '<meta name="robots" content="noindex">' });
}

export function pagina404(ctx) {
  const body = `<section class="section"><div class="page-width page-width--narrow not-found">
  <p class="section-subheading">404</p>
  <h1 class="title-lg">Página não encontrada</h1>
  <p>O endereço que você abriu não existe ou mudou de lugar.</p>
  <div class="not-found__actions"><a class="button button--primary" href="/collections/all">Ver produtos</a><a class="button button--secondary" href="/">Ir para o início</a></div>
</div></section>`;
  return layout(ctx, { title: `Página não encontrada – ${ctx.config.nome}`, canonical: '/404', pageType: '404', body, head: '<meta name="robots" content="noindex">' });
}
