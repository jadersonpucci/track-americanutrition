# Padrao visual dos emails da America Nutrition ("Modelo 2 · Marca forte", aprovado em 05/11/2026).
# Gera os 13 modelos em ses/templates/<slug>.html. Rodar: python3 padrao.py
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

EMAILS["1.2-boas-vindas-comunidade"] = [
    hero("Comunidade", "Convite especial", f"{NOME}, entre para a nossa comunidade",
         "Fazer parte da America Nutrition vai além de receber um produto: é entrar numa comunidade de pessoas que levam a saúde celular a sério e se apoiam todos os dias."),
    texto("Nos nossos grupos você encontra relatos reais de quem está no protocolo, dicas de uso, atualizações da linha e acesso direto à nossa equipe. Escolha o canal que preferir e entre agora."),
    destaque("Quem compartilha a jornada chega mais longe. Nossos grupos são o lugar onde isso acontece."),
    checklist("Por que entrar na comunidade", [
        "Relatos reais de clientes que estão no protocolo, dia a dia, resultado a resultado",
        "Dicas de uso, protocolos e esclarecimento de dúvidas com a equipe",
        "Novidades da linha, lançamentos e ofertas exclusivas para membros",
        f"Acesso direto à equipe pelo {b('WhatsApp')}: suporte real, sem robô"]),
    titulo("Escolha seu canal", "Onde você prefere participar?", pad="10px 32px 16px"),
    canais([("💬", GREEN, "WhatsApp", "Grupo oficial · suporte direto com a equipe", "Entrar", GRUPO_WA),
            ("f", "#1877F2", "Facebook", "Grupo fechado · depoimentos e novidades", "Entrar", FB),
            ("✈", "#229ED9", "Telegram", "Canal oficial · atualizações em tempo real", "Entrar", TG)]),
    depoimento("Entrei no grupo do WhatsApp e foi um divisor de águas. Ver outras pessoas no protocolo, compartilhar dúvidas e receber resposta rápida da equipe me deu confiança para continuar.", "Roberta L.", "Cliente America Nutrition"),
    acao([("Entrar na comunidade", GRUPO_WA, "red")], "Gratuito · escolha o canal de sua preferência · saia quando quiser"),
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
    ficha([("Plataforma", "Judge.me · avaliações verificadas e públicas"), ("Bônus", "5% de desconto na próxima compra"),
           ("Validade", "30 dias"), ("Válido em", "Toda a linha America Nutrition")], "Avalie e ganhe desconto"),
    acao([("Deixar minha avaliação", "https://judge.me/product_reviews/99ec2770-e54f-430d-ad3f-6f458cf0cf18/new?id=7783594754220&amp;source=shareable-link", "red"),
          ("Garantir meu ImunoFosfo", PROD, "navy")], "2 minutos · avaliação verificada · 5% de desconto garantido"),
]

EMAILS["2.1-pos-compra-guia-de-uso"] = [
    hero("Guia de uso", "Leia antes de abrir", f"Seu pedido está chegando, {NOME}!",
         "O modo certo de usar faz toda a diferença nos resultados. Separamos aqui o protocolo para você começar bem.", IMG["imuno"]),
    titulo("As 3 fases do protocolo", "Do choque à prevenção"),
    cartoes(FASES),
    aviso(f"⚡ <b>As doses variam conforme o produto.</b> Peça à Serena o protocolo exato do seu."),
    serena([f"Oi, {NOME}! 👋 Aqui é a Serena.", "Me conta qual produto você pegou e o seu objetivo, que eu monto a <b>dose certa pra você</b>. É grátis 💚"],
           "Quero meu protocolo grátis &rarr;", SERENA_PROTO),
]

