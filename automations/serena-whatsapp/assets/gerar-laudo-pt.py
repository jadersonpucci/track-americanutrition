#!/usr/bin/env python3
# Gera a traducao de cortesia (PT-BR) do laudo toxicologico do ImunoFosfo.
# O documento oficial continua sendo o original em ingles emitido pela Nulab, Inc.: este PDF e so
# para o cliente brasileiro conseguir ler, e diz isso na capa e no rodape de todas as paginas.
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, KeepTogether)

SAIDA = os.environ.get('SAIDA', 'laudo_pt.pdf')
AZUL = colors.HexColor('#1B3A6B')
AZUL_CLARO = colors.HexColor('#E8EEF7')
CINZA = colors.HexColor('#5B6478')

def estilo(nome, **kw):
    base = dict(fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#1B2233'))
    base.update(kw)
    return ParagraphStyle(nome, **base)

H1 = estilo('H1', fontName='Helvetica-Bold', fontSize=19, leading=23, textColor=AZUL, spaceAfter=2)
SUB = estilo('SUB', fontSize=10.5, leading=15, textColor=CINZA)
H2 = estilo('H2', fontName='Helvetica-Bold', fontSize=12.5, leading=16, textColor=AZUL, spaceBefore=12, spaceAfter=5)
P = estilo('P', alignment=TA_JUSTIFY, spaceAfter=5)
PEQ = estilo('PEQ', fontSize=8.2, leading=11.5, textColor=CINZA)
CEL = estilo('CEL', fontSize=9)
CELB = estilo('CELB', fontName='Helvetica-Bold', fontSize=9)

def rodape(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#DDE3EE'))
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, 16 * mm, A4[0] - 20 * mm, 16 * mm)
    canvas.setFont('Helvetica', 7.3)
    canvas.setFillColor(CINZA)
    canvas.drawString(20 * mm, 11.5 * mm,
        'Tradução de cortesia para leitura. Documento oficial: relatório original em inglês da Nulab, Inc. '
        '(NULAB-TX-IF-2026-289).')
    canvas.drawRightString(A4[0] - 20 * mm, 11.5 * mm, 'Página %d' % doc.page)
    canvas.restoreState()

def tabela(dados, larguras):
    t = Table(dados, colWidths=larguras, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), AZUL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, AZUL_CLARO]),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.HexColor('#DDE3EE')),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#C8D2E4')),
    ]))
    return t

doc = BaseDocTemplate(SAIDA, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=22 * mm,
                      title='Laudo Toxicológico ImunoFosfo - tradução PT-BR',
                      author='America Nutrition')
doc.addPageTemplates([PageTemplate(id='pad',
    frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')], onPage=rodape)])

e = []
e.append(Paragraph('Laudo Toxicológico Completo', H1))
e.append(Paragraph('ImunoFosfo&reg; &middot; Fosfoetanolamina Sintética Bioidêntica', SUB))
e.append(Spacer(1, 10))

aviso = Table([[Paragraph(
    '<b>Esta é uma tradução livre, feita pela America Nutrition para facilitar a leitura.</b> '
    'O documento oficial é o relatório original em inglês, emitido pelo laboratório Nulab, Inc. '
    '(relatório NULAB-TX-IF-2026-289, de 16 de janeiro de 2026), que segue disponível e prevalece '
    'em qualquer divergência. Nenhum resultado foi alterado nesta tradução.', PEQ)]],
    colWidths=[doc.width])
aviso.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFF8E6')),
    ('BOX', (0, 0), (-1, -1), 0.7, colors.HexColor('#E8C86A')),
    ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
]))
e.append(aviso)
e.append(Spacer(1, 12))

