/* Minha conta (cliente): e-mail ou celular → código de 6 dígitos → pedidos.
 * API: POST {AN_CONTA.api} {op, ...} (webhook n8n "Loja · API pública" → loja_publico no Postgres).
 * Sem API configurada: demonstração com pedidos fictícios (código 123456).
 */
(function () {
  var C = window.AN_CONTA || {}, raiz = document.querySelector('[data-conta]');
  if (!raiz) return;
  var DEMO = !C.api;
  var $ = function (s) { return raiz.querySelector(s); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  var brl = function (v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var guardar = function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  var ler = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var login = '';

  function etapa(n) { ['login', 'codigo', 'conta', 'avaliar'].forEach(function (e) { $('[data-etapa="' + e + '"]').hidden = e !== n; }); window.scrollTo(0, 0); }
  function msg(sel, t, erro) { var m = $(sel); m.hidden = !t; m.textContent = t || ''; m.classList.toggle('is-erro', !!erro); }
  var ERROS = { login_invalido: 'Confira o e-mail ou celular.', muitas_tentativas: 'Muitas tentativas. Espere alguns minutos e tente de novo.', codigo_invalido: 'Código incorreto ou vencido.', sessao_invalida: 'Sua sessão expirou. Entre de novo.', link_invalido: 'Link de avaliação inválido.' };

  function api(op, dados) {
    if (DEMO) return demo(op, dados);
    return fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ op: op }, dados)) })
      .then(function (r) { return r.json(); }).then(function (j) { if (Array.isArray(j)) j = j[0]; if (j && j.r) j = j.r; return j; });
  }

  // ---------------------------------------------------------------- demonstração
  function demo(op, d) {
    return new Promise(function (ok) {
      setTimeout(function () {
        if (op === 'conta_codigo') return ok({ ok: true, via: /@/.test(d.login) ? 'email' : 'whatsapp' });
        if (op === 'conta_entrar') return ok(d.codigo === '123456' ? { ok: true, token: 'demo' } : { ok: false, erro: 'codigo_invalido' });
        if (op === 'conta_sair') return ok({ ok: true });
        if (op === 'avaliar_pedido') return pedidosDemo().then(function (ps) { ok({ ok: true, nome: 'Cliente', numero: ps[0].numero, itens: ps[0].itens }); });
        if (op === 'conta') return pedidosDemo().then(function (ps) { ok({ ok: true, cliente: { nome: 'Cliente Demonstração', email: login || 'cliente@exemplo.com' }, pedidos: ps }); });
        ok({ ok: false });
      }, 350);
    });
  }
  function pedidosDemo() {
    return fetch('/catalogo.json').then(function (r) { return r.json(); }).then(function (cat) {
      var ps = (cat.produtos || cat).slice(0, 4);
      var item = function (p, q) { var v = p.v[0]; return { variante_id: v.id, titulo: p.t, variante: v.t !== 'Default Title' ? v.t : null, qtd: q, preco: v.p / 100, imagem: p.img, handle: p.h }; };
      var hoje = Date.now();
      return [
        { numero: 15852, nome: 'AN-15852', criado_em: new Date(hoje - 2 * 864e5).toISOString(), status_pagamento: 'pago', status_entrega: 'enviado', rastreio: 'AD123456789BR', itens: [item(ps[0], 2)], avaliar: 'demo' },
        { numero: 15803, nome: 'AN-15803', criado_em: new Date(hoje - 31 * 864e5).toISOString(), status_pagamento: 'pago', status_entrega: 'entregue', rastreio: 'AD987654321BR', itens: [item(ps[1], 1), item(ps[2], 1)], avaliar: 'demo' },
        { numero: 15761, nome: 'AN-15761', criado_em: new Date(hoje - 64 * 864e5).toISOString(), status_pagamento: 'pago', status_entrega: 'entregue', itens: [item(ps[3], 3)], avaliar: 'demo' },
      ].map(function (p) { p.total = p.itens.reduce(function (s, i) { return s + i.preco * i.qtd; }, 0); return p; });
    });
  }

  // ---------------------------------------------------------------- pedidos
  var ST = {
    pendente: ['Aguardando pagamento', 'amber'], cancelado: ['Cancelado', 'red'], reembolsado: ['Reembolsado', 'red'],
    nao_enviado: ['Pagamento aprovado · preparando', 'blue'], preparando: ['Em separação', 'blue'], enviado: ['A caminho', 'blue'], entregue: ['Entregue', 'green'], devolvido: ['Devolvido', 'red'],
  };
  function status(p) { return p.status_pagamento !== 'pago' && p.status_pagamento !== 'parcial' ? ST[p.status_pagamento] || [p.status_pagamento, ''] : ST[p.status_entrega] || [p.status_entrega, '']; }
  function desenharConta(j) {
    var c = j.cliente || {};
    $('[data-conta-ola]').textContent = 'Olá' + (c.nome ? ', ' + c.nome.split(' ')[0] : '') + '!';
    $('[data-conta-quem]').textContent = (c.email || c.telefone || '') + (DEMO ? ' · demonstração' : '');
    var ps = j.pedidos || [];
    $('[data-conta-pedidos]').innerHTML = !ps.length ? '<p class="account__lead">Nenhum pedido encontrado.</p>' : ps.map(function (p, idx) {
      var s = status(p);
      return '<article class="pedido">' +
        '<header class="pedido__h"><div><strong>Pedido ' + esc(p.nome || 'AN-' + p.numero) + '</strong><span>' + new Date(p.criado_em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) + '</span></div>' +
        '<span class="pedido__st pedido__st--' + s[1] + '">' + esc(s[0]) + '</span></header>' +
        '<ul class="pedido__itens">' + (p.itens || []).map(function (i) {
          return '<li><img src="' + esc(i.imagem || '') + '" alt="" loading="lazy" width="56" height="56"><div><a href="/products/' + esc(i.handle || '') + '">' + esc(i.titulo) + '</a>' + (i.variante ? '<small>' + esc(i.variante) + '</small>' : '') + '<small>' + i.qtd + ' × ' + brl(i.preco) + '</small></div></li>';
        }).join('') + '</ul>' +
        '<footer class="pedido__f"><span>Total <strong>' + brl(p.total) + '</strong></span><div class="pedido__acoes">' +
          (p.rastreio ? '<a class="button button--secondary button--sm" href="' + esc((C.rastreio || '').replace(/\/?$/, '/') + p.rastreio) + '" target="_blank" rel="noopener">Rastrear entrega</a>' : '') +
          (p.avaliar ? '<a class="button button--secondary button--sm" href="?avaliar=' + esc(p.avaliar) + '">Avaliar</a>' : '') +
          '<button type="button" class="button button--primary button--sm" data-recomprar="' + idx + '">Comprar de novo</button></div></footer></article>';
    }).join('');
    raiz.querySelectorAll('[data-recomprar]').forEach(function (b) {
      b.onclick = function () {
        var p = ps[+b.getAttribute('data-recomprar')]; b.disabled = true;
        fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: p.itens.map(function (i) { return { id: i.variante_id, quantity: i.qtd }; }) }) })
          .then(function (r) { if (!r.ok) throw new Error(); document.dispatchEvent(new CustomEvent('cart:refresh')); })
          .catch(function () { alert('Algum produto deste pedido não está disponível agora.'); }).then(function () { b.disabled = false; });
      };
    });
    etapa('conta');
  }
  function carregarConta() {
    var t = ler('an_conta');
    if (!t) return etapa('login');
    api('conta', { token: t }).then(function (j) { if (!j || !j.ok) { guardar('an_conta', null); etapa('login'); if (j && j.erro) msg('[data-conta-msg]', ERROS[j.erro] || j.erro, true); return; } desenharConta(j); })
      .catch(function () { etapa('login'); msg('[data-conta-msg]', 'Não foi possível carregar agora. Tente de novo.', true); });
  }

  // ---------------------------------------------------------------- avaliar (link do e-mail/WhatsApp)
  var tAvaliar = new URLSearchParams(location.search).get('avaliar');
  if (tAvaliar) {
    api('avaliar_pedido', { t: tAvaliar }).then(function (j) {
      if (!j || !j.ok) { etapa('login'); return msg('[data-conta-msg]', ERROS[(j || {}).erro] || 'Link inválido.', true); }
      $('[data-avaliar-ola]').textContent = (j.nome ? j.nome + ', conte' : 'Conte') + ' como foi!';
      $('[data-avaliar-itens]').innerHTML = (j.itens || []).map(function (i) {
        return '<a class="account__avaliar-item" href="/products/' + esc(i.handle) + '#avaliar"><img src="' + esc(i.imagem || '') + '" alt="" width="72" height="72"><span>' + esc(i.titulo) + '</span><span class="button button--primary button--sm">Avaliar</span></a>';
      }).join('');
      etapa('avaliar');
    });
  } else carregarConta();

  // ---------------------------------------------------------------- login
  $('[data-conta-login]').addEventListener('submit', function (e) {
    e.preventDefault(); var b = e.target.querySelector('button'); b.disabled = true; msg('[data-conta-msg]', '');
    login = e.target.login.value.trim();
    api('conta_codigo', { login: login }).then(function (j) {
      if (!j || !j.ok) return msg('[data-conta-msg]', ERROS[(j || {}).erro] || 'Não foi possível enviar o código.', true);
      $('[data-conta-enviado]').innerHTML = (j.via === 'email' ? 'Se houver pedidos com <strong>' + esc(login) + '</strong>, você recebe um código por e-mail' + ' (e no WhatsApp, se tivermos seu celular).' : 'Se houver pedidos com este celular, você recebe um código no WhatsApp.') + ' Ele vale por 15 minutos.' + (DEMO ? '<br><em>Demonstração: use 123456.</em>' : '');
      etapa('codigo'); setTimeout(function () { $('[data-conta-codigo] input').focus(); }, 50);
    }).catch(function () { msg('[data-conta-msg]', 'Sem conexão. Tente de novo.', true); }).then(function () { b.disabled = false; });
  });
  $('[data-conta-codigo]').addEventListener('submit', function (e) {
    e.preventDefault(); var b = e.target.querySelector('button'); b.disabled = true; msg('[data-conta-msg2]', '');
    api('conta_entrar', { login: login, codigo: e.target.codigo.value }).then(function (j) {
      if (!j || !j.ok) return msg('[data-conta-msg2]', ERROS[(j || {}).erro] || 'Não foi possível entrar.', true);
      guardar('an_conta', j.token); carregarConta();
    }).catch(function () { msg('[data-conta-msg2]', 'Sem conexão. Tente de novo.', true); }).then(function () { b.disabled = false; });
  });
  $('[data-conta-voltar]').onclick = function () { etapa('login'); };
  $('[data-conta-sair]').onclick = function () { var t = ler('an_conta'); guardar('an_conta', null); api('conta_sair', { token: t }).catch(function () {}); etapa('login'); };
})();
