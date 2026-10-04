# Loja · America Nutrition (substitui a Shopify)

Clone da loja **americanutrition.com** como site estático próprio + painel administrativo. Mesmas URLs, mesmo visual, mesmos ids de produto e variante — o checkout próprio (`checkout.americanutrition.com`) continua funcionando sem mudança.

## O que tem

| Parte | Como funciona |
|---|---|
| **Loja** (`/`) | Gerada por `build.mjs` a partir dos dados. Home com as mesmas seções do tema (hero rotativo, Outubro Rosa, linha de produtos, mais procurados, texto rolando, vídeo, produto em destaque, depoimentos, blog), coleções com filtro/ordenação, as 16 landing pages dos produtos copiadas da Shopify, 35 páginas, 3 blogs com 147 artigos, políticas, busca, carrinho, "Meus pedidos" (rastreio) e 404. |
| **Carrinho** | `assets/theme.js` guarda o carrinho no navegador e responde a **mesma API Ajax da Shopify** (`/cart.js`, `/cart/add.js`, `/cart/change.js`, `/cart/update.js`, `/cart/clear.js`, `/cart/{variante}:{qtd}`). As landing pages e o script de checkout da AN funcionam sem alteração: "Pagar" leva a `checkout.americanutrition.com/?items=variante:qtd:preço&ref=…&discount=…`. |
| **Depoimentos** | As seções que liam metaobjects pela Storefront API agora recebem os mesmos dados de `/depoimentos.json` (409 depoimentos exportados), sem mudar o HTML delas. |
| **Compatibilidade** | `/products.json`, `/products/{h}.js(on)`, `/collections.json`, `/collections/{h}/products.json`, `/pages.json` no formato da Shopify (a página de rastreio lê `/products.json`). Sitemap, robots, JSON-LD de produto/artigo/organização, Open Graph. |
| **Marketing** | GTM, Google Ads, UTMify, Klaviyo, atribuição `an_src`, afiliados (`an_aff`, `?ref`, `?d`), botões de WhatsApp (Serena) e Telegram — copiados da loja atual. Eventos `view_item` e `add_to_cart` vão para o `dataLayer` (e `fbq`, se houver pixel). |
| **Painel** (`/admin`) | Visão geral, pedidos (status, rastreio, histórico), clientes, cupons, produtos (variantes, imagens, SEO, landing própria, coleções), coleções manuais/automáticas, página inicial com **prévia ao vivo** (arrastar seções, editar slides do hero etc.), páginas, blog, depoimentos, cabeçalho e rodapé, configurações, redirecionamentos e publicar. Mesmo login do Financeiro. |

## Rodar no Mac

```bash
cd loja
node build.mjs            # gera loja/dist a partir de data/loja.json
npx serve dist            # http://localhost:3000  ·  painel em http://localhost:3000/admin
```

Sem servidor configurado o painel abre em **modo demonstração** (dados do último build, alterações no navegador; "Publicar" baixa o `loja.json` para salvar em `loja/data/`).

## Dados

- `data/loja.json` + `data/html/*.html` — snapshot importado da Shopify em 04/10/2026.
- Para recapturar: `node scripts/loja-capturar.mjs ./captura` e `python3 scripts/loja-importar.py --captura ./captura`.
- Em produção o build lê do banco: `LOJA_API=https://n8n.americanutrition.com/webhook/loja-api LOJA_BUILD_TOKEN=… node build.mjs` (op `publicado`, token em `checkout_config.loja_build_token`).

## Banco (Supabase) e n8n

`supabase/loja.sql` (idempotente, depois de `schema.sql`): tabelas `loja_produtos`, `loja_colecoes`, `loja_paginas`, `loja_blogs`, `loja_artigos`, `loja_depoimentos`, `loja_config`, `loja_pedidos`, `loja_cupons`, `loja_publicacoes`, view `loja_variantes` e as funções:

| Função | Uso |
|---|---|
| `loja_api(body)` | API do painel (login com `fin_usuarios`). Webhook n8n **Loja · API**: `POST /webhook/loja-api` → `select loja_api({{$json.body}}::jsonb)`; se a resposta trouxer `deploy_hook`, fazer `POST` nele (deploy hook da Vercel) e marcar `loja_publicacoes.status = 'ok'`. |
| `loja_pedido_criar(payload)` | Cria o pedido no formato que os fluxos já montam para a Shopify (`customer`, `shipping_address`, `shopify_items`, `discount_code`, `payment`, `paid`, `ref`, `idempotency_key`). Idempotente por chave/transação; baixa estoque e soma uso do cupom. Devolve `{order_number, name}` como a Shopify. |
| `loja_cupom_validar(code, subtotal, email, cpf)` | Mesma resposta do fluxo "Shopify — Validar Cupom": `{valid, kind, value, code}`. |
| `loja_pedido_rastreio(numero, codigo)` | Grava o rastreio e marca como enviado. |

Testado num Postgres 16 local com os dados reais: carga do catálogo, `load`/`upsert`/`set`, pedido com cupom (idempotência e duplicata), resumo, clientes, edição de rastreio pelo painel e build lendo do banco (mesmas páginas do build a partir do arquivo).

Histórico: `python3 scripts/loja-importar-pedidos.py --loja 39c4f8-2.myshopify.com --token shpat_… --saida pedidos.sql` (pedidos com rastreio e status + cupons).

## Deploy

Projeto novo na Vercel ligado a este repositório, **Root Directory `loja`** (o `vercel.json` daqui já define build `node build.mjs` e saída `dist`). Variáveis `LOJA_API` e `LOJA_BUILD_TOKEN` quando o banco estiver no ar. Criar um Deploy Hook e gravar em `checkout_config.loja_deploy_hook`.

## Virada (Shopify → loja própria)

1. **Mídia**: imagens, vídeos e arquivos ainda apontam para `cdn.shopify.com` / `americanutrition.com/cdn/shop/…`. Copiar para o CDN próprio (`cdn.americanutrition.com`) e trocar as URLs **antes** de cancelar a Shopify — senão somem.
2. **Checkout/n8n**: nos fluxos "Pagar.me — Criar Pedido", "AN - PIX Banco Inter", "Checkout US — Stripe", "AN - Assinatura", "AN Checkout Bump", trocar a criação do pedido na Shopify por `loja_pedido_criar`; em "Shopify — Validar Cupom", usar `loja_cupom_validar`; "Pagar.me — Consultar Status" e o conciliador de tráfego passam a ler `loja_pedidos`. Rastreio/etiquetas: `loja_pedido_rastreio`.
3. **Depoimentos**: a automação que cria metaobjects "depoimento" na Shopify passa a gravar em `loja_depoimentos`.
4. **Avaliações**: as notas/totais do Judge.me foram copiadas para os produtos; o widget de avaliações das landings continua no serviço atual (`anrv`).
5. **Pixels**: os pixels instalados por apps da Shopify (Meta, TikTok via Web Pixels) não vêm junto — colar o código em Configurações → Scripts.
6. **Páginas de campanha antigas** (`dia-do-consumidor…`, `fosfoetanolamina`, `imunofosfo-combate-ao-cancer-existe`, `live-21-08…`) usavam blocos padrão do tema e aparecem marcadas para revisão.
7. **DNS**: apontar `americanutrition.com`/`www` para a Vercel. As URLs são as mesmas; `/collections/x/products/y`, `/account/*`, `/checkout`, `/pt-br/*` têm redirecionamento.
