"""Gera a legenda (.ass) de um depoimento a partir dos timestamps do ElevenLabs.

O TTS devolve, junto com o áudio, o instante de cada caractere falado
(endpoint `/with-timestamps`), então a legenda nasce sincronizada — não há
transcrição no caminho e nomes como "ImunoFosfo" ou "PET Scan" não têm como
sair errados.

Uso:
    python3 gera_legenda_ass.py <offset_segundos> <contorno|caixa> <saida.ass>

O offset é a duração da abertura do locutor: a legenda cobre apenas a fala do
cliente, começando depois dela.

Espera um `align.json` no diretório atual, com o objeto `alignment` da resposta
do ElevenLabs (characters + character_start_times_seconds + ..._end_...).

Posicionamento pensado para o vídeo 1080x1920 do pipeline: a faixa livre entre
a barra do player e o logo do rodapé, que não cobre nenhum elemento do layout.
"""

import json, sys

OFFSET = float(sys.argv[1])          # duracao da abertura do locutor
VARIANTE = sys.argv[2]               # 'contorno' ou 'caixa'
SAIDA = sys.argv[3]

al = json.load(open('align.json'))
ch = al['characters']
st = al['character_start_times_seconds']
en = al['character_end_times_seconds']

# ignora a tag <break .../> que mandamos no texto
texto = ''.join(ch)
ini = texto.find('/>')
ini = 0 if ini < 0 else ini + 2

# reconstroi palavras com tempo
palavras, atual, p_ini, p_fim = [], '', None, None
for i in range(ini, len(ch)):
    c = ch[i]
    if c.isspace():
        if atual:
            palavras.append((atual, p_ini, p_fim)); atual, p_ini = '', None
    else:
        if not atual: p_ini = st[i]
        atual += c; p_fim = en[i]
if atual: palavras.append((atual, p_ini, p_fim))

# agrupa em blocos: primeiro por frase, depois divide frase longa em partes
# equilibradas, cortando de preferencia numa virgula. Evita orfaos.
MAX_CHARS = 50

frases, buf = [], []
for w, a, b in palavras:
    buf.append((w, a, b))
    if w.endswith(('.', '!', '?')):
        frases.append(buf); buf = []
if buf: frases.append(buf)

def divide(fr):
    txt = ' '.join(w for w, _, _ in fr)
    if len(txt) <= MAX_CHARS:
        return [fr]
    n = (len(txt) + MAX_CHARS - 1) // MAX_CHARS      # quantas partes
    alvo = len(txt) / n
    partes, atual, corridos, cortes = [], [], 0, 1
    for i, (w, a, b) in enumerate(fr):
        atual.append((w, a, b)); corridos += len(w) + 1
        if cortes >= n: continue
        virgula = w.endswith((',', ';', ':'))
        passou = corridos >= alvo * cortes
        # corta na virgula assim que estiver perto do alvo, ou no alvo quando nao houver
        if i < len(fr) - 1 and (passou or (virgula and corridos >= alvo * cortes * 0.65)):
            partes.append(atual); atual = []; cortes += 1
    if atual: partes.append(atual)
    return partes

blocos = []
for fr in frases:
    for parte in divide(fr):
        txt = ' '.join(w for w, _, _ in parte)
        blocos.append((txt, parte[0][1], parte[-1][2]))

# funde bloco curto demais com o vizinho, para nao piscar sozinho na tela
i = 0
while i < len(blocos):
    t, a, b = blocos[i]
    if len(t) < 14 and len(blocos) > 1:
        if i > 0 and len(blocos[i-1][0]) + len(t) + 1 <= MAX_CHARS + 8:
            pt, pa, pb = blocos[i-1]
            blocos[i-1] = (pt + ' ' + t, pa, b); blocos.pop(i); continue
        if i + 1 < len(blocos) and len(blocos[i+1][0]) + len(t) + 1 <= MAX_CHARS + 8:
            nt, na, nb = blocos[i+1]
            blocos[i] = (t + ' ' + nt, a, nb); blocos.pop(i+1); continue
    i += 1

def quebra(t):
    # duas linhas equilibradas quando passa de 24 caracteres
    if len(t) <= 24: return t
    meio, melhor, dif = len(t) // 2, None, 999
    for i, c in enumerate(t):
        if c == ' ' and abs(i - meio) < dif:
            dif, melhor = abs(i - meio), i
    return t if melhor is None else t[:melhor] + r'\N' + t[melhor + 1:]

def tc(s):
    s = max(s, 0); h = int(s // 3600); m = int(s % 3600 // 60); seg = s % 60
    return f'{h:d}:{m:02d}:{seg:05.2f}'

if VARIANTE == 'caixa':
    # texto branco sobre faixa escura translucida
    estilo = ('Style: Leg,Montserrat,52,&H00FFFFFF,&H00FFFFFF,&H00201005,&HB4200A00,'
              '-1,0,0,0,100,100,0,0,3,14,0,5,60,60,60,1')
else:
    # texto branco com contorno preto forte
    estilo = ('Style: Leg,Montserrat,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,'
              '-1,0,0,0,100,100,0,0,1,4.5,2,5,60,60,60,1')

cab = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
{estilo}

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""

linhas = []
for t, a, b in blocos:
    # \an5 + \pos: faixa livre entre o circulo do produto e os controles do player
    linhas.append(f'Dialogue: 0,{tc(a + OFFSET)},{tc(b + OFFSET)},Leg,,0,0,0,,'
                  f'{{\\an5\\pos(540,1300)\\fad(120,120)}}{quebra(t)}')

open(SAIDA, 'w', encoding='utf-8').write(cab + '\n'.join(linhas) + '\n')
print(f'{SAIDA}: {len(blocos)} blocos, de {blocos[0][1]+OFFSET:.1f}s a {blocos[-1][2]+OFFSET:.1f}s')
for t, a, b in blocos[:4]:
    print(f'   {a+OFFSET:5.1f}-{b+OFFSET:5.1f}  {t}')
