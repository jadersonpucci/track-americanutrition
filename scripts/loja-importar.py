#!/usr/bin/env python3
"""Converte a captura da loja Shopify (scripts/loja-capturar.mjs) nos dados da loja própria.

Entrada (pasta da captura, padrão ./captura):
  raw/*.html                      HTML renderizado de cada URL (produtos, coleções, páginas, blog, home)
  data/products.json_limit_250    /products.json da Shopify (ids de produto e variante preservados)
  data/collections.json_limit_250 /collections.json
  data/pages.json                 /pages.json
  data/depoimentos.json           metaobjects "depoimento" (Storefront API)
  home.html                       home renderizada
  index.json                      templates/index.json do tema (seções da home)

Saída (loja/data):
  loja.json      catálogo, coleções, páginas, blog, home, configurações
  html/*.html    landing pages próprias (seções customizadas copiadas do HTML renderizado)

Uso (Mac):  python3 scripts/loja-importar.py --captura ./captura
"""
import argparse, html as H, json, os, re, sys
from datetime import datetime, timezone

ap = argparse.ArgumentParser()
ap.add_argument('--captura', default='captura')
ap.add_argument('--saida', default=os.path.join(os.path.dirname(__file__), '..', 'loja', 'data'))
args = ap.parse_args()
CAP, OUT = args.captura, os.path.abspath(args.saida)
os.makedirs(os.path.join(OUT, 'html'), exist_ok=True)
for f in os.listdir(os.path.join(OUT, 'html')): os.remove(os.path.join(OUT, 'html', f))

def rd(p):
    with open(os.path.join(CAP, p), encoding='utf-8') as f: return f.read()
def rj(p):
    with open(os.path.join(CAP, p), encoding='utf-8') as f: return json.load(f)
def raw(url):
    p = os.path.join(CAP, 'raw', url.lstrip('/').replace('/', '_').replace('?', '_').replace('=', '_').replace('&', '_').replace('.', '_') + '.html')
    return open(p, encoding='utf-8').read() if os.path.exists(p) else None
def put_html(nome, conteudo):
    with open(os.path.join(OUT, 'html', nome + '.html'), 'w', encoding='utf-8') as f: f.write(conteudo)
    return 'html/' + nome + '.html'
def txt(s):
    return H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s or ''))).strip()

# ---------------------------------------------------------------- seções
SEC_RE = re.compile(r'<div id="shopify-section-([^"]+)" class="([^"]*)">')

def secoes(doc, ini, fim):
    """Lista [(id, classes, html)] das seções entre os offsets ini e fim."""
    pos = [(m.start(), m.group(1), m.group(2)) for m in SEC_RE.finditer(doc, ini, fim)]
    out = []
    for i, (p, sid, cls) in enumerate(pos):
        q = pos[i + 1][0] if i + 1 < len(pos) else fim
        out.append((sid, cls, doc[p:q].rstrip()))
    return out

def fechar_div(h):
    """Corta o html da seção no </div> que fecha o wrapper shopify-section."""
    depth, i = 0, 0
    for m in re.finditer(r'<(/?)div\b[^>]*>', h):
        depth += -1 if m.group(1) else 1
        if depth == 0: return h[:m.end()]
    return h

def secoes_template(doc):
    a = doc.find('<main class="main-content'); b = doc.find('</main>', a)
    if a < 0: return []
    return [(sid.split('__')[-1], cls, fechar_div(h)) for sid, cls, h in secoes(doc, a, b) if sid.startswith('template--')]

def limpar_secao(h):
    # tira atributos de editor/Shopify que não fazem sentido fora da plataforma
    h = re.sub(r'\s+data-shopify-editor-[a-z-]+="[^"]*"', '', h)
    h = h.replace('//www.americanutrition.com/cdn/shop/', 'https://www.americanutrition.com/cdn/shop/')
    h = re.sub(r'(["\'(\s])//cdn\.shopify\.com/', r'\1https://cdn.shopify.com/', h)
    return h

def landing(doc):
    """HTML das seções do template (a página toda é seção customizada)."""
    return '\n'.join(limpar_secao(h) for _, _, h in secoes_template(doc))

