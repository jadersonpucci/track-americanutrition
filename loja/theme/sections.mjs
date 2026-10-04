// Seções da home (mesmos tipos e configurações do tema Concept, para importar o templates/index.json sem conversão).
import { esc, img, srcset, icon, heading, titleSize, link, secVars, temFundo, brl, resumo } from './util.mjs';
import { productCard, sectionHeader, botao, carousel, preco, estrelas, faixaPreco } from './components.mjs';
import { produtoInfo, galeria } from './product.mjs';

const wrap = (id, tipo, c, inner, extra = '') => {
  const cls = ['section', `section--${tipo}`, temFundo(c) ? 'section--bg' : '', c.rounded ? 'section--rounded' : '', c.full_width === false ? 'section--inset' : ''].filter(Boolean).join(' ');
  return `<section id="sec-${esc(id)}" class="${cls}" style="${secVars(c)}"${extra}>${inner}</section>`;
};

const R = {};

// ---------------------------------------------------------------- Hero rotativo (seção própria da America Nutrition)
R['hero-rotativo'] = (id, s) => {
  const c = s.config || {}; const bl = s.blocos || [];
  const slides = bl.map((b, i) => {
    const x = b.config || {};
    const vd = x.video_desktop || x.video_mobile, vm = x.video_mobile || x.video_desktop;
    const vop = (x.video_opacity ?? 100) / 100;
    const pool = [x.video_square, ...(x.video_square_pool || '').split('\n')].map((u) => (u || '').trim()).filter(Boolean);
    const ppool = [x.video_square ? x.poster_sq_url : null, ...(x.poster_sq_pool || '').split('\n')].map((u) => (u || '').trim()).filter((u, k) => k > 0 || x.video_square);
    const href = link(x.link);
    return `<article class="hrx-slide${i ? '' : ' is-active'} hrx-acc-${esc(x.accent || 'red')}" data-href="${esc(href)}" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${bl.length}"${href ? ' tabindex="0"' : ''}>
  <div class="hrx-bg"${x.bg_image ? ` style="background-image:url(${esc(img(x.bg_image, 2000))})"` : ''}></div>
  ${vd ? `<video class="hrx-vid hrx-vid--d" muted loop playsinline preload="none" style="opacity:${vop}" data-src="${esc(vd)}"${x.poster_bg_url ? ` poster="${esc(x.poster_bg_url)}"` : ''}></video>
  <video class="hrx-vid hrx-vid--m" muted loop playsinline preload="none" style="opacity:${vop}" data-src="${esc(vm)}"${x.poster_bg_url ? ` poster="${esc(x.poster_bg_url)}"` : ''}></video>` : ''}
  <div class="hrx-scrim"></div>
  <div class="hrx-wrap">
    <div class="hrx-copy">
      ${x.eyebrow ? `<span class="hrx-eyebrow"><span class="hrx-flag"><i></i><i></i><i></i></span> ${esc(x.eyebrow)}</span>` : ''}
      ${x.heading ? `<${i ? 'h2' : 'h1'} class="hrx-h">${x.heading}${x.heading_em ? ` <span class="hrx-em">${x.heading_em}</span>` : ''}</${i ? 'h2' : 'h1'}>` : ''}
      ${x.subheading ? `<p class="hrx-sub">${x.subheading}</p>` : ''}
      ${x.rating ? `<div class="hrx-rate"><span class="hrx-stars"></span> <span>${esc(x.rating)}</span></div>` : ''}
      ${x.price ? `<div class="hrx-price"><span class="hrx-from">${esc(x.price_prefix || 'A partir de')}</span><span class="hrx-now"><i>R$</i>${esc(x.price)}</span></div>` : ''}
      ${x.button_label && href ? `<div class="hrx-cta"><a class="hrx-btn hrx-btn-red hrx-beam" href="${esc(href)}">${esc(x.button_label)}</a></div>` : ''}
    </div>
    ${pool.length ? `<div class="hrx-specimen"><div class="hrx-square"><video class="hrx-specvid" muted loop playsinline preload="none" data-specsrc="${esc(pool[0])}" data-specpool="${esc(pool.join('|'))}" data-specmode="${esc(x.square_rotation || 'sequence')}" data-specposterpool="${esc(ppool.join('|'))}"${ppool[0] || x.poster_sq_url ? ` poster="${esc(ppool[0] || x.poster_sq_url)}"` : ''}></video></div></div>`
      : x.product_image ? `<div class="hrx-specimen"><img class="hrx-spec-img" src="${esc(img(x.product_image, 900))}" alt="${esc(x.heading || 'Produto')}" loading="lazy"></div>` : ''}
  </div>
</article>`;
  }).join('');
  const setas = c.show_arrows && bl.length > 1 ? `<button class="hrx-arrow prev" type="button" aria-label="Anterior">${icon.chevL}</button><button class="hrx-arrow next" type="button" aria-label="Próximo">${icon.chevR}</button>` : '';
  const dots = c.show_dots && bl.length > 1 ? `<div class="hrx-dots" role="tablist" aria-label="Selecionar slide">${bl.map((_, i) => `<button class="hrx-dot${i ? '' : ' is-on'}" type="button" role="tab" aria-label="Ir para slide ${i + 1}" aria-selected="${!i}"></button>`).join('')}</div>` : '';
  return `<section class="hrx hrx--${esc(c.height || 'medium')}" id="sec-${esc(id)}" data-section="${esc(id)}" data-interval="${(Number(c.interval_seconds) || 10) * 1000}" data-autoplay="${!!c.autoplay}" data-pause="${!!c.pause_on_hover}" aria-roledescription="carrossel" aria-label="${esc(c.aria_label || 'Destaques de produtos')}">
  <div class="hrx-stage">${slides || '<div class="hrx-empty">Adicione slides nesta seção pelo painel.</div>'}</div>${setas}${dots}
</section>`;
};

