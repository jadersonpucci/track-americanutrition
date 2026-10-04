// Peças reaproveitadas entre seções e páginas: card de produto, preço, carrossel, cabeçalho de seção.
import { esc, brl, img, srcset, icon, heading, titleSize, link } from './util.mjs';

export function faixaPreco(p) {
  const vs = p.variantes || [];
  const precos = vs.map((v) => v.preco);
  const min = Math.min(...precos), max = Math.max(...precos);
  const v0 = vs.find((v) => v.preco === min) || vs[0] || {};
  return { min, max, varia: min !== max, comparacao: v0.preco_comparacao, disponivel: vs.some((v) => v.disponivel) };
}

export function desconto(p) {
  const f = faixaPreco(p);
  return f.comparacao && f.comparacao > f.min ? Math.round((1 - f.min / f.comparacao) * 100) : 0;
}

export function preco(p, { grande = false } = {}) {
  const f = faixaPreco(p);
  if (f.varia) return `<div class="price${grande ? ' price--lg' : ''}"><span class="price__from">A partir de</span> <span class="price__now">${brl(f.min)}</span></div>`;
  if (f.comparacao) return `<div class="price price--sale${grande ? ' price--lg' : ''}"><span class="sr-only">Preço de venda</span><span class="price__now">${brl(f.min)}</span> <span class="sr-only">Preço regular</span><s class="price__was">${brl(f.comparacao)}</s></div>`;
  return `<div class="price${grande ? ' price--lg' : ''}"><span class="price__now">${brl(f.min)}</span></div>`;
}

export function productCard(p, { lazy = true } = {}) {
  if (!p) return '';
  const f = faixaPreco(p);
  const off = desconto(p);
  const i0 = p.imagens?.[0], i1 = p.imagens?.[1];
  const nota = p.avaliacao?.nota ? p.avaliacao.nota.toFixed(1) : '5.0';
  const v0 = (p.variantes || []).find((v) => v.disponivel) || p.variantes?.[0];
  const umaVariante = (p.variantes || []).length === 1;
  return `<div class="card product-card" data-product="${esc(p.handle)}">
  <div class="product-card__mediawrap">
  <a class="product-card__media" href="/products/${esc(p.handle)}" aria-label="${esc(p.titulo)}">
    ${i0 ? `<img class="product-card__img" src="${esc(img(i0.url, 600))}" srcset="${srcset(i0.url, [300, 450, 600, 800])}" sizes="(min-width:1024px) 22vw, 50vw" alt="${esc(i0.alt || p.titulo)}"${lazy ? ' loading="lazy"' : ''} width="600" height="600">` : '<div class="product-card__placeholder"></div>'}
    ${i1 ? `<img class="product-card__img product-card__img--hover" src="${esc(img(i1.url, 600))}" alt="" loading="lazy" width="600" height="600">` : ''}
    ${off ? `<span class="badge badge--sale">${off}% OFF</span>` : ''}
    <span class="badge badge--rating">${icon.star} ${nota}</span>
    ${!f.disponivel ? '<span class="badge badge--soldout">Sem estoque</span>' : ''}
  </a>
  ${f.disponivel ? (umaVariante && v0
    ? `<button class="product-card__quick button button--primary" data-add="${esc(v0.id)}">Adicionar ao carrinho</button>`
    : `<a class="product-card__quick button button--primary" href="/products/${esc(p.handle)}">Escolha opções</a>`) : ''}
  </div>
  <div class="product-card__info">
    <p class="product-card__vendor">${esc(p.fornecedor || 'America Nutrition')}</p>
    <div class="product-card__row">
      <a class="product-card__title" href="/products/${esc(p.handle)}">${esc(p.titulo)}</a>
      ${preco(p)}
    </div>
  </div>
</div>`;
}

export function sectionHeader(c, { botao = '' } = {}) {
  const h = c.heading ? `<h2 class="section-title ${titleSize(c.heading_size)}">${heading(c.heading, c)}</h2>` : '';
  const sub = c.subheading ? `<p class="section-subheading">${esc(c.subheading)}</p>` : '';
  const desc = c.description ? `<div class="section-desc rte">${c.description}</div>` : '';
  if (!h && !sub && !desc && !botao) return '';
  return `<div class="section-header">
  <div class="section-header__text">${sub}${h}${desc}</div>
  ${botao ? `<div class="section-header__actions">${botao}</div>` : ''}
</div>`;
}

export function botao(label, url, { estilo = 'secondary', iconeR = true, externo = false } = {}) {
  if (!label || !url) return '';
  return `<a class="button button--${estilo}" href="${esc(link(url))}"${externo ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}${iconeR ? ' ' + icon.arrowR : ''}</a>`;
}

export function carousel(items, { cols = 4, colsSm = 2, carousel = true, classe = '' } = {}) {
  const nav = carousel ? `<div class="carousel__nav"><button class="carousel__btn" data-carousel-prev aria-label="Anterior">${icon.chevL}</button><button class="carousel__btn" data-carousel-next aria-label="Próximo">${icon.chevR}</button></div>` : '';
  return { nav, html: `<div class="${carousel ? 'carousel' : 'grid-list'} ${classe}" style="--cols:${cols};--cols-sm:${colsSm}" data-carousel>${items.map((h) => `<div class="carousel__item">${h}</div>`).join('')}</div>` };
}

export function estrelas(nota = 5) {
  const p = Math.max(0, Math.min(100, (nota / 5) * 100));
  return `<span class="stars" style="--p:${p}%" aria-label="${nota} de 5 estrelas"></span>`;
}