# ---------------------------------------------------------------- produtos
P = rj('data/products.json_limit_250')['products']
# avaliações (metafields reviews.rating / reviews.rating_count do Judge.me), exportadas à parte
AVAL = rj('data/avaliacoes.json') if os.path.exists(os.path.join(CAP, 'data/avaliacoes.json')) else {}
rating_re = re.compile(r'"aggregateRating"\s*:\s*\{[^}]*"ratingValue"\s*:\s*"?([\d.]+)"?[^}]*"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)')
produtos = []
for p in P:
    doc = raw('/products/' + p['handle'])
    land, aval = None, None
    if doc:
        land = put_html('produto-' + p['handle'], landing(doc))
        m = rating_re.search(doc)
        if m: aval = {'nota': float(m.group(1)), 'total': int(m.group(2))}
        if not aval:
            m = re.search(r'data-average-rating=["\']([\d.]+)["\'][^>]*data-number-of-reviews=["\'](\d+)', doc)
            if m: aval = {'nota': float(m.group(1)), 'total': int(m.group(2))}
    if p['handle'] in AVAL: aval = {'nota': AVAL[p['handle']][0], 'total': AVAL[p['handle']][1]}
    seo_t = seo_d = None
    if doc:
        m = re.search(r'<title>(.*?)</title>', doc, re.S); seo_t = H.unescape(m.group(1).strip()) if m else None
        m = re.search(r'<meta name="description" content="([^"]*)"', doc); seo_d = H.unescape(m.group(1)) if m else None
    produtos.append({
        'id': str(p['id']), 'handle': p['handle'], 'titulo': p['title'], 'descricao_html': p['body_html'] or '',
        'tipo': p['product_type'], 'fornecedor': p['vendor'], 'tags': p['tags'], 'status': 'ativo',
        'opcoes': [{'nome': o['name'], 'valores': o['values']} for o in p['options']],
        'imagens': [{'id': str(i['id']), 'url': i['src'], 'alt': i.get('alt') or p['title'], 'largura': i.get('width'), 'altura': i.get('height'), 'variantes': [str(v) for v in i.get('variant_ids') or []]} for i in p['images']],
        'variantes': [{
            'id': str(v['id']), 'titulo': v['title'], 'opcoes': [x for x in (v.get('option1'), v.get('option2'), v.get('option3')) if x],
            'preco': float(v['price']), 'preco_comparacao': float(v['compare_at_price']) if v.get('compare_at_price') and float(v['compare_at_price']) > float(v['price']) else None,
            'sku': v.get('sku') or '', 'disponivel': bool(v.get('available')), 'estoque': None, 'peso_g': v.get('grams') or 0,
            'imagem': str(v['featured_image']['id']) if v.get('featured_image') else None,
        } for v in p['variants']],
        'avaliacao': aval, 'landing': land,
        'seo': {'titulo': seo_t, 'descricao': seo_d},
        'criado_em': p['created_at'], 'publicado_em': p['published_at'], 'atualizado_em': p['updated_at'],
    })
print(f'produtos: {len(produtos)} ({sum(1 for x in produtos if x["landing"])} com landing)')

# ---------------------------------------------------------------- coleções
def vazio(h):
    if re.search(r'<(img|video|iframe|form)\b', h): return False
    return not txt(re.sub(r'<(style|script)\b.*?</\1>', '', h, flags=re.S))
C = rj('data/collections.json_limit_250')['collections']
colecoes = []
for c in C:
    hs = []
    try:
        hs = [x['handle'] for x in json.loads(raw('/collections/' + c['handle'] + '/products.json') or '{"products":[]}')['products']]
    except Exception: pass
    if not hs:
        doc = raw('/collections/' + c['handle']) or ''
        for h in re.findall(r'href="/(?:collections/[^/"]+/)?products/([a-z0-9-]+)', doc):
            if h not in hs: hs.append(h)
    # coleções com template próprio (ex.: "Linha completa" em /collections/america-nutrition): guarda a landing
    land = None
    doc = raw('/collections/' + c['handle'])
    if doc:
        STD_COL = ('main-collection-banner', 'main-collection', 'rich_text', 'rich-text', 'images-with-text-overlay', 'image-banner', 'slideshow')
        custom = [h for sid, _, h in secoes_template(doc) if not sid.startswith(STD_COL) and not vazio(h)]
        if custom: land = put_html('colecao-' + c['handle'], '\n'.join(limpar_secao(h) for h in custom))
    colecoes.append({'id': str(c['id']), 'handle': c['handle'], 'titulo': c['title'], 'descricao_html': c.get('body_html') or '',
                     'imagem': (c.get('image') or {}).get('src'), 'produtos': hs, 'ordem': 'manual', 'publicado_em': c.get('published_at'), 'landing': land})
