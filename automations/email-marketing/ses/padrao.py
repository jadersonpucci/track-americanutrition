# Padrao visual dos emails da America Nutrition ("Modelo 2 · Marca forte", aprovado em 05/11/2026).
# Gera os modelos em ses/templates/<slug>.html e o catalogo ses/produtos.sql. Rodar: python3 padrao.py
# Variaveis trocadas no envio: {{ nome }} (primeiro nome) e {{ link_descadastro }}.
# Layout fluid-hybrid (colunas em inline-block com max-width): empilha no celular mesmo sem media query.
import os

NAVY, NAVY2, RED, GREEN, INK, MUTED = "#07388E", "#1656C9", "#AD0404", "#25D366", "#0F1B33", "#4B5565"
T = "font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;"
S = "font-family:'Inter',Arial,Helvetica,sans-serif;"
TB = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
TI = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

CDN = "https://cdn.shopify.com/s/files/1/0643/9000/4908/files/"
LOGO_W = CDN + "an-logo-branco-email.png?v=1793847024"
IMG = {
    "imuno": CDN + "ImunoFosfo_90_C_psulas.jpg?v=1771893996&width=600",
    "omega": CDN + "Mockup---Omega3-2025.jpg?v=1750164299&width=600",
    "propolis": CDN + "Mockup---Propolis-Verde-2025.jpg?v=1750164799&width=600",
    "pet": CDN + "mockup-imunopet.jpg?v=1774835522&width=600",
    "d3": CDN + "Mockup---Vitamin-D3.jpg?v=1757015071&width=600",
}
SITE = "https://americanutrition.com"
PROD = SITE + "/products/imunofosfo"
DEP = SITE + "/pages/depoimentos"
SERENA = "https://wa.me/16462068419"
SERENA_PROTO = SERENA + "?text=Ol%C3%A1%20Serena!%20Quero%20meu%20protocolo%20personalizado"
EQUIPE = "https://wa.me/16464270203"
RASTREIO = "https://track.americanutrition.com"
NOME = "{{ nome }}"

# ------------------------------------------------------------------ base
def btn(txt, url, kind="red", full=True):
    bg, fg, bd = {"red": (RED, "#fff", RED), "green": (GREEN, "#fff", GREEN), "white": ("#ffffff", NAVY, "#ffffff"),
                  "ghost": ("transparent", "#ffffff", "#7F9BD6"), "navy": (NAVY, "#fff", NAVY)}[kind]
    w = 'width="100%"' if full else ""
    return (f'<table role="presentation" {w} cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>'
            f'<td align="center" bgcolor="{bg if bg != "transparent" else NAVY}" style="border-radius:999px;background:{bg};border:2px solid {bd};">'
            f'<a href="{url}" style="display:block;padding:14px 26px;{S}font-size:16px;font-weight:700;color:{fg};text-decoration:none;border-radius:999px;">{txt}</a>'
            f'</td></tr></table>')

def row(inner, pad="0 32px 22px"):
    return f'<tr><td class="px" style="padding:{pad};">{inner}</td></tr>'

def card(inner, pad="22px 24px", bg="#ffffff", border="1px solid #E3E8F2", extra=""):
    return (f'<table {TB} style="border-collapse:separate;background:{bg};border:{border};border-radius:16px;{extra}">'
            f'<tr><td style="padding:{pad};">{inner}</td></tr></table>')

def p(txt, size=15, color=MUTED, mb=12, align="left"):
    return f'<div style="{S}font-size:{size}px;line-height:1.65;color:{color};margin:0 0 {mb}px;text-align:{align};">{txt}</div>'

def b(txt):
    return f'<b style="color:{INK};">{txt}</b>'

# ------------------------------------------------------------------ blocos
def hero(label, tag, title, sub, img=None, cta=None, tag_color=RED):
    txt_w = 330 if img else 536
    left = (f'<div class="col" style="display:inline-block;width:100%;max-width:{txt_w}px;vertical-align:middle;">'
            f'<div style="padding:26px 0 30px;">'
            f'<span style="display:inline-block;background:{tag_color};color:#fff;{S}font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:5px 10px;border-radius:6px;">{tag}</span>'
            f'<div class="h1" style="{T}font-size:46px;line-height:46px;font-weight:700;color:#ffffff;margin:14px 0 12px;">{title}</div>'
            f'<div style="{S}font-size:15px;line-height:1.6;color:#C9D6F2;">{sub}</div>'
            + (f'<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>{cta}' if cta else "")
            + '</div></div>')
    right = ""
    if img:
        right = (f'<div class="col" style="display:inline-block;width:100%;max-width:206px;vertical-align:bottom;">'
                 f'<table {TI} align="center" style="border-collapse:separate;margin:0 auto;"><tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px 18px 0 0;padding:14px 14px 0;">'
                 f'<img src="{img}" width="178" alt="" style="display:block;width:178px;height:auto;border:0;"></td></tr></table></div>')
    return (f'<tr><td class="px" bgcolor="{NAVY}" style="background:{NAVY};background-image:radial-gradient(circle at 85% 15%,{NAVY2} 0,{NAVY} 58%);padding:26px 32px 0;">'
            f'<table {TB}><tr><td><img src="{LOGO_W}" width="132" alt="America Nutrition" style="display:block;width:132px;height:auto;border:0;"></td>'
            f'<td align="right" style="{S}font-size:12px;font-weight:700;color:#9DB4E4;letter-spacing:1.2px;text-transform:uppercase;">{label}</td></tr></table>'
            f'<div style="font-size:0;">{left}{right}</div></td></tr>')

def titulo(kicker, title, align="center", pad="30px 32px 16px"):
    return row(f'<div style="{S}font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{RED};text-align:{align};">{kicker}</div>'
               f'<div style="{T}font-size:30px;line-height:32px;font-weight:700;color:{NAVY};text-align:{align};margin-top:6px;">{title}</div>', pad)

def texto(*pars, pad="30px 32px 22px"):
    body = "".join(p(x, mb=(0 if i == len(pars) - 1 else 12)) for i, x in enumerate(pars))
    return row(card(body, "24px 26px"), pad)

def cartoes(items, cols=3):
    """items: (grande, titulo, legenda, texto, cor)"""
    mw = {3: 176, 2: 268}[cols]
    out = ""
    for big, t, cap, d, cor in items:
        out += (f'<div class="col" style="display:inline-block;width:100%;max-width:{mw}px;vertical-align:top;padding:0 4px 10px;box-sizing:border-box;">'
                f'<table {TB} style="border-collapse:separate;background:#fff;border-radius:14px;border:1px solid #E3E8F2;">'
                f'<tr><td height="6" bgcolor="{cor}" style="height:6px;font-size:0;line-height:0;background:{cor};border-radius:14px 14px 0 0;">&nbsp;</td></tr>'
                f'<tr><td style="padding:16px 16px 18px;text-align:left;">'
                + (f'<div style="{T}font-size:36px;font-weight:700;color:{cor};line-height:1;margin-bottom:8px;">{big}</div>' if big else "")
                + f'<div style="{T}font-size:21px;font-weight:700;color:{INK};line-height:1.1;margin:0 0 3px;">{t}</div>'
                + (f'<div style="{S}font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:8px;">{cap}</div>' if cap else "")
                + f'<div style="{S}font-size:13px;line-height:1.55;color:{MUTED};">{d}</div></td></tr></table></div>')
    return f'<tr><td align="center" class="px" style="padding:0 28px 12px;font-size:0;">{out}</td></tr>'

def checklist(title, items, icon="✓", cor="#16A34A"):
    li = "".join(f'<tr><td width="34" valign="top" style="padding:0 0 12px;"><table {TI} style="border-collapse:separate;"><tr><td width="24" height="24" align="center" bgcolor="{cor}" style="width:24px;height:24px;border-radius:12px;{S}font-size:13px;font-weight:700;color:#fff;line-height:24px;">{icon}</td></tr></table></td>'
                 f'<td valign="top" style="padding:2px 0 12px;{S}font-size:15px;line-height:1.5;color:{MUTED};">{x}</td></tr>' for x in items)
    head = f'<div style="{T}font-size:24px;font-weight:700;color:{NAVY};margin-bottom:14px;">{title}</div>' if title else ""
    return row(card(head + f'<table {TB}>{li}</table>', "24px 24px 12px"))

