// Página inicial (seções), cabeçalho e rodapé, configurações, redirecionamentos e publicação.
import { db, pref } from '../db.js';
import { esc, $, $$, toast, abrirPainel, confirmar, fld, inp, area, sel, chk, lerForm, editorRico, ordenavel, dataBR } from '../ui.js';
import { htmlHome, montarFrame } from '../preview.js';

// ------------------------------------------------------------------ esquemas das seções (mesmas chaves do tema da Shopify)
const T = (k, l, extra = {}) => ({ k, l, t: 'text', ...extra });
const A = (k, l, extra = {}) => ({ k, l, t: 'area', ...extra });
const C = (k, l) => ({ k, l, t: 'chk' });
const N = (k, l) => ({ k, l, t: 'num' });
const S = (k, l, ops) => ({ k, l, t: 'sel', ops });
const R = (k, l) => ({ k, l, t: 'rich' });
const H = (k, l) => ({ k, l, t: 'code' });
const COR = (k, l) => ({ k, l, t: 'cor' });
const COL = (k, l) => ({ k, l, t: 'colecao' });
const PROD = (k, l) => ({ k, l, t: 'produto' });
const PRODS = (k, l) => ({ k, l, t: 'produtos' });
const BLOG = (k, l) => ({ k, l, t: 'blog' });
const PAD = [N('padding_top', 'Espaço acima (px)'), N('padding_bottom', 'Espaço abaixo (px)')];
const TITULO = [T('heading', 'Título', { ajuda: 'Use <em>palavra</em> para destacar com o rabisco.' }), T('subheading', 'Linha acima do título'), R('description', 'Descrição'), COR('color_highlight', 'Cor do destaque')];