print(f'coleções: {len(colecoes)}')

# ---------------------------------------------------------------- páginas
G = rj('data/pages.json')['pages']
STD_PAGE = {'main', 'main-page', 'main_page', 'empty-space', 'contact-form'}
def vazio(h):
    if re.search(r'<(img|video|iframe|form)\b', h): return False
    return not txt(re.sub(r'<(style|script)\b.*?</\1>', '', h, flags=re.S))
paginas = []
for g in G:
    doc = raw('/pages/' + g['handle'])
    land, corpo, legado = None, g['body_html'] or '', False
    if doc:
        secs = secoes_template(doc)
        custom = [(sid, h) for sid, _, h in secs if sid not in STD_PAGE and not vazio(h)]
        if g['handle'] == 'contact':
            # formulário de contato da Shopify não existe aqui: vira texto + canais de atendimento
            corpo = ''.join(h for sid, h in custom if sid == 'rich-text') and corpo
            custom = []
        if custom:
            # seções padrão do Concept (featured_product, rich_text…) só existem em páginas de campanha antigas
            legado = any(not re.search(r'custom_liquid|_lp$|^an[_-]|combo|depoimentos', sid) for sid, _ in custom)
            land = put_html('pagina-' + g['handle'], '\n'.join(limpar_secao(h) for _, h in custom))
        elif not secs:
            # templates .liquid (sem seções): o conteúdo é o <main> inteiro
            a = doc.find('<main class="main-content'); b = doc.find('</main>', a)
            if a >= 0:
                inner = doc[doc.find('>', a) + 1:b]
                if not vazio(inner): land = put_html('pagina-' + g['handle'], limpar_secao(inner))
    paginas.append({'id': str(g['id']), 'handle': g['handle'], 'titulo': g['title'], 'corpo_html': corpo,
                    'landing': land, 'legado': legado, 'publicado_em': g.get('published_at'), 'atualizado_em': g.get('updated_at')})
for pol, titulo in [('refund-policy', 'Política de reembolso'), ('privacy-policy', 'Política de privacidade'), ('terms-of-service', 'Termos de serviço'),
                    ('shipping-policy', 'Política de frete'), ('contact-information', 'Informações de contato'), ('legal-notice', 'Aviso legal')]:
    doc = raw('/policies/' + pol)
    corpo = ''
    if doc:
        m = re.search(r'<div class="shopify-policy__body">\s*<div class="rte">(.*?)</div>\s*</div>', doc, re.S)
        corpo = m.group(1).strip() if m else ''
    paginas.append({'id': 'policy-' + pol, 'handle': pol, 'titulo': titulo, 'corpo_html': corpo, 'landing': None, 'politica': True})
print(f'páginas: {len(paginas)} ({sum(1 for x in paginas if x["landing"])} com landing)')