def depoimento(txt, autor, meta=""):
    return row(card(f'<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:60px;line-height:44px;font-weight:700;color:{RED};height:30px;">&ldquo;</div>'
                    f'<div style="{S}font-size:13px;color:#F5A524;letter-spacing:2px;margin:4px 0 8px;">★★★★★</div>'
                    f'<div style="{S}font-size:16px;line-height:1.6;color:{INK};font-style:italic;margin-bottom:14px;">{txt}</div>'
                    f'<div style="{S}font-size:13px;font-weight:700;color:{NAVY};">{autor}</div>'
                    + (f'<div style="{S}font-size:12px;color:#8A94A6;">{meta}</div>' if meta else ""), "22px 26px 24px"))

def depoimentos_grid(items):
    out = ""
    for txt, autor in items:
        out += (f'<div class="col" style="display:inline-block;width:100%;max-width:268px;vertical-align:top;padding:0 4px 10px;box-sizing:border-box;">'
                f'<table {TB} style="border-collapse:separate;background:#fff;border-radius:14px;border:1px solid #E3E8F2;"><tr><td style="padding:18px 18px 20px;text-align:left;">'
                f'<div style="{S}font-size:12px;color:#F5A524;letter-spacing:2px;margin-bottom:8px;">★★★★★</div>'
                f'<div style="{S}font-size:14px;line-height:1.55;color:{INK};font-style:italic;margin-bottom:10px;">&ldquo;{txt}&rdquo;</div>'
                f'<div style="{S}font-size:12px;font-weight:700;color:{NAVY};">{autor}</div></td></tr></table></div>')
    return f'<tr><td align="center" class="px" style="padding:0 28px 12px;font-size:0;">{out}</td></tr>'

def aviso(txt, cor=RED, fg="#ffffff"):
    return row(f'<table {TB} bgcolor="{cor}" style="border-collapse:separate;background:{cor};border-radius:12px;"><tr><td style="padding:15px 18px;{S}font-size:14px;line-height:1.55;color:{fg};">{txt}</td></tr></table>')

def cupom(rotulo, codigo, desc, validade, cta_txt, url, nota=""):
    inner = (f'<div style="{S}font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#9DB4E4;text-align:center;">{rotulo}</div>'
             f'<table {TI} align="center" style="border-collapse:separate;margin:12px auto 12px;"><tr><td style="border:2px dashed #7F9BD6;border-radius:12px;padding:10px 26px;{T}font-size:40px;font-weight:700;letter-spacing:3px;color:#ffffff;text-align:center;">{codigo}</td></tr></table>'
             f'<div style="{T}font-size:24px;font-weight:700;color:#ffffff;text-align:center;line-height:1.2;">{desc}</div>'
             f'<div style="{S}font-size:13px;color:#C9D6F2;text-align:center;margin:4px 0 20px;">{validade}</div>{btn(cta_txt, url)}'
             + (f'<div style="{S}font-size:12px;color:#9DB4E4;text-align:center;margin-top:10px;">{nota}</div>' if nota else ""))
    return row(card(inner, "26px 24px 24px", bg=NAVY, border="0", extra=f"background-image:radial-gradient(circle at 90% 0%,{NAVY2} 0,{NAVY} 60%);"), "28px 32px 22px")

def ficha(rows, title=None):
    tr = "".join(f'<tr><td style="padding:11px 0;border-bottom:1px solid #EEF1F6;">'
                 f'<div style="{S}font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:2px;">{k}</div>'
                 f'<div style="{S}font-size:15px;line-height:1.45;color:{INK};">{v}</div></td></tr>' for k, v in rows)
    head = f'<div style="{T}font-size:24px;font-weight:700;color:{NAVY};margin-bottom:4px;">{title}</div>' if title else ""
    return row(card(head + f'<table {TB}>{tr}</table>', "22px 24px 12px"))

def produtos(items):
    """items: (img, nome, desc, url, botao)"""
    out = ""
    for img, nome, desc, url, bt in items:
        out += (f'<div class="col" style="display:inline-block;width:100%;max-width:268px;vertical-align:top;padding:0 4px 10px;box-sizing:border-box;">'
                f'<table {TB} style="border-collapse:separate;background:#fff;border-radius:14px;border:1px solid #E3E8F2;"><tr><td align="center" style="padding:14px 14px 0;">'
                f'<a href="{url}"><img src="{img}" width="150" alt="{nome}" style="display:block;width:150px;height:auto;border:0;"></a></td></tr>'
                f'<tr><td style="padding:10px 18px 18px;text-align:center;"><div style="{T}font-size:21px;font-weight:700;color:{INK};line-height:1.15;">{nome}</div>'
                f'<div style="{S}font-size:13px;line-height:1.5;color:{MUTED};margin:4px 0 12px;">{desc}</div>{btn(bt, url, "navy")}</td></tr></table></div>')
    return f'<tr><td align="center" class="px" style="padding:0 28px 12px;font-size:0;">{out}</td></tr>'

def canais(items):
    """items: (sigla, cor, nome, desc, botao, url)"""
    out = ""
    for sig, cor, nome, desc, bt, url in items:
        out += (f'<table {TB} style="border-collapse:separate;background:#fff;border-radius:14px;border:1px solid #E3E8F2;margin-bottom:10px;"><tr>'
                f'<td width="64" valign="middle" style="padding:16px 0 16px 16px;"><table {TI} style="border-collapse:separate;"><tr><td width="46" height="46" align="center" bgcolor="{cor}" style="width:46px;height:46px;border-radius:14px;{S}font-size:20px;line-height:46px;color:#fff;font-weight:700;">{sig}</td></tr></table></td>'
                f'<td valign="middle" style="padding:14px 8px;"><div style="{T}font-size:20px;font-weight:700;color:{INK};">{nome}</div><div style="{S}font-size:13px;line-height:1.45;color:{MUTED};">{desc}</div></td>'
                f'<td valign="middle" align="right" style="padding:14px 14px 14px 0;width:1%;"><table {TI} style="border-collapse:separate;"><tr><td bgcolor="{cor}" style="border-radius:999px;background:{cor};"><a href="{url}" style="display:block;padding:9px 16px;{S}font-size:13px;font-weight:700;color:#fff;text-decoration:none;white-space:nowrap;">{bt}</a></td></tr></table></td></tr></table>')
    return row(out, "0 32px 12px")

def numeros(items):
    out = ""
    for n, lbl in items:
        out += (f'<div class="col3n" style="display:inline-block;width:33%;min-width:150px;vertical-align:top;text-align:center;padding:6px 0;">'
                f'<div style="{T}font-size:38px;font-weight:700;color:#ffffff;line-height:1;">{n}</div>'
                f'<div style="{S}font-size:12px;color:#C9D6F2;margin-top:4px;">{lbl}</div></div>')
    return row(card(f'<div style="font-size:0;text-align:center;">{out}</div>', "20px 12px", bg=NAVY, border="0"))

def passos(items, title=None):
    li = ""
    for i, x in enumerate(items, 1):
        li += (f'<tr><td width="48" valign="top" style="padding:0 0 14px;"><table {TI} style="border-collapse:separate;"><tr><td width="34" height="34" align="center" bgcolor="{NAVY}" style="width:34px;height:34px;border-radius:17px;{T}font-size:18px;font-weight:700;color:#fff;line-height:34px;">{i}</td></tr></table></td>'
               f'<td valign="middle" style="padding:0 0 14px;{S}font-size:15px;line-height:1.5;color:{MUTED};">{x}</td></tr>')
    head = f'<div style="{T}font-size:24px;font-weight:700;color:{NAVY};margin-bottom:14px;">{title}</div>' if title else ""
    return row(card(head + f'<table {TB}>{li}</table>', "24px 24px 10px"))

