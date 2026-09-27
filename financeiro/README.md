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

## Produção

- App: **https://financeiro.americanutrition.com** (Vercel, projeto `financeiro-americanutrition`, root `financeiro/`). Também responde em `financeiro-americanutrition.vercel.app`.
- Dados: Postgres do Supabase self-hosted, acessado só pelo n8n. O navegador fala com `POST https://n8n.americanutrition.com/webhook/financeiro-api` (workflow **Financeiro · API**), que chama a função `fin_api` no banco. Nenhuma chave do Supabase vai pro navegador.
- Login: usuários e sessões próprios (`fin_usuarios`, `fin_sessoes`, bcrypt). Sessão vale 30 dias e renova a cada uso.
- Schema: `supabase/schema.sql`, aplicado pelo workflow **Financeiro · Setup (schema)** no n8n (gatilho manual, idempotente). Rode de novo sempre que o schema mudar.
- Novo usuário: no SQL Editor do Supabase rode `select fin_criar_usuario('email', 'Nome', 'senha');`.

**Modo local (alternativo):** em Configurações → Conexão dá pra usar só o navegador (`localStorage`), sem servidor. Útil pra testes; faça backup em Configurações → Dados.

## Pagar.me e Banco Inter em tempo real

O workflow **Financeiro · Sync (Pagar.me + Inter)** (n8n, a cada 10 min) chama `fin_sync_staging()` e espelha nos lançamentos:

- **Pagar.me**: cada venda paga vira recebimento bruto (Vendas, cliente PAGARME GATEWAY) + taxa (Tarifa bancária, fornecedor PAGAR.ME) na conta Pagar.me; estornos e chargebacks viram saída (Devoluções); cada saque vira transferência Pagar.me → conta configurada em `checkout_config.fin_pgm_saque_conta` (padrão Stone).
- **Inter**: PIX e boletos do checkout viram recebimentos na conta Inter. Com a permissão **Extrato** liberada na aplicação da API do Inter, a varredura de 10 min também traz TED/DOC/depósitos e todos os **débitos** (PIX enviado, boletos pagos, tarifas, impostos), que entram como pagos, com categoria sugerida quando dá para inferir.

Os coletores continuam sendo os workflows "AN - Pagar.me → Nibo" e "AN - PIX Banco Inter (Provedor)", que gravam nas tabelas `pagarme_nibo_lancamentos` / `inter_nibo_lancamentos`. Com `checkout_config.fin_lancar = on` eles funcionam mesmo com o Nibo desligado (`pgm_nibo_lancar` / `nibo_lancar = off`). `fin_desde` define a partir de quando espelhar (antes disso os dados vieram da importação do Nibo).

## O que já foi migrado do Nibo

| Fluxo (n8n) | Antes | Agora |
|---|---|---|
| Relatório Mensal · Fechamento (`/webhook/relatorio`) | contas pagas do Nibo | `v_lancamentos` (pagar, pago, por vencimento) |
| Relatório Internacional · USA (`/webhook/relatorio-usa`) | idem + centro de custo | idem, `rateio_centros` → centro "Estados Unidos" |
| Painel Diretoria · Web | despesas, contas em aberto e saldos do Nibo | mesmas consultas no Financeiro |
| Nibo - Lancar Comissao Afiliado (`/webhook/nibo-lancar-comissao`) | POST /payments no Nibo | `fin_lancar_comissao()` (conta Stone, categoria Comissões) |
| AN - Pagar.me → Nibo, conferência diária 9h05 | Pagar.me × Nibo | Pagar.me × Financeiro |

Os nós Postgres devolvem o mesmo formato que a API do Nibo devolvia, então o HTML dos relatórios não mudou.

## Plano de contas e DRE

O DRE gerencial segue 7 grupos, na ordem de um DRE profissional. Cada categoria tem código (`1.1.01`…), grupo e subgrupo; a ordem no DRE vem do código.

| Grupo | Subgrupos | Linha de resultado logo abaixo |
|---|---|---|
| 1. Receita bruta | Receita de vendas, Outras receitas | |
| 2. Deduções da receita | Devoluções e estornos, Impostos sobre vendas | **Receita líquida** |
| 3. Custos variáveis | Produto, Logística, Vendas (comissões, taxas de gateway e marketplace) | **Margem de contribuição** |
| 4. Despesas operacionais | Marketing, Pessoas, Ocupação e utilidades, Tecnologia, Administrativas, Tributos | **Resultado operacional (EBITDA)** |
| 5. Resultado financeiro | Receitas financeiras, Despesas financeiras (juros, IOF, multas) | **Resultado líquido** |
| 6. Investimentos | Equipamentos, ativo fixo, construção, aporte em coligadas (USA) | |
| 7. Sócios e financiamentos | Empréstimos, Retiradas de sócios, Distribuição de lucros | **Resultado após investimentos e sócios** |

