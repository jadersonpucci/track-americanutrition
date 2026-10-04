#!/usr/bin/env node
// Gera a loja estática em loja/dist a partir dos dados (loja/data/loja.json ou a API do painel).
//
//   node loja/build.mjs                 usa loja/data/loja.json
//   LOJA_API=https://n8n.americanutrition.com/webhook/loja-api node loja/build.mjs
//                                       baixa os dados publicados do banco (op "publicado")
//
// Mesmas URLs da Shopify (/products/x, /collections/x, /pages/x, /blogs/b/a, /policies/x), então links,
// anúncios e SEO continuam valendo. Variantes mantêm os ids da Shopify: o checkout próprio
// (checkout.americanutrition.com/?items=variante:qtd:preço) funciona sem mudança.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSecao } from './theme/sections.mjs';
import { layout } from './theme/layout.mjs';
import * as P from './theme/pages.mjs';
import { img, esc } from './theme/util.mjs';
import { criarContexto } from './theme/contexto.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const t0 = Date.now();

async function carregar() {
  if (process.env.LOJA_API) {
    const r = await fetch(process.env.LOJA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'publicado', token: process.env.LOJA_BUILD_TOKEN }) });
    let j = await r.json(); if (Array.isArray(j)) j = j[0]; if (j?.r) j = j.r;
    if (!j?.ok) throw new Error('API da loja: ' + (j?.erro || r.status));
    return j.data;
  }
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'loja.json'), 'utf8'));
}

const d = await carregar();
const lerHtml = (ref) => (ref && !ref.includes('<') && fs.existsSync(path.join(ROOT, 'data', ref))) ? fs.readFileSync(path.join(ROOT, 'data', ref), 'utf8') : (ref && ref.includes('<') ? ref : '');

const ctx = criarContexto(d, { lerHtml });
const { versao, produtosDaColecao, colecoes } = ctx;
const ativos = ctx.todos, visiveis = ctx.produtos;