e.append(tabela([
    [Paragraph('Identificação do relatório', CELB), ''],
    [Paragraph('Laboratório emissor', CEL), Paragraph('Nulab, Inc.', CEL)],
    [Paragraph('Número do relatório', CEL), Paragraph('NULAB-TX-IF-2026-289', CEL)],
    [Paragraph('Data de emissão', CEL), Paragraph('16 de janeiro de 2026', CEL)],
    [Paragraph('Lote analisado', CEL), Paragraph('8329US', CEL)],
    [Paragraph('Endereço', CEL), Paragraph('2161 Logan St, Clearwater, FL 33765 - EUA', CEL)],
    [Paragraph('Registros', CEL), Paragraph('Estado da Flórida #292398 &middot; US FDA #14474720618', CEL)],
], [55 * mm, doc.width - 55 * mm]))
e.append(Spacer(1, 6))
e.append(Paragraph('<font color="#1B7A3A"><b>TODOS OS ENSAIOS EM CONFORMIDADE</b></font>', estilo('ok', fontSize=10.5)))

e.append(Paragraph('Resumo', H2))
e.append(Paragraph(
    'Este relatório descreve uma avaliação toxicológica ampla do ImunoFosfo&reg;, um suplemento alimentar '
    'formulado com fosfoetanolamina sintética bioidêntica. A avaliação foi conduzida pela Nulab, Inc. sob as '
    'Boas Práticas de Fabricação vigentes (cGMP), conforme o 21 CFR Parte 111 e alinhada às orientações '
    'aplicáveis da USP e do FDA. O objetivo foi determinar a presença ou ausência de contaminantes tóxicos, '
    'verificar a segurança microbiológica e confirmar que o produto está livre de resíduos perigosos que '
    'pudessem representar risco à saúde humana.', P))
e.append(Paragraph(
    '<b>Resultado:</b> o produto apresenta <b>perfil toxicológico limpo</b>, sem substâncias tóxicas '
    'detectáveis dentro do alcance e da sensibilidade dos métodos aplicados.', P))

e.append(Paragraph('Declaração de conformidade com as BPF (cGMP)', H2))
e.append(Paragraph(
    'A Nulab, Inc. mantém conformidade integral com as Boas Práticas de Fabricação vigentes (cGMP), conforme '
    'definido no 21 CFR Parte 111. Todos os ensaios analíticos, o tratamento dos dados e as atividades de '
    'garantia da qualidade associados a este relatório foram executados sob um Sistema de Gestão da Qualidade '
    'controlado, que inclui procedimentos documentados de custódia das amostras, treinamento dos analistas, '
    'calibração de equipamentos, validação de métodos, controle de desvios e retenção de registros, '
    'assegurando integridade dos dados e prontidão regulatória.', P))

e.append(Paragraph('Identificação da amostra', H2))
e.append(tabela([
    [Paragraph('Campo', CELB), Paragraph('Informação', CELB)],
    [Paragraph('Nome do produto', CEL), Paragraph('ImunoFosfo&reg;', CEL)],
    [Paragraph('Forma farmacêutica', CEL), Paragraph('Cápsulas', CEL)],
    [Paragraph('Ingrediente ativo', CEL), Paragraph('Fosfoetanolamina sintética bioidêntica', CEL)],
    [Paragraph('Lote', CEL), Paragraph('8329US', CEL)],
    [Paragraph('Origem de fabricação', CEL), Paragraph('Estados Unidos', CEL)],
    [Paragraph('Recebimento da amostra', CEL), Paragraph('12 de janeiro de 2026', CEL)],
], [55 * mm, doc.width - 55 * mm]))

e.append(Paragraph('Métodos analíticos', H2))
e.append(Paragraph('A avaliação toxicológica empregou metodologias validadas e otimizadas para sensibilidade:', P))
e.append(tabela([
    [Paragraph('Método', CELB), Paragraph('Nome completo', CELB), Paragraph('Aplicação', CELB)],
    [Paragraph('ICP-MS', CEL), Paragraph('Espectrometria de massas com plasma indutivamente acoplado', CEL),
     Paragraph('Detecção de metais pesados em nível de traço', CEL)],
    [Paragraph('GC-MS', CEL), Paragraph('Cromatografia gasosa acoplada à espectrometria de massas', CEL),
     Paragraph('Triagem de solventes residuais e agrotóxicos', CEL)],
    [Paragraph('HPLC', CEL), Paragraph('Cromatografia líquida de alta eficiência', CEL),
     Paragraph('Confirmação de identidade e pureza', CEL)],
    [Paragraph('USP Micro', CEL), Paragraph('Ensaios microbiológicos alinhados à USP', CEL),
     Paragraph('Detecção de patógenos e organismos indicadores', CEL)],
], [24 * mm, 68 * mm, doc.width - 92 * mm]))

