/* Painel do email (SES). Servido como asset do tema; dados de /webhook/email-painel-api com token. */
(function(){
  var qs = new URLSearchParams(location.search);
  var TOKEN = qs.get('t') || '';
  var BASE = 'https://n8n.americanutrition.com/webhook/';
  var app = document.getElementById('app'), tip = document.getElementById('tip');
  function lg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function ls(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  var dias = Number(qs.get('dias') || lg('ep_dias') || 30);
  var aba = qs.get('aba') || lg('ep_aba') || 'geral';
  var t0 = lg('ep_tema'); if (t0) document.documentElement.setAttribute('data-theme', t0);

  var fmt = new Intl.NumberFormat('pt-BR');
  var brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
  var brl0 = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
  function pct(a,b){ return b ? (a/b*100) : 0; }
  function p1(x, casas){ var m = Math.pow(10, casas == null ? 1 : casas); return (Math.round(x*m)/m).toLocaleString('pt-BR') + '%'; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function dt(s){ if(!s) return '—'; var d = new Date(s); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
  function dia(s){ var p = String(s).split('-'); return p[2] + '/' + p[1]; }
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  var FLUXOS = { boas_vindas:['Boas-vindas','Quem se inscreve na lista e ainda não comprou'], pos_compra:['Pós-compra','Jornada depois de cada pedido pago'], recompra:['Recompra','Lembrete antes do ImunoFosfo acabar'], vip:['VIP','Quem chega ao 3º pedido'], navegacao:['Navegação abandonada','Ainda no Klaviyo (precisa do rastreio do site)'] };
  function nomeFluxo(f){ return (FLUXOS[f] || [f])[0]; }

  document.getElementById('tema').onclick = function(){
    var cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', nx); ls('ep_tema', nx); if (window.__d) render(window.__d);
  };
  var segs = document.querySelectorAll('.seg button');
  function marcaSeg(){ segs.forEach(function(b){ b.setAttribute('aria-pressed', String(Number(b.dataset.d) === dias)); }); }
  segs.forEach(function(b){ b.onclick = function(){ dias = Number(b.dataset.d); ls('ep_dias', dias); marcaSeg(); carrega(); }; });
  var tabs = document.querySelectorAll('nav.tabs button');
  function marcaTab(){ tabs.forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.tab === aba)); }); }
  tabs.forEach(function(b){ b.onclick = function(){ aba = b.dataset.tab; ls('ep_aba', aba); marcaTab(); if (window.__d) render(window.__d); window.scrollTo({ top:0 }); }; });
  marcaSeg(); marcaTab();

  function carrega(){
    if (!TOKEN) { app.innerHTML = '<div class="err">Link sem token. Abra o painel pelo link completo.</div>'; return; }
    fetch(BASE + 'email-painel-api?t=' + encodeURIComponent(TOKEN) + '&dias=' + dias, { cache:'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){ if (!d || d.ok === false) throw new Error('acesso negado'); window.__d = d; render(d); })
      .catch(function(e){ app.innerHTML = '<div class="err">Não consegui carregar os dados (' + esc(e.message) + ').</div>'; });
  }

  function status(v, ok, alerta, invert){ var c = invert ? (v >= ok ? 'good' : (v >= alerta ? 'warn' : 'bad')) : (v <= ok ? 'good' : (v <= alerta ? 'warn' : 'bad')); return c; }
  function chip(c, t){ return '<span class="chip ' + c + '">' + (c === 'good' ? '● ' : (c === 'warn' ? '▲ ' : (c === 'bad' ? '■ ' : ''))) + t + '</span>'; }
  function kpi(l, v, m){ return '<div class="card pad"><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="meta">' + (m || '') + '</div></div>'; }
  function vazio(t, s){ return '<div class="card empty"><b>' + t + '</b>' + (s || '') + '</div>'; }
  function sec(t, s, corpo){ return '<section class="sec"><div class="sec-h"><h2>' + t + '</h2>' + (s ? '<p>' + s + '</p>' : '') + '</div>' + corpo + '</section>'; }

  function porModelo(d){ var m = {}; (d.por_modelo || []).forEach(function(x){ m[x.slug] = x; }); return m; }

  function render(d){
    var c = d.config || {}, f = d.fila || {};
    var modo = c.fluxos_modo || '—';
    document.getElementById('modo').innerHTML = '<span class="dot ' + (modo === 'ativo' ? '' : modo) + '"></span>' + (modo === 'ativo' ? 'Enviando' : (modo === 'teste' ? 'Modo teste' : 'Desligado'));
    document.getElementById('sub').textContent = 'Atualizado ' + dt(d.gerado_em) + ' · período desde ' + dia(String(d.desde).slice(0,10));
    var h = ({ geral:geral, emails:emails, vendas:vendas, contatos:contatos, operacao:operacao }[aba] || geral)(d);
    h += '<p class="note">Abertura é uma estimativa: o Mail da Apple abre as imagens sozinho, então parte das aberturas não é leitura real. Cliques e vendas são confiáveis. Venda atribuída: pedido pago até 5 dias depois de um clique num email nosso, ou até 2 dias depois de uma abertura.</p>';
    app.innerHTML = h;
    if (aba === 'geral') graficos(d);
    if (aba === 'emails') ligaEmails(d);
  }

  /* ---------- Visão geral ---------- */
  function geral(d){
    var r = d.resumo || {}, c = d.config || {}, f = d.fila || {};
    var env = r.enviados || 0, ent = r.entregues || 0;
    var ticket = r.vendas ? r.receita / r.vendas : 0;
    var h = '<div class="grid g-hero">';
    h += '<div class="card pad hero"><div class="lbl">Receita atribuída ao email</div><div class="val">' + brl.format(r.receita || 0) + '</div>' +
      '<div class="hero-row"><div>Vendas<b>' + fmt.format(r.vendas || 0) + '</b></div><div>Ticket médio<b>' + brl0.format(ticket) + '</b></div><div>Por clique<b>' + brl0.format(r.receita_clique || 0) + '</b></div></div></div>';
    h += kpi('Enviados', fmt.format(env), f.proximas_24h ? fmt.format(f.proximas_24h) + ' agendados p/ 24h' : 'fila em dia');
    h += kpi('Abertura', p1(pct(r.aberturas || 0, ent)), fmt.format(r.aberturas || 0) + ' pessoas abriram');
    h += kpi('Clique', p1(pct(r.cliques || 0, ent)), fmt.format(r.cliques || 0) + ' pessoas clicaram');
    h += kpi('Conversão', p1(pct(r.vendas || 0, ent), 2), 'vendas por email entregue');
    h += '</div>';

    var entR = pct(ent, env), bR = pct(r.bounces || 0, env), cR = pct(r.reclamacoes || 0, ent || env), dR = pct(r.descadastros || 0, ent);
    var lim = Number(c.envio_limite_dia || 0), hoje = f.enviados_hoje || 0;
    h += sec('Saúde do envio', 'limites da AWS: bounce até 5% e reclamação até 0,1%',
      '<div class="card"><div class="health">' +
        meter('Entrega', env ? p1(entR) : '—', env ? chip(status(entR, 98, 95, true), entR >= 98 ? 'ótima' : 'baixa') : chip('neutral','sem envios'), entR, css('--good')) +
        meter('Bounce', env ? p1(bR) : '—', env ? chip(status(bR, 2, 5), bR <= 2 ? 'saudável' : (bR <= 5 ? 'atenção' : 'risco de pausa')) : chip('neutral','sem envios'), bR / 5 * 100, bR <= 2 ? css('--good') : (bR <= 5 ? css('--warn') : css('--bad'))) +
        meter('Reclamação (spam)', env ? p1(cR, 2) : '—', env ? chip(status(cR, .08, .1), cR <= .08 ? 'saudável' : 'acima do limite') : chip('neutral','sem envios'), cR / .1 * 100, cR <= .08 ? css('--good') : css('--bad')) +
        meter('Descadastros', fmt.format(r.descadastros || 0), '<span class="meta" style="margin:0">' + p1(dR, 2) + ' dos entregues</span>', dR / 1 * 100, css('--s2')) +
      '</div><div class="limit"><span>Hoje: <b>' + fmt.format(hoje) + '</b> de ' + fmt.format(lim) + ' (limite do aquecimento)</span><div class="meter"><span style="width:' + Math.min(100, pct(hoje, lim)) + '%;background:' + css('--brand') + '"></span></div></div></div>');

    h += sec('Desempenho no período', 'passe o mouse sobre os gráficos para ver cada dia',
      '<div class="grid g-3">' +
      '<div class="card pad chart"><h3>Envios por dia</h3><div class="cap">' + fmt.format(env) + ' no período</div><div id="c1"></div></div>' +
      '<div class="card pad chart"><h3>Aberturas e cliques</h3><div class="cap">pelo dia do envio</div><div class="legend"><span><i style="background:var(--s1)"></i>Aberturas</span><span><i style="background:var(--s2)"></i>Cliques</span></div><div id="c2"></div></div>' +
      '<div class="card pad chart"><h3>Receita atribuída</h3><div class="cap">pelo dia do pedido</div><div id="c3"></div></div></div>');

    var pm = (d.por_modelo || []).slice().sort(function(a,b){ return (b.receita - a.receita) || (b.cliques - a.cliques) || (b.enviados - a.enviados); }).slice(0, 5);
    var mods = {}; (d.modelos || []).forEach(function(m){ mods[m.slug] = m; });
    var topo = pm.length ? '<div class="card pad"><ul class="clean rank">' + pm.map(function(m, i){ var e = m.entregues || 0; return '<li><span class="pos">' + (i + 1) + '</span><div style="min-width:0"><div class="t">' + esc((mods[m.slug] || {}).assunto || m.assunto || m.slug) + '</div><div class="s">' + esc(nomeFluxo(m.fluxo)) + ' · ' + fmt.format(m.enviados) + ' enviados · abertura ' + p1(pct(m.aberturas, e)) + ' · clique ' + p1(pct(m.cliques, e)) + '</div></div><div class="v">' + brl0.format(m.receita) + '<div class="s" style="font-weight:500">' + fmt.format(m.vendas) + ' vendas</div></div></li>'; }).join('') + '</ul></div>'
      : vazio('Ainda sem emails enviados no período', 'Os fluxos começam com as próximas inscrições e pedidos pagos.');
    h += sec('Emails que mais vendem', '', topo);
    return h;
  }
  function meter(l, v, extra, w, cor){ return '<div><div class="lbl">' + l + '</div><div class="val" style="font-size:24px">' + v + '</div><div style="margin-top:6px">' + extra + '</div><div class="meter"><span style="width:' + Math.max(0, Math.min(100, w || 0)) + '%;background:' + cor + '"></span></div></div>'; }

  /* ---------- Emails ---------- */
  function emails(d){
    var mods = d.modelos || [], pm = porModelo(d);
    if (!mods.length) return vazio('Nenhum modelo encontrado');
    var grupos = {}; mods.forEach(function(m){ (grupos[m.fluxo] = grupos[m.fluxo] || []).push(m); });
    var h = '<div class="sec-h"><h2>Os emails de cada fluxo</h2><p>clique num email para ver como ele chega na caixa da cliente</p></div>';
    ['boas_vindas','pos_compra','recompra','vip','navegacao'].forEach(function(k){
      if (!grupos[k]) return;
      var fi = FLUXOS[k] || [k, ''];
      var ativo = k !== 'navegacao';
      h += '<div class="flow"><div class="flow-h"><h3>' + fi[0] + '</h3>' + chip(ativo ? 'good' : 'neutral', ativo ? 'ativo' : 'Klaviyo') + '<span class="meta" style="margin:0">' + fi[1] + '</span></div><div class="emails">';
      grupos[k].forEach(function(m){
        var s = pm[m.slug] || {}, e = s.entregues || 0;
        h += '<div class="card em' + (ativo ? '' : ' off') + '" data-slug="' + esc(m.slug) + '" tabindex="0">' +
          '<div class="thumb"><iframe loading="lazy" tabindex="-1" title="' + esc(m.slug) + '" src="' + BASE + 'email-painel-modelo?t=' + encodeURIComponent(TOKEN) + '&slug=' + encodeURIComponent(m.slug) + '"></iframe><span class="when">' + esc(m.quando) + '</span></div>' +
          '<div class="body"><div class="subj">' + esc(m.assunto) + '</div><div class="pre">' + esc(m.previa) + '</div>' +
          '<div class="stats"><div>Enviados<b>' + fmt.format(s.enviados || 0) + '</b></div><div>Abertura<b>' + (e ? p1(pct(s.aberturas, e)) : '—') + '</b></div><div>Clique<b>' + (e ? p1(pct(s.cliques, e)) : '—') + '</b></div><div>Receita<b>' + (s.receita ? brl0.format(s.receita) : '—') + '</b></div></div></div></div>';
      });
      h += '</div></div>';
    });
    return h;
  }
  function encaixa(){ document.querySelectorAll('.thumb').forEach(function(t){ var f = t.querySelector('iframe'); if (f) f.style.transform = 'scale(' + (t.clientWidth / 600) + ')'; }); }
  window.addEventListener('resize', function(){ if (aba === 'emails') encaixa(); });
  function ligaEmails(d){
    encaixa();
    var mods = {}; (d.modelos || []).forEach(function(m){ mods[m.slug] = m; }); var pm = porModelo(d);
    document.querySelectorAll('.em').forEach(function(el){
      var abre = function(){ var m = mods[el.dataset.slug] || {}, s = pm[el.dataset.slug] || {}, e = s.entregues || 0;
        document.getElementById('mSubj').textContent = m.assunto || ''; document.getElementById('mPre').textContent = m.previa || '';
        document.getElementById('mStats').innerHTML = chip('neutral', esc(nomeFluxo(m.fluxo)) + ' · ' + esc(m.quando)) + chip('neutral', fmt.format(s.enviados || 0) + ' enviados') + chip('neutral', 'abertura ' + (e ? p1(pct(s.aberturas, e)) : '—')) + chip('neutral', 'clique ' + (e ? p1(pct(s.cliques, e)) : '—')) + chip('neutral', fmt.format(s.vendas || 0) + ' vendas · ' + brl0.format(s.receita || 0)) + chip('neutral', fmt.format(s.pendentes || 0) + ' na fila');
        document.getElementById('mFrame').src = BASE + 'email-painel-modelo?t=' + encodeURIComponent(TOKEN) + '&slug=' + encodeURIComponent(el.dataset.slug);
        document.getElementById('modal').classList.add('on'); document.body.style.overflow = 'hidden'; };
      el.onclick = abre; el.onkeydown = function(ev){ if (ev.key === 'Enter') abre(); };
    });
  }
  function fecha(){ document.getElementById('modal').classList.remove('on'); document.getElementById('mFrame').src = 'about:blank'; document.body.style.overflow = ''; }
  document.getElementById('mClose').onclick = fecha;
  document.getElementById('modal').onclick = function(e){ if (e.target.id === 'modal') fecha(); };
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') fecha(); });

  /* ---------- Vendas ---------- */
  function vendas(d){
    var r = d.resumo || {}, vs = d.vendas || [];
    var h = '<div class="grid g-3">' + kpi('Receita atribuída', brl.format(r.receita || 0), fmt.format(r.vendas || 0) + ' pedidos') + kpi('Por clique', brl.format(r.receita_clique || 0), fmt.format(r.vendas_clique || 0) + ' pedidos (até 5 dias)') + kpi('Por abertura', brl.format((r.receita || 0) - (r.receita_clique || 0)), fmt.format((r.vendas || 0) - (r.vendas_clique || 0)) + ' pedidos (até 2 dias)') + '</div>';
    var pf = {}; vs.forEach(function(v){ var k = v.fluxo || '-'; pf[k] = pf[k] || { n:0, r:0 }; pf[k].n++; pf[k].r += Number(v.total || 0); });
    var ks = Object.keys(pf).sort(function(a,b){ return pf[b].r - pf[a].r; }), mx = ks.length ? pf[ks[0]].r || 1 : 1;
    h += sec('Receita por fluxo', '', ks.length ? '<div class="card pad"><ul class="clean kv">' + ks.map(function(k){ return '<li style="display:block"><div style="display:flex;justify-content:space-between"><span class="k">' + esc(nomeFluxo(k)) + ' · ' + fmt.format(pf[k].n) + ' vendas</span><b>' + brl.format(pf[k].r) + '</b></div><div class="bar"><span style="width:' + Math.max(3, pf[k].r / mx * 100) + '%"></span></div></li>'; }).join('') + '</ul></div>' : vazio('Nenhuma venda atribuída no período ainda'));
    h += sec('Pedidos atribuídos', 'os 100 mais recentes', vs.length ? '<div class="card tablewrap"><table><thead><tr><th>Pedido</th><th>Quando</th><th>Cliente</th><th class="n">Valor</th><th>Email que levou</th><th>Por</th></tr></thead><tbody>' + vs.map(function(v){ return '<tr><td><b>' + esc(v.numero) + '</b></td><td>' + dt(v.quando) + '</td><td>' + esc(v.email) + '</td><td class="n">' + brl.format(v.total) + '</td><td>' + esc(v.slug) + '</td><td>' + chip(v.tipo === 'clique' ? 'good' : 'neutral', v.tipo === 'clique' ? 'clique' : 'abertura') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
    var links = d.links || [];
    h += sec('Links mais clicados', '', links.length ? '<div class="card pad"><ul class="clean kv">' + links.map(function(l){ var u = String(l.link).replace(/^https?:\/\/(www\.)?/, '').replace(/[?&]utm_[^&]+/g, ''); var m0 = links[0].cliques || 1; return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:12px"><span class="k" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(u) + '</span><b>' + fmt.format(l.cliques) + '</b></div><div class="bar"><span style="width:' + Math.max(3, l.cliques / m0 * 100) + '%"></span></div></li>'; }).join('') + '</ul></div>' : vazio('Sem cliques no período'));
    return h;
  }

  /* ---------- Contatos ---------- */
  function contatos(d){
    var ct = d.contatos || {}, ps = ct.por_status || {};
    var itens = [['inscrito','Inscritos',css('--s1')],['nao_inscrito','Sem aceite de marketing',css('--muted')],['descadastrado','Descadastrados',css('--s2')],['bounce','Email inválido',css('--warn')],['reclamacao','Marcaram spam',css('--bad')]];
    var tot = itens.reduce(function(a,i){ return a + Number(ps[i[0]] || 0); }, 0);
    var h = '<div class="grid g-3">' + kpi('Inscritos (recebem email)', fmt.format(ps.inscrito || 0), p1(pct(ps.inscrito || 0, tot)) + ' da base') + kpi('Novos inscritos', fmt.format(ct.novos_inscritos || 0), 'no período') + kpi('Inscritos que compraram em 90 dias', fmt.format(ct.engajados_90d || 0), 'os mais engajados') + '</div>';
    h += sec('Base de contatos', fmt.format(tot) + ' emails espelhados da Shopify',
      '<div class="card pad"><div class="stack">' + itens.map(function(i){ var n = Number(ps[i[0]] || 0); return n ? '<span title="' + i[1] + ': ' + fmt.format(n) + '" style="width:' + pct(n, tot) + '%;background:' + i[2] + '"></span>' : ''; }).join('') + '</div><div class="leg">' + itens.map(function(i){ return '<span><i style="background:' + i[2] + '"></i>' + i[1] + ' <b>' + fmt.format(ps[i[0]] || 0) + '</b></span>'; }).join('') + '</div></div>');
    var ds = ct.descadastros || [];
    h += sec('Descadastros recentes', '', ds.length ? '<div class="card tablewrap"><table><thead><tr><th>Quando</th><th>Email</th><th>Motivo</th></tr></thead><tbody>' + ds.map(function(x){ return '<tr><td>' + dt(x.quando) + '</td><td>' + esc(x.email) + '</td><td>' + esc(x.motivo || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : vazio('Nenhum descadastro no período'));
    return h;
  }

  /* ---------- Operação ---------- */
  function operacao(d){
    var f = d.fila || {}, c = d.config || {}, sy = (d.contatos || {}).sincronizacao || {};
    var pend = f.pendentes || {}, sp = f.status_periodo || {}, pm2 = f.pulados_motivo || {};
    var h = '<div class="grid g-3">' + kpi('Agendados', fmt.format(Object.keys(pend).reduce(function(a,k){ return a + pend[k]; }, 0)), fmt.format(f.proximas_24h || 0) + ' saem nas próximas 24h') + kpi('Enviados hoje', fmt.format(f.enviados_hoje || 0), 'limite ' + fmt.format(Number(c.envio_limite_dia || 0)) + ' por dia') + kpi('Modo', c.fluxos_modo === 'ativo' ? 'Enviando' : (c.fluxos_modo === 'teste' ? 'Teste' : 'Desligado'), 'sincronização ' + (sy.sync_clientes_after ? 'carregando base' : 'em dia')) + '</div>';
    h += '<div class="grid g-2" style="margin-top:14px">';
    h += '<div class="card pad"><h3 style="margin:0 0 6px;font-size:13.5px">Fila por fluxo</h3><ul class="clean kv">' + (Object.keys(pend).length ? Object.keys(pend).map(function(k){ return '<li><span class="k">' + esc(nomeFluxo(k)) + '</span><b>' + fmt.format(pend[k]) + '</b></li>'; }).join('') : '<li><span class="k">Nada agendado agora</span><b>0</b></li>') + '</ul></div>';
    var rot = { enviado:'Enviados', pulado:'Pulados pelas regras', expirado:'Expirados (atrasaram 2 dias)', erro:'Erro no envio', teste:'Testes no simulador', pendente:'Ainda agendados' };
    h += '<div class="card pad"><h3 style="margin:0 0 6px;font-size:13.5px">O que aconteceu com a fila no período</h3><ul class="clean kv">' + (Object.keys(sp).length ? Object.keys(sp).map(function(k){ return '<li><span class="k">' + (rot[k] || k) + '</span><b>' + fmt.format(sp[k]) + '</b></li>'; }).join('') : '<li><span class="k">Sem movimento</span><b>0</b></li>') +
      Object.keys(pm2).map(function(k){ return '<li><span class="k" style="padding-left:14px">↳ ' + esc(k) + '</span><span>' + fmt.format(pm2[k]) + '</span></li>'; }).join('') + '</ul></div>';
    h += '</div>';
    var pb = d.problemas || [], er = f.erros || [];
    var linhas = pb.map(function(p){ return '<tr><td>' + dt(p.quando) + '</td><td>' + chip(p.tipo === 'complaint' ? 'bad' : 'warn', p.tipo === 'complaint' ? 'spam' : (p.tipo === 'reject' ? 'rejeitado' : 'bounce')) + '</td><td>' + esc(p.email) + '</td><td>' + esc(p.slug) + '</td><td>' + esc(p.detalhe) + '</td></tr>'; })
      .concat(er.map(function(p){ return '<tr><td>' + dt(p.quando) + '</td><td>' + chip('bad', 'erro') + '</td><td>' + esc(p.email) + '</td><td>' + esc(p.slug) + '</td><td>' + esc(p.motivo) + '</td></tr>'; }));
    h += sec('Problemas', 'bounces, spam e erros de envio', linhas.length ? '<div class="card tablewrap"><table><thead><tr><th>Quando</th><th>Tipo</th><th>Email</th><th>Modelo</th><th>Detalhe</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>' : vazio('Nenhum problema no período', 'Bounce, spam e erros aparecem aqui assim que acontecerem.'));
    return h;
  }

  /* ---------- Gráficos (SVG) ---------- */
  var W = 420, H = 200, M = { l:38, r:8, t:10, b:24 };
  function escala(max){ if (max <= 0) return { max:1, ticks:[0,1] }; var p = Math.pow(10, Math.floor(Math.log10(max))); var n = Math.ceil(max / p); var step = n <= 2 ? p/2 : (n <= 5 ? p : 2*p); var top = Math.ceil(max/step)*step; var t = []; for (var v = 0; v <= top + 1e-9; v += step) t.push(v); return { max:top, ticks:t }; }
  function curto(v){ return v >= 1000 ? (Math.round(v/100)/10).toLocaleString('pt-BR') + ' mil' : fmt.format(v); }
  function eixo(sc, pd){
    var g = '', ih = H - M.t - M.b, iw = W - M.l - M.r, n = pd.length, cada = Math.max(1, Math.ceil(n / 6));
    sc.ticks.forEach(function(v){ var y = M.t + ih - v/sc.max*ih; g += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + css('--grid') + '"/><text x="' + (M.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="' + css('--muted') + '">' + curto(v) + '</text>'; });
    pd.forEach(function(p, i){ if (i % cada === 0 || i === n - 1) g += '<text x="' + (M.l + (i + .5) * iw / n) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + css('--muted') + '">' + dia(p.dia) + '</text>'; });
    return g;
  }
  function graficos(d){ var pd = d.por_dia || [];
    barras('c1', pd, 'enviados', css('--brand'), function(p){ return '<div class="r"><span>Enviados</span><span>' + fmt.format(p.enviados || 0) + '</span></div>'; });
    linhas('c2', pd, [['aberturas','Aberturas',css('--s1')],['cliques','Cliques',css('--s2')]]);
    barras('c3', pd, 'receita', css('--s3'), function(p){ return '<div class="r"><span>Receita</span><span>' + brl.format(p.receita || 0) + '</span></div><div class="r"><span>Vendas</span><span>' + fmt.format(p.vendas || 0) + '</span></div>'; });
  }
  function topo(x, y, w, h){ var r = Math.min(4, w/2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; }
  function barras(id, pd, campo, cor, linhaTip){
    var el = document.getElementById(id); if (!el) return;
    var max = Math.max.apply(null, pd.map(function(p){ return Number(p[campo] || 0); }).concat([0]));
    var sc = escala(max), n = pd.length, iw = W - M.l - M.r, ih = H - M.t - M.b, bw = Math.max(2, Math.min(26, iw / n - 2));
    var g = eixo(sc, pd);
    pd.forEach(function(p, i){ var v = Number(p[campo] || 0), hh = v / sc.max * ih, x = M.l + (i + .5) * iw / n - bw/2;
      if (v > 0) g += '<path d="' + topo(x, M.t + ih - hh, bw, hh) + '" fill="' + cor + '"/>';
      g += '<rect x="' + (M.l + i * iw / n) + '" y="' + M.t + '" width="' + (iw / n) + '" height="' + ih + '" fill="transparent" data-i="' + i + '"/>'; });
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + campo + ' por dia">' + g + '</svg>';
    hover(el, function(i){ return '<b>' + dia(pd[i].dia) + '</b>' + linhaTip(pd[i]); });
  }
  function linhas(id, pd, series){
    var el = document.getElementById(id); if (!el) return;
    var max = 0; series.forEach(function(s){ pd.forEach(function(p){ max = Math.max(max, Number(p[s[0]] || 0)); }); });
    var sc = escala(max), n = pd.length, iw = W - M.l - M.r, ih = H - M.t - M.b, g = eixo(sc, pd);
    series.forEach(function(s){ var pts = pd.map(function(p, i){ return [M.l + (i + .5) * iw / n, M.t + ih - Number(p[s[0]] || 0) / sc.max * ih]; });
      g += '<polyline fill="none" stroke="' + s[2] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function(q){ return q.join(','); }).join(' ') + '"/>';
      if (n <= 31) pts.forEach(function(q){ g += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3" fill="' + s[2] + '" stroke="' + css('--surface') + '" stroke-width="2"/>'; }); });
    g += '<line class="cross" x1="0" x2="0" y1="' + M.t + '" y2="' + (M.t + ih) + '" stroke="' + css('--muted') + '" stroke-dasharray="3 3" visibility="hidden"/>';
    pd.forEach(function(p, i){ g += '<rect x="' + (M.l + i * iw / n) + '" y="' + M.t + '" width="' + (iw / n) + '" height="' + ih + '" fill="transparent" data-i="' + i + '"/>'; });
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Aberturas e cliques por dia">' + g + '</svg>';
    var cross = el.querySelector('.cross');
    hover(el, function(i){ var x = M.l + (i + .5) * iw / n; cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible'); var p = pd[i]; return '<b>' + dia(p.dia) + '</b>' + series.map(function(s){ return '<div class="r"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + s[2] + ';margin-right:6px"></span>' + s[1] + '</span><span>' + fmt.format(p[s[0]] || 0) + '</span></div>'; }).join(''); }, function(){ cross.setAttribute('visibility', 'hidden'); });
  }
  function hover(el, html, sai){
    el.querySelectorAll('rect[data-i]').forEach(function(r){
      r.addEventListener('mousemove', function(e){ tip.innerHTML = html(Number(r.dataset.i)); tip.style.display = 'block'; var x = e.clientX + 14; if (x + tip.offsetWidth > innerWidth - 8) x = e.clientX - tip.offsetWidth - 14; tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
      r.addEventListener('mouseleave', function(){ tip.style.display = 'none'; if (sai) sai(); });
      r.addEventListener('touchstart', function(e){ var t = e.touches[0]; tip.innerHTML = html(Number(r.dataset.i)); tip.style.display = 'block'; tip.style.left = Math.min(t.clientX, innerWidth - 170) + 'px'; tip.style.top = (t.clientY + 16) + 'px'; }, { passive:true });
    });
  }

  carrega();
  setInterval(function(){ if (!document.getElementById('modal').classList.contains('on')) carrega(); }, 5 * 60 * 1000);
})();