def serena(baloes, cta="Responder a Serena &rarr;", url=SERENA):
    bub = "".join(f'<table {TI} style="border-collapse:separate;margin-bottom:8px;"><tr><td bgcolor="#ffffff" style="background:#fff;border-radius:4px 14px 14px 14px;padding:10px 14px;{S}font-size:14px;line-height:1.5;color:#1f2937;">{t}'
                  f'<div style="{S}font-size:10px;color:#9ca3af;text-align:right;margin-top:2px;">agora</div></td></tr></table>' for t in baloes)
    inner = (f'<table {TB} bgcolor="#075E54" style="background:#075E54;border-radius:18px 18px 0 0;"><tr><td style="padding:14px 18px;border-radius:18px 18px 0 0;">'
             f'<table {TI}><tr><td width="38" height="38" align="center" bgcolor="{GREEN}" style="width:38px;height:38px;border-radius:19px;{T}font-size:19px;font-weight:700;color:#fff;line-height:38px;">S</td>'
             f'<td style="padding-left:12px;"><div style="{S}font-size:15px;font-weight:700;color:#fff;">Serena · America Nutrition</div><div style="{S}font-size:12px;color:#B7E4C7;">online · responde em minutos</div></td></tr></table></td></tr></table>'
             f'<table {TB}><tr><td style="padding:18px 18px 4px;">{bub}</td></tr><tr><td style="padding:10px 18px 20px;">{btn(cta, url, "green")}</td></tr></table>')
    return row(f'<table {TB} bgcolor="#ECE5DD" style="border-collapse:separate;background:#ECE5DD;border-radius:18px;"><tr><td style="padding:0;">{inner}</td></tr></table>', "8px 32px 26px")

def acao(botoes, nota="", pad="8px 32px 26px"):
    """botoes: [(txt,url,kind)]"""
    bts = "".join((f'<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>' if i else "") + btn(t, u, k) for i, (t, u, k) in enumerate(botoes))
    n = f'<div style="{S}font-size:12px;color:#8A94A6;text-align:center;margin-top:10px;">{nota}</div>' if nota else ""
    return row(bts + n, pad)

def destaque(txt, autor=""):
    return row(f'<table {TB} style="border-collapse:separate;border-left:4px solid {RED};"><tr><td style="padding:4px 0 4px 18px;">'
               f'<div style="{T}font-size:24px;line-height:1.25;font-weight:700;color:{NAVY};">{txt}</div>'
               + (f'<div style="{S}font-size:12px;color:#8A94A6;margin-top:6px;">{autor}</div>' if autor else "") + '</td></tr></table>', "4px 32px 24px")

def rodape():
    lk = lambda t, u: f'<a href="{u}" style="color:#ffffff;font-weight:600;text-decoration:none;">{t}</a>'
    sep = '<span style="color:#5D7BB8;">&nbsp;|&nbsp;</span>'
    return (f'<tr><td class="px" bgcolor="{NAVY}" align="center" style="background:{NAVY};padding:30px 32px 32px;">'
            f'<img src="{LOGO_W}" width="112" alt="America Nutrition" style="display:block;width:112px;height:auto;border:0;margin:0 auto 16px;">'
            f'<div style="{S}font-size:13px;line-height:1.9;">{lk("Site", SITE)}{sep}{lk("Depoimentos", DEP)}{sep}{lk("Rastrear pedido", RASTREIO)}{sep}{lk("WhatsApp", EQUIPE)}</div>'
            f'<div style="{S}font-size:13px;color:#C9D6F2;margin-top:10px;">Dúvidas? <a href="{SERENA}" style="color:{GREEN};font-weight:700;text-decoration:none;">Fale com a Serena</a>, 24h por dia.</div>'
            f'<div style="{S}font-size:11px;line-height:1.6;color:#8FA6D6;margin-top:16px;">Você recebe este email por ter se cadastrado ou comprado na America Nutrition.<br>'
            f'Este produto não é um medicamento. · <a href="{{{{ link_descadastro }}}}" style="color:#8FA6D6;text-decoration:underline;">Cancelar inscrição</a></div></td></tr>')

def documento(assunto, previa, linhas):
    return f'''<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{assunto}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&amp;family=Inter:wght@400;600;700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0;padding:0;background:#E9EEF6;-webkit-text-size-adjust:100%;}}
img{{border:0;outline:none;text-decoration:none;}} a{{text-decoration:none;}}
@media (max-width:540px){{
 .px{{padding-left:18px !important;padding-right:18px !important;}}
 .h1{{font-size:38px !important;line-height:40px !important;}}
 .col{{max-width:100% !important;}}
}}
</style>
</head>
<body style="margin:0;padding:0;background:#E9EEF6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#E9EEF6;font-size:1px;line-height:1px;">{previa}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table {TB} bgcolor="#E9EEF6" style="background:#E9EEF6;"><tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#F6F8FC;border-radius:20px;overflow:hidden;">
{"".join(linhas)}
{rodape()}
</table>
</td></tr></table>
</body>
</html>
'''

# ================================================================== EMAILS
FASES = [
    ("01", "Fase de Choque", "Dias 1 a 7", f"Dose intensiva para iniciar o suporte celular. Respeite o {b('intervalo mínimo de 3 horas')} entre cada dose.", RED),
    ("02", "Manutenção", "A partir do 8º dia", f"Uso diário contínuo para manter o {b('equilíbrio da imunidade')} e o suporte ao metabolismo celular.", NAVY),
    ("03", "Uso Preventivo", "Longo prazo", f"Dose reduzida para suporte {b('contínuo e preventivo')} ao metabolismo celular.", "#16A34A"),
]
CUPOM10 = SITE + "/discount/IMUNOFOSFO?redirect=/products/imunofosfo"
VIP = "https://www.americanutrition.com/discount/VIP_AN"
GRUPO_WA = "https://grupo.americanutrition.com"
FB = "https://www.facebook.com/groups/fosfoetanolamina"
TG = "https://t.me/imunofosfo"
AVALIAR = "https://seguro.americanutrition.com/avaliar"
OMEGA_CK = "https://seguro.americanutrition.com/WggSccM"
OMEGA_PG = SITE + "/products/omega-3-meg3"

EMAILS = {}

EMAILS["1.1-boas-vindas-cupom"] = [
    hero("Bem-vindo(a)", "Presente de boas-vindas", f"Seu cupom de 10% OFF chegou, {NOME}!",
         f"Bem-vindo(a) à America Nutrition, a plataforma completa de saúde celular. Como prometido, aqui está o seu cupom de primeiro pedido.", IMG["imuno"]),
    cupom("Seu código exclusivo", "IMUNOFOSFO", "10% OFF no primeiro pedido", "Válido por 7 dias · o desconto entra sozinho ao clicar",
          "Usar meu cupom agora", CUPOM10, "ImunoFosfo 90 cápsulas · R$ 327 · Frete grátis acima de R$ 300"),
    titulo("Onde usar o seu cupom", "Conheça a linha"),
    cartoes([("", "ImunoFosfo", "Carro-chefe", "Fosfoetanolamina 650mg. Versões: Cápsulas, Vegano, Liquid, Kids e Healing.", RED),
             ("", "Ômega 3 MEG-3", "EPA/DHA ultra puro", "Saúde cardiovascular com alta pureza.", NAVY),
             ("", "Própolis Verde", "Premium", "Antioxidante e defesa natural.", "#16A34A"),
             ("", "Vitamina D3 K2 A", "Saúde óssea", "Também na versão D3 K2 A E 50.000 UI, dose de alto impacto.", "#F5A524")], cols=2),
    depoimento("Comecei pelo ImunoFosfo e acabei descobrindo toda a linha. Hoje uso o Ômega 3 e o Própolis junto. Nunca me senti tão bem.", "Carlos M.", "Cliente America Nutrition"),
    ficha([("Especialidade", "Saúde celular · Metabolismo · Longevidade"), ("Carro-chefe", "ImunoFosfo · Fosfoetanolamina Sintética Bioidêntica"),
           ("Linha", "10+ produtos de alta pureza"), ("Suporte", "Equipe disponível no WhatsApp")], "Sobre a America Nutrition"),
    aviso(f"⏳ <b>Seu cupom IMUNOFOSFO expira em 7 dias.</b> Garanta o desconto no primeiro pedido."),
    acao([("Garantir meu desconto agora", CUPOM10, "red")], "Dúvida sobre qual produto escolher? A Serena te orienta no WhatsApp."),
]

