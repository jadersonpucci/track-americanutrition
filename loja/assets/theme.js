/* America Nutrition · loja própria
 *
 * 1) Carrinho no navegador (localStorage) com a MESMA API Ajax da Shopify:
 *    GET /cart.js · POST /cart/add.js · /cart/change.js · /cart/update.js · /cart/clear.js · /cart/{variante}:{qtd}
 *    As landing pages dos produtos (copiadas da Shopify) chamam essas rotas com fetch() e continuam
 *    funcionando sem nenhuma alteração. O botão "Pagar" leva ao checkout próprio com os mesmos ids de variante.
 * 2) Depoimentos: consultas à Storefront API (metaobjects "depoimento") são respondidas com /depoimentos.json.
 * 3) Interface: gavetas (menu, busca, carrinho, filtros), anúncio, cabeçalho fixo, carrosséis, produto, hero.
 */
(function () {
  'use strict';
  var CFG = window.AN_LOJA || {};
  var LS = 'an_cart_v1';
  var nativeFetch = window.fetch.bind(window);

  // ------------------------------------------------------------------ catálogo
  var catalogo = null, catalogoP = null;
  function carregarCatalogo() {
    if (catalogo) return Promise.resolve(catalogo);
    if (catalogoP) return catalogoP;
    try {
      var c = JSON.parse(sessionStorage.getItem('an_cat') || 'null');
      if (c && c.v === CFG.v) { indexar(c); return Promise.resolve(catalogo); }
    } catch (e) {}
    catalogoP = nativeFetch('/catalogo.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (c) {
      try { sessionStorage.setItem('an_cat', JSON.stringify(c)); } catch (e) {}
      indexar(c); return catalogo;
    });
    return catalogoP;
  }
  function indexar(c) {
    var porVar = {}, porHandle = {};
    (c.produtos || []).forEach(function (p) { porHandle[p.h] = p; p.v.forEach(function (v) { porVar[String(v.id)] = { p: p, v: v }; }); });
    catalogo = { raw: c, porVar: porVar, porHandle: porHandle };
  }

  // ------------------------------------------------------------------ carrinho (estado)
  function ler() { try { var c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && Array.isArray(c.items)) return c; } catch (e) {} return { items: [], note: '', attributes: {}, token: 'an' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }; }
  function gravar(c) { try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) {} }
  function chave(id, props) { var s = JSON.stringify(props || {}); var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(id) + ':' + (h >>> 0).toString(16); }

  function linha(it) {
    var m = catalogo.porVar[String(it.id)];
    if (!m) return null;
    var p = m.p, v = m.v, padrao = v.t === 'Default Title';
    var q = it.quantity;
    return {
      id: Number(v.id), key: chave(v.id, it.properties), quantity: q, variant_id: Number(v.id), product_id: Number(p.id) || p.id,
      title: p.t + (padrao ? '' : ' - ' + v.t), product_title: p.t, variant_title: padrao ? null : v.t, sku: v.sku || '', vendor: 'America Nutrition',
      price: v.p, original_price: v.p, discounted_price: v.p, final_price: v.p, compare_at_price: v.c,
      line_price: v.p * q, original_line_price: v.p * q, final_line_price: v.p * q, total_discount: 0, discounts: [], line_level_discount_allocations: [],
      properties: it.properties || {}, gift_card: false, requires_shipping: true, taxable: false, grams: 0,
      url: '/products/' + p.h + '?variant=' + v.id, handle: p.h, image: v.img || p.img, featured_image: { url: v.img || p.img, alt: p.t },
      product_type: p.tp || '', product_has_only_default_variant: padrao, options_with_values: padrao ? [] : [{ name: 'Opção', value: v.t }],
      available: !!v.ok,
    };
  }
  function cartJson() {
    var c = ler();
    var items = c.items.map(linha).filter(Boolean);
    var total = items.reduce(function (s, i) { return s + i.final_line_price; }, 0);
    return {
      token: c.token, note: c.note || '', attributes: c.attributes || {}, original_total_price: total, total_price: total, total_discount: 0, total_weight: 0,
      item_count: items.reduce(function (s, i) { return s + i.quantity; }, 0), items: items, requires_shipping: items.length > 0, currency: 'BRL',
      items_subtotal_price: total, cart_level_discount_applications: [],
    };
  }
  function adicionar(lista) {
    var c = ler(), adicionados = [];
    lista.forEach(function (x) {
      var id = String(x.id || x.variant_id || ''); var q = Math.max(1, parseInt(x.quantity, 10) || 1);
      var m = catalogo.porVar[id];
      if (!m) throw erro(404, 'Produto não encontrado', 'Esta variante não existe mais na loja.');
      if (!m.v.ok) throw erro(422, 'Esgotado', 'O produto "' + m.p.t + '" está esgotado.');
      var props = x.properties || {};
      var k = chave(id, props);
      var it = c.items.filter(function (i) { return chave(i.id, i.properties) === k; })[0];
      if (it) it.quantity += q; else { it = { id: id, quantity: q, properties: props }; c.items.push(it); }
      adicionados.push(it);
    });
    gravar(c);
    dl('add_to_cart', adicionados);
    return adicionados.map(linha);
  }
  function alterar(body) {
    var c = ler();
    var q = Math.max(0, parseInt(body.quantity, 10) || 0);
    var alvo = null;
    if (body.line) alvo = c.items[parseInt(body.line, 10) - 1];
    else if (body.id != null) {
      var id = String(body.id);
      alvo = c.items.filter(function (i) { return chave(i.id, i.properties) === id; })[0] || c.items.filter(function (i) { return String(i.id) === id.split(':')[0]; })[0];
    }
    if (!alvo) throw erro(400, 'Item não encontrado', 'Este item não está no carrinho.');
    if (q === 0) c.items.splice(c.items.indexOf(alvo), 1); else alvo.quantity = q;
    if (body.properties) alvo.properties = body.properties;
    gravar(c);
  }
  function atualizar(body) {
    var c = ler();
    var up = body.updates;
    if (Array.isArray(up)) up.forEach(function (q, i) { if (c.items[i]) c.items[i].quantity = parseInt(q, 10) || 0; });
    else if (up) Object.keys(up).forEach(function (k) {
      var q = parseInt(up[k], 10) || 0;
      var it = c.items.filter(function (i) { return String(i.id) === k.split(':')[0]; })[0];
      if (it) it.quantity = q; else if (q > 0 && catalogo.porVar[k]) c.items.push({ id: k, quantity: q, properties: {} });
    });
    c.items = c.items.filter(function (i) { return i.quantity > 0; });
    if (body.note != null) c.note = body.note;
    if (body.attributes) c.attributes = Object.assign(c.attributes || {}, body.attributes);
    gravar(c);
  }
  function limpar() { var c = ler(); c.items = []; gravar(c); }
  function erro(status, message, description) { var e = new Error(message); e.status = status; e.description = description; return e; }

  // ------------------------------------------------------------------ shim de fetch
  function corpo(init) {
    var b = init && init.body;
    if (!b) return {};
    if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return formObj(new URLSearchParams(b)); } }
    if (b instanceof FormData || b instanceof URLSearchParams) return formObj(b);
    return b;
  }
  function formObj(fd) {
    var o = {}, items = {};
    fd.forEach(function (v, k) {
      var m = /^items\[(\d+)\]\[(\w+)\]$/.exec(k); var u = /^updates\[(.+)\]$/.exec(k); var pr = /^properties\[(.+)\]$/.exec(k);
      if (m) { (items[m[1]] = items[m[1]] || {})[m[2]] = v; }
      else if (u) { (o.updates = o.updates || {})[u[1]] = v; }
      else if (pr) { (o.properties = o.properties || {})[pr[1]] = v; }
      else if (k === 'updates[]') { (o.updates = o.updates || []).push(v); }
      else o[k] = v;
    });
    var ks = Object.keys(items); if (ks.length) o.items = ks.map(function (k) { return items[k]; });
    return o;
  }
  function resp(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); }
  function rota(url) {
    var u; try { u = new URL(url, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    var p = u.pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?(?=\/cart)/i, '');
    return /^\/cart(\.js|\.json|\/.*)?$/.test(p) ? { path: p, search: u.searchParams } : null;
  }
  // eventos para os pixels (assets/rastreio.js)
  function emitir(nome, det) { try { setTimeout(function () { document.dispatchEvent(new CustomEvent(nome, { detail: det })); }, 0); } catch (e) {} }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[data-an-checkout], [name="checkout"], a[href*="checkout.americanutrition.com"], [data-checkout]');
    if (a) carregarCatalogo().then(function () { var c = cartJson(); if (c.item_count) emitir('an:checkout', c); });
  }, true);
  function tratarCarrinho(r, init) {
    var metodo = ((init && init.method) || 'GET').toUpperCase();
    return carregarCatalogo().then(function () {
      var b = corpo(init), p = r.path;
      try {
        if (p === '/cart.js' || p === '/cart.json' || (p === '/cart' && metodo === 'GET')) return resp(cartJson());
        if (/^\/cart\/add(\.js)?$/.test(p)) {
          var lista = b.items || [{ id: b.id, quantity: b.quantity, properties: b.properties }];
          var add = adicionar(lista); notificar(); emitir('an:add', add);
          return resp(b.items ? { items: add } : add[0]);
        }
        if (/^\/cart\/change(\.js)?$/.test(p)) { alterar(b); notificar(); return resp(cartJson()); }
        if (/^\/cart\/update(\.js)?$/.test(p)) { atualizar(b); notificar(); return resp(cartJson()); }
        if (/^\/cart\/clear(\.js)?$/.test(p)) { limpar(); notificar(); return resp(cartJson()); }
        var m = /^\/cart\/([\d:,]+)$/.exec(p);
        if (m) { emitir('an:add', adicionar(m[1].split(',').map(function (s) { var a = s.split(':'); return { id: a[0], quantity: a[1] || 1 }; }))); notificar(); return resp(cartJson()); }
        if (/^\/cart\/shipping_rates/.test(p)) return resp({ shipping_rates: [] });
        return resp(cartJson());
      } catch (e) { return resp({ status: e.status || 422, message: e.message, description: e.description || e.message }, e.status || 422); }
    });
  }

  // Depoimentos da Storefront API (metaobjects) servidos pela própria loja
  var deps = null;
  function carregarDeps() { if (deps) return deps; deps = nativeFetch('/depoimentos.json').then(function (r) { return r.json(); }).then(function (j) { return j.depoimentos || []; }); return deps; }
  // As seções tocam a PRIMEIRA fonte da lista. HLS (.m3u8) só toca no Safari; nos outros navegadores
  // vai primeiro o MP4 de 720p (o de 1080p chega a ~80 MB por vídeo).
  var tocaHls = (function () { try { return !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'); } catch (e) { return false; } })();
  function fontesVideo(d) {
    var fs = (d.fontes && d.fontes.length ? d.fontes : [{ url: d.video, tipo: 'video/mp4' }]).map(function (f) { return { url: f.url, mimeType: f.tipo || 'video/mp4', height: f.altura || 0 }; });
    var hls = fs.filter(function (f) { return /mpegurl/i.test(f.mimeType); });
    var mp4 = fs.filter(function (f) { return !/mpegurl/i.test(f.mimeType); }).sort(function (a, b) { return Math.abs(a.height - 720) - Math.abs(b.height - 720); });
    return tocaHls ? hls.concat(mp4) : mp4.concat(hls);
  }
  function tratarStorefront(init) {
    var b = corpo(init); var q = b.query || ''; var vars = b.variables || {};
    if (!/metaobjects\s*\(\s*type\s*:\s*"depoimento"/.test(q)) return null;
    var aliases = {}; var re = /(\w+)\s*:\s*field\s*\(\s*key\s*:\s*"(\w+)"\s*\)/g, m;
    while ((m = re.exec(q))) aliases[m[1]] = m[2];
    var first = vars.first || parseInt((/first\s*:\s*(\d+)/.exec(q) || [])[1], 10) || 50;
    var after = vars.after ? parseInt(vars.after, 10) : 0;
    return carregarDeps().then(function (lista) {
      var fatia = lista.slice(after, after + first);
      function ref(d, k) {
        if (k === 'midia') {
          if (d.video) return { __typename: 'Video', sources: fontesVideo(d), previewImage: d.poster ? { url: d.poster } : null };
          if (d.imagem) return { __typename: 'MediaImage', image: { url: d.imagem, width: d.largura, height: d.altura, altText: '' }, previewImage: { url: d.imagem } };
          return null;
        }
        if (k === 'produto' && d.produto) { var pr = catalogo && catalogo.porHandle[d.produto]; return { __typename: 'Product', handle: d.produto, title: pr ? pr.t : d.produto }; }
        return null;
      }
      function campo(d, k) { var v = k === 'midia' ? (d.video || d.imagem || null) : k === 'produto' ? d.produto : d[k]; return v == null ? null : { key: k, value: String(v), reference: ref(d, k) }; }
      var edges = fatia.map(function (d, i) {
        var node = { id: 'gid://shopify/Metaobject/' + d.id, handle: d.handle, type: 'depoimento', updatedAt: d.atualizado_em };
        Object.keys(aliases).forEach(function (a) { node[a] = campo(d, aliases[a]); });
        node.fields = ['tipo', 'tom', 'confianca', 'midia', 'produto'].map(function (k) { return campo(d, k); }).filter(Boolean);
        return { cursor: String(after + i + 1), node: node };
      });
      var fim = after + fatia.length;
      return resp({ data: { metaobjects: { edges: edges, nodes: edges.map(function (e) { return e.node; }), pageInfo: { hasNextPage: fim < lista.length, endCursor: String(fim), hasPreviousPage: after > 0, startCursor: String(after) } } } });
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (input && typeof input === 'object' && !init && input.method) init = { method: input.method };
    var r = rota(url);
    if (r) return tratarCarrinho(r, init);
    if (CFG.depoimentosLocais !== false && /\.myshopify\.com\/api\/[^/]+\/graphql\.json/.test(url)) {
      var x = tratarStorefront(init); if (x) return carregarCatalogo().catch(function () {}).then(function () { return x; });
    }
    return nativeFetch(input, init);
  };
  window.ANCart = { get: function () { return carregarCatalogo().then(cartJson); }, add: function (id, q) { return window.fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, quantity: q || 1 }) }); } };

  // formulários <form action="/cart/add"> (landing pages e produto padrão)
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f || !f.action || !rota(f.action) || !/\/cart\/add/.test(f.action)) return;
    ev.preventDefault();
    var btn = f.querySelector('[type=submit]'); if (btn) { btn.disabled = true; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = 'Adicionando...'; }
    window.fetch('/cart/add.js', { method: 'POST', body: new FormData(f) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.description || j.message); }); })
      .then(function () { abrir('cart'); })
      .catch(function (e) { toast(e.message || 'Não foi possível adicionar.'); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; } });
  }, true);

  // ------------------------------------------------------------------ eventos e analytics
  function notificar() { setTimeout(function () { document.dispatchEvent(new CustomEvent('an:cart', { detail: cartJson() })); }, 0); }
  function dl(evento, itens) {
    try {
      window.dataLayer = window.dataLayer || [];
      var vs = itens.map(function (i) { var m = catalogo.porVar[String(i.id)]; return m ? { item_id: m.v.sku || String(i.id), item_name: m.p.t, item_variant: m.v.t, price: m.v.p / 100, quantity: i.quantity } : null; }).filter(Boolean);
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push({ event: evento, ecommerce: { currency: 'BRL', value: vs.reduce(function (s, x) { return s + x.price * x.quantity; }, 0), items: vs } });
    } catch (e) {}
  }

  // ------------------------------------------------------------------ utilidades de interface
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function brl(c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function toast(msg) { var t = $('.toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast', role: 'status' })); t.textContent = msg; t.classList.add('is-on'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('is-on'); }, 3200); }

  // gavetas
  var aberta = null;
  function abrir(nome) {
    var d = $('[data-drawer="' + nome + '"]'); if (!d) return;
    if (aberta && aberta !== d) fechar(aberta);
    d.hidden = false; d.offsetWidth; d.classList.add('is-open'); d.setAttribute('open', '');
    document.documentElement.classList.add('drawer-open'); aberta = d;
    if (nome === 'cart') renderCarrinho();
    if (nome === 'search') setTimeout(function () { var i = $('[data-search-input]'); if (i) i.focus(); }, 50);
  }
  function fechar(d) {
    d = d || aberta; if (!d) return;
    d.classList.remove('is-open'); d.removeAttribute('open');
    setTimeout(function () { if (!d.classList.contains('is-open')) d.hidden = true; }, 350);
    document.documentElement.classList.remove('drawer-open'); if (aberta === d) aberta = null;
  }
  window.ANDrawer = { abrir: abrir, fechar: fechar };

  document.addEventListener('click', function (ev) {
    var o = ev.target.closest('[data-open]'); if (o) { ev.preventDefault(); abrir(o.getAttribute('data-open')); return; }
    var c = ev.target.closest('[data-close]'); if (c) { ev.preventDefault(); fechar(c.closest('.drawer')); return; }
    if (ev.target.classList && ev.target.classList.contains('drawer')) { fechar(ev.target); return; }
    // ícones de carrinho de seções importadas (cart-drawer-button / link /cart)
    var cb = ev.target.closest('a[href="/cart"]:not([data-an-checkout]), [aria-controls="CartDrawer"], cart-drawer-button, .cart-drawer-button');
    if (cb && !ev.target.closest('.cart-drawer, .cart-page')) { ev.preventDefault(); abrir('cart'); return; }
    var q = ev.target.closest('[data-add]');
    if (q) {
      ev.preventDefault(); q.disabled = true; var lb = q.textContent; q.textContent = 'Adicionando...';
      window.fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: q.getAttribute('data-add'), quantity: 1 }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.description); abrir('cart'); }); })
        .catch(function (e) { toast(e.message); }).then(function () { q.disabled = false; q.textContent = lb; });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberta) fechar(); });
  document.addEventListener('cart:refresh', function (e) { renderCarrinho(); if (!e.detail || e.detail.open !== false) abrir('cart'); });
  document.addEventListener('an:cart', function () { renderCarrinho(); });
  window.addEventListener('storage', function (e) { if (e.key === LS) renderCarrinho(); });

  // render do carrinho (gaveta e página /cart)
  function renderCarrinho() {
    carregarCatalogo().then(function () {
      var c = cartJson();
      $$('[data-cart-count]').forEach(function (el) { el.textContent = c.item_count; el.hidden = !c.item_count; });
      $$('[data-cart-count-sup]').forEach(function (el) { el.textContent = c.item_count; });
      $$('[data-cart-items]').forEach(function (box) {
        box.innerHTML = c.items.map(function (i) {
          return '<div class="cart-line" data-key="' + esc(i.key) + '">' +
            '<a href="' + esc(i.url) + '"><img src="' + esc(i.image || '') + '" alt="" loading="lazy"></a>' +
            '<div><a class="cart-line__title" href="' + esc(i.url) + '">' + esc(i.product_title) + '</a>' + (i.variant_title ? '<p class="cart-line__variant">' + esc(i.variant_title) + '</p>' : '') +
            '<div class="cart-line__qty"><div class="qty qty--sm"><button type="button" data-line-qty="-1" aria-label="Diminuir">−</button><input type="number" min="0" value="' + i.quantity + '" data-line-input aria-label="Quantidade"><button type="button" data-line-qty="1" aria-label="Aumentar">+</button></div>' +
            '<button class="cart-line__remove" data-line-remove>Remover</button></div></div>' +
            '<div class="cart-line__price">' + brl(i.final_line_price) + (i.compare_at_price && i.compare_at_price > i.price ? '<s>' + brl(i.compare_at_price * i.quantity) + '</s>' : '') + '</div></div>';
        }).join('');
      });
      $$('[data-cart-empty]').forEach(function (el) { el.hidden = c.item_count > 0; });
      $$('[data-cart-foot]').forEach(function (el) { el.hidden = !c.item_count; });
      $$('[data-cart-subtotal]').forEach(function (el) { el.textContent = brl(c.total_price); });
      $$('[data-cart-items]').forEach(function (el) { el.hidden = !c.item_count; });
      var ship = $('[data-cart-ship]');
      if (ship) {
        var free = (CFG.frete || 0) * 100;
        if (!free) ship.hidden = true;
        else {
          var falta = free - c.total_price;
          ship.innerHTML = (falta > 0 ? 'Faltam apenas <strong>' + brl(falta) + '</strong> para ganhar frete grátis!' : '<strong>Parabéns!</strong> Você ganhou frete grátis.') + '<div class="bar"><i style="width:' + Math.min(100, Math.round(c.total_price / free * 100)) + '%"></i></div>';
        }
      }
      // links "Pagar": o script de checkout da America Nutrition reescreve no clique; deixamos a URL pronta também
      $$('a[data-an-checkout]').forEach(function (a) { a.href = (CFG.checkout || '/') + '?items=' + c.items.map(function (i) { return i.variant_id + ':' + i.quantity + ':' + i.final_price; }).join(','); });
    });
  }
  document.addEventListener('click', function (ev) {
    var line = ev.target.closest('.cart-line'); if (!line) return;
    var key = line.getAttribute('data-key');
    var b = ev.target.closest('[data-line-qty]'), rm = ev.target.closest('[data-line-remove]');
    if (!b && !rm) return;
    var input = line.querySelector('[data-line-input]');
    var q = rm ? 0 : Math.max(0, parseInt(input.value, 10) + parseInt(b.getAttribute('data-line-qty'), 10));
    window.fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: key, quantity: q }) });
  });
  document.addEventListener('change', function (ev) {
    var i = ev.target.closest('[data-line-input]'); if (!i) return;
    window.fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: i.closest('.cart-line').getAttribute('data-key'), quantity: Math.max(0, parseInt(i.value, 10) || 0) }) });
  });

  // ------------------------------------------------------------------ busca
  function buscar(q) {
    return carregarCatalogo().then(function () {
      var t = norm(q).trim(); if (!t) return { produtos: [], artigos: [] };
      var termos = t.split(/\s+/);
      var hit = function (s) { var n = norm(s); return termos.every(function (x) { return n.indexOf(x) >= 0; }); };
      return {
        produtos: catalogo.raw.produtos.filter(function (p) { return hit(p.t + ' ' + (p.tags || []).join(' ') + ' ' + (p.tp || '') + ' ' + p.v.map(function (v) { return v.sku; }).join(' ')); }),
        artigos: (catalogo.raw.artigos || []).filter(function (a) { return hit(a.t); }),
      };
    });
  }
  function precoMin(p) { return Math.min.apply(null, p.v.map(function (v) { return v.p; })); }
  var si = $('[data-search-input]'), sr = $('[data-search-results]'), stm;
  if (si && sr) si.addEventListener('input', function () {
    clearTimeout(stm); stm = setTimeout(function () {
      buscar(si.value).then(function (r) {
        if (!si.value.trim()) { sr.innerHTML = ''; return; }
        sr.innerHTML = (r.produtos.length ? '<div class="search-results__grid">' + r.produtos.slice(0, 8).map(function (p) { return '<a class="search-hit" href="/products/' + esc(p.h) + '"><img src="' + esc(p.img) + '" alt=""><div><strong>' + esc(p.t) + '</strong><span>' + (p.v.length > 1 ? 'A partir de ' : '') + brl(precoMin(p)) + '</span></div></a>'; }).join('') + '</div>' : '<p>Nenhum produto encontrado para "' + esc(si.value) + '".</p>') +
          (r.artigos.length ? '<div class="search-results__grid" style="margin-top:12px">' + r.artigos.slice(0, 4).map(function (a) { return '<a class="search-hit" href="' + esc(a.u) + '">' + (a.img ? '<img src="' + esc(a.img) + '" alt="">' : '') + '<div><strong>' + esc(a.t) + '</strong><span>Blog</span></div></a>'; }).join('') + '</div>' : '') +
          '<p class="search-results__all"><a class="link" href="/search?q=' + encodeURIComponent(si.value) + '">Ver todos os resultados</a></p>';
      });
    }, 120);
  });

  // ------------------------------------------------------------------ inicialização da página
  function pronto(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  pronto(function () {
    renderCarrinho();

    // Outubro Rosa e outras seções de mês
    $$('[data-only-month]').forEach(function (el) { el.hidden = (new Date().getMonth() + 1) !== parseInt(el.getAttribute('data-only-month'), 10); });

    // anúncio
    $$('[data-announcement]').forEach(function (box) {
      var ms = $$('.topbar__msg', box); if (ms.length < 2) return;
      var i = 0, tm;
      function show(n) { ms[i].classList.remove('is-on'); i = (n + ms.length) % ms.length; ms[i].classList.add('is-on'); }
      function play() { clearInterval(tm); tm = setInterval(function () { show(i + 1); }, (parseInt(box.getAttribute('data-speed'), 10) || 5) * 1000); }
      $$('.topbar__arrow', box).forEach(function (b) { b.addEventListener('click', function () { show(i + parseInt(b.getAttribute('data-dir'), 10)); play(); }); });
      play();
    });

    // cabeçalho fixo
    var hd = $('[data-header]');
    if (hd) { var on = function () { hd.classList.toggle('is-stuck', window.scrollY > 140); }; window.addEventListener('scroll', on, { passive: true }); on(); }

    // carrosséis
    $$('[data-carousel]').forEach(function (car) {
      var sec = car.closest('section') || car.parentNode;
      var prev = $('[data-carousel-prev]', sec), next = $('[data-carousel-next]', sec);
      function passo() { var it = car.firstElementChild; return it ? it.getBoundingClientRect().width + 20 : car.clientWidth; }
      function upd() { if (prev) prev.disabled = car.scrollLeft <= 4; if (next) next.disabled = car.scrollLeft + car.clientWidth >= car.scrollWidth - 4; }
      if (prev) prev.addEventListener('click', function () { car.scrollBy({ left: -passo(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { car.scrollBy({ left: passo(), behavior: 'smooth' }); });
      car.addEventListener('scroll', upd, { passive: true }); upd();
    });

    // vídeos com botão de pausa
    $$('[data-video-toggle]').forEach(function (b) {
      var v = b.parentNode.querySelector('video'); if (!v) return;
      b.addEventListener('click', function () { if (v.paused) { v.play(); b.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>'; } else { v.pause(); b.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; } });
    });

    // slideshow simples
    $$('[data-slideshow]').forEach(function (s) { var sl = $$('.slideshow__slide', s); if (sl.length < 2) return; var i = 0; setInterval(function () { sl[i].classList.remove('is-on'); i = (i + 1) % sl.length; sl[i].classList.add('is-on'); }, (parseInt(s.getAttribute('data-speed'), 10) || 7) * 1000); });

    // produto: galeria, variantes, quantidade
    $$('[data-product-form]').forEach(function (root) {
      var thumbs = $$('[data-thumb]', root), slides = $$('[data-slide]', root);
      function ver(n) { slides.forEach(function (s, k) { s.classList.toggle('is-on', k === n); }); thumbs.forEach(function (t, k) { t.classList.toggle('is-on', k === n); }); }
      thumbs.forEach(function (t) { t.addEventListener('click', function () { ver(parseInt(t.getAttribute('data-thumb'), 10)); }); });
      var info = $('[data-variants]', root); var vs = info ? JSON.parse(info.getAttribute('data-variants') || '[]') : [];
      var idIn = $('input[name="id"]', root);
      $$('.variant-picker input', root).forEach(function (r) {
        r.addEventListener('change', function () {
          var esc2 = $$('.variant-picker', root).map(function (fs) { var c = $('input:checked', fs); return c ? c.value : null; });
          $$('.variant-picker', root).forEach(function (fs, k) { var l = $('[data-option-value]', fs); if (l) l.textContent = esc2[k]; });
          var v = vs.filter(function (x) { return x.opcoes.every(function (o, k) { return o === esc2[k]; }); })[0];
          if (!v) return;
          if (idIn) idIn.value = v.id;
          var pr = $('[data-price]', root);
          if (pr) pr.innerHTML = '<div class="price price--lg' + (v.comparacao ? ' price--sale' : '') + '"><span class="price__now">' + brl(Math.round(v.preco * 100)) + '</span>' + (v.comparacao ? ' <s class="price__was">' + brl(Math.round(v.comparacao * 100)) + '</s>' : '') + '</div>';
          var add = $('.product__add', root); if (add) { add.disabled = !v.disponivel; add.textContent = v.disponivel ? add.getAttribute('data-add-label') : 'Esgotado'; }
          var st = $('[data-stock]', root); if (st) { st.classList.toggle('is-out', !v.disponivel); st.lastChild.textContent = v.disponivel ? 'Em estoque, envio rápido disponível' : 'Esgotado no momento'; }
          var sl = slides.findIndex(function (s) { return (s.getAttribute('data-variant-ids') || '').split(',').indexOf(String(v.id)) >= 0; }); if (sl >= 0) ver(sl);
          try { history.replaceState(null, '', location.pathname + '?variant=' + v.id); } catch (e) {}
        });
      });
      $$('[data-qty]', root).forEach(function (b) { b.addEventListener('click', function () { var i = $('input[name="quantity"]', root); i.value = Math.max(1, (parseInt(i.value, 10) || 1) + parseInt(b.getAttribute('data-qty'), 10)); }); });
    });
    if (CFG.page === 'product' && window.AN_PRODUTO) { try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: 'view_item', ecommerce: { currency: 'BRL', items: [{ item_id: window.AN_PRODUTO.id, item_name: window.AN_PRODUTO.titulo, price: window.AN_PRODUTO.variantes[0] && window.AN_PRODUTO.variantes[0].preco }] } }); } catch (e) {} }

    // coleção: ordenar e filtrar no navegador
    $$('[data-collection]').forEach(function (sec) {
      var grid = $('[data-grid]', sec), sel = $('[data-sort]', sec), cnt = $('[data-count]', sec);
      var itens = $$('.product-grid__item', grid);
      var fAv = $('[data-f-available]'), fMin = $('[data-f-min]'), fMax = $('[data-f-max]');
      function aplicar() {
        var o = sel.value;
        var cmp = { 'title-ascending': function (a, b) { return a.dataset.title.localeCompare(b.dataset.title); }, 'title-descending': function (a, b) { return b.dataset.title.localeCompare(a.dataset.title); },
          'price-ascending': function (a, b) { return a.dataset.price - b.dataset.price; }, 'price-descending': function (a, b) { return b.dataset.price - a.dataset.price; },
          'created-descending': function (a, b) { return b.dataset.created.localeCompare(a.dataset.created); }, 'created-ascending': function (a, b) { return a.dataset.created.localeCompare(b.dataset.created); } }[o] || function (a, b) { return a.dataset.pos - b.dataset.pos; };
        itens.slice().sort(cmp).forEach(function (el) { grid.appendChild(el); });
        var min = parseFloat(fMin && fMin.value) || 0, max = parseFloat(fMax && fMax.value) || Infinity, n = 0;
        itens.forEach(function (el) { var ok = (!fAv || !fAv.checked || el.dataset.available === '1') && +el.dataset.price >= min && +el.dataset.price <= max; el.hidden = !ok; if (ok) n++; });
        if (cnt) cnt.textContent = n + ' produto' + (n === 1 ? '' : 's');
        try { var u = new URL(location.href); u.searchParams.set('sort_by', o); history.replaceState(null, '', u); } catch (e) {}
      }
      var sb = new URLSearchParams(location.search).get('sort_by'); if (sb && $('option[value="' + sb + '"]', sel)) sel.value = sb;
      sel.addEventListener('change', aplicar); [fAv, fMin, fMax].forEach(function (x) { if (x) x.addEventListener('input', aplicar); });
      var cl = $('[data-f-clear]'); if (cl) cl.addEventListener('click', function () { if (fAv) fAv.checked = false; if (fMin) fMin.value = ''; if (fMax) fMax.value = ''; aplicar(); });
      aplicar();
    });

    // página de busca
    var sp = $('[data-search-page]');
    if (sp) {
      var q = new URLSearchParams(location.search).get('q') || ''; sp.value = q;
      buscar(q).then(function (r) {
        $('[data-search-count]').textContent = q ? r.produtos.length + ' resultado' + (r.produtos.length === 1 ? '' : 's') + ' para "' + q + '"' : 'Digite o que você procura.';
        $('[data-search-grid]').innerHTML = r.produtos.map(function (p) {
          var v = p.v[0], off = v.c && v.c > v.p ? Math.round((1 - v.p / v.c) * 100) : 0;
          return '<div class="card product-card"><div class="product-card__mediawrap"><a class="product-card__media" href="/products/' + esc(p.h) + '"><img class="product-card__img" src="' + esc(p.img) + '" alt="' + esc(p.t) + '" loading="lazy">' + (off ? '<span class="badge badge--sale">' + off + '% OFF</span>' : '') + '</a></div><div class="product-card__info"><p class="product-card__vendor">America Nutrition</p><div class="product-card__row"><a class="product-card__title" href="/products/' + esc(p.h) + '">' + esc(p.t) + '</a><div class="price">' + (p.v.length > 1 ? '<span class="price__from">A partir de</span> ' : '') + '<span class="price__now">' + brl(precoMin(p)) + '</span></div></div></div></div>';
        }).join('');
        $('[data-search-articles]').innerHTML = r.artigos.slice(0, 10).map(function (a) { return '<a class="search-hit" href="' + esc(a.u) + '">' + (a.img ? '<img src="' + esc(a.img) + '" alt="">' : '') + '<div><strong>' + esc(a.t) + '</strong><span>Blog</span></div></a>'; }).join('');
      });
    }

    // conta: rastreio
    var tf = $('[data-track-form]');
    if (tf) tf.addEventListener('submit', function (e) { e.preventDefault(); var c = tf.codigo.value.trim().toUpperCase().replace(/\s+/g, ''); if (c) location.href = tf.action.replace(/\/?$/, '/') + encodeURIComponent(c); });

    // hero rotativo
    $$('.hrx[data-section]').forEach(heroInit);
  });

  // ------------------------------------------------------------------ hero rotativo (mesmo comportamento do tema atual)
  function heroInit(root) {
    if (!root || root.__hrx) return; root.__hrx = true;
    var slides = $$('.hrx-slide', root), dots = $$('.hrx-dot', root);
    var sid = root.getAttribute('data-section') || 'hrx';
    slides.forEach(function (slide, idx) {
      var v = $('.hrx-specvid', slide); if (!v) return;
      var pool = (v.getAttribute('data-specpool') || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      if (pool.length < 2) { if (pool.length === 1) v.setAttribute('data-specsrc', pool[0]); return; }
      var mode = v.getAttribute('data-specmode') || 'sequence', pick = 0;
      if (mode === 'random') pick = Math.floor(Math.random() * pool.length);
      else { try { var key = 'hrx_sq_' + sid + '_' + idx; var last = parseInt(localStorage.getItem(key), 10); pick = isNaN(last) ? 0 : ((last + 1) % pool.length); localStorage.setItem(key, String(pick)); } catch (e) { pick = Math.floor(Math.random() * pool.length); } }
      v.setAttribute('data-specsrc', pool[pick]);
      var pp = (v.getAttribute('data-specposterpool') || '').split('|').map(function (s) { return s.trim(); });
      if (pp[pick]) v.setAttribute('poster', pp[pick]);
    });
    var interval = parseInt(root.getAttribute('data-interval'), 10) || 10000;
    var autoplay = root.getAttribute('data-autoplay') === 'true', pauseHover = root.getAttribute('data-pause') === 'true';
    var mq = window.matchMedia('(max-width:820px)');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var i = 0, timer = null;
    function src(v) { if (v && !v.getAttribute('src')) { var s = v.getAttribute('data-src') || v.getAttribute('data-specsrc'); if (s) { v.setAttribute('src', s); v.load(); } } }
    function pick(s) { var d = $('.hrx-vid--d', s), m = $('.hrx-vid--m', s); return mq.matches ? (m || d) : (d || m); }
    function play1(v) { if (v) { v.muted = true; src(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
    function playVid(s) { if (!s || reduce) return; var a = pick(s); $$('.hrx-vid', s).forEach(function (v) { if (v !== a) try { v.pause(); } catch (e) {} }); play1(a); play1($('.hrx-specvid', s)); }
    function pauseVid(s) { if (s) $$('.hrx-vid,.hrx-specvid', s).forEach(function (v) { try { v.pause(); } catch (e) {} }); }
    function show(n) {
      if (!slides.length) return; i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { var on = k === i; s.classList.toggle('is-active', on); if (on) playVid(s); else pauseVid(s); });
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); d.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { stop(); if (autoplay && slides.length > 1) timer = setInterval(function () { show(i + 1); }, interval); }
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); start(); }); });
    var p = $('.hrx-arrow.prev', root), n = $('.hrx-arrow.next', root);
    if (p) p.addEventListener('click', function () { show(i - 1); start(); });
    if (n) n.addEventListener('click', function () { show(i + 1); start(); });
    if (pauseHover) { root.addEventListener('mouseenter', stop); root.addEventListener('mouseleave', start); }
    slides.forEach(function (s) {
      var href = s.getAttribute('data-href'); if (!href) return;
      s.addEventListener('click', function (e) { if (e.target.closest('a,button')) return; location.href = href; });
      s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = href; } });
    });
    if (mq.addEventListener) mq.addEventListener('change', function () { playVid(slides[i]); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); pauseVid(slides[i]); } else { start(); playVid(slides[i]); } });
    show(0); start();
  }

  // compatibilidade com scripts que esperam objetos da Shopify/Concept
  window.Shopify = window.Shopify || { shop: 'americanutrition', locale: 'pt-BR', currency: { active: 'BRL', rate: '1.0' }, routes: { root: '/' } };
  window.theme = window.theme || { routes: { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_update_url: '/cart/update', predictive_search_url: '/search/suggest' }, settings: {} };
})();