// ---------------------------------------------------------------- Outubro Rosa (seção própria)
R['an-outubro-rosa'] = (id, s, ctx) => {
  const c = s.config || {};
  if (c.enabled === false) return '';
  const ribbon = '<svg viewBox="0 0 24 24"><path d="M8.5 21 15 10.6c1-1.6 1.5-2.9 1.5-4.1C16.5 4 14.5 2 12 2S7.5 4 7.5 6.5c0 1.2.5 2.5 1.5 4.1L15.5 21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // "Só em outubro" é decidido no navegador (o site é estático e fica publicado o ano todo)
  return `<div class="section-an-outubro-rosa" id="sec-${esc(id)}"${c.only_october !== false ? ' data-only-month="10" hidden' : ''}><section class="aor" aria-label="Outubro Rosa"><div class="aor-wrap">
  <div class="aor-rib" aria-hidden="true">${ribbon}</div>
  <div class="aor-copy">${c.eyebrow ? `<span class="aor-eyebrow">${esc(c.eyebrow)}</span>` : ''}<h2 class="aor-h">${esc(c.heading)}${c.heading_em ? ` <em>${esc(c.heading_em)}</em>` : ''}</h2>${c.text ? `<p class="aor-sub">${esc(c.text)}</p>` : ''}</div>
  ${c.button_label ? `<a class="aor-btn" href="${esc(link(c.link) || 'https://www.gov.br/inca/pt-br/assuntos/cancer/tipos/mama')}"${c.new_tab ? ' target="_blank" rel="noopener"' : ''}>${esc(c.button_label)} <span aria-hidden="true">→</span></a>` : ''}
</div></section></div>`;
};

