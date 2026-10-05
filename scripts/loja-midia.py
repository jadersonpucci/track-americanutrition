#!/usr/bin/env python3
"""Tira a loja do CDN da Shopify: copia imagens e vídeos para o Storage próprio e reescreve os links.

Destino: bucket `imagens`, pasta `loja/…`, servido por https://cdn.americanutrition.com/imagens/loja/…
(Cloudflare na frente, cache de 1 ano). Imagens ganham também versões WebP de 300/600/1000/1600 px
(`loja/w600/files/foto.webp`), geradas pelo redimensionador do Supabase na hora da cópia — o site
usa a largura certa sem depender de redimensionamento em tempo real.

Varre: loja/data/loja.json, loja/data/html/*.html e o logo/favicon do painel.
Depoimentos em vídeo ficam com um MP4 só (720p, ou o mais próximo), sem HLS da Shopify.

Uso (Mac):
    python3 scripts/loja-midia.py plano                 # o que falta copiar
    python3 scripts/loja-midia.py migrar --chave XXXX   # copia (retomável; registra em loja/data/midia.json)
    python3 scripts/loja-midia.py reescrever            # troca os links nos dados (só os já copiados)
A cópia passa pelo fluxo n8n "Loja · Migrar mídia da Shopify" (POST /webhook/loja-migrar-midia).
"""
import argparse, concurrent.futures as cf, glob, json, os, re, sys, time, urllib.parse, urllib.request

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DADOS = os.path.join(RAIZ, 'loja', 'data')
REGISTRO = os.path.join(DADOS, 'midia.json')
WEBHOOK = 'https://n8n.americanutrition.com/webhook/loja-migrar-midia'
CDN = 'https://cdn.americanutrition.com/imagens/'
RENDER = 'https://supabase.americanutrition.com/storage/v1/render/image/public/imagens/'
LARGURAS = [300, 600, 1000, 1600]
RASTER = {'jpg', 'jpeg', 'png', 'webp'}

# URLs da Shopify: cdn.shopify.com/s/files/1/0643/9000/4908/…, (www.)americanutrition.com/cdn/shop/…, /cdn/shop/… relativo
URL_RE = re.compile(r'''(?:(?:https?:)?//(?:cdn\.shopify\.com|(?:www\.)?americanutrition\.com|39c4f8-2\.myshopify\.com)|(?<=["'(\s,=]))'''
                    r'''(/s/files/1/0643/9000/4908/[^\s"'<>)\\,]+|/cdn/shop/[^\s"'<>)\\,]+|/videos/c/[^\s"'<>)\\,]+)''')


def arquivos():
    fs = [os.path.join(DADOS, 'loja.json')] + sorted(glob.glob(os.path.join(DADOS, 'html', '*.html')))
    fs += [os.path.join(RAIZ, 'loja', 'admin', 'app.js'), os.path.join(RAIZ, 'loja', 'admin', 'index.html')]
    return fs


def chave(caminho):
    """/cdn/shop/files/x.jpg?v=1&width=300 → ('files/x.jpg', {'v': '1', 'width': '300'})"""
    p, _, q = caminho.partition('?')
    q = q.replace('&amp;', '&')
    p = re.sub(r'^/s/files/1/0643/9000/4908/', '/', p)
    p = re.sub(r'^/cdn/shop/', '/', p)
    p = re.sub(r'^/t/\d+/assets/', '/tema/', p)
    p = re.sub(r'^/videos/c/(?:vp|o/v)/', '/videos/', p)
    p = urllib.parse.unquote(p).lstrip('/')
    return p, dict(urllib.parse.parse_qsl(q))


def destino(k):
    seguro = re.sub(r'[^A-Za-z0-9._/-]', '_', k)
    return 'loja/' + seguro


def origem(caminho):
    p = caminho.partition('?')[0]
    if p.startswith('/videos/'):
        return 'https://cdn.shopify.com' + p
    if p.startswith('/s/files/'):
        return 'https://cdn.shopify.com' + p
    return 'https://www.americanutrition.com' + p


def ext(k):
    return k.rsplit('.', 1)[-1].lower() if '.' in k.rsplit('/', 1)[-1] else ''


def simplificar_depoimentos(d):
    """Um MP4 por depoimento (720p, senão o mais perto disso); sem HLS."""
    for dep in d.get('depoimentos') or []:
        fs = [f for f in dep.get('fontes') or [] if (f.get('url') or '').split('?')[0].endswith('.mp4')]
        if not fs:
            continue
        fs.sort(key=lambda f: abs((f.get('altura') or 720) - 720))
        dep['fontes'] = [fs[0]]
        dep['video'] = fs[0]['url']


def plano():
    achados = {}   # caminho original (com query) → (chave, query)
    for f in arquivos():
        txt = open(f, encoding='utf-8').read().replace('\\/', '/')
        if f.endswith('loja.json'):
            d = json.loads(txt)
            simplificar_depoimentos(d)
            txt = json.dumps(d, ensure_ascii=False)
        for m in URL_RE.finditer(txt):
            achados[m.group(1)] = chave(m.group(1))
    # HLS (.m3u8) vira o MP4 do mesmo vídeo quando houver; o resto é copiado
    chaves = {}
    for cam, (k, q) in achados.items():
        if k.endswith('.m3u8'):
            continue
        chaves.setdefault(k, cam)
    tarefas = []
    for k, cam in sorted(chaves.items()):
        d = destino(k)
        tarefas.append({'src': origem(cam), 'path': d, 'chave': k})
        if ext(k) in RASTER:
            base = d[len('loja/'):].rsplit('.', 1)[0]
            for w in LARGURAS:
                tarefas.append({'src': f'{RENDER}{d}?width={w}&resize=contain', 'accept': 'image/webp', 'path': f'loja/w{w}/{base}.webp', 'depois': d})
    return achados, tarefas