EMAILS["1.3-boas-vindas-como-age"] = [
    hero("Sobre o ImunoFosfo", "Como funciona", "Ele não trata sintomas. Age na origem.",
         f"Olá, {NOME}! O ImunoFosfo é baseado em fosfoetanolamina sintética bioidêntica, uma molécula que age diretamente no metabolismo celular.", IMG["imuno"]),
    texto(f"Sua ação se organiza em {b('4 pilares')}: modulação imunológica, comunicação celular, ação anti-inflamatória sistêmica e suporte metabólico. Juntos, esses mecanismos promovem o equilíbrio que o organismo precisa para funcionar bem e se proteger."),
    destaque("O ImunoFosfo não aumenta nem fortalece a imunidade. Ele promove o equilíbrio dela, e isso muda tudo."),
    titulo("Os 4 pilares de ação", "Como o ImunoFosfo age", pad="6px 32px 16px"),
    cartoes([("1", "Modulação imunológica", "", "Regula a resposta do sistema imune sem superestimulá-lo.", RED),
             ("2", "Comunicação celular", "", "Melhora a sinalização entre as células.", NAVY),
             ("3", "Ação anti-inflamatória", "Sistêmica", "Age em todo o organismo, não só localmente.", "#16A34A"),
             ("4", "Suporte metabólico", "Celular", "Apoia energia e regeneração em nível celular.", "#F5A524")], cols=2),
    ficha([("Princípio ativo", "Fosfoetanolamina Sintética Bioidêntica · 650mg/cáps"), ("Fase de Choque", "6 cáps/dia por 7 dias · mín. 3h entre doses"),
           ("Manutenção", "3 cáps/dia · mín. 3h entre doses"), ("Preventivo", "2 cáps/dia · mín. 3h entre doses")], "Composição e protocolo"),
    depoimento("Fiz muita pesquisa antes de comprar. O que me convenceu foi entender como a molécula funciona. Resultado em 45 dias de uso: exames muito melhores.", "Ana Paula R.", "Cliente America Nutrition"),
    acao([("Garantir meu ImunoFosfo", PROD, "red")], "90 cápsulas · R$ 327 · também nas versões Vegana e Liquid · pagamento seguro"),
]

EMAILS["1.4-boas-vindas-depoimentos"] = [
    hero("Depoimentos", "Resultados reais", "Quem usa conta a própria história.",
         "Mais de 10.000 clientes em todo o Brasil já sentiram o equilíbrio celular na prática. Veja o que eles dizem.",
         cta=btn("Ver depoimentos", DEP, "white")),
    texto(f"Olá, {NOME}! Nada convence mais do que a experiência de quem já passou pelo processo. Separamos relatos reais de clientes, pessoas com histórias diferentes, mas com algo em comum: a consistência no protocolo.",
          f"Cada organismo responde no seu próprio tempo. O que une todos esses depoimentos é a {b('disciplina no uso')} e a confiança no processo."),
    destaque("O ImunoFosfo não é milagre. É ciência celular. Os resultados chegam para quem respeita o protocolo."),
    titulo("O que os clientes dizem", "Relatos de quem seguiu o protocolo", pad="6px 32px 16px"),
    depoimentos_grid([("Em 3 semanas já senti diferença na disposição diária. Nunca imaginei que um suplemento pudesse fazer tanta diferença.", "Roberto F."),
                      ("Meus exames melhoraram muito após 45 dias de protocolo. O médico ficou surpreso com os resultados.", "Fernanda L."),
                      ("Uso há 4 meses e não pretendo parar. Me sinto muito mais equilibrada. É difícil explicar, mas o organismo responde.", "Cláudia M."),
                      ("Estava com desconfiança total. Resolvi tentar. Após 21 dias no protocolo de choque, os resultados apareceram. Hoje indico para a família inteira.", "Juliana C.")]),
    aviso(f"⏳ <b>Seu cupom IMUNOFOSFO (10% OFF) ainda vale por poucos dias.</b> Ele entra sozinho quando você clica no botão abaixo."),
    acao([("Usar meu cupom de 10%", CUPOM10, "red")], "Pagamento seguro · entrega rastreada para todo o Brasil"),
    titulo("Comunidade", "Converse com quem já usa", pad="6px 32px 16px"),
    canais([("💬", GREEN, "WhatsApp", "Grupo oficial · relatos reais e suporte da equipe", "Entrar", GRUPO_WA),
            ("f", "#1877F2", "Facebook", "Grupo fechado · depoimentos e novidades", "Entrar", FB),
            ("✈", "#229ED9", "Telegram", "Canal oficial · avisos e ofertas", "Entrar", TG)]),
]

EMAILS["2.3-pos-entrega-avaliacao"] = [
    hero("Avaliação", "★★★★★", "Sua opinião transforma a jornada de alguém 🎁",
         f"{NOME}, já são cerca de 2 semanas com {{{{ produto_principal }}}}. Como está sendo a sua experiência?", tag_color="#F5A524"),
    texto(f"Sua avaliação é muito mais do que uma nota: ela {b('ajuda outras pessoas')} que estão procurando exatamente o que você encontrou. Cada palavra sua tem o poder de mudar a jornada de saúde de alguém."),
    cupom("🎁 Seu presente por avaliar", "5% OFF", "na sua próxima compra", "Válido por 30 dias depois da avaliação", "⭐ Deixar minha avaliação agora", AVALIAR,
          "Leva menos de 2 minutos e faz uma diferença enorme 🧬"),
    passos(["Clique no botão e acesse o link de avaliação", "Dê sua nota e escreva sobre sua experiência", "Receba seu cupom de 5% de desconto na próxima compra 🎁"], "Como funciona"),
    aviso(f"💬 Ainda com dúvidas sobre seu produto? <a href=\"{SERENA}\" style=\"color:#ffffff;text-decoration:underline;font-weight:700;\">A Serena responde 24h</a>.", NAVY),
]


EMAILS["5.1-cliente-vip"] = [
    hero("👑 VIP", "Você é VIP", f"Você merece esse tratamento especial, {NOME}.",
         "Você faz parte de um grupo seleto: pessoas que não apenas compraram, mas se comprometeram com a própria saúde.", tag_color="#C9A227"),
    cupom("Seu cupom VIP exclusivo", "VIP_AN", "15% de desconto em qualquer produto", "Válido por 20 dias a partir do recebimento deste email",
          "🛒 Usar meu cupom VIP agora", VIP),
    destaque("Isso é o que nos move: ver pessoas que se comprometem com a própria saúde e colhem os frutos com o tempo."),
    titulo("Aplique seu cupom em qualquer produto", "Escolha o seu", pad="6px 32px 16px"),
    produtos([(IMG["imuno"], "ImunoFosfo", "Linha completa: 90 e 60 caps, Vegano, Liquid, Kids, Diabetes", PROD, "Ver produto"),
              (IMG["omega"], "Ômega 3 MEG-3", "Ultra pure fish oil · certificação internacional", OMEGA_PG, "Ver produto"),
              (IMG["propolis"], "Green Propolis Premium", "Própolis verde brasileira · antioxidante concentrado", SITE + "/products/green-propolis-premium-propolis-verde", "Ver produto"),
              (IMG["pet"], "ImunoPet", "Fosfoetanolamina para cães e gatos", "https://www.americanutrition.com/collections/america-nutrition/products/imunopet", "Ver produto")]),
    texto(f"{b('Obrigado por confiar na America Nutrition.')} 🇺🇸 Estamos aqui em cada etapa da sua jornada. A Serena continua disponível 24h para tudo que você precisar.", pad="8px 32px 22px"),
    acao([("🛒 Usar cupom VIP_AN", VIP, "red"), ("💬 Falar com a Serena", SERENA, "green")], "Cupom VIP_AN · 15% de desconto · válido por 20 dias 🧬"),
]

# ================================================================== v2 (10/11/2026): blocos por produto, carrinho, recompra
# Os modelos abaixo tem variaveis preenchidas no envio a partir de email_fila.dados (email_preencher no banco):
#   {{ guia_produtos }} {{ produto_principal }} {{ produto_foto }} {{ complemento_bloco }} {{ complemento_nome }}
#   {{ carrinho_itens }} {{ carrinho_aviso }} {{ checkout_url }} {{ recompra_itens }} {{ recompra_url }} {{ data_fim }}
CHECKOUT = "https://checkout.americanutrition.com/?items="
V = "{{ %s }}"