const ESQ = {
  'hero-rotativo': { nome: 'Hero rotativo', ico: 'slideshow', cfg: [C('autoplay', 'Rotacionar automaticamente'), N('interval_seconds', 'Trocar a cada (segundos)'), C('pause_on_hover', 'Pausar com o mouse em cima'), C('show_dots', 'Bolinhas'), C('show_arrows', 'Setas'), S('height', 'Altura', [['compact', 'Compacta'], ['medium', 'Média'], ['tall', 'Alta']])],
    blocos: { slide: { nome: 'Slide', campos: [T('link', 'Link do slide/botão'), T('eyebrow', 'Linha superior'), T('heading', 'Título'), T('heading_em', 'Trecho destacado do título'), A('subheading', 'Subtítulo'), T('rating', 'Avaliações (ex.: 4.98 · 15.788 avaliações)'), T('price_prefix', 'Prefixo do preço'), T('price', 'Preço (ex.: 197)'), T('button_label', 'Texto do botão'), S('accent', 'Cor do destaque', [['red', 'Vermelho'], ['blue', 'Azul']]),
      T('video_desktop', 'Vídeo de fundo · desktop (URL .mp4)'), T('video_mobile', 'Vídeo de fundo · celular (URL .mp4)'), N('video_opacity', 'Opacidade do vídeo (%)'), T('poster_bg_url', 'Poster do fundo (URL .jpg)'), T('video_square', 'Vídeo quadrado (URL .mp4)'), A('video_square_pool', 'Vídeos quadrados extras (1 por linha)'), S('square_rotation', 'Variar o quadrado', [['sequence', 'Em sequência'], ['random', 'Aleatório']]), T('poster_sq_url', 'Poster do quadrado'), A('poster_sq_pool', 'Posters extras (1 por linha)'), T('product_image', 'Imagem do produto (sem vídeo)')] } } },
  'an-outubro-rosa': { nome: 'Faixa de campanha (Outubro Rosa)', ico: 'ribbon-health', cfg: [C('enabled', 'Ativar faixa'), C('only_october', 'Mostrar só em outubro'), T('eyebrow', 'Chamada'), T('heading', 'Título'), T('heading_em', 'Título (destaque rosa)'), A('text', 'Texto'), T('button_label', 'Texto do botão'), T('link', 'Link do botão'), C('new_tab', 'Abrir em nova aba')] },
  'rich-text': { nome: 'Texto', ico: 'align-left', cfg: [...TITULO, T('button_label', 'Botão'), T('button_link', 'Link do botão'), ...PAD], blocos: { text: { nome: 'Texto', campos: [R('text', 'Texto')] }, liquid: { nome: 'HTML', campos: [H('liquid', 'HTML')] } } },
  'collection-list': { nome: 'Linha de produtos (coleções)', ico: 'category', cfg: [...TITULO, C('show_products_count', 'Mostrar quantidade'), N('columns', 'Colunas'), C('carousel_on_desktop', 'Carrossel no desktop'), ...PAD], blocos: { collection: { nome: 'Coleção', campos: [COL('collection', 'Coleção'), T('title', 'Título (opcional)'), T('description', 'Descrição')] } } },
  'featured-collections': { nome: 'Vitrine de produtos', ico: 'layout-grid', cfg: [...TITULO, COR('color_background', 'Cor de fundo'), N('product_limit', 'Máximo de produtos'), N('columns', 'Colunas'), C('rounded', 'Cantos arredondados'), ...PAD], blocos: { collection: { nome: 'Lista', campos: [T('title', 'Texto da aba'), COL('collection', 'Coleção (se não escolher produtos)'), PRODS('products', 'Produtos (na ordem)')] } } },
  'scrolling-text': { nome: 'Texto rolando', ico: 'arrows-horizontal', cfg: [S('direction', 'Direção', [['left', 'Para a esquerda'], ['right', 'Para a direita']]), N('speed', 'Velocidade'), N('grid_horizontal', 'Espaço entre itens'), C('enable_twin', 'Faixa dupla inclinada'), COR('color_background', 'Cor de fundo'), ...PAD], blocos: { text: { nome: 'Texto', campos: [T('text', 'Texto (aceita <em> e <strong>)'), N('text_size', 'Tamanho (px)')] }, image: { nome: 'Imagem', campos: [T('image', 'URL da imagem'), N('height', 'Altura (px)')] } } },
  'video-with-text-overlay': { nome: 'Vídeo com texto', ico: 'movie', cfg: [T('video_src', 'Vídeo (URL .mp4)'), T('video_poster', 'Imagem de capa'), T('image_height', 'Altura (ex.: 400px)'), T('image_height_mobile', 'Altura no celular'), N('overlay_opacity', 'Escurecer (%)'), COR('color_highlight', 'Cor do destaque')], blocos: { text: { nome: 'Texto', campos: [R('text', 'Texto')] }, heading: { nome: 'Título', campos: [T('heading', 'Título')] } } },
  'featured-product': { nome: 'Produto em destaque', ico: 'star', cfg: [PROD('product', 'Produto'), C('hide_variants', 'Esconder variantes'), N('media_size', 'Largura da foto (%)'), ...PAD], blocos: { text: { nome: 'Texto', campos: [R('text', 'Texto')] }, liquid: { nome: 'HTML', campos: [H('liquid', 'HTML')] } } },
  'collage-grid': { nome: 'Chamada de depoimentos', ico: 'message-heart', cfg: [...TITULO, T('button_label', 'Botão'), T('button_link', 'Link do botão'), ...PAD] },
  'blog-posts-collage': { nome: 'Blog', ico: 'news', cfg: [T('heading', 'Título'), BLOG('blog', 'Blog'), N('post_limit', 'Quantidade de posts'), C('show_view_all', 'Botão "Ver tudo"'), ...PAD] },
  slideshow: { nome: 'Banner (imagens/vídeos)', ico: 'photo', cfg: [N('autoplay_speed', 'Trocar a cada (s)')], blocos: { image: { nome: 'Imagem', campos: [T('image', 'URL da imagem'), T('button_link', 'Link')] }, video: { nome: 'Vídeo', campos: [T('video_src', 'Vídeo (URL .mp4)'), T('button_link', 'Link')] } } },
  html: { nome: 'HTML livre', ico: 'code', cfg: [] },
};