EMAILS["2.2-pos-compra-comunidade"] = [
    hero("Comunidade", "Convite especial", "Faça parte da nossa comunidade oficial 🧬",
         f"Olá, {NOME}! Você agora é parte da família America Nutrition, e todo membro merece acesso à nossa comunidade exclusiva."),
    titulo("O que você vai encontrar", "Muito além do produto"),
    cartoes([("🔬", "Conteúdo educativo", "Exclusivo", "Metabolismo celular, protocolos e novidades da ciência.", NAVY),
             ("💬", "Suporte e troca", "Com membros", "Tire dúvidas e aprenda com quem já está na jornada há mais tempo.", GREEN),
             ("🎁", "Ofertas antecipadas", "Lançamentos", "Membros recebem primeiro as novidades e promoções exclusivas.", RED),
             ("🏆", "Benefícios VIP", "Exclusivos", "Quanto mais ativo na comunidade, mais benefícios você desbloqueia.", "#F5A524")], cols=2),
    titulo("Escolha onde quer participar", "Estamos em 3 plataformas", pad="10px 32px 16px"),
    canais([("💬", GREEN, "WhatsApp", "Grupo oficial com suporte e novidades em tempo real", "Entrar", GRUPO_WA),
            ("f", "#1877F2", "Facebook", "Comunidade para compartilhar resultados e interagir", "Entrar", FB),
            ("✈", "#229ED9", "Telegram", "Conteúdo educativo e alertas de promoção", "Entrar", TG)]),
    destaque("Você não está sozinho(a) nessa jornada. Milhares de pessoas como você já fazem parte. Chegou a sua vez."),
    depoimento("Entrar no grupo do WhatsApp foi um divisor de águas. Ali aprendi a usar o protocolo correto e me senti parte de algo muito maior do que só comprar um suplemento.", "Cliente America Nutrition"),
    acao([("🧬 Entrar na comunidade agora", GRUPO_WA, "red")], "Gratuito e exclusivo para clientes America Nutrition"),
]

EMAILS["2.3-pos-compra-historia-carla"] = [
    hero("Uma história real", "Enquanto você aguarda", "Ela quase desistiu no décimo dia. Não desistiu.",
         f"{NOME}, queremos te contar uma história que pode mudar a forma como você encara os primeiros dias de uso."),
    texto("Carla tinha 54 anos quando comprou seu primeiro frasco. Nos primeiros dias, nada. Na segunda semana, ficou em dúvida.",
          f"{b('No décimo dia, ela quase parou.')}",
          "Foi quando entrou em contato com a Serena. Recebeu orientação sobre o protocolo, entendeu que a fase de adaptação é normal, e decidiu continuar.",
          "Hoje, no quarto frasco, ela mesma conta a história para quem está começando."),
    depoimento("Quase parei no décimo dia porque achei que não estava funcionando. A Serena me explicou que isso era completamente normal, que o corpo precisa de tempo para se adaptar. Continuei. No final do segundo mês, as pessoas ao meu redor perceberam antes de mim. Não consigo imaginar ter parado.",
               "Carla M.", "São Paulo · cliente há 4 meses"),
    aviso(f"💡 <b>O que a história da Carla ensina:</b> a fase de adaptação é real e normal. Se surgir dúvida nos primeiros dias, não tome decisões sozinho(a). A Serena está aqui para isso.", "#FFF4D6", "#7A4A00"),
    numeros([("4.98", "nota média ★★★★★"), ("+40.000", "avaliações"), ("99.8%", "recomendam")]),
    serena([f"{NOME}, se surgir qualquer dúvida, não espere.", "Me chame <b>antes</b> de tomar qualquer decisão. Estou aqui 24h, antes, durante e depois do uso 🧬"],
           "Falar com a Serena agora &rarr;"),
]

