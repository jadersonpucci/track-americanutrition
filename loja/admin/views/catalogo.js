// Produtos e coleções.
import { db } from '../db.js';
import { esc, brl, num, slug, norm, $, $$, toast, abrirPainel, confirmar, fld, inp, area, sel, chk, lerForm, editorRico, ordenavel, statusBadge, thumb } from '../ui.js';
import { htmlProduto, htmlColecao, montarFrame } from '../preview.js';
import { niveisDe, disp, rastreia, ehKit } from '../estoque-logica.js';

const precoTxt = (p) => { const ps = (p.variantes || []).map((v) => v.preco); if (!ps.length) return '—'; const a = Math.min(...ps), b = Math.max(...ps); return a === b ? brl(a) : `${brl(a)} – ${brl(b)}`; };
// como na Shopify: "475 em estoque para 4 variantes" (disponível em todos os locais)
const estoqueTxt = (p) => {
  const vs = p.variantes || [];
  const comEst = vs.filter((v) => rastreia(db.state, v));
  if (comEst.length) {
    const t = comEst.reduce((s, v) => s + niveisDe(db.state, v.id).reduce((a, n) => a + disp(n), 0), 0);
    return `<span class="${t <= 0 ? 'badge red' : t <= 15 ? 'badge amber' : ''}">${t.toLocaleString('pt-BR')} em estoque${comEst.length > 1 ? ` para ${comEst.length} variantes` : ''}</span>`;
  }
  const ok = vs.filter((v) => v.disponivel).length;
  return ok === vs.length ? '<span class="badge green">Disponível</span>' : ok ? `<span class="badge amber">${vs.length - ok} esgotada(s)</span>` : '<span class="badge red">Esgotado</span>';
};
// ids numéricos, como os da Shopify: o checkout recebe ?items=variante:qtd:preço
const novoId = () => String(Date.now()) + String(Math.floor(Math.random() * 900 + 100));