def lista_var(var, pad="0 32px 18px"):
    """linha que recebe um bloco HTML pronto (gerado no banco a partir dos moldes abaixo)"""
    return f'<tr><td class="px" style="padding:{pad};">{V % var}</td></tr>'

# molde de uma linha de item (carrinho e recompra). O banco troca __FOTO__ __NOME__ __DETALHE__ __VALOR__.
MOLDE_ITEM = (f'<table {TB} style="border-collapse:separate;background:#fff;border:1px solid #E3E8F2;border-radius:14px;margin-bottom:10px;"><tr>'
              f'<td width="84" valign="middle" style="padding:12px 0 12px 12px;"><img src="__FOTO__" width="72" alt="" style="display:block;width:72px;height:auto;border:0;border-radius:10px;"></td>'
              f'<td valign="middle" style="padding:12px 14px;"><div style="{T}font-size:20px;font-weight:700;color:{INK};line-height:1.15;">__NOME__</div>'
              f'<div style="{S}font-size:13px;line-height:1.5;color:{MUTED};margin-top:2px;">__DETALHE__</div></td>'
              f'<td valign="middle" align="right" style="padding:12px 16px 12px 0;{S}font-size:15px;font-weight:700;color:{NAVY};white-space:nowrap;">__VALOR__</td></tr></table>')

# molde do aviso do carrinho (cartao recusado / boleto). O banco troca __TEXTO__.
MOLDE_AVISO = (f'<table {TB} bgcolor="#FFF4D6" style="border-collapse:separate;background:#FFF4D6;border-radius:12px;margin-bottom:14px;"><tr>'
               f'<td style="padding:14px 18px;{S}font-size:14px;line-height:1.55;color:#7A4A00;">__TEXTO__</td></tr></table>')

PRODUTOS = [
  # chave, padrao (regex no titulo do item), nome curto, foto, url, variant_id, preco, unidades por frasco, dose/dia, dias fixos, complemento, recompra,
  # como usar (lista), dicas (lista), argumento de venda quando ele e o complemento sugerido
  dict(chave="imunofosfo_diabetes", padrao="diabetes", nome="ImunoFosfo Diabetes", foto=CDN+"diabetes_mocup.jpg?v=1769434468&width=400",
       url=SITE+"/products/imunofosfo-diabetes", vid="45117829218476", preco=267, un=60, dose=2, fixo=None, comp="omega", rec=True,
       usar=["2 cápsulas por dia: uma de manhã e uma à noite", "Intervalo mínimo de 3 horas entre as doses", "Tome após as refeições principais"],
       dicas=["Beba bastante água ao longo do dia", "Use todos os dias, no mesmo horário: a constância é o que traz resultado", "Pode usar junto com o acompanhamento que você já faz"],
       pitch="Fosfoetanolamina com protocolo próprio para quem cuida da glicemia."),
  dict(chave="imunofosfo_liquid", padrao="imunofosfo liquid", nome="ImunoFosfo Liquid", foto=CDN+"Mockup_Liquid_201fcff5-5e85-48ff-a71f-3eb38443d47c.jpg?v=1771378027&width=400",
       url=SITE+"/products/imunofosfo-liquid", vid="45522481643692", preco=137, un=None, dose=None, fixo=10, comp="omega", rec=True,
       usar=["20 gotas (1 ml), 3 vezes ao dia", "Sempre após as refeições principais", "Cada frasco rende cerca de 10 dias nessa dose"],
       dicas=["Pingue em um pouco de água ou suco, se preferir", "Para não ficar sem, os kits de 3, 6 e 9 frascos saem com até 30% de desconto", "Na dúvida sobre a dose, a Serena ajusta para o seu caso"],
       pitch="A fosfoetanolamina em gotas, com B3, B12 e zinco."),
  dict(chave="imunofosfo_kids", padrao="kids", nome="ImunoFosfo Kids", foto=CDN+"ImunoFosfo_Kids_fosfoetanolamina.jpg?v=1771511298&width=400",
       url=SITE+"/products/imunofosfo-kids-fosfoetanolamina", vid="43736522653868", preco=167, un=None, dose=None, fixo=30, comp=None, rec=True,
       usar=["A partir de 3 anos", "10 gotas pela manhã e 10 gotas à noite", "Para crianças não existe fase de reforço"],
       dicas=["Sabor tangerina: pode pingar direto ou em um pouco de suco", "Mantenha o horário fixo para virar rotina", "Qualquer dúvida sobre a dose da criança, fale com a Serena"],
       pitch="Fosfoetanolamina em gotas, sabor tangerina, para crianças a partir de 3 anos."),
  dict(chave="imunofosfo_healing", padrao="healing", nome="ImunoFosfo Healing", foto=CDN+"IMUNOHEALING.jpg?v=1736989270&width=400",
       url=SITE+"/products/imunofosfo-healing", vid="43671038656684", preco=87, un=None, dose=None, fixo=None, comp="imunofosfo", rec=False,
       usar=["Siga o modo de uso indicado na embalagem", "Use de forma contínua para melhores resultados"],
       dicas=["Se tiver qualquer dúvida sobre como aplicar, a Serena te orienta", "Combine com o ImunoFosfo em cápsulas para o cuidado por dentro"],
       pitch="Cuidado complementar da linha ImunoFosfo."),
  dict(chave="imunopet", padrao="imunopet", nome="ImunoPet", foto=IMG["pet"], url=SITE+"/products/imunopet", vid="45211644625068", preco=157,
       un=None, dose=None, fixo=None, comp=None, rec=False,
       usar=["1 gota por kg do animal, no máximo 15 gotas por dose", "Primeiros 7 dias: 3 vezes ao dia", "Depois: 1 vez ao dia (manutenção)"],
       dicas=["Pode pingar direto na boca ou em um petisco", "Mantenha a manutenção todos os dias", "A Serena calcula a dose pelo peso do seu pet"],
       pitch="Fosfoetanolamina para cães e gatos."),
  dict(chave="imunofosfo", padrao="imunofosfo", nome="ImunoFosfo", foto=IMG["imuno"], url=PROD, vid="44436756234412", preco=327, un=90, dose=3, fixo=None, comp="omega", rec=True,
       usar=["Manutenção: 3 cápsulas por dia", "Intervalo mínimo de 3 horas entre uma cápsula e outra", "Fase de Reforço (quando indicada): 6 cápsulas por dia durante 7 dias"],
       dicas=["Capriche na água ao longo do dia", "Se preferir, a cápsula pode ser aberta e dissolvida em líquido", "Com o Ômega 3: tome 1 ImunoFosfo junto do Ômega de manhã e à noite, e a do meio do dia sozinha"],
       pitch="O carro-chefe da America Nutrition: fosfoetanolamina sintética bioidêntica, 650 mg por cápsula, para o equilíbrio da imunidade e o metabolismo celular."),
  dict(chave="omega", padrao="omega", nome="Ômega 3 Ultra Pure", foto=IMG["omega"], url=OMEGA_PG, vid="43843399712940", preco=77, un=60, dose=2, fixo=None, comp="imunofosfo", rec=True,
       usar=["2 cápsulas por dia (2.000 mg de óleo de peixe)", "Uma no café da manhã e uma no jantar", "Sempre junto com uma refeição: absorve melhor com alimento"],
       dicas=["Guarde em local fresco, longe do sol", "Use todos os dias: o efeito vem da constância", "Combina muito bem com o ImunoFosfo nas mesmas refeições"],
       pitch="EPA e DHA de alta pureza, com vitamina E. Ação anti-inflamatória e cuidado com coração e cérebro. São 2 cápsulas por dia, junto das refeições."),
  dict(chave="d3_50000", padrao="50[. ]?000", nome="D3 K2 A E 50.000 UI", foto=CDN+"Mockup---Vitamin-D3_e68dfc5f-4442-4f03-ba0b-cfe981eb6522.jpg?v=1770058482&width=400",
       url=SITE+"/products/vitamina-d3-50000-ui-k2-a-e", vid="45300915863724", preco=77, un=None, dose=None, fixo=84, comp="omega", rec=True,
       usar=["1 cápsula por semana, sempre no mesmo dia", "Tome junto de uma refeição com gordura (almoço ou jantar)", "O frasco de 12 cápsulas dura 12 semanas"],
       dicas=["Escolha um dia fixo e coloque um lembrete no celular", "Não tome mais de uma por semana", "Combina com o Ômega 3, que também absorve melhor com gordura"],
       pitch="Dose semanal de D3 com K2, A e E: uma cápsula por semana."),
  dict(chave="d3", padrao="d3", nome="Vitamina D3 K2 A", foto=IMG["d3"], url=SITE+"/products/d3-vitamin-with-k2-and-a", vid="44240381411500", preco=67, un=60, dose=2, fixo=None, comp="omega", rec=True,
       usar=["2 cápsulas por dia", "Junto de uma refeição com gordura, como o almoço ou o jantar"],
       dicas=["A K2 ajuda o cálcio a ir para os ossos, e não para as artérias", "Mantenha o uso diário", "Combina com o Ômega 3 na mesma refeição"],
       pitch="D3 com K2 e A em sinergia, para ossos, coração e imunidade. São 2 cápsulas por dia."),
  dict(chave="propolis_verde", padrao="green propolis|pr[oó]polis verde", nome="Própolis Verde Premium", foto=IMG["propolis"],
       url=SITE+"/products/green-propolis-premium-propolis-verde", vid="43959807508652", preco=77, un=60, dose=2, fixo=None, comp="imunofosfo", rec=True,
       usar=["2 cápsulas por dia", "Uma de manhã e uma à noite, junto das refeições"],
       dicas=["Absorve melhor com alimento", "Use todos os dias para manter a defesa em dia", "Combina com o ImunoFosfo e o Ômega 3 na mesma rotina"],
       pitch="Própolis verde brasileira com vitaminas C e E, selênio e zinco. Antioxidante e defesa natural, 2 cápsulas por dia."),
  dict(chave="propolis_extract", padrao="propolis extract", nome="Propolis Extract", foto=CDN+"PROPOLIS-MICK.jpg?v=1736989296&width=400",
       url=SITE+"/products/propolis-extract", vid="43843418259628", preco=67, un=60, dose=2, fixo=None, comp="imunofosfo", rec=True,
       usar=["1 a 2 cápsulas por dia", "Preferencialmente junto das refeições"],
       dicas=["Use todos os dias", "Combina com o ImunoFosfo na mesma rotina"],
       pitch="Extrato de própolis concentrado, antioxidante, 2 cápsulas por dia."),
  dict(chave="creatina", padrao="creatin", nome="Creatina Ultra Micronizada", foto=CDN+"Mockup---Creatina-em-Po-frente.jpg?width=400",
       url=SITE+"/products/creatine-ultra-micronized", vid="44268289982636", preco=99.90, un=None, dose=None, fixo=100, comp="vitamins", rec=True,
       usar=["3 g por dia (1 medida)", "Todos os dias, inclusive nos dias sem treino", "Misture em água, suco ou no shake"],
       dicas=["O efeito vem da saturação do músculo ao longo das semanas, não do horário", "Beba bastante água", "A embalagem rende 100 doses"],
       pitch="Creatina monohidratada pura e micronizada, 3 g por dia."),
  dict(chave="life_gummy", padrao="gummy|gomas", nome="Life Gummy", foto=CDN+"Mockup---Life-Gummy.jpg?width=400",
       url=SITE+"/products/life-gummy-creatina-em-gomas", vid="44291546448044", preco=99.90, un=60, dose=2, fixo=None, comp="vitamins", rec=True,
       usar=["2 gomas por dia (3 g de creatina)", "Todos os dias, no horário que for mais fácil"],
       dicas=["O efeito vem da constância, não do horário", "Beba bastante água ao longo do dia"],
       pitch="Creatina em gomas: 3 g por dia em 2 gomas."),
  dict(chave="vitamins", padrao="vitamins", nome="Vitamins & Minerals Premium", foto=CDN+"Mockup---Multivitamin.jpg?width=400",
       url=SITE+"/products/vitamins-minerals-premium", vid="44714532208812", preco=147, un=90, dose=3, fixo=None, comp="omega", rec=True,
       usar=["3 cápsulas por dia", "Junto das refeições"],
       dicas=["12 vitaminas e 10 minerais na dose diária", "Use todos os dias para manter os níveis"],
       pitch="12 vitaminas e 10 minerais em 3 cápsulas por dia: a base que falta na alimentação do dia a dia."),
  dict(chave="life_hair", padrao="life hair|biotina", nome="Life Hair", foto=CDN+"lifehair.jpg?v=1760037313&width=400",
       url=SITE+"/products/life-hair", vid="44852610826412", preco=77, un=60, dose=2, fixo=None, comp="vitamins", rec=True,
       usar=["2 cápsulas por dia", "Junto das refeições"],
       dicas=["Cabelo e unhas respondem em semanas: mantenha o uso por pelo menos 3 meses", "Beba bastante água"],
       pitch="Biotina e vitaminas para cabelo, pele e unhas."),
  dict(chave="life_protein", padrao="protein", nome="Life Protein", foto=CDN+"Mockup---Life-Protein.jpg?width=400",
       url=SITE+"/products/life-protein-proteina-vegetal", vid="45035695866028", preco=107, un=None, dose=None, fixo=None, comp="creatina", rec=False,
       usar=["1 dose (medida inclusa) em 200 a 300 ml de água ou bebida", "Pode ser no café da manhã ou depois do treino"],
       dicas=["Ajuda a manter a massa muscular", "Combina com a Creatina para quem treina"],
       pitch="Proteína vegetal para manter a massa muscular."),
]

