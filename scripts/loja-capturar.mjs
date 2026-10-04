#!/usr/bin/env node
// Captura a loja Shopify atual para o importador (scripts/loja-importar.py).
// Usa um navegador de verdade (Playwright) porque o Cloudflare da loja bloqueia downloads diretos,
// e vai devagar para não tomar 429. Rodar de novo só baixa o que faltou.
//
//   npm i -D playwright && npx playwright install chromium
//   node scripts/loja-capturar.mjs ./captura
//   python3 scripts/loja-importar.py --captura ./captura
//
// Também é preciso, dentro de ./captura: index.json (templates/index.json do tema, Shopify → Temas → Editar código),
// data/depoimentos.json (metaobjects "depoimento") e data/avaliacoes.json ({handle: [nota, total]}).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIR = path.resolve(process.argv[2] || 'captura');
const BASE = 'https://www.americanutrition.com';
fs.mkdirSync(path.join(DIR, 'raw'), { recursive: true });
fs.mkdirSync(path.join(DIR, 'data'), { recursive: true });
const nome = (u) => u.replace(/^\//, '').replace(/[\/?=&.]/g, '_');

const b = await chromium.launch();
const p = await (await b.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36' })).newPage();
await p.route('**/*', (r) => (['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()));

async function baixar(u, destino) {
  if (fs.existsSync(destino)) return fs.readFileSync(destino, 'utf8');
  for (let t = 0; t < 5; t++) {
    let st = 0, body = '';
    try { const r = await p.goto(BASE + u, { waitUntil: 'domcontentloaded', timeout: 60000 }); st = r.status(); body = await r.text(); } catch (e) { body = String(e); }
    if (/Just a moment|Verifying your connection/.test(body.slice(0, 3000))) { await p.waitForTimeout(10000); body = await p.content(); st = /Just a moment|Verifying/.test(body.slice(0, 3000)) ? 403 : 200; }
    console.log(st, u);
    if (st === 200) { fs.writeFileSync(destino, body.startsWith('<html') && u.endsWith('.json') ? await p.evaluate(() => document.body.innerText) : body); await p.waitForTimeout(2500); return fs.readFileSync(destino, 'utf8'); }
    if (st === 404) return null;
    await p.waitForTimeout(15000 * (t + 1));
  }
  return null;
}

const json = async (u, arq) => JSON.parse(await baixar(u, path.join(DIR, 'data', arq)));
fs.writeFileSync(path.join(DIR, 'home.html'), (await baixar('/', path.join(DIR, 'raw', 'home.html'))) || '');
const prods = (await json('/products.json?limit=250', 'products.json_limit_250')).products;
const cols = (await json('/collections.json?limit=250', 'collections.json_limit_250')).collections;
const pags = (await json('/pages.json', 'pages.json')).pages;
const smap = await baixar('/sitemap_blogs_1.xml', path.join(DIR, 'data', 'sitemap_blogs_1.xml'));
const blog = [...(smap || '').matchAll(/<loc>https:\/\/www\.americanutrition\.com([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = [
  ...prods.map((x) => '/products/' + x.handle), ...cols.map((c) => '/collections/' + c.handle), '/collections/all',
  ...cols.map((c) => '/collections/' + c.handle + '/products.json'), ...pags.map((g) => '/pages/' + g.handle),
  ...['refund-policy', 'privacy-policy', 'terms-of-service', 'shipping-policy', 'contact-information', 'legal-notice'].map((x) => '/policies/' + x),
  ...blog,
];
for (const u of urls) await baixar(u, path.join(DIR, 'raw', nome(u) + '.html'));
await b.close();
console.log('ok:', urls.length, 'URLs em', DIR);
