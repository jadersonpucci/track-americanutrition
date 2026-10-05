// Visão geral, pedidos, clientes e cupons.
import { db } from '../db.js';
import { esc, brl, num, dataBR, norm, $, $$, toast, abrirPainel, confirmar, fld, inp, area, sel, chk, lerForm, thumb } from '../ui.js';

const PAG = { pago: ['green', 'Pago'], pendente: ['amber', 'Pendente'], cancelado: ['red', 'Cancelado'], reembolsado: ['', 'Reembolsado'], parcial: ['amber', 'Reembolso parcial'] };
const ENT = { nao_enviado: ['amber', 'Não enviado'], preparando: ['blue', 'Preparando'], enviado: ['blue', 'Enviado'], entregue: ['green', 'Entregue'], devolvido: ['red', 'Devolvido'] };
const bdg = (m, k) => { const [c, t] = m[k] || ['', k || '—']; return `<span class="badge ${c}">${esc(t)}</span>`; };

function semServidor(view, titulo, texto) {
  view.innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><div class="grow"><div class="eyebrow">Vendas</div><h1>${titulo}</h1></div></div>
  <div class="card card-b stack"><div class="help amber">${texto}</div>
  <ol class="sm" style="line-height:1.8;margin:0;padding-left:20px">
    <li>Aplicar <code>supabase/loja.sql</code> no Postgres (cria <code>loja_pedidos</code>, <code>loja_cupons</code>, catálogo e a função <code>loja_api</code>).</li>
    <li>Criar no n8n o webhook <b>Loja · API</b> (<code>POST /webhook/loja-api</code> → <code>select loja_api($json.body)</code>) e preencher <code>CONFIG.gateway</code> em <code>loja/admin/db.js</code>.</li>
    <li>Importar o histórico da Shopify: <code>python3 scripts/loja-importar-pedidos.py --token …</code> (pedidos, clientes e cupons).</li>
    <li>Nos fluxos do checkout, trocar a criação do pedido na Shopify por <code>select loja_pedido_criar(…)</code> e a validação de cupom por <code>loja_cupom_validar(…)</code> — mesmo formato de entrada e saída.</li>
  </ol></div></div>`;
}

const aviso = () => db.demo ? '<div class="help amber" style="margin-bottom:16px"><b>Pedidos fictícios.</b> Modo demonstração: clientes, endereços e CPFs são inventados para mostrar como o painel fica. Os produtos e preços são os reais. Quando o painel for ligado ao banco, aparecem os pedidos de verdade.</div>' : '';

// ------------------------------------------------------------------ visão geral
export async function painel(view, { crumb }) {
  crumb('<b>Visão geral</b>');
  const s = db.state;
  const ativos = s.produtos.filter((p) => (p.status || 'ativo') === 'ativo');
  const esgotados = ativos.filter((p) => !(p.variantes || []).some((v) => v.disponivel));
  const baixo = ativos.filter((p) => (p.variantes || []).some((v) => v.estoque != null && v.estoque <= 15 && v.estoque > 0));
  let r = null;
  try { r = await db.backend.resumo(); } catch (e) { toast(e.message, true); }
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Visão geral</h1></div><a class="btn" href="/" target="_blank"><i class="ti ti-external-link"></i> Ver loja</a></div>
  ${aviso()}${r ? `<div class="kpis">
    <div class="card kpi"><div class="l">Vendas hoje</div><div class="v">${brl(r.hoje_total)}</div><div class="d">${r.hoje_pedidos} pedidos</div></div>
    <div class="card kpi"><div class="l">Últimos 7 dias</div><div class="v">${brl(r.sem_total)}</div><div class="d">${r.sem_pedidos} pedidos</div></div>
    <div class="card kpi"><div class="l">Este mês</div><div class="v">${brl(r.mes_total)}</div><div class="d">ticket médio ${brl(r.mes_ticket)}</div></div>
    <div class="card kpi"><div class="l">A enviar</div><div class="v">${r.a_enviar}</div><div class="d">pagos sem rastreio</div></div></div>` : ''}
  <div class="grid2">
    <div class="stack">
      ${r ? `<div class="card"><div class="card-h"><h3 class="grow">Últimos pedidos</h3><a class="btn sm" href="#/pedidos">Ver todos</a></div><table class="t"><tbody>${(r.ultimos || []).map((p) => `<tr class="click" onclick="location.hash='#/pedidos/${esc(p.id)}'"><td><b>#${esc(p.numero)}</b><div class="xs soft">${dataBR(p.criado_em, true)}</div></td><td>${esc(p.cliente?.nome || '')}</td><td>${bdg(PAG, p.status_pagamento)}</td><td class="r amt">${brl(p.total)}</td></tr>`).join('') || '<tr><td class="soft">Nenhum pedido ainda.</td></tr>'}</tbody></table></div>`
      : `<div class="card card-b stack"><h3>Bem-vindo à loja própria</h3><p class="muted">Esta é a mesma loja da Shopify — produtos, coleções, landing pages, blog, depoimentos e página inicial —, agora gerada a partir destes dados e publicada como site estático.</p>
        <div class="help amber"><b>Modo demonstração:</b> você pode editar tudo e ver a prévia; as alterações ficam neste navegador até o servidor ser ligado (veja <a href="#/publicar">Publicar</a>).</div></div>`}
      <div class="card"><div class="card-h"><h3 class="grow">Catálogo</h3><a class="btn sm" href="#/produtos">Produtos</a></div><div class="card-b"><div class="kpis" style="margin:0">
        <div class="kpi" style="padding:0"><div class="l">Produtos ativos</div><div class="v">${ativos.length}</div></div>
        <div class="kpi" style="padding:0"><div class="l">Variantes</div><div class="v">${ativos.reduce((n, p) => n + (p.variantes || []).length, 0)}</div></div>
        <div class="kpi" style="padding:0"><div class="l">Coleções</div><div class="v">${s.colecoes.length}</div></div>
        <div class="kpi" style="padding:0"><div class="l">Artigos no blog</div><div class="v">${s.artigos.length}</div></div></div></div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3 class="grow">Atenção</h3></div><div class="card-b stack" style="gap:10px">
        ${esgotados.map((p) => `<a class="cell" href="#/produtos/${esc(p.id)}"><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt=""><div><b>${esc(p.titulo)}</b><small class="badge red">Esgotado</small></div></a>`).join('')}
        ${baixo.map((p) => `<a class="cell" href="#/produtos/${esc(p.id)}"><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt=""><div><b>${esc(p.titulo)}</b><small class="badge amber">Estoque baixo</small></div></a>`).join('')}
        ${s.paginas.filter((g) => g.legado).length ? `<a href="#/paginas" class="sm"><i class="ti ti-alert-triangle"></i> ${s.paginas.filter((g) => g.legado).length} páginas de campanha antigas para revisar</a>` : ''}
        ${!esgotados.length && !baixo.length ? '<p class="soft sm">Tudo certo com o catálogo.</p>' : ''}
      </div></div>
      <div class="card card-b stack"><h3>Atalhos</h3>
        <a class="btn" href="#/loja"><i class="ti ti-layout-board"></i> Editar página inicial</a>
        <a class="btn" href="#/navegacao"><i class="ti ti-speakerphone"></i> Barra de anúncio e menu</a>
        <a class="btn" href="#/cupons"><i class="ti ti-discount-2"></i> Criar cupom</a></div>
    </div>
  </div></div>`;
}

