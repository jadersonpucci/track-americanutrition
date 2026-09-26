# Financeiro · America Nutrition

Sistema financeiro completo para substituir o Nibo: contas a pagar e a receber, extrato e conciliação bancária, fluxo de caixa, DRE gerencial, relatórios, cadastros e integrações. Sem framework, sem build: HTML + CSS + ES modules, servido como arquivo estático (Vercel / Hostinger).

## O que tem

| Área | Funcionalidades |
|---|---|
| Visão geral | saldo consolidado com projeção, contas com ícone do banco, atrasados / hoje / 7 dias, fluxo de 30 dias, resumo do mês vs mês anterior, composição de despesas, vencendo, últimos movimentos |
| Contas a pagar / receber | período, busca, filtros (status, conta, categoria, contato, centro de custo, tag), agrupamento por dia/semana, seleção múltipla com baixa em lote, exportação CSV |
| Lançamento | despesa / receita / transferência, contato com criação inline, categoria com **rateio**, centro de custo com **rateio em %**, conta, forma, **parcelamento** (dividir ou por parcela), **recorrência** (semanal → anual, por nº de vezes ou até data), "já foi pago", tags, referência, observações, **anexos** (arquivo ou link) |
| Baixa | data, conta, valor (parcial ou total), juros, multa, desconto; estorno; baixa em lote |
| Contas e extrato | saldo por conta, extrato com saldo corrente, previsto (60 dias), **conciliação** com importação **OFX/CSV**, sugestão automática, conciliar em um clique, criar lançamento a partir da linha, ignorar |
| Fluxo de caixa | dia / semana / mês, 30–90 dias (ou 6–12 meses), realizado vs previsto, saldo acumulado, atrasados caindo em "hoje", por conta ou consolidado |
| DRE | competência ou caixa, 12 meses, grupos → subgrupos → categorias, % da receita, filtro por centro de custo, exportação e impressão |
| Relatórios | por categoria, por contato, por centro de custo, evolução mensal, atrasados por faixa, lançamentos detalhados |
| Cadastros | contas (49 bancos/gateways com logo), categorias (plano de contas com código DRE, ícone, cor), contatos (busca de CNPJ na Receita), centros de custo, tags |
| Configurações | multiempresa, backup/restauração JSON, importação do Nibo, importação CSV, dados de exemplo, conexão Supabase, integrações n8n, tema claro/escuro, densidade, atalhos |

Atalhos: `⌘K` busca e comandos · `N` despesa · `R` receita · `T` transferência · `G` + `H/P/R/E/F/D` navega.

## Onde os dados ficam

**Modo local (padrão):** tudo no `localStorage` do navegador. Funciona na hora, sem servidor. Faça backup em Configurações → Dados.

**Supabase (recomendado para uso real):** multiusuário, Mac + iPhone, integrações via n8n.

1. No Supabase self-hosted (`supabase.americanutrition.com`), abra o SQL Editor e rode `supabase/schema.sql`.
2. Crie os usuários em Authentication → Users (e-mail + senha).
3. No app: Configurações → Conexão → Supabase, informe URL, `anon key`, e-mail e senha. Salvar e conectar.
4. Se já usava o modo local, clique em "Enviar dados locais pro Supabase".

## Migrar do Nibo

No Mac, com o `apitoken` do Nibo (Configurações → Integrações → API):

```bash
python3 scripts/importar-nibo.py --token SEU_APITOKEN --saida nibo.json
```

Depois: Configurações → Dados → **Importar arquivo do Nibo**. Contas, categorias, centros de custo, contatos e lançamentos (com baixas) entram casando por nome com o que já existe. Rodar de novo não duplica (usa o id do Nibo como referência).

## Lançamentos automáticos (n8n)

Com o Supabase conectado, os workflows (Shopify pedido pago, Pagar.me, Mercado Livre) inserem direto na tabela `lancamentos` via REST com a `service_role` key. Payloads de exemplo com os ids certos ficam em Configurações → Integrações. O índice único `(empresa_id, origem, origem_ref)` impede duplicatas.

## Estrutura

```
financeiro/
  index.html            shell
  css/app.css           tokens, componentes, telas, responsivo, dark, print
  js/app.js             layout, roteador, ⌘K, atalhos, onboarding
  js/db.js              backends local (localStorage) e Supabase (PostgREST + Auth)
  js/model.js           status, saldos, fluxo, DRE, parcelas, recorrência, conciliação
  js/ui.js              componentes (drawer, modal, combobox, money input, menus, toasts…)
  js/charts.js          gráficos SVG (barras, linha, donut, sparkline)
  js/bancos.js          registro de bancos e logos
  js/seed.js            plano de contas e dados de exemplo
  js/views/*.js         uma tela por arquivo
  assets/bancos/        logos
supabase/schema.sql     tabelas, índices, RLS, views
scripts/importar-nibo.py
```

## Deploy

Está dentro do projeto `track.americanutrition.com`, em `/financeiro`. O `vercel.json` já exclui esse caminho da reescrita de códigos de rastreio. Para domínio próprio (ex.: `financeiro.americanutrition.com`), crie um projeto na Vercel apontando a **Root Directory** para `financeiro`.