EMAILS["2.4-pos-compra-omega3"] = [
    hero("Ômega 3", "Potencialize seus resultados", "O combo que nossos clientes mais recomendam.",
         "ImunoFosfo + Ômega 3 MEG-3, a combinação que potencializa a ação celular.", IMG["omega"], btn("Adicionar Ômega 3", OMEGA_CK, "red")),
    texto(f"Olá, {NOME}! Agora que seu protocolo começou, queremos te apresentar algo que nossos clientes mais experientes já descobriram: o {b('Ômega 3 MEG-3')} é o complemento natural do ImunoFosfo.",
          "O Ômega 3 não é apenas para o coração. Com EPA e DHA de alta pureza, ele cria o ambiente celular ideal para que o ImunoFosfo atue com ainda mais eficiência, e dá para usar os dois juntos."),
    checklist("Por que adicionar o Ômega 3", [
        f"{b('EPA e DHA')} criam o ambiente celular ideal para a fosfoetanolamina agir com mais eficiência",
        f"Ação {b('anti-inflamatória sistêmica')} que complementa o ImunoFosfo",
        "Saúde cardiovascular, cerebral e articular, benefícios adicionais ao cuidado diário",
        "MEG-3 certificado, padrão de pureza mais alto disponível no mercado",
        "Frete grátis acima de R$ 250: aproveite no mesmo pedido"]),
    ficha([("ImunoFosfo", "Metabolismo celular e equilíbrio da imunidade"), ("Ômega 3", "EPA/DHA, potencializa o ambiente celular"),
           ("Como usar", "2 cápsulas/dia com as principais refeições"), ("Frete", "Grátis em pedidos acima de R$ 250")], "Combo ImunoFosfo + Ômega 3"),
    depoimento("Comecei só com o ImunoFosfo. Depois adicionei o Ômega 3 e a diferença foi notável. Recomendo o combo para quem quer potencializar os resultados.", "Beatriz M.", "Cliente America Nutrition"),
    acao([("Adicionar Ômega 3 ao pedido", OMEGA_CK, "red"), ("Saber mais sobre o Ômega 3", OMEGA_PG, "navy")], "🚚 Frete grátis acima de R$ 250 · 🔒 Pagamento seguro · 📦 Entrega rastreada"),
]

EMAILS["2.5-pos-compra-avaliacao"] = [
    hero("Avaliação", "★★★★★", "Sua opinião transforma a jornada de alguém 🎁",
         f"{NOME}, você já tem cerca de 2 semanas de uso real. Como está sendo sua experiência?", tag_color="#F5A524"),
    texto(f"Sua avaliação é muito mais do que uma nota: ela {b('ajuda outras pessoas')} que estão procurando exatamente o que você encontrou. Cada palavra sua tem o poder de mudar a jornada de saúde de alguém."),
    cupom("🎁 Seu presente por avaliar", "5% OFF", "na sua próxima compra", "Válido por 30 dias depois da avaliação", "⭐ Deixar minha avaliação agora", AVALIAR,
          "Leva menos de 2 minutos e faz uma diferença enorme 🧬"),
    passos(["Clique no botão e acesse o link de avaliação", "Dê sua nota e escreva sobre sua experiência", "Receba seu cupom de 5% de desconto na próxima compra 🎁"], "Como funciona"),
    aviso(f"💬 Ainda com dúvidas sobre seu produto? <a href=\"{SERENA}\" style=\"color:#ffffff;text-decoration:underline;font-weight:700;\">A Serena responde 24h</a>.", NAVY),
]

EMAILS["2.6-pos-compra-4-semanas"] = [
    hero("Conquista", "4 semanas de uso real", "Olha até onde você chegou 🏆",
         f"{NOME}, 4 semanas de protocolo contínuo. Isso não é pouca coisa: a maioria das pessoas desiste antes disso. Você não.", tag_color="#16A34A"),
    texto("Nessas 4 semanas, seu organismo passou por mudanças reais no nível celular. A fase de adaptação ficou para trás. O metabolismo celular está operando com o suporte que você escolheu dar a ele.",
          f"E o melhor ainda está por vir. Os resultados mais consistentes e duradouros aparecem {b('a partir do segundo mês de uso contínuo')}."),
    titulo("O que aconteceu nas últimas 4 semanas", "Sua jornada até aqui", pad="6px 32px 16px"),
    cartoes([("🔬", "Semana 1", "Fase de choque", "Ativação dos processos celulares com dose intensiva.", RED),
             ("⚡", "Semanas 2 e 3", "Adaptação", "O organismo aprendeu a trabalhar com o composto.", NAVY),
             ("🌱", "Semana 4", "Equilíbrio", "Manutenção diária, base sólida construída.", "#16A34A")]),
    destaque("O mês 2 é onde a mágica acontece. 🧬", "Clientes que completam o segundo ciclo relatam resultados mais consistentes. Continue: você está no caminho certo."),
    depoimento("No segundo mês foi onde realmente senti a diferença. Quem me acompanhou percebeu antes de mim. Vale muito a pena não desistir no começo.", "Cliente America Nutrition", "4 meses de uso"),
    acao([("💬 Falar com a Serena", SERENA, "green")]),
]