def guia_bloco(pr):
    """bloco 'como usar' de um produto, usado no email de entrega. __DURACAO__ e __QTD__ sao trocados no banco."""
    li = lambda xs, cor: "".join(f'<tr><td width="26" valign="top" style="padding:0 0 8px;{S}font-size:14px;font-weight:700;color:{cor};">&#9679;</td>'
                                 f'<td valign="top" style="padding:0 0 8px;{S}font-size:14px;line-height:1.5;color:{MUTED};">{x}</td></tr>' for x in xs)
    return (f'<table {TB} style="border-collapse:separate;background:#fff;border:1px solid #E3E8F2;border-radius:16px;margin-bottom:14px;">'
            f'<tr><td style="padding:18px 20px 6px;"><table {TB}><tr>'
            f'<td width="92" valign="top"><img src="{pr["foto"]}" width="80" alt="" style="display:block;width:80px;height:auto;border:0;border-radius:12px;"></td>'
            f'<td valign="middle"><div style="{S}font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:{RED};">Seu produto · __QTD__</div>'
            f'<div style="{T}font-size:26px;line-height:1.1;font-weight:700;color:{NAVY};margin-top:2px;">{pr["nome"]}</div></td></tr></table></td></tr>'
            f'<tr><td style="padding:10px 20px 4px;"><div style="{T}font-size:19px;font-weight:700;color:{INK};margin-bottom:8px;">Como usar</div><table {TB}>{li(pr["usar"], RED)}</table></td></tr>'
            f'<tr><td style="padding:4px 20px 6px;"><div style="{T}font-size:19px;font-weight:700;color:{INK};margin-bottom:8px;">Dicas para ter resultado</div><table {TB}>{li(pr["dicas"], "#16A34A")}</table></td></tr>'
            f'<tr><td style="padding:4px 20px 18px;">__DURACAO__</td></tr></table>')

def complemento_bloco(pr):
    """cartao do produto sugerido (email de complemento)"""
    ck = f'{CHECKOUT}{pr["vid"]}%3A1'
    preco = f'R$ {pr["preco"]:.2f}'.replace(".", ",")
    return (f'<table {TB} style="border-collapse:separate;background:#fff;border:1px solid #E3E8F2;border-radius:16px;">'
            f'<tr><td align="center" style="padding:22px 22px 6px;"><a href="{pr["url"]}"><img src="{pr["foto"]}" width="190" alt="{pr["nome"]}" style="display:block;width:190px;height:auto;border:0;"></a></td></tr>'
            f'<tr><td style="padding:6px 24px 22px;text-align:center;"><div style="{T}font-size:28px;font-weight:700;color:{NAVY};line-height:1.1;">{pr["nome"]}</div>'
            f'<div style="{S}font-size:15px;line-height:1.6;color:{MUTED};margin:8px 0 6px;">{pr["pitch"]}</div>'
            f'<div style="{T}font-size:26px;font-weight:700;color:{RED};margin:6px 0 16px;">{preco}</div>'
            f'{btn("Adicionar à minha rotina", ck, "red")}'
            f'<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>{btn("Conhecer o produto", pr["url"], "navy")}</td></tr></table>')