// ------------------------------------------------------------------ produtos
export function produtos(view, { args, crumb, acts }) {
  crumb('<b>Produtos</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Adicionar produto</button>').querySelector('#novo').onclick = () => editarProduto(null);
  let filtro = 'todos', q = '';
  const draw = () => {
    const lista = db.all('produtos').filter((p) => (filtro === 'todos' || (p.status || 'ativo') === filtro) && (!q || norm(p.titulo + ' ' + (p.tags || []).join(' ') + ' ' + (p.variantes || []).map((v) => v.sku).join(' ')).includes(norm(q))));
    $('#lista', view).innerHTML = lista.length ? `<table class="t"><thead><tr><th>Produto</th><th>Status</th><th class="hide-sm">Estoque</th><th class="hide-sm">Variantes</th><th class="r">Preço</th></tr></thead><tbody>${lista.map((p) => `<tr class="click" data-id="${esc(p.id)}">
  <td><div class="cell"><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt=""><div style="min-width:0"><b>${esc(p.titulo)}</b><small>/products/${esc(p.handle)}${p.landing || p.landing_html ? ' · <i class="ti ti-template"></i> landing própria' : ''}</small></div></div></td>
  <td>${statusBadge(p.status)}</td><td class="hide-sm">${estoqueTxt(p)}</td><td class="hide-sm">${(p.variantes || []).length}</td><td class="r amt">${precoTxt(p)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty"><i class="ti ti-package-off"></i>Nenhum produto encontrado.</div>';
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarProduto(db.get('produtos', tr.dataset.id)));
  };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Catálogo</div><h1>Produtos</h1></div></div>
  <div class="card"><div class="card-h"><div class="search"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Buscar por nome, tag ou SKU"></div><div class="grow"></div>
  <div class="seg" id="f">${[['todos', 'Todos'], ['ativo', 'Ativos'], ['rascunho', 'Rascunhos'], ['arquivado', 'Arquivados']].map(([k, t]) => `<button data-f="${k}" class="${k === 'todos' ? 'on' : ''}">${t}</button>`).join('')}</div></div>
  <div class="table-wrap" id="lista"></div></div></div>`;
  $('#q', view).oninput = (e) => { q = e.target.value; draw(); };
  $$('#f button', view).forEach((b) => b.onclick = () => { filtro = b.dataset.f; $$('#f button', view).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  draw();
  if (args[0]) { const p = db.get('produtos', args[0]); if (p) editarProduto(p); }
}

export function editarProduto(orig) {
  const p = structuredClone(orig || { id: String(Date.now()), titulo: '', handle: '', status: 'rascunho', fornecedor: 'America Nutrition', tipo: 'Suplementos', tags: [], descricao_html: '', imagens: [], opcoes: [{ nome: 'Title', valores: ['Default Title'] }], variantes: [{ id: novoId(), titulo: 'Default Title', opcoes: ['Default Title'], preco: 0, preco_comparacao: null, sku: '', disponivel: true, estoque: null, peso_g: 0, rastrear: true, vender_sem_estoque: false, custo: null }], seo: {}, avaliacao: null, criado_em: new Date().toISOString() });
  const novo = !orig;
  const cols = db.all('colecoes').filter((c) => !c.regras?.length);
  const temVariantes = (p.variantes || []).length > 1 || (p.variantes?.[0]?.titulo && p.variantes[0].titulo !== 'Default Title');

  const corpo = `<form id="fp" class="grid2" onsubmit="return false">
  <div class="stack">
    <div class="card card-b stack">
      ${fld('Título', inp('titulo', p.titulo, 'required'))}
      <div class="fld"><span>Descrição</span>${editorRico(p.descricao_html, 'descricao_html')}</div>
    </div>
    <div class="card"><div class="card-h"><h3 class="grow">Imagens</h3><button class="btn sm" type="button" id="addimg"><i class="ti ti-link"></i> Adicionar por URL</button></div><div class="card-b"><div class="imgs" id="imgs"></div><p class="xs soft" style="margin-top:10px">Arraste para reordenar. A primeira é a capa. Hospede as imagens no CDN (cdn.americanutrition.com) e cole a URL.</p></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Variantes</h3>${chk('_temvar', temVariantes, 'Tem opções (tamanho, cápsulas…)')}</div><div class="card-b" id="vars"></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Landing page própria</h3>${chk('_landing', !!(p.landing_html || p.landing), 'Usar landing no lugar da página padrão')}</div>
      <div class="card-b" id="landbox"><p class="sm muted" style="margin-bottom:10px">HTML completo da página do produto (copiado da Shopify). O carrinho entende <code>/cart/add.js</code> e o evento <code>cart:refresh</code>, então os botões continuam funcionando.</p>${area('landing_html', p.landing_html || '', 'class="in code" spellcheck="false"')}</div></div>
    <div class="card card-b stack"><h3>Mecanismos de busca</h3>
      ${fld('Título da página', inp('seo_titulo', p.seo?.titulo || '', 'placeholder="' + esc(p.titulo + ' – America Nutrition') + '"'))}
      ${fld('Descrição', area('seo_descricao', p.seo?.descricao || '', 'rows="3" maxlength="320"'))}
      ${fld('Endereço', `<div style="display:flex;align-items:center;gap:6px"><span class="soft sm">/products/</span>${inp('handle', p.handle, 'placeholder="gerado do título"')}</div>`, novo ? '' : 'Mudar o endereço quebra links antigos — crie um redirecionamento.')}
    </div>
  </div>
  <div class="stack">
    <div class="card card-b stack">${fld('Status', sel('status', p.status || 'ativo', [['ativo', 'Ativo (aparece na loja)'], ['rascunho', 'Rascunho'], ['arquivado', 'Arquivado']]))}</div>
    <div class="card card-b stack"><h3>Organização</h3>
      ${fld('Tipo', inp('tipo', p.tipo))}${fld('Fornecedor', inp('fornecedor', p.fornecedor))}
      ${fld('Tags', inp('tags', (p.tags || []).join(', ')), 'Separadas por vírgula. Coleções automáticas usam as tags.')}
      <div class="fld"><span>Coleções</span><div class="stack" style="gap:6px">${cols.map((c) => chk('_col_' + c.id, (c.produtos || []).includes(p.handle), c.titulo)).join('') || '<small>Nenhuma coleção manual.</small>'}</div></div>
    </div>
    <div class="card card-b stack"><h3>Avaliações</h3><div class="row">${fld('Nota', inp('av_nota', p.avaliacao?.nota ?? '', 'type="number" step="0.01" min="0" max="5"'))}${fld('Total', inp('av_total', p.avaliacao?.total ?? '', 'type="number" min="0"'))}</div><small class="soft">Mostradas nos cards e na página (vinham do Judge.me).</small></div>
    ${novo ? '' : `<div class="card card-b stack"><h3>Identificação</h3><dl class="kv"><dt>ID</dt><dd class="mono">${esc(p.id)}</dd><dt>Criado</dt><dd>${p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '—'}</dd></dl><button class="btn red sm" type="button" id="excluir"><i class="ti ti-trash"></i> Excluir produto</button></div>`}
  </div>
</form>`;
  const pn = abrirPainel({ titulo: novo ? 'Novo produto' : p.titulo, largo: true, corpo, rodape: `<span class="soft sm" style="flex:1">${novo ? '' : `<a href="/products/${esc(p.handle)}" target="_blank">Ver na loja publicada <i class="ti ti-external-link"></i></a>`}</span><button class="btn" id="prev"><i class="ti ti-eye"></i> Prévia</button><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  const el = pn.el;

  // imagens
  const drawImgs = () => {
    $('#imgs', el).innerHTML = p.imagens.map((m, i) => `<div class="im it" draggable="true" data-i="${i}"><img src="${esc(thumb(m.url, 300))}" alt=""><div class="acts"><button type="button" data-alt="${i}" title="Texto alternativo"><i class="ti ti-text-caption"></i></button><button type="button" data-rm="${i}" title="Remover"><i class="ti ti-trash"></i></button></div></div>`).join('') + '<button type="button" class="add" id="addimg2"><span><i class="ti ti-photo-plus" style="font-size:22px"></i><br>Adicionar</span></button>';
    $$('[data-rm]', el).forEach((b) => b.onclick = () => { p.imagens.splice(+b.dataset.rm, 1); drawImgs(); });
    $$('[data-alt]', el).forEach((b) => b.onclick = () => { const m = p.imagens[+b.dataset.alt]; const a = prompt('Texto alternativo da imagem:', m.alt || ''); if (a != null) m.alt = a; });
    $('#addimg2', el).onclick = addImg;
  };
  const addImg = () => { const u = prompt('URL da imagem (https://…):'); if (u && /^https?:\/\//.test(u.trim())) { p.imagens.push({ id: novoId(), url: u.trim(), alt: p.titulo }); drawImgs(); } };
  $('#addimg', el).onclick = addImg;
  ordenavel($('#imgs', el), () => { const ord = $$('#imgs .im', el).map((x) => p.imagens[+x.dataset.i]); p.imagens = ord; drawImgs(); });
  drawImgs();

  // variantes
  const drawVars = () => {
    const multi = $('[name=_temvar]', el).checked;
    if (!multi) {
      const v = p.variantes[0];
      $('#vars', el).innerHTML = `<div class="row" style="--c:3">${fld('Preço', inp('v0_preco', v.preco, 'inputmode="decimal"'))}${fld('Preço comparativo (de)', inp('v0_comp', v.preco_comparacao ?? '', 'inputmode="decimal" placeholder="sem desconto"'))}${fld('SKU', inp('v0_sku', v.sku))}</div>
      <div class="row" style="--c:3;margin-top:14px">${fld('Custo por item', inp('v0_custo', v.custo ?? '', 'inputmode="decimal" placeholder="R$"'), v.custo && v.preco ? `Margem ${Math.round((1 - v.custo / v.preco) * 100)}%` : '')}${fld('Peso (g)', inp('v0_peso', v.peso_g || '', 'type="number"'))}<div class="fld"><span>&nbsp;</span>${chk('v0_disp', v.disponivel, 'Disponível para venda')}</div></div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)"><div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">${chk('v0_kit', ehKit(v), 'É um kit / combo')}<span data-nao-kit style="display:contents">${chk('v0_rastrear', rastreia(db.state, v), 'Controlar quantidade')}</span>${chk('v0_vse', !!v.vender_sem_estoque, 'Continuar vendendo quando esgotar')}</div><div id="v0_kit"></div><div id="v0_locais"></div></div>
      <p class="xs soft" style="margin-top:10px">ID da variante: <span class="mono">${esc(v.id)}</span> (é o que o checkout recebe).</p>`;
      // kit: o estoque é o dos produtos que compõem (vende enquanto der para montar um kit completo)
      v.componentes = v.componentes || [];
      const opcoesVar = db.state.produtos.flatMap((pp) => (pp.variantes || []).filter((x) => !ehKit(x) && x.id !== v.id).map((x) => [x.id, pp.titulo + (x.titulo !== 'Default Title' ? ' · ' + x.titulo : '')]));
      const kit = () => {
        const on = $('[name=v0_kit]', el).checked;
        $('[data-nao-kit]', el).hidden = on; $('[data-nao-kit]', el).style.display = on ? 'none' : 'contents';
        if (!on) { $('#v0_kit', el).innerHTML = ''; return locs(); }
        $('#v0_locais', el).innerHTML = '';
        if (!v.componentes.length) v.componentes.push({ variante_id: opcoesVar[0]?.[0], qtd: 1 });
        $('#v0_kit', el).innerHTML = `<table class="t"><thead><tr><th>Produto do kit</th><th style="width:90px">Qtd</th><th class="r">Disponível</th><th></th></tr></thead><tbody>${v.componentes.map((c, i) => `<tr><td><select class="in" data-kv="${i}">${opcoesVar.map(([id, t]) => `<option value="${esc(id)}"${String(id) === String(c.variante_id) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
          <td><input class="in" type="number" min="1" data-kq="${i}" value="${c.qtd || 1}"></td><td class="r">${niveisDe(db.state, c.variante_id).reduce((a, n) => a + disp(n), 0)}</td><td><button type="button" class="btn sm ico ghost" data-kr="${i}"><i class="ti ti-x"></i></button></td></tr>`).join('')}</tbody></table>
          <button type="button" class="btn sm" id="kadd" style="margin-top:8px"><i class="ti ti-plus"></i> Adicionar produto ao kit</button>
          <p class="xs soft" style="margin:8px 0 0">Cada kit vendido reserva e baixa os produtos acima no estoque. O kit esgota quando faltar qualquer um deles.</p>`;
        $$('[data-kv]', el).forEach((x) => x.onchange = () => { v.componentes[+x.dataset.kv].variante_id = x.value; kit(); });
        $$('[data-kq]', el).forEach((x) => x.oninput = () => { v.componentes[+x.dataset.kq].qtd = Math.max(1, Number(x.value) || 1); });
        $$('[data-kr]', el).forEach((x) => x.onclick = () => { v.componentes.splice(+x.dataset.kr, 1); kit(); });
        $('#kadd', el).onclick = () => { v.componentes.push({ variante_id: opcoesVar[0]?.[0], qtd: 1 }); kit(); };
      };
      const locs = () => {
        if ($('[name=v0_kit]', el).checked) return;
        const on = $('[name=v0_rastrear]', el).checked;
        $('[name=v0_disp]', el).closest('.fld').hidden = on;
        const ns = (db.state.locais || []).filter((l) => l.ativo !== false).map((l) => [l, niveisDe(db.state, v.id).find((n) => n.local_id === l.id)]).filter(([l, n]) => n || l.online);
        $('#v0_locais', el).innerHTML = !on ? '<small class="soft">Sem controle: a disponibilidade é a caixa "Disponível para venda".</small>'
          : `<table class="t"><thead><tr><th>Local</th><th class="r">Comprometido</th><th class="r">Disponível</th><th class="r">Em mãos</th></tr></thead><tbody>${ns.map(([l, n]) => `<tr><td>${esc(l.nome)}${l.online ? ' <span class="tag">loja online</span>' : ''}</td><td class="r">${n?.comprometido || 0}</td><td class="r">${disp(n)}</td><td class="r">${n?.em_maos || 0}</td></tr>`).join('')}</tbody></table>
            ${novo ? '<small class="soft">Salve o produto e lance as quantidades em Estoque → Receber mercadoria.</small>' : `<a class="btn sm" style="margin-top:8px" href="#/estoque/${esc(v.id)}"><i class="ti ti-building-warehouse"></i> Ajustar quantidades</a>`}`;
      };
      $('[name=v0_rastrear]', el).onchange = locs; $('[name=v0_kit]', el).onchange = kit; kit();
      return;
    }
    $('#vars', el).innerHTML = `<div class="row" style="margin-bottom:14px">${fld('Nome da opção 1', inp('op1', p.opcoes?.[0]?.nome === 'Title' ? 'Tamanho' : p.opcoes?.[0]?.nome || 'Tamanho'))}${fld('Nome da opção 2 (opcional)', inp('op2', p.opcoes?.[1]?.nome || ''))}</div>
    <div class="table-wrap vars"><table class="t"><thead><tr><th>Opção 1</th><th>Opção 2</th><th>Preço</th><th>De</th><th>SKU</th><th>Custo</th><th>Disponível</th><th>Disp.</th><th></th></tr></thead><tbody>${p.variantes.map((v, i) => `<tr data-v="${i}">
      <td><input class="in" data-k="o1" value="${esc(v.opcoes?.[0] ?? '')}"></td><td><input class="in" data-k="o2" value="${esc(v.opcoes?.[1] ?? '')}"></td>
      <td><input class="in" data-k="preco" value="${esc(v.preco)}" inputmode="decimal" style="width:90px"></td><td><input class="in" data-k="comp" value="${esc(v.preco_comparacao ?? '')}" inputmode="decimal" style="width:90px"></td>
      <td><input class="in" data-k="sku" value="${esc(v.sku)}" style="width:120px"></td><td><input class="in" data-k="custo" value="${esc(v.custo ?? '')}" inputmode="decimal" style="width:80px"></td>
      <td>${rastreia(db.state, v) ? `<a href="#/estoque/${esc(v.id)}" title="Ajustar no estoque">${niveisDe(db.state, v.id).reduce((a, n) => a + disp(n), 0)}</a>` : '<span class="soft" title="Sem controle de quantidade">—</span>'}</td>
      <td><input type="checkbox" data-k="disp"${v.disponivel ? ' checked' : ''}${rastreia(db.state, v) ? ' disabled title="Controlado pelo estoque"' : ''}></td><td><button type="button" class="btn sm ico ghost" data-rmv="${i}" title="Remover"><i class="ti ti-x"></i></button></td></tr>`).join('')}</tbody></table></div>
    <button type="button" class="btn sm" id="addv" style="margin-top:10px"><i class="ti ti-plus"></i> Adicionar variante</button>`;
    $('#addv', el).onclick = () => { lerVars(); p.variantes.push({ id: novoId(), titulo: '', opcoes: [''], preco: p.variantes.at(-1)?.preco || 0, preco_comparacao: null, sku: '', disponivel: true, estoque: null, rastrear: true }); drawVars(); };
    $$('[data-rmv]', el).forEach((b) => b.onclick = () => { lerVars(); if (p.variantes.length > 1) { p.variantes.splice(+b.dataset.rmv, 1); drawVars(); } });
  };
  const lerVars = () => {
    if (!$('[name=_temvar]', el).checked) {
      const v = p.variantes[0];
      Object.assign(v, { preco: num($('[name=v0_preco]', el)?.value), preco_comparacao: num($('[name=v0_comp]', el)?.value) || null, sku: $('[name=v0_sku]', el)?.value || '', peso_g: Number($('[name=v0_peso]', el)?.value) || 0, disponivel: $('[name=v0_disp]', el)?.checked,
        custo: $('[name=v0_custo]', el)?.value ? num($('[name=v0_custo]', el).value) : null, rastrear: !!$('[name=v0_rastrear]', el)?.checked, vender_sem_estoque: !!$('[name=v0_vse]', el)?.checked });
      if ($('[name=v0_kit]', el)?.checked) { v.componentes = (v.componentes || []).filter((c) => c.variante_id); v.rastrear = false; } else delete v.componentes;
      if (!p.variantes[0].titulo || p.variantes.length === 1) { p.variantes = [v]; v.titulo = 'Default Title'; v.opcoes = ['Default Title']; p.opcoes = [{ nome: 'Title', valores: ['Default Title'] }]; }
      return;
    }
    const o1 = $('[name=op1]', el)?.value || 'Opção', o2 = $('[name=op2]', el)?.value || '';
    $$('tr[data-v]', el).forEach((tr) => {
      const v = p.variantes[+tr.dataset.v]; const g = (k) => $(`[data-k=${k}]`, tr);
      v.opcoes = [g('o1').value, o2 ? g('o2').value : null].filter((x) => x != null && x !== '');
      v.titulo = v.opcoes.join(' / ');
      Object.assign(v, { preco: num(g('preco').value), preco_comparacao: num(g('comp').value) || null, sku: g('sku').value, custo: g('custo').value ? num(g('custo').value) : null, disponivel: g('disp').checked });
    });
    p.opcoes = [{ nome: o1, valores: [...new Set(p.variantes.map((v) => v.opcoes[0]))] }, ...(o2 ? [{ nome: o2, valores: [...new Set(p.variantes.map((v) => v.opcoes[1]).filter(Boolean))] }] : [])];
  };
  $('[name=_temvar]', el).onchange = (e) => { if (!e.target.checked) { lerVars(); p.variantes = [p.variantes[0]]; p.variantes[0].titulo = 'Default Title'; } drawVars(); };
  drawVars();
  const landT = () => { $('#landbox', el).hidden = !$('[name=_landing]', el).checked; };
  $('[name=_landing]', el).onchange = landT; landT();
  $('[name=titulo]', el).oninput = (e) => { if (novo) $('[name=handle]', el).value = slug(e.target.value); };

  const coletar = () => {
    lerVars();
    const f = lerForm($('#fp', el));
    const out = { ...p, titulo: f.titulo.trim(), handle: slug(f.handle || f.titulo), status: f.status, tipo: f.tipo, fornecedor: f.fornecedor,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), descricao_html: f.descricao_html,
      seo: { titulo: f.seo_titulo || null, descricao: f.seo_descricao || null },
      avaliacao: f.av_nota ? { nota: Number(f.av_nota), total: Number(f.av_total) || 0 } : null };
    if (f._landing) { out.landing_html = f.landing_html; } else { out.landing_html = ''; }
    delete out.landing; out.atualizado_em = new Date().toISOString();
    return { out, f };
  };
  $('#prev', el).onclick = async () => {
    const { out } = coletar();
    const pv = abrirPainel({ titulo: 'Prévia · ' + out.titulo, largo: true, corpo: '<div class="frame" style="height:calc(100vh - 140px);display:flex;flex-direction:column" id="fr"></div>' });
    montarFrame($('#fr', pv.el)).render(await htmlProduto(out));
  };
  $('#salvar', el).onclick = async () => {
    const { out, f } = coletar();
    if (!out.titulo) return toast('Dê um título ao produto.', true);
    if (db.all('produtos').some((x) => x.handle === out.handle && x.id !== out.id)) return toast('Já existe um produto com esse endereço.', true);
    if (orig && orig.handle !== out.handle && !db.state.redirects.some((r) => r.de === '/products/' + orig.handle)) {
      db.state.redirects.push({ de: '/products/' + orig.handle, para: '/products/' + out.handle });
      await db.set('redirects', db.state.redirects);
    }
    await db.upsert('produtos', out);
    // participação nas coleções manuais
    const mud = [];
    for (const c of cols) {
      const quer = f['_col_' + c.id], tem = (c.produtos || []).includes(orig?.handle || out.handle);
      let lista = (c.produtos || []).map((h) => h === orig?.handle ? out.handle : h);
      if (quer && !tem) lista.push(out.handle);
      if (!quer && tem) lista = lista.filter((h) => h !== out.handle);
      if (JSON.stringify(lista) !== JSON.stringify(c.produtos || [])) mud.push({ ...c, produtos: lista });
    }
    if (mud.length) await db.upsert('colecoes', mud);
    toast('Produto salvo. Publique a loja para colocar no ar.');
    pn.fechar(); location.hash = '#/produtos';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  const ex = $('#excluir', el);
  if (ex) ex.onclick = async () => { if (await confirmar(`Excluir "${p.titulo}"? Prefira arquivar: excluir apaga as variantes e quebra links.`, { ok: 'Excluir', perigo: true })) { await db.remove('produtos', p.id); pn.fechar(); window.dispatchEvent(new HashChangeEvent('hashchange')); } };
}

// ------------------------------------------------------------------ coleções
export function colecoes(view, { crumb, acts }) {
  crumb('<b>Coleções</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Nova coleção</button>').querySelector('#novo').onclick = () => editarColecao(null);
  const draw = () => {
    const lista = db.all('colecoes');
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Catálogo</div><h1>Coleções</h1></div></div>
    <div class="card"><table class="t"><thead><tr><th>Coleção</th><th>Tipo</th><th class="r">Produtos</th></tr></thead><tbody>${lista.map((c) => `<tr class="click" data-id="${esc(c.id)}"><td><div class="cell"><img class="thumb" style="object-fit:cover" src="${esc(thumb(c.imagem))}" alt=""><div><b>${esc(c.titulo)}</b><small>/collections/${esc(c.handle)}</small></div></div></td><td>${c.regras?.length ? '<span class="badge blue">Automática</span>' : '<span class="badge">Manual</span>'}</td><td class="r">${c.regras?.length ? '—' : (c.produtos || []).length}</td></tr>`).join('')}</tbody></table></div></div>`;
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarColecao(db.get('colecoes', tr.dataset.id), draw));
  };
  draw();
}

function editarColecao(orig, redraw) {
  const c = structuredClone(orig || { id: novoId(), titulo: '', handle: '', descricao_html: '', imagem: '', banner: '', produtos: [], regras: [] });
  const novo = !orig;
  const prods = db.all('produtos');
  const corpo = `<form id="fc" class="grid2" onsubmit="return false"><div class="stack">
    <div class="card card-b stack">${fld('Título', inp('titulo', c.titulo, 'required'))}<div class="fld"><span>Descrição</span>${editorRico(c.descricao_html, 'descricao_html')}</div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Produtos</h3><div class="seg" id="tipo"><button type="button" data-t="manual" class="${c.regras?.length ? '' : 'on'}">Manual</button><button type="button" data-t="auto" class="${c.regras?.length ? 'on' : ''}">Automática</button></div></div>
    <div class="card-b" id="pbox"></div></div>
  </div><div class="stack">
    <div class="card card-b stack"><h3>Imagens</h3>${fld('Imagem (cards da home)', inp('imagem', c.imagem))}${fld('Banner do topo da página', inp('banner', c.banner || ''), 'Vazio = usa a imagem acima.')}
      ${fld('Ordem padrão', sel('ordem_padrao', c.ordem_padrao || 'title-ascending', [['manual', 'Manual'], ['title-ascending', 'A–Z'], ['price-ascending', 'Menor preço'], ['price-descending', 'Maior preço'], ['created-descending', 'Mais recentes']]))}
      ${chk('mostrar_titulo', c.mostrar_titulo, 'Mostrar título e descrição no banner')}</div>
    <div class="card card-b stack"><h3>Mecanismos de busca</h3>${fld('Endereço', inp('handle', c.handle))}${fld('Título', inp('seo_titulo', c.seo?.titulo || ''))}${fld('Descrição', area('seo_descricao', c.seo?.descricao || '', 'rows="3"'))}</div>
    ${novo ? '' : '<button class="btn red sm" type="button" id="excluir"><i class="ti ti-trash"></i> Excluir coleção</button>'}
  </div></form>`;
  const pn = abrirPainel({ titulo: novo ? 'Nova coleção' : c.titulo, largo: true, corpo, rodape: '<button class="btn" id="prev"><i class="ti ti-eye"></i> Prévia</button><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>' });
  const el = pn.el;
  let modo = c.regras?.length ? 'auto' : 'manual';
  const drawP = () => {
    if (modo === 'manual') {
      $('#pbox', el).innerHTML = `<div class="list-sort" id="ls">${(c.produtos || []).map((h) => { const p = prods.find((x) => x.handle === h); return p ? `<div class="it" draggable="true" data-h="${esc(h)}"><i class="ti ti-grip-vertical grip"></i><img class="thumb" src="${esc(thumb(p.imagens?.[0]?.url))}" alt=""><div class="grow"><b>${esc(p.titulo)}</b></div><button type="button" class="btn sm ico ghost" data-rm="${esc(h)}"><i class="ti ti-x"></i></button></div>` : ''; }).join('')}</div>
      <div style="margin-top:12px">${sel('_add', '', [['', '+ Adicionar produto…'], ...prods.filter((p) => !(c.produtos || []).includes(p.handle)).map((p) => [p.handle, p.titulo])])}</div>`;
      ordenavel($('#ls', el), () => { c.produtos = $$('#ls .it', el).map((x) => x.dataset.h); });
      $$('[data-rm]', el).forEach((b) => b.onclick = () => { c.produtos = c.produtos.filter((h) => h !== b.dataset.rm); drawP(); });
      $('[name=_add]', el).onchange = (e) => { if (e.target.value) { c.produtos = [...(c.produtos || []), e.target.value]; drawP(); } };
    } else {
      c.regras = c.regras?.length ? c.regras : [{ campo: 'tag', op: 'igual', valor: '' }];
      $('#pbox', el).innerHTML = `<p class="sm muted" style="margin-bottom:10px">Produtos ativos que atendem ${chk('disjuntivo', c.disjuntivo, 'qualquer condição (em vez de todas)')}</p>
      <div class="stack" style="gap:8px" id="rg">${c.regras.map((r, i) => `<div class="row" style="--c:4;align-items:end" data-r="${i}">${sel('campo', r.campo, [['tag', 'Tag'], ['tipo', 'Tipo'], ['fornecedor', 'Fornecedor'], ['titulo', 'Título']])}${sel('op', r.op, [['igual', 'é igual a'], ['contem', 'contém']])}${inp('valor', r.valor)}<button type="button" class="btn sm" data-rmr="${i}">Remover</button></div>`).join('')}</div>
      <button type="button" class="btn sm" id="addr" style="margin-top:10px"><i class="ti ti-plus"></i> Condição</button>`;
      const ler = () => { c.regras = $$('[data-r]', el).map((row) => ({ campo: $('[name=campo]', row).value, op: $('[name=op]', row).value, valor: $('[name=valor]', row).value })); };
      $('#addr', el).onclick = () => { ler(); c.regras.push({ campo: 'tag', op: 'igual', valor: '' }); drawP(); };
      $$('[data-rmr]', el).forEach((b) => b.onclick = () => { ler(); c.regras.splice(+b.dataset.rmr, 1); drawP(); });
      $$('#rg [name]', el).forEach((i) => i.onchange = ler);
    }
  };
  $$('#tipo button', el).forEach((b) => b.onclick = () => { modo = b.dataset.t; $$('#tipo button', el).forEach((x) => x.classList.toggle('on', x === b)); if (modo === 'manual') c.regras = []; drawP(); });
  drawP();
  const coletar = () => {
    const f = lerForm($('#fc', el));
    if (modo === 'auto') c.regras = $$('[data-r]', el).map((row) => ({ campo: $('[name=campo]', row).value, op: $('[name=op]', row).value, valor: $('[name=valor]', row).value })).filter((r) => r.valor);
    return { ...c, titulo: f.titulo, handle: slug(f.handle || f.titulo), descricao_html: f.descricao_html, imagem: f.imagem, banner: f.banner, ordem_padrao: f.ordem_padrao, mostrar_titulo: f.mostrar_titulo, disjuntivo: !!f.disjuntivo, regras: modo === 'auto' ? c.regras : [], seo: { titulo: f.seo_titulo || null, descricao: f.seo_descricao || null } };
  };
  $('#prev', el).onclick = async () => { const pv = abrirPainel({ titulo: 'Prévia', largo: true, corpo: '<div style="height:calc(100vh - 140px);display:flex;flex-direction:column" id="fr"></div>' }); montarFrame($('#fr', pv.el)).render(await htmlColecao(coletar())); };
  $('#salvar', el).onclick = async () => { const out = coletar(); if (!out.titulo) return toast('Dê um título.', true); await db.upsert('colecoes', out); toast('Coleção salva.'); pn.fechar(); redraw?.(); };
  const ex = $('#excluir', el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir esta coleção? Os produtos continuam existindo.', { ok: 'Excluir', perigo: true })) { await db.remove('colecoes', c.id); pn.fechar(); redraw?.(); } };
}
