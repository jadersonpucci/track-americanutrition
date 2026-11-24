# Site (tema da Shopify)

## Black Friday 2026 no site (24/11/2026)
O tema rascunho de 05/11 não será usado (decisão do Jaderson). A Black entra por um único arquivo numa cópia do tema
atual, **Concept 6.0.2 · Black 2026** (`160629719212`), feita em 24/11 a partir do publicado (`155877212332`):
`snippets/an-esquenta-popup.liquid` passou a ter o conteúdo de [`an-black-2026.liquid`](an-black-2026.liquid). Com isso o popup
do Esquenta sai e a Black entra em todas as páginas.
- Liga sozinho de qui 26/11 20h até seg 30/11 23h59 (Brasília). Fora disso não aparece nada, então a cópia pode ser
  publicada antes.
- Prévia: `?preview_theme_id=160629719212&black=preview`.
- Barra preta no topo com contagem; faixa da Black no começo da home.
- Páginas de produto da Black (mesma lista dos descontos automáticos): a caixa de compra calcula 20/30/35/40% pela
  quantidade de frascos, contando o Ômega 3 adicionado junto, igual ao carrinho. Mostra o preço cheio riscado, a linha
  "Black −X%", "3x sem juros · em até 12x" e esconde o campo de cupom.
- Edição direta do tema publicado ficou bloqueada (o conector da Shopify não liberou a edição de temas). Por isso a
  mudança foi feita na cópia, que o Jaderson publica.

## Black Friday 2026 (05/11/2026)
- Tema rascunho **Black Friday 2026 (rascunho)** (`159845712044`), cópia do tema publicado
  `America Nutrition - Concept 6.0.2` (`155877212332`) feita em 05/11. O tema publicado não foi alterado.
- Prévia: https://www.americanutrition.com/?preview_theme_id=159845712044
- `an-black-friday.liquid` → `sections/an-black-friday.liquid` do rascunho. Seção "AN · Black Friday" no topo da
  home (`templates/index.json`, antes do hero rotativo): topo azul com contagem, kits do ImunoFosfo (1, 3 e 6
  frascos = 1, 3 e 6 meses de manutenção), ofertas da linha (blocos de produto: foto, nome e preço atual vêm da
  loja; preço da campanha e selo vêm do bloco) e calendário Esquenta / Black Friday / Cyber Monday.
- Tudo editável no editor do tema (datas, preços, textos, produtos). Aparece entre "Mostrar a partir de" e o fim da
  campanha; no editor aparece sempre. Imagem do frasco recortada em `assets/an-bf-frasco.png`.
- Barra do topo (`sections/header-group.json`): a contagem "countdown-condensed" de 2025 foi religada no rascunho
  com o texto e a data de 2026 (30/11 23:59).
- Preços e descontos são proposta (ainda não existem descontos automáticos na Shopify): 1 frasco R$ 259,
  Kit 3 R$ 687, Kit 6 R$ 1.194; linha completa com 20 a 26%. Os botões levam à página do produto.
- Atenção: a loja tem 20 temas (o limite da Shopify). Para criar outro tema, apague um antigo antes.