EMAILS["3.1-recompra-imunofosfo"] = [
    hero("Estoque", "⚠️ Seu estoque pode estar acabando", "Não perca o ritmo que você construiu.",
         f"{NOME}, faz algumas semanas que você está investindo na sua saúde, e isso merece parabéns! Mas há algo importante que precisamos te dizer.",
         IMG["imuno"], btn("🛒 Renovar meu estoque", PROD, "red")),
    texto(f"A {b('consistência é o segredo dos melhores resultados')}. Interromper o protocolo agora significa dar um passo atrás em tudo que você já conquistou, e ter que recomeçar do início."),
    aviso(f"📦 <b>Hora de renovar.</b> Se você está na manutenção com o frasco de 90 cápsulas (3 por dia), seu estoque está chegando ao fim. Não espere acabar para pedir o próximo.", "#FFF4D6", "#7A4A00"),
    checklist("Por que continuar agora?", [
        f"{b('Uso contínuo traz resultados consistentes')}: essa é a chave",
        f"{b('Interromper e reiniciar')} pode exigir uma nova fase de choque, atrasando os resultados que você trabalhou para alcançar",
        f"{b('Uso contínuo = resultados contínuos.')} Simples assim."]),
    acao([("🛒 Renovar meu estoque agora", PROD, "red")]),
    serena(["Precisa de ajuda para escolher o próximo ciclo?", "Eu te oriento no WhatsApp, 24h 💚"], "Falar com a Serena &rarr;"),
]