function campoHtml(f, v, pre) {
  const nm = pre + f.k;
  switch (f.t) {
    case 'area': return fld(f.l, area(nm, v, 'rows="3"'), f.ajuda);
    case 'chk': return chk(nm, v, f.l);
    case 'num': return fld(f.l, inp(nm, v, 'type="number"'));
    case 'sel': return fld(f.l, sel(nm, v, f.ops));
    case 'rich': return `<div class="fld"><span>${esc(f.l)}</span>${editorRico(v, nm)}</div>`;
    case 'code': return fld(f.l, area(nm, v, 'class="in code" spellcheck="false"'));
    case 'cor': return fld(f.l, `<div style="display:flex;gap:8px"><input type="color" value="${esc(v || '#07388e')}" oninput="this.nextElementSibling.value=this.value;this.nextElementSibling.dispatchEvent(new Event('input',{bubbles:true}))" style="width:44px;height:40px;border:1px solid var(--line);border-radius:10px;padding:2px">${inp(nm, v)}</div>`);
    case 'colecao': return fld(f.l, sel(nm, v, [['', '—'], ...db.all('colecoes').map((c) => [c.handle, c.titulo])]));
    case 'produto': return fld(f.l, sel(nm, v, [['', '—'], ...db.all('produtos').map((p) => [p.handle, p.titulo])]));
    case 'blog': return fld(f.l, sel(nm, v, db.all('blogs').map((b) => [b.handle, b.titulo])));
    case 'produtos': return `<div class="fld"><span>${esc(f.l)}</span><div class="list-sort" data-prods="${nm}" style="max-height:340px;overflow:auto">${[...(v || []), ...db.all('produtos').map((p) => p.handle).filter((h) => !(v || []).includes(h))].map((h) => { const p = db.all('produtos').find((x) => x.handle === h); return p ? `<div class="it" draggable="true" data-h="${esc(h)}"><i class="ti ti-grip-vertical grip"></i><label class="chk grow"><input type="checkbox"${(v || []).includes(h) ? ' checked' : ''}> ${esc(p.titulo)}</label></div>` : ''; }).join('')}</div></div>`;
    default: return fld(f.l, inp(nm, v), f.ajuda);
  }
}
function lerCampos(root, campos, pre, alvo) {
  for (const f of campos) {
    if (f.t === 'produtos') { const box = $(`[data-prods="${pre + f.k}"]`, root); if (box) alvo[f.k] = $$('.it', box).filter((it) => $('input', it).checked).map((it) => it.dataset.h); continue; }
    const el = $(`[name="${pre + f.k}"]`, root); if (!el) continue;
    alvo[f.k] = f.t === 'chk' ? el.checked : f.t === 'num' ? (el.value === '' ? null : Number(el.value)) : el.value;
  }
}