// ------------------------------------------------------------------ pedidos
export async function pedidos(view, { args, crumb, acts }) {
  crumb('<b>Pedidos</b>');
  const f = { q: '', pagamento: '', entrega: '', limite: 100 };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Vendas</div><h1>Pedidos</h1></div></div>${aviso()}
  <div class="card"><div class="card-h" style="flex-wrap:wrap"><div class="search"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Número, nome, e-mail, CPF ou rastreio"></div><div class="grow"></div>
  <select class="in" id="fp" style="width:auto"><option value="">Pagamento: todos</option>${Object.entries(PAG).map(([k, [, t]]) => `<option value="${k}">${t}</option>`).join('')}</select>
  <select class="in" id="fe" style="width:auto"><option value="">Entrega: todas</option>${Object.entries(ENT).map(([k, [, t]]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
  <div class="table-wrap" id="lista"><div class="empty">Carregando…</div></div></div></div>`;
  const draw = async () => {
    const lista = await db.backend.pedidos(f);
    $('#lista', view).innerHTML = lista.length ? `<table class="t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Pagamento</th><th class="hide-sm">Entrega</th><th class="hide-sm">Origem</th><th class="r">Total</th></tr></thead><tbody>${lista.map((p) => `<tr class="click" data-id="${esc(p.id)}"><td><b>#${esc(p.numero)}</b><div class="xs soft">${dataBR(p.criado_em, true)}</div></td><td>${esc(p.cliente?.nome || '')}<div class="xs soft">${esc(p.cliente?.email || '')}</div></td><td>${bdg(PAG, p.status_pagamento)}</td><td class="hide-sm">${bdg(ENT, p.status_entrega)}</td><td class="hide-sm soft sm">${esc(p.origem || '')}${p.ref ? ` · ${esc(p.ref)}` : ''}</td><td class="r amt">${brl(p.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="ti ti-receipt-off"></i>Nenhum pedido encontrado.</div>';
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => abrirPedido(tr.dataset.id, draw));
  };
  let tm; $('#q', view).oninput = (e) => { f.q = e.target.value; clearTimeout(tm); tm = setTimeout(draw, 300); };
  $('#fp', view).onchange = (e) => { f.pagamento = e.target.value; draw(); };
  $('#fe', view).onchange = (e) => { f.entrega = e.target.value; draw(); };
  await draw();
  if (args[0]) abrirPedido(args[0], draw);
}

async function abrirPedido(id, redraw) {
  const p = await db.backend.pedido(id);
  const c = p.cliente || {}, e = p.endereco || {};
  const corpo = `<div class="stack">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${bdg(PAG, p.status_pagamento)} ${bdg(ENT, p.status_entrega)} ${p.origem ? `<span class="badge">${esc(p.origem)}</span>` : ''} ${(p.tags || []).map((t) => `<span class="badge blue">${esc(t)}</span>`).join(' ')}</div>
    <div class="card"><table class="t"><tbody>${(p.itens || []).map((i) => `<tr><td><div class="cell"><img class="thumb" src="${esc(thumb(i.imagem))}" alt=""><div><b>${esc(i.titulo)}</b><small>${esc(i.variante && i.variante !== 'Default Title' ? i.variante : '')} ${i.sku ? '· ' + esc(i.sku) : ''}</small></div></div></td><td class="r">${i.qtd} × ${brl(i.preco)}</td><td class="r amt">${brl(i.qtd * i.preco)}</td></tr>`).join('')}
      <tr><td colspan="2" class="r soft">Subtotal</td><td class="r">${brl(p.subtotal)}</td></tr>
      ${p.desconto ? `<tr><td colspan="2" class="r soft">Desconto ${p.cupom ? `(${esc(p.cupom)})` : ''}</td><td class="r">− ${brl(p.desconto)}</td></tr>` : ''}
      <tr><td colspan="2" class="r soft">Frete ${esc(p.frete_servico || '')}</td><td class="r">${brl(p.frete)}</td></tr>
      <tr><td colspan="2" class="r"><b>Total</b></td><td class="r amt">${brl(p.total)}</td></tr></tbody></table></div>
    <div class="row">
      <div class="card card-b"><h5 style="margin-top:0">Cliente</h5><b>${esc(c.nome || '')}</b><div class="sm">${esc(c.email || '')}</div><div class="sm">${esc(c.telefone || '')}</div><div class="sm soft">CPF ${esc(c.cpf || '—')}</div>
        ${c.telefone && !(p.tags || []).includes('demonstração') ? `<a class="btn sm" style="margin-top:10px" target="_blank" href="https://wa.me/${esc(String(c.telefone).replace(/\D/g, ''))}"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>` : ''}</div>
      <div class="card card-b"><h5 style="margin-top:0">Entrega</h5><div class="sm">${esc([e.logradouro, e.numero].filter(Boolean).join(', '))}${e.complemento ? ' – ' + esc(e.complemento) : ''}<br>${esc(e.bairro || '')}<br>${esc(e.cidade || '')}${e.uf ? '/' + esc(e.uf) : ''} · ${esc(e.cep || '')}</div></div>
    </div>
    <div class="card card-b stack"><h5 style="margin-top:0">Envio</h5>
      <div class="row">${fld('Código de rastreio', inp('rastreio', p.rastreio || '', 'style="text-transform:uppercase"'))}${fld('Status da entrega', sel('status_entrega', p.status_entrega, Object.entries(ENT).map(([k, [, t]]) => [k, t])))}</div>
      ${p.rastreio ? `<a class="sm" target="_blank" href="https://track.americanutrition.com/${esc(p.rastreio)}"><i class="ti ti-truck"></i> Abrir rastreio</a>` : ''}</div>
    <div class="card card-b stack"><h5 style="margin-top:0">Pagamento</h5><dl class="kv"><dt>Método</dt><dd>${esc(p.pagamento?.metodo || '—')}${p.pagamento?.parcelas > 1 ? ` · ${p.pagamento.parcelas}x` : ''}</dd><dt>Gateway</dt><dd>${esc(p.pagamento?.gateway || '—')}</dd><dt>Transação</dt><dd class="mono">${esc(p.pagamento?.transacao || '—')}</dd>${p.ref ? `<dt>Afiliado</dt><dd>${esc(p.ref)}</dd>` : ''}${p.shopify_id ? `<dt>Pedido Shopify</dt><dd class="mono">${esc(p.shopify_id)}</dd>` : ''}</dl>
      ${fld('Status do pagamento', sel('status_pagamento', p.status_pagamento, Object.entries(PAG).map(([k, [, t]]) => [k, t])))}</div>
    <div class="card card-b stack">${fld('Observações internas', area('notas', p.notas || '', 'rows="3"'))}${fld('Tags', inp('tags', (p.tags || []).join(', ')))}</div>
    ${(p.eventos || []).length ? `<div class="card card-b"><h5 style="margin-top:0">Histórico</h5><div class="timeline">${p.eventos.slice().reverse().map((ev) => `<div class="ev"><span class="dot"></span><div><b>${esc(ev.texto)}</b><div class="xs soft">${dataBR(ev.em, true)} ${ev.por ? '· ' + esc(ev.por) : ''}</div></div></div>`).join('')}</div></div>` : ''}
  </div>`;
  const pn = abrirPainel({ titulo: `Pedido #${p.numero}`, corpo, rodape: `<span class="soft sm" style="flex:1">${dataBR(p.criado_em, true)}</span><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  $('#salvar', pn.el).onclick = async () => {
    const f = lerForm(pn.el);
    await db.backend.pedidoAtualizar(p.id, { rastreio: f.rastreio.trim().toUpperCase() || null, status_entrega: f.status_entrega, status_pagamento: f.status_pagamento, notas: f.notas, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) });
    toast('Pedido atualizado.'); pn.fechar(); redraw?.();
  };
}

// ------------------------------------------------------------------ clientes
export async function clientes(view, { crumb }) {
  crumb('<b>Clientes</b>');
  const f = { q: '' };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Vendas</div><h1>Clientes</h1></div></div>${aviso()}
  <div class="card"><div class="card-h"><div class="search"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Nome, e-mail, telefone ou CPF"></div></div><div class="table-wrap" id="lista"></div></div></div>`;
  const draw = async () => {
    const lista = await db.backend.clientes(f);
    $('#lista', view).innerHTML = `<table class="t"><thead><tr><th>Cliente</th><th class="hide-sm">Contato</th><th class="r">Pedidos</th><th class="r">Total gasto</th><th class="hide-sm">Último pedido</th></tr></thead><tbody>${lista.map((c) => `<tr><td><b>${esc(c.nome)}</b><div class="xs soft">${esc(c.cidade || '')}</div></td><td class="hide-sm sm">${esc(c.email || '')}<div class="soft">${esc(c.telefone || '')}</div></td><td class="r">${c.pedidos}</td><td class="r amt">${brl(c.total)}</td><td class="hide-sm soft">${dataBR(c.ultimo)}</td></tr>`).join('')}</tbody></table>`;
  };
  let tm; $('#q', view).oninput = (e) => { f.q = e.target.value; clearTimeout(tm); tm = setTimeout(draw, 300); };
  draw();
}

// ------------------------------------------------------------------ cupons
export function cupons(view, { crumb, acts }) {
  crumb('<b>Cupons</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Criar cupom</button>').querySelector('#novo').onclick = () => editarCupom(null, draw);
  function draw() {
    const lista = db.all('cupons').sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Vendas</div><h1>Cupons</h1><p class="muted sm" style="margin-top:6px">O checkout valida pelo <code>loja_cupom_validar</code> (mesma resposta do fluxo "Shopify — Validar Cupom": <code>{valid, kind, value, code}</code>).</p></div></div>
    <div class="card">${lista.length ? `<table class="t"><thead><tr><th>Código</th><th>Desconto</th><th class="hide-sm">Validade</th><th class="r">Usos</th><th>Status</th></tr></thead><tbody>${lista.map((c) => `<tr class="click" data-id="${esc(c.id)}"><td><b class="mono">${esc(c.codigo)}</b><div class="xs soft">${esc(c.descricao || '')}</div></td><td>${c.tipo === 'percentual' ? `${c.valor}%` : c.tipo === 'frete' ? 'Frete grátis' : brl(c.valor)}${c.minimo ? `<div class="xs soft">acima de ${brl(c.minimo)}</div>` : ''}</td><td class="hide-sm soft">${c.fim ? 'até ' + dataBR(c.fim) : 'sem prazo'}</td><td class="r">${c.usos || 0}${c.limite ? ' / ' + c.limite : ''}</td><td>${c.ativo === false ? '<span class="badge">Inativo</span>' : c.fim && new Date(c.fim) < new Date() ? '<span class="badge amber">Expirado</span>' : '<span class="badge green">Ativo</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="ti ti-discount-2"></i>Nenhum cupom ainda. Importe os da Shopify com <code>scripts/loja-importar-pedidos.py</code> ou crie um.</div>'}</div></div>`;
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarCupom(db.get('cupons', tr.dataset.id), draw));
  }
  draw();
}

function editarCupom(orig, redraw) {
  const c = structuredClone(orig || { codigo: '', tipo: 'percentual', valor: 10, minimo: null, inicio: null, fim: null, limite: null, uso_por_cliente: null, ativo: true, usos: 0, descricao: '', criado_em: new Date().toISOString() });
  const corpo = `<form id="fcu" class="stack" onsubmit="return false">
    <div class="row">${fld('Código', inp('codigo', c.codigo, 'style="text-transform:uppercase" required'))}${fld('Descrição interna', inp('descricao', c.descricao))}</div>
    <div class="row">${fld('Tipo', sel('tipo', c.tipo, [['percentual', 'Porcentagem'], ['fixo', 'Valor fixo (R$)'], ['frete', 'Frete grátis']]))}${fld('Valor', inp('valor', c.valor ?? '', 'inputmode="decimal"'))}</div>
    <div class="row">${fld('Compra mínima (R$)', inp('minimo', c.minimo ?? '', 'inputmode="decimal"'))}${fld('Limite total de usos', inp('limite', c.limite ?? '', 'type="number"'))}</div>
    <div class="row">${fld('Início', inp('inicio', (c.inicio || '').slice(0, 16), 'type="datetime-local"'))}${fld('Fim', inp('fim', (c.fim || '').slice(0, 16), 'type="datetime-local"'))}</div>
    ${fld('Um uso por cliente?', sel('uso_por_cliente', c.uso_por_cliente ? '1' : '', [['', 'Não'], ['1', 'Sim (por e-mail/CPF)']]))}
    ${chk('ativo', c.ativo !== false, 'Ativo')}</form>`;
  const pn = abrirPainel({ titulo: orig ? 'Cupom ' + c.codigo : 'Novo cupom', corpo, central: true, rodape: `${orig ? '<button class="btn red" id="excluir" style="margin-right:auto"><i class="ti ti-trash"></i></button>' : ''}<button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  $('#salvar', pn.el).onclick = async () => {
    const f = lerForm($('#fcu', pn.el));
    const codigo = f.codigo.trim().toUpperCase().replace(/\s+/g, '');
    if (!codigo) return toast('Informe o código.', true);
    if (db.all('cupons').some((x) => x.codigo === codigo && x.id !== c.id)) return toast('Já existe um cupom com esse código.', true);
    await db.upsert('cupons', { ...c, codigo, descricao: f.descricao, tipo: f.tipo, valor: num(f.valor), minimo: num(f.minimo) || null, limite: f.limite ? Number(f.limite) : null, inicio: f.inicio ? new Date(f.inicio).toISOString() : null, fim: f.fim ? new Date(f.fim).toISOString() : null, uso_por_cliente: !!f.uso_por_cliente, ativo: f.ativo });
    toast('Cupom salvo.'); pn.fechar(); redraw();
  };
  const ex = $('#excluir', pn.el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir este cupom?', { ok: 'Excluir', perigo: true })) { await db.remove('cupons', c.id); pn.fechar(); redraw(); } };
}