// ---------------------------------------------------------------- Rich text
R['rich-text'] = (id, s) => {
  const c = s.config || {};
  const blocos = (s.blocos || []).map((b) => {
    const x = b.config || {};
    if (b.tipo === 'text') return `<div class="rich-text__text rte ${esc(x.text_size || '')}">${x.text || ''}</div>`;
    if (b.tipo === 'liquid' || b.tipo === 'html') return `<div class="rich-text__liquid">${x.liquid || x.html || ''}</div>`;
    if (b.tipo === 'button') return botao(x.button_label, x.button_link, { estilo: x.button_style || 'primary' });
    if (b.tipo === 'heading') return `<h3 class="title-sm">${heading(x.heading, x)}</h3>`;
    return '';
  }).join('');
  const titulo = c.heading ? `<h2 class="section-title ${titleSize(c.heading_size)}">${heading(c.heading, c)}</h2>` : '';
  return wrap(id, 'rich-text', c, `<div class="page-width rich-text rich-text--${esc(c.text_alignment || 'left')} rich-text--${c.heading_width || 'small'}">
  <div class="rich-text__head">${c.subheading ? `<p class="section-subheading">${esc(c.subheading)}</p>` : ''}${titulo}${c.description ? `<div class="rich-text__desc rte">${c.description}</div>` : ''}${botao(c.button_label, c.button_link, { estilo: 'primary' })}</div>
  ${blocos ? `<div class="rich-text__body">${blocos}</div>` : ''}
</div>`);
};

// ---------------------------------------------------------------- Linha de produtos (lista de coleções)
R['collection-list'] = (id, s, ctx) => {
  const c = s.config || {};
  const cards = (s.blocos || []).map((b) => {
    const x = b.config || {};
    const col = ctx.colecoes.find((k) => k.handle === x.collection);
    if (!col) return '';
    const n = ctx.produtosDaColecao(col).length;
    return `<a class="collection-card" href="/collections/${esc(col.handle)}">
  <div class="collection-card__media">${col.imagem ? `<img src="${esc(img(col.imagem, 900))}" srcset="${srcset(col.imagem, [450, 700, 900, 1200])}" sizes="(min-width:1024px) 31vw, 90vw" alt="${esc(x.title || col.titulo)}" loading="lazy" width="900" height="560">` : ''}</div>
  <div class="collection-card__info">
    <div><h3 class="collection-card__title">${esc(x.title || col.titulo)}${c.show_products_count ? `<sup>${n}</sup>` : ''}</h3>${x.description ? `<p class="collection-card__desc">${esc(x.description)}</p>` : ''}</div>
    <span class="collection-card__arrow">${icon.arrowR}</span>
  </div>
</a>`;
  });
  const car = carousel(cards, { cols: Number(c.columns) || 3, colsSm: Number(c.columns_mobile) || 1, carousel: c.carousel_on_desktop !== false });
  return wrap(id, 'collection-list', c, `<div class="page-width">${sectionHeader(c, { botao: car.nav })}${car.html}</div>`);
};

// ---------------------------------------------------------------- Mais procurados (coleção em destaque)
R['featured-collections'] = (id, s, ctx) => {
  const c = s.config || {};
  const b = (s.blocos || [])[0] || { config: {} };
  const x = b.config || {};
  let lista = (x.products && x.products.length ? x.products.map((h) => ctx.produto(h)) : ctx.produtosDaColecao(ctx.colecoes.find((k) => k.handle === x.collection) || { produtos: [] })).filter(Boolean);
  lista = lista.slice(0, Number(c.product_limit) || 12);
  const car = carousel(lista.map((p) => productCard(p)), { cols: Number(c.columns) || 4, colsSm: Number(c.columns_mobile) || 2, carousel: c.carousel_on_desktop !== false });
  const verTodos = '';
  return wrap(id, 'featured-collections', c, `<div class="page-width">
  ${sectionHeader({ ...c, subheading: '' }, { botao: car.nav })}
  ${x.title ? `<p class="featured-collections__tab">${esc(x.title)}</p>` : ''}
  ${car.html}
  ${verTodos ? `<div class="section-footer">${verTodos}</div>` : ''}
</div>`);
};