# ---------------------------------------------------------------- blog
blogs, artigos = {}, []
locs = re.findall(r'<loc>https://www\.americanutrition\.com(/blogs/[^<]+)</loc>', rd('data/sitemap_blogs_1.xml')) if os.path.exists(os.path.join(CAP, 'data/sitemap_blogs_1.xml')) else []
for u in locs:
    parts = u.strip('/').split('/')
    doc = raw(u)
    if len(parts) == 2:
        t = re.search(r'<title>(.*?)</title>', doc or '', re.S)
        blogs[parts[1]] = {'handle': parts[1], 'titulo': H.unescape(t.group(1).split('–')[0].strip()) if t else parts[1].replace('-', ' ').title()}
        continue
    if not doc: continue
    meta = lambda n: (re.search(r'<meta (?:property|name)="' + n + r'" content="([^"]*)"', doc) or [None, None])[1]
    m = re.search(r'<div class="rte[^"]*"[^>]*itemprop="articleBody"[^>]*>(.*?)</div>\s*(?:</div>|<div class="article)', doc, re.S) \
        or re.search(r'<div[^>]+class="[^"]*article-template__content[^"]*"[^>]*>(.*?)</div>\s*</div>', doc, re.S) \
        or re.search(r'itemprop="articleBody"[^>]*>(.*?)</div>', doc, re.S)
    corpo = m.group(1).strip() if m else ''
    titulo = H.unescape(meta('og:title') or parts[2])
    img = meta('og:image')
    if img and img.startswith('http:'): img = 'https:' + img[5:]
    data = (re.search(r'"datePublished"\s*:\s*"([^"]+)"', doc) or [None, None])[1] or meta('article:published_time')
    autor = (re.search(r'"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"', doc) or [None, None])[1]
    tags = re.findall(r'href="/blogs/[^/]+/tagged/[^"]+"[^>]*>([^<]+)<', doc)
    artigos.append({'id': parts[1] + '/' + parts[2], 'blog': parts[1], 'handle': parts[2], 'titulo': titulo,
                    'resumo': H.unescape(meta('description') or ''), 'corpo_html': limpar_secao(corpo), 'imagem': img,
                    'autor': autor, 'tags': sorted(set(t.strip() for t in tags)), 'publicado_em': data})
    blogs.setdefault(parts[1], {'handle': parts[1], 'titulo': parts[1].replace('-', ' ').title()})
artigos.sort(key=lambda a: a['publicado_em'] or '', reverse=True)
print(f'blogs: {len(blogs)}  artigos: {len(artigos)} ({sum(1 for a in artigos if a["corpo_html"])} com corpo)')

# ---------------------------------------------------------------- home
home = rd('home.html')
idx = rj('index.json')
render = {sid.split('__')[-1]: h for sid, _, h in secoes_template(home)}
NATIVAS = {'rich-text', 'collection-list', 'featured-collections', 'scrolling-text', 'video-with-text-overlay', 'featured-product',
           'collage-grid', 'blog-posts-collage', 'hero-rotativo', 'an-outubro-rosa', 'slideshow', 'product-bundle', 'custom-liquid'}
secs, ordem = {}, []
for key in idx['order']:
    s = idx['sections'][key]
    if s.get('disabled'): continue
    tipo = s['type']
    blocos = [{'id': bid, 'tipo': b['type'], 'config': b.get('settings', {}), 'nome': b.get('name')}
              for bid in s.get('block_order', list((s.get('blocks') or {}).keys())) for b in [s['blocks'][bid]] if not b.get('disabled')]
    item = {'tipo': tipo, 'config': s.get('settings', {}), 'blocos': blocos}
    if tipo == 'custom-liquid' or tipo not in NATIVAS:
        # liquid não roda fora da Shopify: guarda o HTML já renderizado
        item = {'tipo': 'html', 'config': {'titulo': key}, 'blocos': [], 'html': limpar_secao(render.get(key, ''))}
        if not item['html']: continue
    else:
        # referências shopify:// viram URLs reais (imagens da loja e vídeos já renderizados)
        rend = render.get(key, '')
        videos = ['https:' + v if v.startswith('//') else v for v in re.findall(r'<source src="([^"]+\.mp4[^"]*)"', rend)]
        posters = ['https:' + v if v.startswith('//') else v for v in re.findall(r'<video[^>]*poster="([^"]+)"', rend)]
        def resolve(d):
            for k2, v in list(d.items()):
                if isinstance(v, str) and v.startswith('shopify://shop_images/'):
                    d[k2] = 'https://www.americanutrition.com/cdn/shop/files/' + v.split('/', 3)[-1]
                elif isinstance(v, str) and v.startswith('shopify://files/videos/') and videos:
                    d[k2 + '_src'] = videos.pop(0)
                    if posters: d[k2 + '_poster'] = posters.pop(0)
        resolve(item['config'])
        for b in item['blocos']: resolve(b['config'])
    secs[key] = item; ordem.append(key)
print(f'home: {len(ordem)} seções ({", ".join(secs[k]["tipo"] for k in ordem)})')

# ---------------------------------------------------------------- layout (cabeçalho, rodapé, scripts)
def grupo(doc, nome):
    a = doc.find('<!-- BEGIN sections: ' + nome + ' -->'); b = doc.find('<!-- END sections: ' + nome + ' -->', a)
    return secoes(doc, a, b) if a >= 0 else []