e.append(KeepTogether([
    Paragraph('Metais pesados', H2),
    tabela([
        [Paragraph('Analito', CELB), Paragraph('Resultado', CELB), Paragraph('Limite', CELB), Paragraph('Situação', CELB)],
        [Paragraph('Chumbo (Pb)', CEL), Paragraph('Não detectado (&lt; 0,01 ppm)', CEL), Paragraph('&le; 0,5 ppm', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Arsênio (As)', CEL), Paragraph('Não detectado (&lt; 0,01 ppm)', CEL), Paragraph('&le; 0,5 ppm', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Cádmio (Cd)', CEL), Paragraph('Não detectado (&lt; 0,005 ppm)', CEL), Paragraph('&le; 0,3 ppm', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Mercúrio (Hg)', CEL), Paragraph('Não detectado (&lt; 0,002 ppm)', CEL), Paragraph('&le; 0,1 ppm', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
    ], [38 * mm, 52 * mm, 28 * mm, doc.width - 118 * mm]),
]))

e.append(KeepTogether([
    Paragraph('Análises microbiológicas', H2),
    tabela([
        [Paragraph('Ensaio', CELB), Paragraph('Resultado', CELB), Paragraph('Especificação', CELB), Paragraph('Situação', CELB)],
        [Paragraph('Contagem total de aeróbios', CEL), Paragraph('Abaixo do limite de detecção', CEL), Paragraph('&le; 10&#179; UFC/g', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Leveduras e bolores', CEL), Paragraph('Abaixo do limite de detecção', CEL), Paragraph('&le; 10&#178; UFC/g', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Escherichia coli', CEL), Paragraph('Não detectada', CEL), Paragraph('Ausente', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
        [Paragraph('Salmonella spp.', CEL), Paragraph('Não detectada', CEL), Paragraph('Ausente', CEL), Paragraph('<font color="#1B7A3A">CONFORME</font>', CEL)],
    ], [45 * mm, 50 * mm, 28 * mm, doc.width - 123 * mm]),
]))

e.append(Paragraph('Declaração de perfil toxicológico limpo', H2))
e.append(Paragraph(
    'Dentro do alcance das análises realizadas, o lote de ImunoFosfo&reg; testado não apresentou níveis '
    'detectáveis de metais pesados tóxicos, não apresentou contaminação microbiológica e não apresentou '
    'solventes residuais ou resíduos de agrotóxicos de preocupação. Os dados sustentam a conclusão de que o '
    'produto está limpo, é química e microbiologicamente seguro, e livre de resíduos tóxicos dentro dos '
    'limites de sensibilidade das metodologias aplicadas.', P))

e.append(Paragraph('Considerações regulatórias - consulta ao FDA', H2))
e.append(Paragraph(
    'Este relatório foi preparado para subsidiar consultas regulatórias e de qualidade, inclusive pedidos de '
    'informação do FDA. Todos os dados de origem são mantidos conforme os requisitos de retenção de registros '
    'das cGMP e podem ser disponibilizados para análise regulatória autorizada, mediante solicitação.', P))

e.append(Spacer(1, 10))
e.append(Paragraph('<b>Autorizado por</b><br/>Dr. Michael R. Thompson, PhD<br/>'
                   'Diretor de Toxicologia - Nulab, Inc.', estilo('ass', fontSize=9.5, leading=14)))
e.append(Spacer(1, 8))
e.append(Paragraph(
    'Este relatório é emitido exclusivamente para a amostra avaliada e não pode ser reproduzido, exceto na '
    'íntegra, sem autorização por escrito da Nulab, Inc.', PEQ))

doc.build(e)
print('gerado:', SAIDA)