def nav_bloco(pr):
    """cartao do produto que a pessoa viu no site (email de navegacao abandonada)"""
    ck = f'{CHECKOUT}{pr["vid"]}%3A1'
    preco = f'R$ {pr["preco"]:.2f}'.replace(".", ",")
    return (f'<table {TB} style="border-collapse:separate;background:#fff;border:1px solid #E3E8F2;border-radius:16px;">'
            f'<tr><td align="center" style="padding:22px 22px 6px;"><a href="{pr["url"]}"><img src="{pr["foto"]}" width="210" alt="{pr["nome"]}" style="display:block;width:210px;height:auto;border:0;"></a></td></tr>'
            f'<tr><td style="padding:6px 24px 22px;text-align:center;"><div style="{S}font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:{RED};">Você viu</div>'
            f'<div style="{T}font-size:30px;font-weight:700;color:{NAVY};line-height:1.1;margin-top:2px;">{pr["nome"]}</div>'
            f'<div style="{S}font-size:15px;line-height:1.6;color:{MUTED};margin:8px 0 6px;">{pr["pitch"]}</div>'
            f'<div style="{T}font-size:28px;font-weight:700;color:{RED};margin:6px 0 16px;">{preco}</div>'
            f'{btn("Quero o meu", ck, "red")}'
            f'<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>{btn("Ver detalhes do produto", pr["url"], "navy")}</td></tr></table>')

EMAILS["2.1-pos-entrega-leia-antes"] = [
    hero("Pedido entregue", "Leia antes de abrir", f"Chegou, {NOME}! Comece do jeito certo.",
         "O jeito de usar faz toda a diferença no resultado. Separamos aqui o modo de uso de cada produto do seu pedido.", V % "produto_foto"),
    titulo("Seu guia de uso", "Do primeiro dia em diante", pad="28px 32px 14px"),
    lista_var("guia_produtos", "0 32px 8px"),
    aviso("📌 <b>Este produto não é um medicamento.</b> Não interrompa nenhum tratamento sem falar com o seu médico. Pode usar junto com o acompanhamento que você já faz.", "#FFF4D6", "#7A4A00"),
    serena([f"Oi, {NOME}! 👋 Aqui é a Serena.", "Me conta o seu objetivo que eu monto a <b>rotina certa pra você</b>, com horários e combinações. É grátis 💚"],
           "Quero minha rotina personalizada &rarr;", SERENA_PROTO),
    titulo("Comunidade", "Converse com quem já usa", pad="4px 32px 16px"),
    canais([("💬", GREEN, "WhatsApp", "Grupo oficial · relatos reais e suporte da equipe", "Entrar", GRUPO_WA),
            ("f", "#1877F2", "Facebook", "Grupo fechado · depoimentos e novidades", "Entrar", FB)]),
]

EMAILS["2.2-pos-entrega-complemento"] = [
    hero("Para a sua rotina", "Combinação recomendada", f"{NOME}, quem usa {V % 'produto_principal'} costuma somar isto.",
         f"Depois dos primeiros dias com {V % 'produto_principal'}, muitos clientes completam a rotina com {V % 'complemento_nome'}. Veja por quê."),
    lista_var("complemento_bloco", "28px 32px 18px"),
    depoimento("Comecei só com o ImunoFosfo. Depois somei o Ômega 3 e senti a diferença. Hoje não deixo faltar nenhum dos dois.", "Beatriz M.", "Cliente America Nutrition"),
    serena(["Quer saber se essa combinação faz sentido pra você?", "Me chama que eu explico como encaixar na sua rotina 💚"], "Perguntar para a Serena &rarr;"),
]

EMAILS["3.1-recompra-acabando"] = [
    hero("Reposição", "Seu estoque está acabando", f"{NOME}, seu {V % 'produto_principal'} termina por volta de {V % 'data_fim'}.",
         "Fizemos a conta pela dose recomendada, a partir do dia seguinte à entrega. Peça agora para o próximo chegar antes de acabar e você não interromper o uso.",
         V % "produto_foto", btn("Repetir meu pedido", V % "recompra_url", "white")),
    titulo("Pela dose recomendada", "Quanto falta de cada produto", pad="28px 32px 14px"),
    lista_var("recompra_itens", "0 32px 8px"),
    aviso("🔁 <b>A constância é o que traz resultado.</b> Parar e recomeçar pode exigir uma nova fase de adaptação.", "#FFF4D6", "#7A4A00"),
    acao([("Repetir meu pedido", V % "recompra_url", "red"), ("Ver toda a linha", SITE, "navy")], "O carrinho já abre com os mesmos produtos · pagamento seguro · entrega rastreada"),
    serena(["Quer ajustar a quantidade ou levar um kit para mais meses?", "Eu te ajudo a escolher e mando o link 💚"], "Falar com a Serena &rarr;"),
]

EMAILS["3.2-recompra-acabou"] = [
    hero("Reposição", "Não deixe a rotina parar", f"{NOME}, seu {V % 'produto_principal'} já deve ter acabado.",
         f"Pela dose recomendada, ele terminou por volta de {V % 'data_fim'}. Se ainda não pediu o próximo, dá tempo de retomar sem perder o ritmo.",
         V % "produto_foto", btn("Repetir meu pedido", V % "recompra_url", "white")),
    lista_var("recompra_itens", "28px 32px 8px"),
    acao([("Repetir meu pedido", V % "recompra_url", "red")], "Se você já tem estoque em casa, pode ignorar este email 🙂"),
    serena(["Se ficou alguma dúvida sobre continuar, me chama.", "Eu te ajudo a decidir o melhor caminho 💚"], "Falar com a Serena &rarr;"),
]

EMAILS["6.1-carrinho-itens"] = [
    hero("Seu carrinho", "Ficou guardado para você", f"{NOME}, seu pedido está quase pronto.",
         "Você escolheu seus produtos e não finalizou. Tudo continua separado: é só tocar no botão para concluir.",
         cta=btn("Finalizar meu pedido", V % "checkout_url", "white")),
    lista_var("carrinho_aviso", "26px 32px 0"),
    titulo("No seu carrinho", "O que você escolheu", pad="8px 32px 14px"),
    lista_var("carrinho_itens", "0 32px 8px"),
    acao([("Finalizar meu pedido", V % "checkout_url", "red")], "🔒 Pagamento seguro · 📦 Entrega rastreada para todo o Brasil"),
    serena(["Ficou alguma dúvida antes de fechar?", "Me chama aqui que eu respondo em minutos 💚"], "Tirar uma dúvida &rarr;"),
]

EMAILS["6.2-carrinho-duvidas"] = [
    hero("Seu carrinho", "Antes de decidir", f"{NOME}, veja o que diz quem já usa.",
         "Decisão de saúde não se toma no impulso, e está certo. Separamos relatos de clientes para ajudar.",
         cta=btn("Voltar ao meu carrinho", V % "checkout_url", "white")),
    titulo("Relatos reais", "Quem já usa conta", pad="28px 32px 14px"),
    depoimentos_grid([("Em 3 semanas já senti diferença na disposição diária. Hoje indico para a família inteira.", "Roberto F."),
                      ("Meus exames melhoraram muito após 45 dias de uso. O médico ficou surpreso.", "Fernanda L.")]),
    numeros([("4.98", "nota média ★★★★★"), ("+10.000", "clientes"), ("24h", "suporte da Serena")]),
    titulo("Seu carrinho", "Continua separado", pad="8px 32px 14px"),
    lista_var("carrinho_itens", "0 32px 8px"),
    acao([("Finalizar meu pedido", V % "checkout_url", "red"), ("Ver mais depoimentos", DEP, "navy")]),
    serena(["Quer que eu te explique como usar antes de comprar?", "Me conta o seu objetivo 💚"], "Falar com a Serena &rarr;"),
]

