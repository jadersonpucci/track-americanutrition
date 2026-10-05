/* Pixels de marketing que a Shopify injetava pelos apps (Facebook & Instagram, TikTok, Google & YouTube,
 * Klaviyo), agora direto no site, com os mesmos eventos:
 *   página → PageView / page_view · produto → ViewContent / view_item / Viewed Product
 *   carrinho → AddToCart / add_to_cart / Added to Cart · ir para o checkout → InitiateCheckout / begin_checkout
 *   busca → Search / search · coleção → view_item_list
 * A compra (Purchase) continua sendo disparada pelo checkout próprio.
 * IDs em Configurações → Rastreamento (config.rastreio). Os eventos vêm do tema: an:add, an:checkout.
 */
(function () {
  var R = window.AN_RASTREIO || {}, L = window.AN_LOJA || {};
  if (window.__anRastreio) return; window.__anRastreio = true;

  // ---------------------------------------------------------------- bases
  if (R.meta && !window.fbq) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }
  if (R.meta) { window.fbq('init', R.meta); window.fbq('track', 'PageView'); }
  if (R.tiktok && !window.ttq) {
    !function (w, d, t) { w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; }; ttq.load = function (e, n) { var r = 'https://analytics.tiktok.com/i18n/pixel/events.js'; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {}; ttq._o[e] = n || {}; var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = r + '?sdkid=' + e + '&lib=' + t; var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a); }; ttq.load(R.tiktok); ttq.page(); }(window, document, 'ttq');
  }
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
  if (R.ga4) {
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) { var g = document.createElement('script'); g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + R.ga4; document.head.appendChild(g); window.gtag('js', new Date()); }
    window.gtag('config', R.ga4);
  }
  var ADS = R.google_ads || {};   // {page_view: 'AW-x/label', view_item: …}
  function google(ev, params) {
    if (!R.ga4 && !ADS[ev]) return;
    var p = Object.assign({}, params || {});
    var para = [R.ga4].concat(ADS[ev] ? [ADS[ev]] : []).filter(Boolean);
    p.send_to = para.length === 1 ? para[0] : para;
    window.gtag('event', ev, p);
  }
  function klaviyo(ev, props) { try { if (window.klaviyo && window.klaviyo.track) window.klaviyo.track(ev, props); else if (window._learnq) window._learnq.push(['track', ev, props]); } catch (e) {} }
  google('page_view', {});

  // ---------------------------------------------------------------- eventos
  var P = window.AN_PRODUTO;
  if (L.page === 'product' && P) {
    var v0 = P.variantes && P.variantes[0] || {};
    var item = { item_id: String(v0.id || P.id), item_name: P.titulo, price: v0.preco, quantity: 1 };
    if (window.fbq && R.meta) window.fbq('track', 'ViewContent', { content_ids: [String(v0.id || P.id)], content_type: 'product', content_name: P.titulo, value: v0.preco, currency: 'BRL' });
    if (window.ttq && R.tiktok) window.ttq.track('ViewContent', { contents: [{ content_id: String(v0.id || P.id), content_name: P.titulo, price: v0.preco, quantity: 1 }], content_type: 'product', value: v0.preco, currency: 'BRL' });
    google('view_item', { currency: 'BRL', value: v0.preco, items: [item] });
    klaviyo('Viewed Product', { ProductName: P.titulo, ProductID: P.id, SKU: v0.sku, Price: v0.preco, URL: location.origin + location.pathname, ImageURL: P.imagem, Handle: P.handle });
  }
  if (L.page === 'collection') google('view_item_list', { item_list_name: document.title });

  document.addEventListener('an:add', function (e) {
    var itens = [].concat(e.detail || []);
    var valor = itens.reduce(function (s, i) { return s + (i.price || 0) / 100 * (i.quantity || 1); }, 0);
    var ids = itens.map(function (i) { return String(i.variant_id); });
    if (window.fbq && R.meta) window.fbq('track', 'AddToCart', { content_ids: ids, content_type: 'product', value: valor, currency: 'BRL', contents: itens.map(function (i) { return { id: String(i.variant_id), quantity: i.quantity }; }) });
    if (window.ttq && R.tiktok) window.ttq.track('AddToCart', { contents: itens.map(function (i) { return { content_id: String(i.variant_id), content_name: i.product_title, price: (i.price || 0) / 100, quantity: i.quantity }; }), content_type: 'product', value: valor, currency: 'BRL' });
    google('add_to_cart', { currency: 'BRL', value: valor, items: itens.map(function (i) { return { item_id: String(i.variant_id), item_name: i.product_title, item_variant: i.variant_title, price: (i.price || 0) / 100, quantity: i.quantity }; }) });
    itens.forEach(function (i) { klaviyo('Added to Cart', { $value: (i.price || 0) / 100 * i.quantity, AddedItemProductName: i.product_title, AddedItemProductID: i.product_id, AddedItemSKU: i.sku, AddedItemImageURL: i.image, AddedItemPrice: (i.price || 0) / 100, AddedItemQuantity: i.quantity, ItemNames: [i.product_title], CheckoutURL: location.origin + '/cart' }); });
  });

  var iniciou = 0;
  document.addEventListener('an:checkout', function (e) {
    if (Date.now() - iniciou < 3000) return; iniciou = Date.now();
    var c = e.detail || {}, itens = c.items || [];
    var valor = (c.total_price || 0) / 100;
    if (window.fbq && R.meta) window.fbq('track', 'InitiateCheckout', { content_ids: itens.map(function (i) { return String(i.variant_id); }), content_type: 'product', num_items: c.item_count, value: valor, currency: 'BRL' });
    if (window.ttq && R.tiktok) window.ttq.track('InitiateCheckout', { contents: itens.map(function (i) { return { content_id: String(i.variant_id), quantity: i.quantity, price: (i.price || 0) / 100 }; }), value: valor, currency: 'BRL' });
    google('begin_checkout', { currency: 'BRL', value: valor, items: itens.map(function (i) { return { item_id: String(i.variant_id), item_name: i.product_title, price: (i.price || 0) / 100, quantity: i.quantity }; }) });
    klaviyo('Started Checkout', { $value: valor, ItemNames: itens.map(function (i) { return i.product_title; }), Items: itens.map(function (i) { return { ProductName: i.product_title, Quantity: i.quantity, ItemPrice: (i.price || 0) / 100, ImageURL: i.image }; }) });
  });

  var q = /^\/search/.test(location.pathname) && new URLSearchParams(location.search).get('q');
  if (q) {
    if (window.fbq && R.meta) window.fbq('track', 'Search', { search_string: q });
    if (window.ttq && R.tiktok) window.ttq.track('Search', { query: q });
    google('search', { search_term: q });
  }
})();