// ------------------------------------------------------------------ página inicial
export async function home(view, { crumb, acts }) {
  crumb('<b>Página inicial</b>');
  const h = structuredClone(db.state.home || { ordem: [], secoes: {} });
  let sujo = false, atual = null;
  const bar = acts('<span class="soft sm" id="st"></span> <button class="btn" id="desf"><i class="ti ti-arrow-back-up"></i> Descartar</button> <button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button>');
  const marcar = (v = true) => { sujo = v; $('#st', bar).textContent = v ? 'Alterações não salvas' : ''; };
  view.innerHTML = `<div class="preview"><aside id="lado"></aside><div class="frame" id="frame"></div></div>`;
  const frame = montarFrame($('#frame', view));
  let tm; const atualizar = (rolar) => { clearTimeout(tm); tm = setTimeout(async () => frame.render(await htmlHome(h), rolar), 300); };

  const lista = () => {
    atual = null;
    $('#lado', view).innerHTML = `<h3 style="margin-bottom:4px">Seções</h3><p class="xs soft" style="margin-bottom:14px">Arraste para mudar a ordem. Clique para editar.</p>
    <div class="list-sort secs" id="ls">${h.ordem.map((id) => { const s = h.secoes[id]; if (!s) return ''; const e = ESQ[s.tipo] || { nome: s.tipo, ico: 'box' }; return `<div class="it${s.desativada ? ' off' : ''}" draggable="true" data-id="${esc(id)}"><span class="sec-ico"><i class="ti ti-${e.ico}"></i></span><div class="grow"><b class="sm">${esc(e.nome)}</b><div class="xs soft" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(resumoSec(s))}</div></div><button class="btn sm ico ghost" data-olho="${esc(id)}" title="${s.desativada ? 'Mostrar' : 'Esconder'}"><i class="ti ti-eye${s.desativada ? '-off' : ''}"></i></button></div>`; }).join('')}</div>
    <div style="margin-top:12px">${sel('_nova', '', [['', '+ Adicionar seção…'], ...Object.entries(ESQ).map(([k, e]) => [k, e.nome])])}</div>`;
    ordenavel($('#ls', view), () => { h.ordem = $$('#ls .it', view).map((x) => x.dataset.id); marcar(); atualizar(); });
    $$('#ls .it', view).forEach((it) => it.onclick = (e) => { if (e.target.closest('[data-olho]')) return; editarSec(it.dataset.id); });
    $$('[data-olho]', view).forEach((b) => b.onclick = () => { const s = h.secoes[b.dataset.olho]; s.desativada = !s.desativada; marcar(); lista(); atualizar(); });
    $('[name=_nova]', view).onchange = (e) => { const t = e.target.value; if (!t) return; const id = t.replace(/[^a-z]/g, '_') + '_' + Math.random().toString(36).slice(2, 7); h.secoes[id] = { tipo: t, config: {}, blocos: [], html: t === 'html' ? '<div class="page-width" style="padding:40px 0">Novo conteúdo</div>' : undefined }; h.ordem.push(id); marcar(); editarSec(id); atualizar(); };
  };
  const resumoSec = (s) => s.tipo === 'html' ? (s.config?.titulo || 'HTML') : (s.config?.heading || s.config?.eyebrow || (s.blocos || []).map((b) => b.config?.heading || b.config?.title || b.nome).filter(Boolean).slice(0, 3).join(' · ') || '').replace(/<[^>]+>/g, '');

  const editarSec = (id) => {
    atual = id;
    const s = h.secoes[id]; const e = ESQ[s.tipo] || { nome: s.tipo, cfg: [] };
    const blocos = e.blocos ? (s.blocos || []) : [];
    $('#lado', view).innerHTML = `<button class="btn sm ghost" id="volta" style="margin:-6px 0 10px -10px"><i class="ti ti-chevron-left"></i> Seções</button>
    <h3 style="margin-bottom:14px">${esc(e.nome)}</h3>
    <form id="fs" class="stack" style="gap:14px" onsubmit="return false">
      ${s.tipo === 'html' ? fld('Nome (só no painel)', inp('c_titulo', s.config?.titulo || '')) + fld('HTML', area('html', s.html, 'class="in code" spellcheck="false" style="min-height:420px"'), 'Seção copiada da Shopify. Edite com cuidado.') : ''}
      ${e.cfg.map((f) => campoHtml(f, s.config?.[f.k], 'c_')).join('')}
      ${e.blocos ? `<h5>Blocos</h5><div class="list-sort" id="bl">${blocos.map((b, i) => `<details class="it" style="display:block" draggable="true" data-i="${i}"><summary style="cursor:pointer;display:flex;gap:8px;align-items:center"><i class="ti ti-grip-vertical grip"></i><b class="sm grow">${esc(e.blocos[b.tipo]?.nome || b.tipo)}</b><span class="xs soft">${esc((b.config?.heading || b.config?.title || b.config?.collection || b.nome || '').replace(/<[^>]+>/g, '').slice(0, 26))}</span></summary>
        <div class="stack" style="gap:12px;margin-top:12px">${(e.blocos[b.tipo]?.campos || []).map((f) => campoHtml(f, b.config?.[f.k], `b${i}_`)).join('')}<button type="button" class="btn sm red" data-rmb="${i}"><i class="ti ti-trash"></i> Remover bloco</button></div></details>`).join('')}</div>
        <div>${sel('_bloco', '', [['', '+ Adicionar bloco…'], ...Object.entries(e.blocos).map(([k, b]) => [k, b.nome])])}</div>` : ''}
      <details><summary class="xs soft" style="cursor:pointer">Avançado (JSON)</summary><textarea class="in code" id="json" data-skip style="min-height:200px;margin-top:8px">${esc(JSON.stringify({ config: s.config, blocos: s.blocos }, null, 2))}</textarea><button type="button" class="btn sm" id="aplicar" style="margin-top:6px">Aplicar JSON</button></details>
      <button type="button" class="btn red sm" id="del" style="justify-self:start"><i class="ti ti-trash"></i> Remover seção</button>
    </form>`;
    const fs = $('#fs', view);
    const ler = () => {
      s.config = s.config || {};
      if (s.tipo === 'html') { s.html = $('[name=html]', fs).value; s.config.titulo = $('[name=c_titulo]', fs).value; }
      lerCampos(fs, e.cfg, 'c_', s.config);
      blocos.forEach((b, i) => { b.config = b.config || {}; lerCampos(fs, e.blocos[b.tipo]?.campos || [], `b${i}_`, b.config); });
      marcar(); atualizar('sec-' + id);
    };
    fs.addEventListener('input', ler); fs.addEventListener('change', ler);
    $$('[data-prods]', fs).forEach((x) => ordenavel(x, ler));
    if ($('#bl', fs)) ordenavel($('#bl', fs), () => { ler(); s.blocos = $$('#bl > .it', fs).map((x) => blocos[+x.dataset.i]); editarSec(id); atualizar('sec-' + id); });
    $$('[data-rmb]', fs).forEach((b) => b.onclick = () => { s.blocos.splice(+b.dataset.rmb, 1); marcar(); editarSec(id); atualizar('sec-' + id); });
    const nb = $('[name=_bloco]', fs); if (nb) nb.onchange = () => { if (!nb.value) return; s.blocos = [...(s.blocos || []), { id: 'b' + Date.now().toString(36), tipo: nb.value, config: {} }]; marcar(); editarSec(id); };
    $('#aplicar', fs).onclick = () => { try { const j = JSON.parse($('#json', fs).value); s.config = j.config || {}; s.blocos = j.blocos || []; marcar(); editarSec(id); atualizar('sec-' + id); } catch (err) { toast('JSON inválido: ' + err.message, true); } };
    $('#del', fs).onclick = async () => { if (await confirmar('Remover esta seção da página inicial?', { ok: 'Remover', perigo: true })) { delete h.secoes[id]; h.ordem = h.ordem.filter((x) => x !== id); marcar(); lista(); atualizar(); } };
    $('#volta', view).onclick = lista;
    atualizar('sec-' + id);
  };

  $('#salvar', bar).onclick = async () => { await db.set('home', h); marcar(false); toast('Página inicial salva. Publique para colocar no ar.'); };
  $('#desf', bar).onclick = () => { if (!sujo) return; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  lista(); atualizar();
}