def registro():
    try:
        return json.load(open(REGISTRO, encoding='utf-8'))
    except Exception:
        return {'copiados': {}}


def enviar(chave_api, lote):
    corpo = json.dumps({'k': chave_api, 'itens': [{x: t[x] for x in ('src', 'path', 'accept') if t.get(x)} for t in lote]}).encode()
    for tent in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(WEBHOOK, data=corpo, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (loja-midia)'}), timeout=600)
            return json.load(r).get('itens') or []
        except Exception as e:
            erro = e
            time.sleep(3 * (tent + 1))
    return [{'path': t['path'], 'ok': False, 'erro': str(erro)} for t in lote]


def migrar(chave_api, paralelo=4, tamanho=6):
    _, tarefas = plano()
    reg = registro()
    feitos = reg['copiados']
    # originais primeiro (as versões redimensionadas leem o original já copiado)
    for fase in ('orig', 'w'):
        pend = [t for t in tarefas if (('depois' in t) == (fase == 'w')) and t['path'] not in feitos]
        if fase == 'w':
            pend = [t for t in pend if t['depois'] in feitos]
        lotes = [pend[i:i + tamanho] for i in range(0, len(pend), tamanho)]
        print(f'{fase}: {len(pend)} arquivos em {len(lotes)} lotes', file=sys.stderr)
        n = 0
        with cf.ThreadPoolExecutor(paralelo) as ex:
            for res in ex.map(lambda l: enviar(chave_api, l), lotes):
                for r in res:
                    if r.get('ok'):
                        feitos[r['path']] = time.strftime('%Y-%m-%dT%H:%M:%S')
                    else:
                        reg.setdefault('erros', {})[r.get('path') or '?'] = r.get('erro')
                n += 1
                if n % 10 == 0 or n == len(lotes):
                    reg['erros'] = {k: v for k, v in (reg.get('erros') or {}).items() if k not in feitos}
                    json.dump(reg, open(REGISTRO, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
                    print(f'  {n}/{len(lotes)} lotes · {len(feitos)} copiados · {len(reg["erros"])} erros', file=sys.stderr)
    return reg


def nova_url(cam, feitos, mp4_por_video):
    k, q = chave(cam)
    if k.endswith('.m3u8'):
        vid = k.split('/')[1] if k.startswith('videos/') else None
        alt = mp4_por_video.get(vid)
        if not alt:
            return None
        k = alt
    d = destino(k)
    if d not in feitos:
        return None
    w = int(q['width']) if q.get('width', '').isdigit() else None
    if w and ext(k) in RASTER:
        alvo = next((x for x in LARGURAS if x >= w), None)
        base = d[len('loja/'):].rsplit('.', 1)[0]
        if alvo and f'loja/w{alvo}/{base}.webp' in feitos:
            return f'{CDN}loja/w{alvo}/{base}.webp'
    return CDN + d


def reescrever():
    reg = registro()
    feitos = reg['copiados']
    _, tarefas = plano()
    # MP4 que substitui o HLS de cada vídeo: o mais perto de 720p
    mp4_por_video = {}
    for t in tarefas:
        k = t.get('chave') or ''
        if k.startswith('videos/') and k.endswith('.mp4') and t['path'] in feitos:
            vid = k.split('/')[1]
            alt = int((re.search(r'(\d{3,4})p', k) or [0, 720])[1])
            atual = mp4_por_video.get(vid)
            if not atual or abs(alt - 720) < abs(int((re.search(r'(\d{3,4})p', atual) or [0, 720])[1]) - 720):
                mp4_por_video[vid] = k
    faltou = set()
    for f in arquivos():
        txt = open(f, encoding='utf-8').read()
        if f.endswith('loja.json'):
            d = json.loads(txt)
            simplificar_depoimentos(d)
            txt = json.dumps(d, ensure_ascii=False, indent=1)

        def troca(m):
            inteiro, cam = m.group(0), m.group(1)
            u = nova_url(cam.replace('\\/', '/'), feitos, mp4_por_video)
            if not u:
                faltou.add(cam)
                return inteiro
            return u.replace('/', '\\/') if '\\/' in cam else u
        novo = URL_RE.sub(troca, txt)
        if novo != txt:
            open(f, 'w', encoding='utf-8').write(novo)
            print('reescrito:', os.path.relpath(f, RAIZ), file=sys.stderr)
    print(f'links sem cópia (ficaram como estavam): {len(faltou)}', file=sys.stderr)
    for c in sorted(faltou)[:20]:
        print('  ', c, file=sys.stderr)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('acao', choices=['plano', 'migrar', 'reescrever'])
    ap.add_argument('--chave', default=os.environ.get('LOJA_MIDIA_CHAVE'))
    ap.add_argument('--paralelo', type=int, default=4)
    a = ap.parse_args()
    if a.acao == 'plano':
        achados, tarefas = plano()
        feitos = registro()['copiados']
        orig = [t for t in tarefas if 'depois' not in t]
        print(f'{len(achados)} links → {len(orig)} arquivos ({sum(1 for t in orig if t["path"].endswith(".mp4"))} vídeos) + {len(tarefas) - len(orig)} versões redimensionadas')
        print(f'já copiados: {sum(1 for t in tarefas if t["path"] in feitos)} de {len(tarefas)}')
    elif a.acao == 'migrar':
        if not a.chave:
            sys.exit('informe --chave (ou LOJA_MIDIA_CHAVE)')
        migrar(a.chave, a.paralelo)
    else:
        reescrever()