// ---------------------------------------------------------------- Texto rolando
R['scrolling-text'] = (id, s) => {
  const c = s.config || {};
  const itens = (s.blocos || []).map((b) => {
    const x = b.config || {};
    if (b.tipo === 'image') {
      return `<span class="marquee__item marquee__item--img"><img src="${esc(img(x.image, 240))}" alt="${esc(x.accessibility_info || '')}" style="height:${Number(x.height) || 60}px" loading="lazy"></span>`;
    }
    return `<span class="marquee__item" style="font-size:clamp(${Math.round((Number(x.text_size) || 60) * 0.5)}px, ${(Number(x.text_size) || 60) / 14.4}vw, ${Number(x.text_size) || 60}px)"><span class="marquee__dot"></span>${heading(x.text, x)}</span>`;
  }).join('');
    const rep = (s.blocos || []).some((b) => b.tipo === 'image') ? 12 : 4;
  const linha = (dir) => `<div class="marquee marquee--${dir}" style="--speed:${Math.max(4, 60 - (Number(c.speed) || 20))}s;--gap:${Number(c.grid_horizontal) || 70}px"><div class="marquee__track">${itens.repeat(rep)}</div></div>`;
  const duplo = c.enable_twin;
  return wrap(id, 'scrolling-text', c, `${duplo ? `<div class="marquee-twin">${linha(c.direction || 'left')}${linha(c.direction === 'right' ? 'left' : 'right')}</div>` : linha(c.direction || 'left')}`);
};

// ---------------------------------------------------------------- Vídeo com texto por cima
R['video-with-text-overlay'] = (id, s) => {
  const c = s.config || {};
  const vsrc = c.video_url || c.video_src || (/^https?:/.test(c.video || '') ? c.video : '');
  const blocos = (s.blocos || []).map((b) => {
    const x = b.config || {};
    if (b.tipo === 'heading') return `<h2 class="section-title ${titleSize(x.heading_size)}">${heading(x.heading, x)}</h2>`;
    if (b.tipo === 'text') return `<div class="rte video-overlay__text ${esc(x.text_size || '')}">${x.text || ''}</div>`;
    if (b.tipo === 'button') return botao(x.button_label, x.button_link, { estilo: 'primary' });
    return '';
  }).join('');
  return wrap(id, 'video-overlay', c, `<div class="video-overlay" style="--h:${esc(c.image_height || '400px')};--h-sm:${esc(c.image_height_mobile || '400px')};--ov:${(Number(c.overlay_opacity) || 0) / 100}">
  ${vsrc ? `<video class="video-overlay__video" src="${esc(vsrc)}" ${c.enable_video_autoplay !== false ? 'autoplay' : ''} muted ${c.enable_video_looping !== false ? 'loop' : ''} playsinline preload="metadata"${c.video_poster ? ` poster="${esc(c.video_poster)}"` : ''} data-pausable></video>` : ''}
  <div class="video-overlay__scrim"></div>
  <div class="video-overlay__content text-${esc(c.text_alignment || 'center')}">${blocos}</div>
  <button class="video-overlay__toggle" data-video-toggle aria-label="Pausar vídeo">${icon.pause}</button>
</div>`);
};

// ---------------------------------------------------------------- Produto em destaque
R['featured-product'] = (id, s, ctx) => {
  const c = s.config || {};
  const p = ctx.produto(c.product);
  if (!p) return '';
  return wrap(id, 'featured-product', c, `<div class="page-width"><div class="product" data-product-form="${esc(p.handle)}" style="--media:${Number(c.media_size) || 60}%">
  ${galeria(p, { spinning: (s.blocos || []).find((b) => b.tipo === 'spinning_text')?.config?.text })}
  ${produtoInfo(p, s.blocos || [], ctx, { titleTag: 'h2', verDetalhes: true, esconderVariantes: !!c.hide_variants })}
</div></div>`);
};