EMAILS["6.3-carrinho-ultima-chamada"] = [
    hero("Último aviso", "10% OFF por 24 horas", f"{NOME}, um presente para você finalizar hoje.",
         "Seu carrinho continua separado. Para ajudar na decisão, liberamos um cupom de 10% só para você, válido pelas próximas 24 horas.",
         cta=btn("Usar meus 10% OFF", V % "checkout_cupom_url", "white"), tag_color="#F5A524"),
    cupom("Seu cupom exclusivo", V % "cupom_codigo", "10% OFF em todo o carrinho", "Válido por 24 horas · uso único · já entra aplicado pelo botão",
          "Finalizar com 10% OFF", V % "checkout_cupom_url", "Depois de 24 horas o cupom expira e o carrinho é liberado"),
    titulo("No seu carrinho", "O que você escolheu", pad="8px 32px 14px"),
    lista_var("carrinho_itens", "0 32px 8px"),
    acao([("Finalizar com 10% OFF", V % "checkout_cupom_url", "red")], "🔒 Pagamento seguro · 📦 Entrega rastreada · 💬 Serena 24h"),
]

EMAILS["4.1-navegacao-abandonada"] = [
    hero("Você viu", "Ainda pensando?", f"{NOME}, o {V % 'produto_nome'} continua te esperando.",
         "Vimos que você deu uma olhada e não levou. Decisão de saúde se toma com calma, então separamos o que você precisa saber.",
         V % "produto_foto", btn("Ver de novo", V % "produto_url", "white")),
    lista_var("nav_bloco", "28px 32px 18px"),
    lista_var("nav_outros", "0 32px 8px"),
    checklist("Por que a America Nutrition", [
        "Suplementos de alta pureza, com tecnologia americana",
        "Milhares de avaliações verificadas de clientes",
        "Pagamento seguro e entrega rastreada para todo o Brasil",
        f"Suporte da {b('Serena')} 24h no WhatsApp, antes e depois da compra"]),
    depoimento("Fiquei semanas olhando e saindo sem comprar. Quando finalmente decidi, me arrependi de não ter comprado antes.", "Cliente America Nutrition"),
    serena(["Ficou com alguma dúvida sobre esse produto?", "Me chama aqui: respondo em minutos, 24h 💚"], "Tirar uma dúvida &rarr;"),
]

ASSUNTOS = {
    "1.1-boas-vindas-cupom": "{{ nome }}, seu cupom de 10% OFF chegou 🎁",
    "1.3-boas-vindas-como-age": "{{ nome }}, sabe como o ImunoFosfo age no seu organismo?",
    "1.4-boas-vindas-depoimentos": "{{ nome }}, os resultados falam por si (e seu cupom ainda vale)",
    "2.1-pos-entrega-leia-antes": "📦 Chegou! Leia antes de abrir seu {{ produto_principal }}",
    "2.2-pos-entrega-complemento": "{{ nome }}, a combinação que quem usa {{ produto_principal }} mais pede",
    "2.3-pos-entrega-avaliacao": "⭐ {{ nome }}, como está sendo com o {{ produto_principal }}?",
    "3.1-recompra-acabando": "{{ nome }}, seu {{ produto_principal }} acaba por volta de {{ data_fim }}",
    "3.2-recompra-acabou": "Seu {{ produto_principal }} acabou, {{ nome }}?",
    "4.1-navegacao-abandonada": "{{ nome }}, ainda pensando no {{ produto_nome }}?",
    "5.1-cliente-vip": "👑 Você é VIP, {{ nome }}: sua recompensa exclusiva chegou",
    "6.1-carrinho-itens": "{{ nome }}, seu carrinho ficou guardado 🛒",
    "6.2-carrinho-duvidas": "Ficou alguma dúvida, {{ nome }}?",
    "6.3-carrinho-ultima-chamada": "⏳ {{ nome }}, 10% OFF por 24h para finalizar seu carrinho",
}
PREVIAS = {
    "1.1-boas-vindas-cupom": "Código exclusivo dentro. O desconto aplica sozinho no clique.",
    "1.3-boas-vindas-como-age": "Modulação imunológica, comunicação celular, ação anti-inflamatória e suporte metabólico.",
    "1.4-boas-vindas-depoimentos": "Depoimentos verificados de quem seguiu o protocolo, e o convite para a comunidade.",
    "2.1-pos-entrega-leia-antes": "Modo de uso, horários e dicas de cada produto do seu pedido.",
    "2.2-pos-entrega-complemento": "Uma combinação simples que completa a sua rotina.",
    "2.3-pos-entrega-avaliacao": "Sua avaliação ajuda outras pessoas e ainda garante 5% OFF na próxima compra.",
    "3.1-recompra-acabando": "Fizemos a conta pela dose recomendada. Peça agora e não interrompa o uso.",
    "3.2-recompra-acabou": "Dá tempo de retomar sem perder o ritmo. O carrinho já abre com os mesmos produtos.",
    "4.1-navegacao-abandonada": "Separamos o que você precisa saber para decidir com calma.",
    "5.1-cliente-vip": "Você faz parte de um grupo seleto. Preparamos um cupom exclusivo de 15% para você.",
    "6.1-carrinho-itens": "Tudo continua separado: é só tocar no botão para concluir.",
    "6.2-carrinho-duvidas": "Relatos de quem já usa, e a Serena para responder qualquer pergunta.",
    "6.3-carrinho-ultima-chamada": "Um cupom só seu, válido pelas próximas 24 horas, já aplicado no botão.",
}

def sql_texto(x):
    return "null" if x is None else "'" + str(x).replace("'", "''") + "'"

def gerar_sql(out_dir):
    """produtos.sql: catalogo usado pelo agendador (dose, duracao, complemento, blocos HTML) e os moldes"""
    linhas = []
    for i, pr in enumerate(PRODUTOS):
        comp = next((x for x in PRODUTOS if x["chave"] == pr["comp"]), None)
        vals = [pr["chave"], pr["padrao"], pr["nome"], pr["foto"], pr["url"], pr["vid"]]
        extra = f", {sql_texto(pr['pitch'])}, {sql_texto(nav_bloco(pr))}"
        linhas.append("(" + ", ".join(sql_texto(v) for v in vals) + f", {pr['preco']}, {i + 1}, {pr['un'] or 'null'}, {pr['dose'] or 'null'}, "
                      f"{pr['fixo'] or 'null'}, {sql_texto(pr['comp'])}, {'true' if pr['rec'] else 'false'}, "
                      f"{sql_texto(guia_bloco(pr))}, {sql_texto(complemento_bloco(pr))}" + extra + ")")
    sql = ("-- Gerado por padrao.py (nao editar a mao). Catalogo dos emails por produto, 10/11/2026.\n"
           "insert into email_produtos (chave, padrao, nome, foto, url, variant_id, preco, ordem, unidades, dose_dia, dias_fixos, complemento, recompra, guia_html, card_html, pitch, nav_html) values\n"
           + ",\n".join(linhas) +
           "\non conflict (chave) do update set padrao = excluded.padrao, nome = excluded.nome, foto = excluded.foto, url = excluded.url,"
           " variant_id = excluded.variant_id, preco = excluded.preco, ordem = excluded.ordem, unidades = excluded.unidades, dose_dia = excluded.dose_dia,"
           " dias_fixos = excluded.dias_fixos, complemento = excluded.complemento, recompra = excluded.recompra, guia_html = excluded.guia_html,"
           " card_html = excluded.card_html, pitch = excluded.pitch, nav_html = excluded.nav_html, atualizado_em = now();\n"
           f"insert into email_config (chave, valor) values ('molde_item', {sql_texto(MOLDE_ITEM)}), ('molde_aviso', {sql_texto(MOLDE_AVISO)})\n"
           "on conflict (chave) do update set valor = excluded.valor;\n")
    with open(os.path.join(out_dir, "produtos.sql"), "w") as f:
        f.write(sql)

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    os.makedirs(out, exist_ok=True)
    for slug, linhas in EMAILS.items():
        with open(os.path.join(out, slug + ".html"), "w") as f:
            f.write(documento(ASSUNTOS[slug].replace("{{ nome }}", "").strip(" ,"), PREVIAS[slug], linhas))
    print(len(EMAILS), "modelos em", out)
    gerar_sql(os.path.dirname(out))
    print(len(PRODUTOS), "produtos em produtos.sql")