Categorias novas nascem em `financeiro/js/seed.js`. Para uma base que veio do Nibo, `supabase/migracao_dre.sql` renomeia e reagrupa as categorias existentes (mantendo os ids), cria as que faltam, reclassifica os lançamentos por regras de descrição/fornecedor (tráfego pago, embalagens, encargos, retiradas de sócios, aporte USA…) e arquiva as categorias antigas do Nibo. É idempotente (marcador `fin_dre_v2` em `checkout_config`) e roda pelo workflow **Financeiro · Setup (schema)**. O que não casou com nenhuma regra fica em **A classificar** (grupo 4) para revisão manual.

## Automação (regras, previstos, anexos, backup)

- **Regras de classificação** (Cadastros → Regras): todo lançamento que chega sem categoria (extrato do Inter, Pagar.me, importação) passa pelas regras na ordem de prioridade; a primeira que casa (por fornecedor e/ou por padrão na descrição) define a categoria e, opcionalmente, o centro de custo. O que não casa fica em **A classificar**. "Sugerir pelo histórico" cria regras para fornecedores com 3+ lançamentos e 70%+ na mesma categoria. No banco: trigger `trg_a_classificar`, `fin_regras_aprender`, `fin_classificar_pendentes`.
- **Previstos**: pares fornecedor + categoria de despesa presentes em 6+ dos últimos 9 meses viram lançamentos com a tag **Previsto** nos 6 meses seguintes (valor e dia medianos; parcelamentos só até a última parcela). Quando o pagamento real entra no mesmo mês, o previsto some sozinho. `fin_recorrencias_gerar` / `fin_recorrencias_conciliar`, chamados por `fin_rotina` a cada 10 min pelo workflow **Financeiro · Sync**.
- **Anexos**: boleto, nota ou foto do comprovante ficam no Postgres (tabela `anexos`, ops `anexo_put` / `anexo_get` / `anexo_remove` da `fin_api`); o lançamento guarda só os metadados. Fotos grandes são reduzidas no aparelho antes de subir (máx. 1800px). Anexos de formulários abandonados são apagados após 2 dias.
- **Backup diário** (workflow **Financeiro · Backup diário (Telegram)**, 03:40): JSON gzip com todas as tabelas e anexos, enviado como documento ao Telegram (chat de alertas, tópico da conferência). Para restaurar: baixar o `.json.gz` e importar em Configurações → Dados.

Tudo isso está em `supabase/automacao.sql` (idempotente), aplicado pelo workflow **Financeiro · Setup (schema)** depois de `schema.sql`.

## Migrar do Nibo

No Mac, com o `apitoken` do Nibo (Configurações → Integrações → API):

```bash
python3 scripts/importar-nibo.py --token SEU_APITOKEN --saida nibo.json
```

Depois: Configurações → Dados → **Importar arquivo do Nibo**. Contas (com saldo inicial e data do Nibo), categorias, centros de custo, contatos, lançamentos e transferências entram casando por nome com o que já existe. As baixas usam a data e a conta reais de `/receipts` e `/payments` do Nibo (não a data de vencimento), então o saldo de cada conta fecha com o Nibo. Rodar de novo não duplica (usa o id do Nibo como referência).

## Lançamentos automáticos (n8n)

Os workflows (Shopify pedido pago, Pagar.me, Mercado Livre, PIX do Inter) gravam direto no banco com o nó Postgres (credencial "Postgres account"): `select fin_api('{"op":"upsert", ...}'::jsonb)` ou um `insert into lancamentos …`. Payloads de exemplo com os ids certos ficam em Configurações → Integrações. O índice único `(empresa_id, origem, origem_ref)` impede duplicatas. O workflow atual **AN - Pagar.me → Nibo** pode ser apontado pra cá trocando a chamada ao Nibo por esse insert.

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

Projeto próprio na Vercel (`financeiro-americanutrition`, Root Directory `financeiro`), ligado a este repositório. O domínio `financeiro.americanutrition.com` aponta por CNAME para `cname.vercel-dns.com` na Cloudflare (registro DNS-only, sem proxy). O `vercel.json` da raiz também exclui `/financeiro` da reescrita de códigos de rastreio.