// ---------------------------------------------------------------- escrita
fs.rmSync(OUT, { recursive: true, force: true });
let n = 0;
function w(rel, conteudo) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, conteudo); n++;
}
const page = (url, html) => w(url === '/' ? 'index.html' : url.replace(/^\//, '') + '/index.html', html);

// home
const home = d.home || { ordem: [], secoes: {} };
page('/', layout(ctx, {
  title: d.config.titulo_home, description: d.config.descricao_home, canonical: '/', pageType: 'index',
  body: home.ordem.map((id) => home.secoes[id] && renderSecao(id, home.secoes[id], ctx)).filter(Boolean).join('\n'),
  jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: d.config.nome, url: d.config.dominio, logo: img(d.config.logo, 600), sameAs: Object.values(d.config.social || {}) },
}));

for (const p of ativos) page(`/products/${p.handle}`, P.paginaProduto(ctx, p));
for (const c of colecoes) page(`/collections/${c.handle}`, P.paginaColecao(ctx, c));
page('/collections', P.paginaColecoes(ctx));
for (const g of ctx.paginas) if (g.status !== 'rascunho') page(g.politica ? `/policies/${g.handle}` : `/pages/${g.handle}`, P.paginaConteudo(ctx, g));

const POR_PAGINA = 12;
for (const b of ctx.blogs) {
  const lista = ctx.artigos.filter((a) => a.blog === b.handle);
  const total = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  for (let i = 1; i <= total; i++) page(i === 1 ? `/blogs/${b.handle}` : `/blogs/${b.handle}/page/${i}`, P.paginaBlog(ctx, b, lista.slice((i - 1) * POR_PAGINA, i * POR_PAGINA), { pagina: i, total }));
}
for (const a of ctx.artigos) page(`/blogs/${a.blog}/${a.handle}`, P.paginaArtigo(ctx, a));
if (ctx.blogs.length && !ctx.blogs.some((b) => b.handle === 'news')) w('blogs/news/index.html', `<!doctype html><meta http-equiv="refresh" content="0;url=/blogs/${ctx.blogs[0].handle}"><link rel="canonical" href="/blogs/${ctx.blogs[0].handle}">`);

page('/search', P.paginaBusca(ctx));
page('/cart', P.paginaCarrinho(ctx));
page('/account', P.paginaConta(ctx));
w('404.html', P.pagina404(ctx));

// ---------------------------------------------------------------- dados públicos (JSON)
const cent = (v) => Math.round(Number(v || 0) * 100);
// catálogo enxuto que o carrinho, a busca e o shim da Ajax API usam no navegador
w('catalogo.json', JSON.stringify({
  v: versao,
  produtos: visiveis.map((p) => ({
    id: p.id, h: p.handle, t: p.titulo, tp: p.tipo, tags: p.tags, img: img(p.imagens?.[0]?.url, 400), nota: p.avaliacao?.nota || null,
    v: p.variantes.map((v) => ({ id: v.id, t: v.titulo, p: cent(v.preco), c: v.preco_comparacao ? cent(v.preco_comparacao) : null, ok: v.disponivel ? 1 : 0, sku: v.sku, img: v.imagem ? img((p.imagens.find((i) => i.id === v.imagem) || {}).url, 400) : null, o: v.opcoes })),
  })),
  artigos: ctx.artigos.slice(0, 200).map((a) => ({ t: a.titulo, u: `/blogs/${a.blog}/${a.handle}`, img: img(a.imagem, 300) })),
}));

// formato /products.json da Shopify: a página de rastreio e integrações antigas continuam lendo daqui
const shopifyProduto = (p) => ({
  id: Number(p.id) || p.id, title: p.titulo, handle: p.handle, body_html: p.descricao_html, published_at: p.publicado_em, created_at: p.criado_em, updated_at: p.atualizado_em,
  vendor: p.fornecedor, product_type: p.tipo, tags: p.tags,
  variants: p.variantes.map((v, i) => ({ id: Number(v.id) || v.id, title: v.titulo, option1: v.opcoes?.[0] || 'Default Title', option2: v.opcoes?.[1] || null, option3: v.opcoes?.[2] || null, sku: v.sku, requires_shipping: true, taxable: false, featured_image: v.imagem ? { id: Number(v.imagem), src: (p.imagens.find((x) => x.id === v.imagem) || {}).url } : null, available: v.disponivel, price: v.preco.toFixed(2), grams: v.peso_g || 0, compare_at_price: v.preco_comparacao ? v.preco_comparacao.toFixed(2) : null, position: i + 1, product_id: Number(p.id) || p.id })),
  images: p.imagens.map((m, i) => ({ id: Number(m.id) || m.id, position: i + 1, product_id: Number(p.id) || p.id, variant_ids: (m.variantes || []).map(Number), src: m.url, width: m.largura, height: m.altura, alt: m.alt })),
  options: (p.opcoes || []).map((o, i) => ({ name: o.nome, position: i + 1, values: o.valores })),
});
w('products.json', JSON.stringify({ products: visiveis.map(shopifyProduto) }));
for (const p of visiveis) {
  w(`products/${p.handle}.json`, JSON.stringify({ product: shopifyProduto(p) }));
  w(`products/${p.handle}.js`, JSON.stringify({ ...shopifyProduto(p), price: cent(Math.min(...p.variantes.map((v) => v.preco))), available: p.variantes.some((v) => v.disponivel), url: `/products/${p.handle}`, featured_image: p.imagens?.[0]?.url, variants: p.variantes.map((v) => ({ id: Number(v.id), title: v.titulo, price: cent(v.preco), compare_at_price: v.preco_comparacao ? cent(v.preco_comparacao) : null, available: v.disponivel, sku: v.sku, options: v.opcoes })) }));
}
w('collections.json', JSON.stringify({ collections: colecoes.filter((c) => !c.virtual).map((c) => ({ id: Number(c.id) || c.id, handle: c.handle, title: c.titulo, body_html: c.descricao_html, image: c.imagem ? { src: c.imagem } : null, products_count: produtosDaColecao(c).length })) }));
for (const c of colecoes) w(`collections/${c.handle}/products.json`, JSON.stringify({ products: produtosDaColecao(c).map(shopifyProduto) }));
w('pages.json', JSON.stringify({ pages: ctx.paginas.filter((g) => !g.politica).map((g) => ({ id: Number(g.id) || g.id, title: g.titulo, handle: g.handle, body_html: g.corpo_html, published_at: g.publicado_em, updated_at: g.atualizado_em })) }));
// depoimentos no formato que as seções da loja leem (substitui a Storefront API da Shopify)
w('depoimentos.json', JSON.stringify({ depoimentos: (d.depoimentos || []).filter((x) => x.ativo !== false) }));

// ---------------------------------------------------------------- SEO
const dom = d.config.dominio.replace(/\/$/, '');
const urls = ['/', '/collections', ...colecoes.map((c) => `/collections/${c.handle}`), ...visiveis.map((p) => `/products/${p.handle}`), ...ctx.paginas.filter((g) => !g.politica && g.status !== 'rascunho').map((g) => `/pages/${g.handle}`), ...ctx.blogs.map((b) => `/blogs/${b.handle}`), ...ctx.artigos.map((a) => `/blogs/${a.blog}/${a.handle}`)];
w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(dom + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
w('robots.txt', `User-agent: *\nDisallow: /admin\nDisallow: /cart\nDisallow: /account\nDisallow: /search\nSitemap: ${dom}/sitemap.xml\n`);

// ---------------------------------------------------------------- arquivos estáticos
const copiar = (de, para) => { if (!fs.existsSync(de)) return; fs.cpSync(de, para, { recursive: true }); };
copiar(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
copiar(path.join(ROOT, 'admin'), path.join(OUT, 'admin'));
copiar(path.join(ROOT, 'theme'), path.join(OUT, 'admin', 'theme'));
// sem servidor configurado, o painel abre em modo demonstração com os dados deste build
if (!process.env.LOJA_API) w('admin/dados.json', JSON.stringify(d));

// redirects configurados no painel (além dos fixos do vercel.json)
const redirects = (d.redirects || []).filter((r) => r.de && r.para);
w('_redirects.json', JSON.stringify(redirects));
for (const r of redirects) {
  const rel = r.de.replace(/^\//, '').replace(/\/$/, '');
  if (!rel || fs.existsSync(path.join(OUT, rel, 'index.html'))) continue;
  w(rel + '/index.html', `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${esc(r.para)}"><link rel="canonical" href="${esc(r.para)}"><script>location.replace(${JSON.stringify(r.para)}+location.search)</script>`);
}

console.log(`loja: ${n} arquivos em ${path.relative(process.cwd(), OUT) || OUT} · ${visiveis.length} produtos · ${colecoes.length} coleções · ${ctx.paginas.length} páginas · ${ctx.artigos.length} artigos · ${Date.now() - t0}ms`);