// ---------------------------------------------------------------- Depoimentos (cabeçalho + grade/colagem)
R['collage-grid'] = (id, s) => {
  const c = s.config || {};
  const btn = botao(c.button_label, c.button_link, { estilo: 'secondary' });
  return wrap(id, 'collage', c, `<div class="page-width">${sectionHeader(c, { botao: btn })}</div>`);
};

// ---------------------------------------------------------------- Blog
R['blog-posts-collage'] = (id, s, ctx) => {
  const c = s.config || {};
  // a Concept mostra os posts do blog escolhido; se o blog não tiver posts, cai pros mais recentes
  const doBlog = ctx.artigos.filter((a) => a.blog === c.blog);
  const lista = (doBlog.length ? doBlog : ctx.artigos).slice(0, Number(c.post_limit) || 4);
  if (!lista.length) return '';
  const [d, ...resto] = lista;
  const url = (a) => `/blogs/${esc(a.blog)}/${esc(a.handle)}`;
  const btn = c.show_view_all ? `<a class="button button--secondary" href="/blogs/${esc(doBlog.length ? c.blog : d.blog)}">${icon.blog} Ver tudo</a>` : '';
  return wrap(id, 'blog-collage', c, `<div class="page-width">
  ${sectionHeader(c, { botao: btn })}
  <div class="blog-collage">
    <a class="blog-collage__main" href="${url(d)}">${d.imagem ? `<img src="${esc(img(d.imagem, 1200))}" srcset="${srcset(d.imagem, [600, 900, 1200, 1600])}" sizes="(min-width:1024px) 55vw, 100vw" alt="${esc(d.titulo)}" loading="lazy">` : ''}<div class="blog-collage__overlay"><h3>${esc(d.titulo)}</h3><span class="link">Leia mais</span></div></a>
    <div class="blog-collage__list">${resto.map((a) => `<a class="blog-collage__item" href="${url(a)}"><div class="blog-collage__thumb">${a.imagem ? `<img src="${esc(img(a.imagem, 500))}" alt="" loading="lazy">` : ''}</div><div><h3>${esc(a.titulo)}</h3><span class="link">Leia mais</span></div></a>`).join('')}</div>
  </div>
</div>`);
};

// ---------------------------------------------------------------- Slideshow (imagens/vídeos)
R.slideshow = (id, s) => {
  const c = s.config || {};
  const slides = (s.blocos || []).map((b, i) => {
    const x = b.config || {};
    const href = link(x.button_link);
    const midia = b.tipo === 'video'
      ? `<video src="${esc(x.video_src || x.video_url || '')}" ${x.video_mobile_src ? `data-src-mobile="${esc(x.video_mobile_src)}"` : ''} autoplay muted loop playsinline></video>`
      : `<img src="${esc(img(x.image_src || x.image, 1800))}" alt="" ${i ? 'loading="lazy"' : ''}>`;
    return `<div class="slideshow__slide${i ? '' : ' is-on'}">${href ? `<a href="${esc(href)}">${midia}</a>` : midia}</div>`;
  }).join('');
  return wrap(id, 'slideshow', c, `<div class="slideshow" data-slideshow data-speed="${Number(c.autoplay_speed) || 7}">${slides}</div>`);
};

// ---------------------------------------------------------------- HTML livre (custom liquid já renderizado, seções próprias)
R.html = (id, s) => `<div class="section-html" id="sec-${esc(id)}">${s.html || ''}</div>`;
R['custom-liquid'] = (id, s) => R.html(id, { html: s.config?.liquid || s.html });

export function renderSecao(id, s, ctx) {
  const fn = R[s.tipo];
  if (!fn || s.desativada) return '';
  try { return fn(id, s, ctx); }
  catch (e) { console.warn(`seção ${id} (${s.tipo}):`, e.message); return ''; }
}
export const TIPOS = Object.keys(R);