// ------------------------------------------------------------------ cabeçalho e rodapé
export function navegacao(view, { crumb }) {
  crumb('<b>Cabeçalho e rodapé</b>');
  const c = structuredClone(db.state.config);
  const menu = c.menu_principal || [];
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Loja</div><h1>Cabeçalho e rodapé</h1></div></div>
  <form id="fn" class="stack" onsubmit="return false">
    <div class="card"><div class="card-h"><h3 class="grow">Barra de anúncio</h3></div><div class="card-b stack">
      ${fld('Mensagens (uma por linha)', area('an_msgs', (c.anuncio?.mensagens || []).join('\n'), 'rows="4"'))}
      <div class="row" style="--c:3">${fld('Cor de fundo', `<input class="in" type="color" name="an_bg" value="${esc(c.anuncio?.cor_fundo || '#07388E')}">`)}${fld('Cor do texto', `<input class="in" type="color" name="an_fg" value="${esc(c.anuncio?.cor_texto || '#FAFAFA')}">`)}${fld('Trocar a cada (s)', inp('an_vel', c.anuncio?.velocidade || 5, 'type="number"'))}</div></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Menu principal</h3><button type="button" class="btn sm" id="addm"><i class="ti ti-plus"></i> Item</button></div><div class="card-b"><div class="list-sort" id="menu">${menu.map((m) => `<div class="it" draggable="true"><i class="ti ti-grip-vertical grip"></i><input class="in" data-k="titulo" value="${esc(m.titulo)}" style="max-width:200px"><input class="in" data-k="url" value="${esc(m.url)}"><button type="button" class="btn sm ico ghost" data-rm><i class="ti ti-x"></i></button></div>`).join('')}</div><p class="xs soft" style="margin-top:8px">Aparece na gaveta do menu. A barra de links abaixo do logo vem do HTML do cabeçalho.</p></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Logos e redes sociais</h3></div><div class="card-b stack">
      <div class="row">${fld('Logo (URL)', inp('logo', c.logo))}${fld('Logo branco (URL)', inp('logo_branco', c.logo_branco))}</div>
      <div class="row">${['facebook', 'instagram', 'youtube', 'tiktok'].map((k) => fld(k[0].toUpperCase() + k.slice(1), inp('so_' + k, c.social?.[k] || ''))).join('')}</div></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">HTML abaixo do logo</h3></div><div class="card-b">${area('header_html', c.header_html || '', 'class="in code" spellcheck="false"')}</div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Rodapé (HTML)</h3></div><div class="card-b">${area('footer_html', c.footer_html || '', 'class="in code" spellcheck="false" style="min-height:360px"')}</div></div>
  </form>
  <div class="editor-bar"><span class="grow"></span><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button></div></div>`;
  const novoItem = () => { const d = document.createElement('div'); d.className = 'it'; d.draggable = true; d.innerHTML = '<i class="ti ti-grip-vertical grip"></i><input class="in" data-k="titulo" placeholder="Título" style="max-width:200px"><input class="in" data-k="url" placeholder="/collections/…"><button type="button" class="btn sm ico ghost" data-rm><i class="ti ti-x"></i></button>'; $('#menu', view).appendChild(d); };
  $('#addm', view).onclick = novoItem;
  $('#menu', view).addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.it').remove(); });
  ordenavel($('#menu', view));
  $('#salvar', view).onclick = async () => {
    const f = lerForm($('#fn', view));
    c.anuncio = { ...(c.anuncio || {}), mensagens: f.an_msgs.split('\n').map((x) => x.trim()).filter(Boolean), cor_fundo: f.an_bg, cor_texto: f.an_fg, velocidade: Number(f.an_vel) || 5 };
    c.menu_principal = $$('#menu .it', view).map((it) => ({ titulo: $('[data-k=titulo]', it).value, url: $('[data-k=url]', it).value })).filter((m) => m.titulo && m.url);
    c.logo = f.logo; c.logo_branco = f.logo_branco; c.header_html = f.header_html; c.footer_html = f.footer_html;
    c.social = Object.fromEntries(['facebook', 'instagram', 'youtube', 'tiktok'].map((k) => [k, f['so_' + k]]).filter(([, v]) => v));
    await db.set('config', c); toast('Salvo. Publique para colocar no ar.');
  };
}

// ------------------------------------------------------------------ configurações
export function config(view, { crumb }) {
  crumb('<b>Configurações</b>');
  const c = structuredClone(db.state.config);
  view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">Loja</div><h1>Configurações</h1></div></div>
  <form id="fc" class="stack" onsubmit="return false">
    <div class="card"><div class="card-h"><h3 class="grow">Loja</h3></div><div class="card-b stack">
      <div class="row">${fld('Nome', inp('nome', c.nome))}${fld('Domínio', inp('dominio', c.dominio), 'Usado no canonical, sitemap e compartilhamento.')}</div>
      ${fld('Título da página inicial', inp('titulo_home', c.titulo_home))}${fld('Descrição (Google)', area('descricao_home', c.descricao_home, 'rows="2"'))}
      <div class="row">${fld('Imagem de compartilhamento (URL)', inp('og_imagem', c.og_imagem))}${fld('Favicon (URL)', inp('favicon', c.favicon))}</div>
      ${fld('Banner padrão das coleções (URL)', inp('banner_colecoes', c.banner_colecoes || ''))}</div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Checkout e frete</h3></div><div class="card-b stack">
      <div class="row">${fld('Endereço do checkout', inp('checkout_url', c.checkout_url), 'O carrinho manda ?items=variante:qtd:preço (+ ref, discount, bg_ref).')}${fld('Frete grátis a partir de (R$)', inp('frete_gratis_min', c.frete_gratis_min, 'type="number"'))}</div>
      <div class="row">${fld('Página de rastreio', inp('rastreio_url', c.rastreio_url))}${fld('Coleções sugeridas no carrinho vazio', inp('carrinho_colecoes', (c.carrinho_colecoes || []).join(', ')), 'Endereços separados por vírgula.')}</div>
      <div class="row" style="--c:3">${fld('Cor principal', `<input class="in" type="color" name="cor_primaria" value="${esc(c.cores?.primaria || '#07388E')}">`)}${fld('Cor de oferta', `<input class="in" type="color" name="cor_oferta" value="${esc(c.cores?.oferta || '#AD0404')}">`)}</div></div></div>
    <div class="card"><div class="card-h"><h3 class="grow">Scripts e pixels</h3></div><div class="card-b stack">
      <div class="help">Google Ads, GTM, UTMify, Klaviyo e o script de origem (an_src) vieram da loja atual. Eventos de carrinho vão para o <code>dataLayer</code> (add_to_cart, view_item) e para o <code>fbq</code> se o pixel da Meta estiver aqui.</div>
      ${fld('No <head> de todas as páginas', area('scripts_head', c.scripts_head || '', 'class="in code" spellcheck="false"'))}
      ${fld('No fim do <body> (botões de WhatsApp/Telegram, afiliados, checkout)', area('scripts_body', c.scripts_body || '', 'class="in code" spellcheck="false" style="min-height:360px"'))}</div></div>
  </form>
  <div class="editor-bar"><span class="grow"></span><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button></div></div>`;
  $('#salvar', view).onclick = async () => {
    const f = lerForm($('#fc', view));
    Object.assign(c, { nome: f.nome, dominio: f.dominio, titulo_home: f.titulo_home, descricao_home: f.descricao_home, og_imagem: f.og_imagem, favicon: f.favicon, banner_colecoes: f.banner_colecoes || null, checkout_url: f.checkout_url, frete_gratis_min: Number(f.frete_gratis_min) || 0, rastreio_url: f.rastreio_url, carrinho_colecoes: f.carrinho_colecoes.split(',').map((x) => x.trim()).filter(Boolean), scripts_head: f.scripts_head, scripts_body: f.scripts_body, cores: { ...(c.cores || {}), primaria: f.cor_primaria, oferta: f.cor_oferta } });
    await db.set('config', c); toast('Configurações salvas.');
  };
}