hdr = {sid.split('__')[-1]: fechar_div(h) for sid, _, h in grupo(home, 'header-group')}
ftr = {sid.split('__')[-1]: fechar_div(h) for sid, _, h in grupo(home, 'footer-group')}
header_html = '\n'.join(limpar_secao(h) for k, h in hdr.items() if k.startswith('custom_liquid'))
footer_html = '\n'.join(limpar_secao(h) for k, h in ftr.items())

ann = hdr.get('announcement-bar', '')
mensagens = []
for m in re.finditer(r'<p class="announcement-text([^"]*)">(.*?)</p>', ann, re.S):
    t = txt(m.group(2))
    if 'md:hidden' in m.group(1): continue
    if t and t not in mensagens: mensagens.append(t)
cor = re.search(r'--gradient-background:\s*(#[0-9A-Fa-f]{6})', ann)

# scripts próprios da America Nutrition (atribuição, afiliados, checkout, Serena) e tags de marketing
SHOPIFY_MARK = ('window.Shopify', 'Shopify.', 'ShopifyAnalytics', 'jdgm', 'trekkie', 'TREKKIE', 'wpmLoader', 'klaviyoReviews', 'customDocumentWrite',
                'window.theme', 'performance.mark', "classList.replace('no-js'", 'ontouchstart', '__st=', 'session_token_from_headers', 'PaypalV4', 'shopify-features',
                'o.Shopify', 'shopify:webmcp', "const t='contact'", 'Shopify=Shopify')
SHOPIFY_SRC = ('cdn.shopify.com', 'shopifycloud', '/cdn/shop/t/', 'myshopify', '/checkouts/', 'cdn/wpm')
head_end = home.find('</head>')
scripts_head = []
for m in re.finditer(r'<script([^>]*)>(.*?)</script>', home[:head_end], re.S):
    attrs, body = m.group(1), m.group(2)
    src = re.search(r'src="([^"]+)"', attrs)
    if src:
        if any(d in src.group(1) for d in ('googletagmanager.com/gtag', 'utmify', 'klaviyo.com/onsite')): scripts_head.append(m.group(0))
        continue
    if 'application/ld+json' in attrs or 'application/json' in attrs or 'captcha' in attrs: continue
    if any(k in body for k in SHOPIFY_MARK): continue
    scripts_head.append(m.group(0).strip())
# depois do rodapé: scripts e botões flutuantes próprios (WhatsApp Serena, Telegram, checkout, afiliados)
f_end = home.find('<!-- END sections: footer-group -->')
tail = home[f_end:home.rfind('</body>')]
k = tail.find('</ul>'); tail = tail[k + 5:] if k >= 0 else tail
def tira(m):
    src = re.search(r'src="([^"]+)"', m.group(1))
    if src and any(d in src.group(1) for d in SHOPIFY_SRC): return ''
    if not src and any(x in m.group(2) for x in SHOPIFY_MARK): return ''
    return m.group(0)
tail = re.sub(r'<script([^>]*)>(.*?)</script>', tira, tail, flags=re.S)
scripts_body = [tail.strip()]
print(f'scripts: head {len(scripts_head)}  rodapé {len(scripts_body[0])} bytes')

def banner_de(doc):
    m = re.search(r'main-collection-banner.*?<img[^>]+src="([^"?]+)', doc or '', re.S)
    return ('https:' + m.group(1)) if m and m.group(1).startswith('//') else (m.group(1) if m else None)
banner_all = banner_de(raw('/collections/all'))
for c in colecoes:
    c['banner'] = banner_de(raw('/collections/' + c['handle']))

def logo(cls):
    m = re.search(r'<img src="([^"?]+)[^"]*"[^>]*class="' + cls, hdr.get('header', ''))
    return ('https:' + m.group(1)) if m and m.group(1).startswith('//') else (m.group(1) if m else None)

