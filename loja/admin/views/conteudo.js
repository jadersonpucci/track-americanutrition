// Páginas, blog e depoimentos.
import { db } from '../db.js';
import { esc, slug, norm, dataBR, $, $$, toast, abrirPainel, confirmar, fld, inp, area, sel, chk, lerForm, editorRico, thumb } from '../ui.js';
import { htmlPagina, htmlArtigo, montarFrame } from '../preview.js';

const previa = async (titulo, html) => { const pv = abrirPainel({ titulo: 'Prévia · ' + titulo, largo: true, corpo: '<div style="height:calc(100vh - 140px);display:flex;flex-direction:column" id="fr"></div>' }); montarFrame($('#fr', pv.el)).render(html); };
const recarregar = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// ------------------------------------------------------------------ páginas
export function paginas(view, { crumb, acts }) {
  crumb('<b>Páginas</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Nova página</button>').querySelector('#novo').onclick = () => editarPagina(null);
  let q = '';
  const draw = () => {
    const lista = db.all('paginas').filter((g) => !q || norm(g.titulo + g.handle).includes(norm(q)));
    $('#lista', view).innerHTML = `<table class="t"><thead><tr><th>Página</th><th>Tipo</th><th class="hide-sm">Atualizada</th></tr></thead><tbody>${lista.map((g) => `<tr class="click" data-id="${esc(g.id)}"><td><b>${esc(g.titulo)}</b><div class="xs soft">${g.politica ? '/policies/' : '/pages/'}${esc(g.handle)}</div></td>
      <td>${g.politica ? '<span class="badge">Política</span>' : g.landing_html ? (g.legado ? '<span class="badge amber">Landing antiga (revisar)</span>' : '<span class="badge blue">Landing</span>') : '<span class="badge">Texto</span>'} ${g.status === 'rascunho' ? '<span class="badge">Rascunho</span>' : ''}</td>
      <td class="hide-sm soft">${dataBR(g.atualizado_em)}</td></tr>`).join('')}</tbody></table>`;
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarPagina(db.get('paginas', tr.dataset.id)));
  };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Conteúdo</div><h1>Páginas</h1></div></div>
  <div class="card"><div class="card-h"><div class="search"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Buscar página"></div></div><div class="table-wrap" id="lista"></div></div></div>`;
  $('#q', view).oninput = (e) => { q = e.target.value; draw(); };
  draw();
}