// ------------------------------------------------------------------ redirecionamentos
export function redirects(view, { crumb }) {
  crumb('<b>Redirecionamentos</b>');
  const lista = structuredClone(db.state.redirects || []);
  const draw = () => {
    view.innerHTML = `<div class="page"><div class="page-head"><div class="grow"><div class="eyebrow">SEO</div><h1>Redirecionamentos</h1><p class="muted sm" style="margin-top:6px">Endereços antigos que devem levar para outro lugar (301). Mudou o endereço de um produto? Ele entra aqui sozinho.</p></div></div>
    <div class="card"><table class="t"><thead><tr><th>De</th><th>Para</th><th></th></tr></thead><tbody>${lista.map((r, i) => `<tr><td><input class="in" data-i="${i}" data-k="de" value="${esc(r.de)}"></td><td><input class="in" data-i="${i}" data-k="para" value="${esc(r.para)}"></td><td><button class="btn sm ico ghost" data-rm="${i}"><i class="ti ti-x"></i></button></td></tr>`).join('')}</tbody></table>
    <div class="card-b"><button class="btn sm" id="add"><i class="ti ti-plus"></i> Adicionar</button></div></div>
    <div class="editor-bar"><span class="grow"></span><button class="btn pri" id="salvar"><i class="ti ti-check"></i> Salvar</button></div></div>`;
    $$('input[data-i]', view).forEach((i) => i.oninput = () => { lista[+i.dataset.i][i.dataset.k] = i.value.trim(); });
    $$('[data-rm]', view).forEach((b) => b.onclick = () => { lista.splice(+b.dataset.rm, 1); draw(); });
    $('#add', view).onclick = () => { lista.push({ de: '/', para: '/' }); draw(); };
    $('#salvar', view).onclick = async () => { await db.set('redirects', lista.filter((r) => r.de && r.para && r.de !== r.para)); toast('Redirecionamentos salvos.'); };
  };
  draw();
}