config = {
    'nome': 'America Nutrition',
    'dominio': 'https://www.americanutrition.com',
    'titulo_home': (re.search(r'<title>(.*?)</title>', home, re.S).group(1).strip()),
    'descricao_home': H.unescape((re.search(r'<meta name="description" content="([^"]*)"', home) or [None, ''])[1]),
    'og_imagem': 'https://cdn.americanutrition.com/imagens/og/og-home.jpg',
    'logo': logo('logo hidden') or 'https://www.americanutrition.com/cdn/shop/files/LOGOTIPO_COLORIDO_FUNDO_TRANSPARENTE.png',
    'logo_branco': logo('white-logo') or 'https://www.americanutrition.com/cdn/shop/files/LOGOTIPO_BRANCO_FUNDO_TRANSPARENTE.png',
    'favicon': (re.search(r'<link rel="icon"[^>]*href="([^"]+)"', home) or re.search(r'<link rel="shortcut icon"[^>]*href="([^"]+)"', home) or [None, None])[1],
    'anuncio': {'mensagens': mensagens, 'cor_fundo': cor.group(1) if cor else '#07388E', 'cor_texto': '#FAFAFA', 'velocidade': 5},
    'anuncio_outubro': {'cor_fundo': '#F27FC4'},
    'cores': {'primaria': '#07388E', 'texto': '#171717', 'oferta': '#AD0404', 'fundo': '#FFFFFF'},
    'menu_principal': [{'titulo': 'Início', 'url': '/'}, {'titulo': 'Produtos', 'url': '/collections/america-nutrition'}, {'titulo': 'Combos', 'url': '/pages/combos'},
                       {'titulo': 'Depoimentos', 'url': '/pages/depoimentos'}, {'titulo': 'Blog', 'url': '/blogs/fosfoetanolamina'}, {'titulo': 'Grupo WhatsApp', 'url': 'https://grupo.americanutrition.com'}],
    'social': {'facebook': 'https://facebook.com/ImunoFosfoBrasil', 'instagram': 'http://instagram.com/americanutrition_br',
               'youtube': 'https://www.youtube.com/comunidadeimunofosfo', 'tiktok': 'https://tiktok.com/@imunofosfo'},
    'banner_colecoes': banner_all,
    'frete_gratis_min': 250,
    'checkout_url': 'https://checkout.americanutrition.com/',
    'rastreio_url': 'https://track.americanutrition.com/',
    'carrinho_colecoes': ['imunofosfo', 'linha-suplementos'],
    'header_html': header_html,
    'footer_html': footer_html,
    'scripts_head': '\n'.join(scripts_head),
    'scripts_body': '\n'.join(scripts_body),
}

# ---------------------------------------------------------------- depoimentos
deps = []
for n in rj('data/depoimentos.json'):
    f = {x['key']: x for x in n['fields']}
    ref = (f.get('midia') or {}).get('reference') or {}
    item = {'id': n['id'].split('/')[-1], 'handle': n['handle'], 'tipo': (f.get('tipo') or {}).get('value'), 'tom': (f.get('tom') or {}).get('value'),
            'confianca': float(f['confianca']['value']) if f.get('confianca') and f['confianca'].get('value') else None,
            'produto': ((f.get('produto') or {}).get('reference') or {}).get('handle'), 'atualizado_em': n.get('updatedAt')}
    if ref.get('__typename') == 'Video':
        srcs = ref.get('sources') or []
        mp4 = next((s['url'] for s in srcs if s.get('mimeType') == 'video/mp4'), srcs[0]['url'] if srcs else None)
        item.update({'video': mp4, 'poster': (ref.get('previewImage') or {}).get('url')})
    elif ref.get('__typename') == 'MediaImage':
        im = ref.get('image') or {}
        item.update({'imagem': im.get('url'), 'largura': im.get('width'), 'altura': im.get('height')})
    deps.append(item)
print(f'depoimentos: {len(deps)}')

loja = {'versao': 1, 'gerado_em': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'config': config,
        'produtos': produtos, 'colecoes': colecoes, 'paginas': paginas, 'blogs': list(blogs.values()), 'artigos': artigos,
        'home': {'ordem': ordem, 'secoes': secs}, 'depoimentos': deps,
        'redirects': [{'de': '/stories', 'para': '/'}, {'de': '/collections/vendors', 'para': '/collections/all'}]}
with open(os.path.join(OUT, 'loja.json'), 'w', encoding='utf-8') as f:
    json.dump(loja, f, ensure_ascii=False, indent=1)
print('ok →', os.path.join(OUT, 'loja.json'))
