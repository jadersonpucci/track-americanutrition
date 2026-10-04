// Produto: galeria + bloco de informações (usado no "Produto em destaque" da home e na página padrão de produto).
import { esc, img, srcset, icon, brl, resumo } from './util.mjs';
import { preco, estrelas, faixaPreco } from './components.mjs';

export function galeria(p, { spinning } = {}) {
  const ims = p.imagens || [];
  const spin = spinning ? `<div class="spinning-text" aria-hidden="true"><svg viewBox="0 0 200 200"><defs><path id="sp-${esc(p.handle)}" d="M100,100 m-75,0 a75,75 0 1,1 150,0 a75,75 0 1,1 -150,0"/></defs><text><textPath href="#sp-${esc(p.handle)}">${esc((spinning + ' • ').repeat(2))}</textPath></text></svg><span>👍</span></div>` : '';
  return `<div class="product__media" data-gallery>
  ${ims.length > 1 ? `<div class="product__thumbs">${ims.map((m, i) => `<button class="product__thumb${i ? '' : ' is-on'}" data-thumb="${i}" aria-label="Imagem ${i + 1}"><img src="${esc(img(m.url, 160))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
  <div class="product__stage">
    ${ims.map((m, i) => `<figure class="product__slide${i ? '' : ' is-on'}" data-slide="${i}" data-variant-ids="${esc((m.variantes || []).join(','))}"><img src="${esc(img(m.url, 1100))}" srcset="${srcset(m.url, [500, 800, 1100, 1500])}" sizes="(min-width:1024px) 50vw, 100vw" alt="${esc(m.alt || p.titulo)}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} width="1100" height="1100"></figure>`).join('') || '<div class="product__placeholder"></div>'}
    ${spin}
  </div>
</div>`;
}

const FLAG = '<svg xmlns="http://www.w3.org/2000/svg" width="25" viewBox="0 0 7410 3900" aria-hidden="true"><path fill="#b22234" d="M0 0h7410v3900H0z"/><path stroke="#fff" stroke-width="300" d="M0 450h7410m0 600H0m0 600h7410m0 600H0m0 600h7410m0 600H0"/><path fill="#3c3b6e" d="M0 0h2964v2100H0z"/></svg>';

export function produtoInfo(p, blocos, ctx, { titleTag = 'h1', verDetalhes = false, esconderVariantes = false } = {}) {
  const vs = p.variantes || [];
  const v0 = vs.find((v) => v.disponivel) || vs[0] || {};
  const f = faixaPreco(p);
  const nota = p.avaliacao?.nota || 5, total = p.avaliacao?.total || 0;
  const out = blocos.map((b) => {
    const x = b.config || {};
    switch (b.tipo) {
      case 'title':
        return `<div class="product__title-row"><${titleTag} class="product__title">${esc(p.titulo)}</${titleTag}>${x.show_price !== false ? `<div class="product__price" data-price>${preco({ ...p, variantes: [v0] }, { grande: true })}</div>` : ''}</div>
${x.show_rating !== false ? `<div class="product__rating">${estrelas(nota)} <span>${nota.toFixed(2)}</span>${total ? `<span class="product__rating-count">${total.toLocaleString('pt-BR')} avaliações</span>` : ''}</div>` : ''}`;
      case 'price':
        return `<div class="product__price" data-price>${preco({ ...p, variantes: [v0] }, { grande: true })}</div>`;
      case 'liquid': case 'html': case 'custom_liquid':
        return x.liquid || x.html ? `<div class="product__liquid">${x.liquid || x.html}</div>` : '';
      case 'text':
        return x.text ? `<div class="product__text rte">${x.text}</div>` : '';
      case 'description':
        return p.descricao_html ? `<div class="product__text rte">${p.descricao_html}</div>` : '';
      case 'variant_picker':
        if (vs.length < 2 || esconderVariantes) return '';
        return (p.opcoes || []).map((o, k) => `<fieldset class="variant-picker" data-option="${k}"><legend>${esc(o.nome)}: <span data-option-value>${esc(v0.opcoes?.[k] || '')}</span></legend><div class="variant-picker__values">${o.valores.map((val) => `<label class="variant-pill"><input type="radio" name="opt-${esc(p.handle)}-${k}" value="${esc(val)}"${v0.opcoes?.[k] === val ? ' checked' : ''}><span>${esc(val)}</span></label>`).join('')}</div></fieldset>`).join('');
      case 'inventory':
        return `<p class="product__stock${f.disponivel ? '' : ' is-out'}" data-stock><span class="dot"></span>${f.disponivel ? 'Em estoque, envio rápido disponível' : 'Esgotado no momento'}</p>`;
      case 'buy_buttons':
        return `<form class="product__form" action="/cart/add" method="post" data-product-form-el>
  <input type="hidden" name="id" value="${esc(v0.id)}">
  <div class="product__buy">
    ${x.show_quantity_selector !== false ? `<div class="qty"><button type="button" data-qty="-1" aria-label="Diminuir">${icon.chevL}</button><input type="number" name="quantity" value="1" min="1" aria-label="Quantidade"><button type="button" data-qty="1" aria-label="Aumentar">${icon.chevR}</button></div>` : ''}
    <button type="submit" class="button button--primary button--lg product__add"${f.disponivel ? '' : ' disabled'} data-add-label="Adicionar ao carrinho">${f.disponivel ? 'Adicionar ao carrinho' : 'Esgotado'}</button>
  </div>
</form>`;
      case 'share': {
        const u = encodeURIComponent(`${ctx.config.dominio}/products/${p.handle}`);
        return `<div class="product__share"><span>${esc(x.share_label || 'Compartilhe')}:</span>
  <a href="https://www.facebook.com/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook">${icon.facebook}</a>
  <a href="https://telegram.me/share/url?url=${u}" target="_blank" rel="noopener" aria-label="Compartilhar no Telegram">${icon.telegram}</a>
  <a href="https://api.whatsapp.com/send?text=${u}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp">${icon.whatsapp}</a>
  ${x.show_help_desk ? `<a class="product__help" href="/pages/${esc(x.help_page || 'contact')}"><span class="help-ico">?</span> ${esc(x.help_label || 'Precisa de ajuda?')}</a>` : ''}
</div>`;
      }
      case 'read_more':
        return verDetalhes ? `<a class="product__more" href="/products/${esc(p.handle)}">Ver detalhes completos ${icon.arrowR}</a>` : '';
      case 'badge_usa':
        return `<div class="message-under-cart">${FLAG}<span>Vendido e entregue por America Nutrition</span></div>`;
      default:
        return '';
    }
  }).join('\n');
  return `<div class="product__info" data-variants='${esc(JSON.stringify(vs.map((v) => ({ id: v.id, opcoes: v.opcoes, preco: v.preco, comparacao: v.preco_comparacao, disponivel: v.disponivel }))))}'>${out}</div>`;
}

// Blocos padrão da página de produto (quando o produto não tem landing própria).
export const BLOCOS_PRODUTO = [
  { tipo: 'title', config: {} }, { tipo: 'badge_usa', config: {} }, { tipo: 'description', config: {} }, { tipo: 'inventory', config: {} },
  { tipo: 'variant_picker', config: {} }, { tipo: 'buy_buttons', config: {} }, { tipo: 'share', config: { show_help_desk: true, help_page: 'depoimentos' } },
];