function editarPagina(orig) {
  const g = structuredClone(orig || { id: 'pg-' + Date.now(), titulo: '', handle: '', corpo_html: '', landing_html: '', status: 'ativo' });
  const novo = !orig;
  const corpo = `<form id="fg" class="stack" onsubmit="return false">
    ${g.legado ? '<div class="help amber"><b>Página de campanha antiga.</b> Foi montada com blocos padrão do tema da Shopify; o HTML veio copiado, mas pode aparecer sem parte do estilo. Revise na prévia ou troque por texto.</div>' : ''}
    <div class="card card-b stack"><div class="row">${fld('Título', inp('titulo', g.titulo, 'required'))}${fld('Endereço', `<div style="display:flex;align-items:center;gap:6px"><span class="soft sm">${g.politica ? '/policies/' : '/pages/'}</span>${inp('handle', g.handle)}</div>`)}</div>
    ${fld('Status', sel('status', g.status || 'ativo', [['ativo', 'Publicada'], ['rascunho', 'Rascunho (fora do ar)']]))}</div>
    <div class="card"><div class="card-h"><h3 class="grow">Conteúdo</h3><div class="seg" id="modo"><button type="button" data-m="texto" class="${g.landing_html ? '' : 'on'}">Texto</button><button type="button" data-m="html" class="${g.landing_html ? 'on' : ''}">Landing (HTML)</button></div></div>
      <div class="card-b"><div id="m-texto"${g.landing_html ? ' hidden' : ''}>${editorRico(g.corpo_html, 'corpo_html')}</div><div id="m-html"${g.landing_html ? '' : ' hidden'}>${area('landing_html', g.landing_html || '', 'class="in code" spellcheck="false"')}</div></div></div>
    <div class="card card-b stack"><h3>Mecanismos de busca</h3>${fld('Título', inp('seo_titulo', g.seo?.titulo || ''))}${fld('Descrição', area('seo_descricao', g.seo?.descricao || '', 'rows="2"'))}</div>
    ${novo ? '' : '<button class="btn red sm" type="button" id="excluir" style="justify-self:start"><i class="ti ti-trash"></i> Excluir página</button>'}</form>`;
  const pn = abrirPainel({ titulo: novo ? 'Nova página' : g.titulo, largo: true, corpo, rodape: `<button class="btn" id="prev"><i class="ti ti-eye"></i> Prévia</button><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  const el = pn.el; let modo = g.landing_html ? 'html' : 'texto';
  $$('#modo button', el).forEach((b) => b.onclick = () => { modo = b.dataset.m; $$('#modo button', el).forEach((x) => x.classList.toggle('on', x === b)); $('#m-texto', el).hidden = modo !== 'texto'; $('#m-html', el).hidden = modo !== 'html'; });
  const coletar = () => { const f = lerForm($('#fg', el)); return { ...g, titulo: f.titulo, handle: slug(f.handle || f.titulo), status: f.status, corpo_html: f.corpo_html, landing_html: modo === 'html' ? f.landing_html : '', landing: undefined, seo: { titulo: f.seo_titulo || null, descricao: f.seo_descricao || null } }; };
  $('#prev', el).onclick = async () => { const o = coletar(); previa(o.titulo, await htmlPagina(o)); };
  $('#salvar', el).onclick = async () => { const o = coletar(); if (!o.titulo) return toast('Dê um título.', true); await db.upsert('paginas', o); toast('Página salva.'); pn.fechar(); recarregar(); };
  const ex = $('#excluir', el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir esta página?', { ok: 'Excluir', perigo: true })) { await db.remove('paginas', g.id); pn.fechar(); recarregar(); } };
}

// ------------------------------------------------------------------ blog
export function artigos(view, { crumb, acts }) {
  crumb('<b>Blog</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Novo artigo</button>').querySelector('#novo').onclick = () => editarArtigo(null);
  let q = '', blog = '';
  const draw = () => {
    const lista = db.all('artigos').filter((a) => (!blog || a.blog === blog) && (!q || norm(a.titulo).includes(norm(q)))).sort((a, b) => String(b.publicado_em || '').localeCompare(String(a.publicado_em || '')));
    $('#lista', view).innerHTML = `<table class="t"><thead><tr><th>Artigo</th><th class="hide-sm">Blog</th><th>Publicado</th></tr></thead><tbody>${lista.map((a) => `<tr class="click" data-id="${esc(a.id)}"><td><div class="cell"><img class="thumb" style="object-fit:cover" src="${esc(thumb(a.imagem))}" alt=""><div style="min-width:0"><b>${esc(a.titulo)}</b><small>${a.status === 'rascunho' ? 'Rascunho' : ''}</small></div></div></td><td class="hide-sm">${esc((db.all('blogs').find((b) => b.handle === a.blog) || {}).titulo || a.blog)}</td><td class="soft">${dataBR(a.publicado_em)}</td></tr>`).join('')}</tbody></table>`;
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => editarArtigo(db.get('artigos', tr.dataset.id)));
  };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Conteúdo</div><h1>Blog</h1></div><span class="soft sm">${db.all('artigos').length} artigos</span></div>
  <div class="card"><div class="card-h"><div class="search"><i class="ti ti-search"></i><input class="in" id="q" placeholder="Buscar artigo"></div><div class="grow"></div><select class="in" id="b" style="width:auto"><option value="">Todos os blogs</option>${db.all('blogs').map((b) => `<option value="${esc(b.handle)}">${esc(b.titulo)}</option>`).join('')}</select></div><div class="table-wrap" id="lista"></div></div></div>`;
  $('#q', view).oninput = (e) => { q = e.target.value; draw(); };
  $('#b', view).onchange = (e) => { blog = e.target.value; draw(); };
  draw();
}

function editarArtigo(orig) {
  const blogs = db.all('blogs');
  const a = structuredClone(orig || { id: '', blog: blogs[0]?.handle || 'blog', handle: '', titulo: '', resumo: '', corpo_html: '', imagem: '', autor: 'America Nutrition', tags: [], publicado_em: new Date().toISOString(), status: 'rascunho' });
  const novo = !orig;
  const corpo = `<form id="fa" class="grid2" onsubmit="return false"><div class="stack">
    <div class="card card-b stack">${fld('Título', inp('titulo', a.titulo, 'required'))}<div class="fld"><span>Conteúdo</span>${editorRico(a.corpo_html, 'corpo_html')}</div>${fld('Resumo', area('resumo', a.resumo, 'rows="3"'), 'Aparece na listagem e no Google.')}</div>
  </div><div class="stack">
    <div class="card card-b stack">${fld('Status', sel('status', a.status || 'ativo', [['ativo', 'Publicado'], ['rascunho', 'Rascunho']]))}${fld('Data de publicação', inp('publicado_em', (a.publicado_em || '').slice(0, 16), 'type="datetime-local"'))}${fld('Blog', sel('blog', a.blog, blogs.map((b) => [b.handle, b.titulo])))}${fld('Autor', inp('autor', a.autor || ''))}</div>
    <div class="card card-b stack">${fld('Imagem de capa (URL)', inp('imagem', a.imagem || ''))}${a.imagem ? `<img src="${esc(thumb(a.imagem, 600))}" style="border-radius:12px;width:100%" alt="">` : ''}${fld('Tags', inp('tags', (a.tags || []).join(', ')))}${fld('Endereço', inp('handle', a.handle))}</div>
    ${novo ? '' : '<button class="btn red sm" type="button" id="excluir"><i class="ti ti-trash"></i> Excluir artigo</button>'}
  </div></form>`;
  const pn = abrirPainel({ titulo: novo ? 'Novo artigo' : a.titulo, largo: true, corpo, rodape: '<button class="btn" id="prev"><i class="ti ti-eye"></i> Prévia</button><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>' });
  const el = pn.el;
  const coletar = () => { const f = lerForm($('#fa', el)); const h = slug(f.handle || f.titulo); return { ...a, ...f, handle: h, id: a.id || f.blog + '/' + h, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), publicado_em: f.publicado_em ? new Date(f.publicado_em).toISOString() : null }; };
  $('#prev', el).onclick = async () => { const o = coletar(); previa(o.titulo, await htmlArtigo(o)); };
  $('#salvar', el).onclick = async () => { const o = coletar(); if (!o.titulo) return toast('Dê um título.', true); await db.upsert('artigos', o); toast('Artigo salvo.'); pn.fechar(); recarregar(); };
  const ex = $('#excluir', el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir este artigo?', { ok: 'Excluir', perigo: true })) { await db.remove('artigos', a.id); pn.fechar(); recarregar(); } };
}

// ------------------------------------------------------------------ depoimentos (antes metaobjects da Shopify)
export function depoimentos(view, { crumb, acts }) {
  crumb('<b>Depoimentos</b>');
  acts('<button class="btn pri" id="novo"><i class="ti ti-plus"></i> Adicionar</button>').querySelector('#novo').onclick = () => editarDep(null);
  let tipo = '';
  const draw = () => {
    const lista = db.all('depoimentos').filter((d) => !tipo || d.tipo === tipo);
    $('#grade', view).innerHTML = lista.map((d) => `<button class="card" data-id="${esc(d.id)}" style="padding:0;overflow:hidden;cursor:pointer;text-align:left;${d.ativo === false ? 'opacity:.45' : ''}">
      <div style="aspect-ratio:9/14;background:var(--bg) center/cover no-repeat url('${esc(thumb(d.imagem || d.poster, 300))}');position:relative">${d.tipo === 'video' ? '<i class="ti ti-player-play-filled" style="position:absolute;left:10px;top:10px;color:#fff;font-size:22px;text-shadow:0 1px 6px #0008"></i>' : ''}</div>
      <div style="padding:8px 10px" class="xs"><b>${esc((db.all('produtos').find((p) => p.handle === d.produto) || {}).titulo || 'Geral')}</b><div class="soft">${esc(d.tom || '')}</div></div></button>`).join('');
    $$('[data-id]', $('#grade', view)).forEach((b) => b.onclick = () => editarDep(db.get('depoimentos', b.dataset.id), draw));
  };
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Prova social</div><h1>Depoimentos</h1><p class="muted sm" style="margin-top:6px">As seções de depoimentos da loja leem daqui (antes vinham da Storefront API da Shopify).</p></div>
    <div class="seg" id="f"><button data-t="" class="on">Todos (${db.all('depoimentos').length})</button><button data-t="video">Vídeos</button><button data-t="imagem">Imagens</button></div></div>
    <div id="grade" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px"></div></div>`;
  $$('#f button', view).forEach((b) => b.onclick = () => { tipo = b.dataset.t; $$('#f button', view).forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  draw();
}

function editarDep(orig, redraw) {
  const d = structuredClone(orig || { id: String(Date.now()), handle: '', tipo: 'imagem', tom: '', produto: '', imagem: '', video: '', poster: '', ativo: true });
  const corpo = `<form id="fd" class="stack" onsubmit="return false">
    ${d.video ? `<video src="${esc(d.video)}" poster="${esc(d.poster || '')}" controls style="width:100%;max-height:420px;border-radius:14px;background:#000"></video>` : d.imagem ? `<img src="${esc(thumb(d.imagem, 700))}" style="width:100%;max-height:420px;object-fit:contain;border-radius:14px;background:var(--bg)" alt="">` : ''}
    <div class="row">${fld('Tipo', sel('tipo', d.tipo, [['imagem', 'Imagem'], ['video', 'Vídeo']]))}${fld('Produto', sel('produto', d.produto || '', [['', 'Geral'], ...db.all('produtos').map((p) => [p.handle, p.titulo])]))}</div>
    ${fld('URL da imagem', inp('imagem', d.imagem || ''))}${fld('URL do vídeo (.mp4)', inp('video', d.video || ''))}${fld('Capa do vídeo (URL)', inp('poster', d.poster || ''))}
    <div class="row">${fld('Tom', inp('tom', d.tom || ''), 'Ex.: cura, gratidão, energia')}<div class="fld"><span>&nbsp;</span>${chk('ativo', d.ativo !== false, 'Mostrar na loja')}</div></div></form>`;
  const pn = abrirPainel({ titulo: orig ? 'Depoimento' : 'Novo depoimento', corpo, rodape: `${orig ? '<button class="btn red" id="excluir" style="margin-right:auto"><i class="ti ti-trash"></i></button>' : ''}<button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>` });
  $('#salvar', pn.el).onclick = async () => { const f = lerForm($('#fd', pn.el)); await db.upsert('depoimentos', { ...d, ...f, handle: d.handle || (f.tipo + '-' + d.id) }); toast('Depoimento salvo.'); pn.fechar(); redraw?.(); };
  const ex = $('#excluir', pn.el); if (ex) ex.onclick = async () => { if (await confirmar('Excluir este depoimento?', { ok: 'Excluir', perigo: true })) { await db.remove('depoimentos', d.id); pn.fechar(); redraw?.(); } };
}