EMAILS["4.1-navegacao-abandonada"] = [
    hero("Aproveite", "Você viu algo interessante", f"{NOME}, ainda está pensando nisso?",
         "Você visitou o ImunoFosfo e foi embora sem levar. Acontece. Mas algumas decisões valem a pena ser retomadas.",
         IMG["imuno"], btn("Quero este produto", PROD, "red")),
    texto("Tomar uma decisão de saúde nunca é por impulso. E está certo que seja assim.",
          "Mas existe uma diferença entre pensar com calma e deixar para depois sem necessidade.",
          f"{b('O organismo não espera o momento perfeito.')} O cuidado que começa hoje já faz diferença amanhã."),
    checklist("Por que a America Nutrition", [
        "Suplementos de alta pureza desenvolvidos com tecnologia americana",
        "Mais de 10.000 avaliações verificadas no Judge.me",
        "Sem efeitos colaterais conhecidos: uso seguro e prolongado",
        "Pagamento seguro · Frete grátis acima de R$ 250 · Entrega rastreada"]),
    depoimento("Fiquei semanas olhando e saindo sem comprar. Quando finalmente decidi, me arrependi de não ter comprado antes. A diferença foi perceptível desde a primeira semana.", "Cliente America Nutrition"),
    acao([("Ver o produto agora", PROD, "red"), ("Ver depoimentos", DEP, "navy")], "🔒 Pagamento seguro · 📦 Entrega rastreada"),
    serena(["Ficou com alguma dúvida sobre o ImunoFosfo?", "Me chama aqui: respondo em minutos, 24h 💚"], "Tirar uma dúvida &rarr;"),
    titulo("Entre para a comunidade", "Faça parte antes de decidir", pad="4px 32px 16px"),
    canais([("💬", GREEN, "WhatsApp", "Grupo oficial com suporte da equipe e novidades", "Entrar", GRUPO_WA),
            ("f", "#1877F2", "Facebook", "Depoimentos reais e troca de experiências", "Participar", FB)]),
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

ASSUNTOS = {
    "1.1-boas-vindas-cupom": "{{ nome }}, seu cupom de 10% OFF chegou 🎁",
    "1.2-boas-vindas-comunidade": "{{ nome }}, você foi convidado(a) para a nossa comunidade",
    "1.3-boas-vindas-como-age": "{{ nome }}, sabe como o ImunoFosfo age no seu organismo?",
    "1.4-boas-vindas-depoimentos": "{{ nome }}, os resultados falam por si mesmos",
    "2.1-pos-compra-guia-de-uso": "Leia antes de abrir seu produto 📋",
    "2.2-pos-compra-comunidade": "🧬 {{ nome }}, você foi convidado(a) para a nossa comunidade",
    "2.3-pos-compra-historia-carla": "Ela quase desistiu no décimo dia, {{ nome }}",
    "2.4-pos-compra-omega3": "O complemento que nossos clientes mais usam com o ImunoFosfo",
    "2.5-pos-compra-avaliacao": "⭐ {{ nome }}, como está sendo sua experiência?",
    "2.6-pos-compra-4-semanas": "🏆 Olha até onde você chegou, {{ nome }}",
    "3.1-recompra-imunofosfo": "⚠️ {{ nome }}, seu ImunoFosfo pode estar acabando",
    "4.1-navegacao-abandonada": "O que faz você se sentir equilibrado?",
    "5.1-cliente-vip": "👑 Você é VIP, {{ nome }}: sua recompensa exclusiva chegou",
}
PREVIAS = {
    "1.1-boas-vindas-cupom": "Código exclusivo dentro. O desconto aplica sozinho no clique.",
    "1.2-boas-vindas-comunidade": "WhatsApp, Facebook ou Telegram: escolha seu canal. Suporte real, relatos reais, todo dia.",
    "1.3-boas-vindas-como-age": "Modulação imunológica, comunicação celular, ação anti-inflamatória e suporte metabólico.",
    "1.4-boas-vindas-depoimentos": "Depoimentos verificados de quem seguiu o protocolo.",
    "2.1-pos-compra-guia-de-uso": "O jeito certo de usar faz toda a diferença. Preparamos tudo para você começar bem.",
    "2.2-pos-compra-comunidade": "WhatsApp, Facebook ou Telegram: conteúdo, suporte e novidades em primeira mão.",
    "2.3-pos-compra-historia-carla": "Uma história real que pode mudar como você encara os primeiros dias de uso.",
    "2.4-pos-compra-omega3": "Ômega 3 MEG-3 de alta pureza, com EPA e DHA para o cuidado diário 🧬",
    "2.5-pos-compra-avaliacao": "Sua avaliação ajuda outras pessoas e ainda garante um mimo exclusivo para você.",
    "2.6-pos-compra-4-semanas": "4 semanas de protocolo contínuo. E o melhor ainda está por vir.",
    "3.1-recompra-imunofosfo": "Interromper o protocolo agora pode atrasar o que você já conquistou. Renove em 1 minuto.",
    "4.1-navegacao-abandonada": "Você visitou e foi embora. Mas algumas decisões valem a pena ser retomadas.",
    "5.1-cliente-vip": "Você faz parte de um grupo seleto. Preparamos um cupom exclusivo de 15% para você.",
}

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    os.makedirs(out, exist_ok=True)
    for slug, linhas in EMAILS.items():
        with open(os.path.join(out, slug + ".html"), "w") as f:
            f.write(documento(ASSUNTOS[slug].replace("{{ nome }}", "").strip(" ,"), PREVIAS[slug], linhas))
    print(len(EMAILS), "modelos em", out)