// ------------------------------------------------------------------ publicar
export async function publicar(view, { crumb }) {
  crumb('<b>Publicar</b>');
  const pend = pref.get('alteracoes', 0);
  const s = db.state;
  view.innerHTML = `<div class="page" style="max-width:860px"><div class="page-head"><div class="grow"><div class="eyebrow">Loja</div><h1>Publicar</h1></div></div>
  <div class="card card-b stack">
    <p>A loja é um site estático gerado a partir destes dados: rápido, sem mensalidade e com as mesmas URLs da Shopify. Publicar gera o site de novo e coloca no ar em ~1 minuto.</p>
    <div class="kpis" style="margin:0"><div class="card kpi"><div class="l">Produtos ativos</div><div class="v">${s.produtos.filter((p) => (p.status || 'ativo') === 'ativo').length}</div></div><div class="card kpi"><div class="l">Coleções</div><div class="v">${s.colecoes.length}</div></div><div class="card kpi"><div class="l">Páginas</div><div class="v">${s.paginas.length}</div></div><div class="card kpi"><div class="l">Artigos</div><div class="v">${s.artigos.length}</div></div></div>
    ${db.demo ? `<div class="help amber"><b>Modo demonstração.</b> As alterações (${pend}) estão só neste navegador. Para publicar daqui: aplique <code>supabase/loja.sql</code>, crie o webhook <code>loja-api</code> no n8n e preencha <code>CONFIG.gateway</code> em <code>loja/admin/db.js</code>. Enquanto isso, baixe o pacote e salve em <code>loja/data/loja.json</code> — o próximo deploy usa ele.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn pri" id="baixar"><i class="ti ti-download"></i> Baixar loja.json</button><button class="btn red" id="reset"><i class="ti ti-refresh"></i> Descartar alterações locais</button></div>`
      : `${fld('Nota (opcional)', inp('nota', '', 'placeholder="Ex.: preço novo do Omega 3"'))}<div><button class="btn pri lg" id="pub"><i class="ti ti-rocket"></i> Publicar agora</button></div><div id="hist"></div>`}
  </div></div>`;
  const b = $('#baixar', view);
  if (b) b.onclick = () => { const blob = new Blob([JSON.stringify(db.exportar(), null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'loja.json'; a.click(); };
  const r = $('#reset', view);
  if (r) r.onclick = async () => { if (await confirmar('Voltar aos dados do último build? As alterações feitas neste navegador serão perdidas.', { ok: 'Descartar', perigo: true })) { await db.backend.resetar(); pref.set('alteracoes', 0); location.reload(); } };
  const p = $('#pub', view);
  if (p) {
    const hist = async () => { try { const it = await db.backend.publicacoes(); $('#hist', view).innerHTML = `<h5>Últimas publicações</h5><table class="t"><tbody>${it.map((x) => `<tr><td>${dataBR(x.criado_em, true)}</td><td>${esc(x.usuario || '')}</td><td class="soft">${esc(x.nota || '')}</td><td>${x.status === 'ok' ? '<span class="badge green">No ar</span>' : `<span class="badge amber">${esc(x.status)}</span>`}</td></tr>`).join('')}</tbody></table>`; } catch {} };
    p.onclick = async () => { p.disabled = true; try { await db.backend.publicar($('[name=nota]', view).value); pref.set('alteracoes', 0); toast('Publicação iniciada. A loja atualiza em ~1 minuto.'); hist(); } finally { p.disabled = false; } };
    hist();
  }
}
