# Painel "Grupos ImunoFosfo" (03/11/2026)

Painel no claude.ai: https://claude.ai/artifact/CoRs5aHgGzjk82r6jqiovn. Mostra pessoas nos grupos por dia, entradas e
saídas por dia (somando todos os grupos) e uma tabela por grupo com membros, variação e movimento dos últimos 30 dias.

Os dados são três arquivos JSON anexados ao painel, gerados destas consultas no Supabase. O painel não lê o Supabase
direto, então para atualizar é preciso rodar as consultas de novo e reenviar os arquivos. Os ids no painel são
`tamanho_diario`, `movimento_diario` e `pessoas_por_dia`.

- Ficam de fora os três grupos internos das comunidades (máximo abaixo de 10 membros).
- Entradas e saídas vêm do webhook em tempo real (`entrou_rt` / `saiu_rt`), que tem data e hora exatas. A comparação
  diária (`entrou` / `saiu`, origem `diff`) dá números parecidos.
- Entradas e saídas contam participações: quem entra em dois grupos conta duas vezes.

## tamanho_diario
```sql
with g as (select grupo_jid from grupos_snapshot group by 1 having max(membros) >= 10),
ult as (select distinct on (grupo_jid) grupo_jid, nome, comunidade from grupos_snapshot where grupo_jid in (select grupo_jid from g) order by grupo_jid, dia desc)
select s.dia::text as dia, u.nome as grupo, u.comunidade, max(s.membros)::int as membros
from grupos_snapshot s join ult u on u.grupo_jid = s.grupo_jid
group by 1, 2, 3 order by 1, 4 desc;
```

## movimento_diario
```sql
with g as (select grupo_jid from grupos_snapshot group by 1 having max(membros) >= 10),
ult as (select distinct on (grupo_jid) grupo_jid, nome from grupos_snapshot where grupo_jid in (select grupo_jid from g) order by grupo_jid, dia desc)
select (e.criado_em at time zone 'America/Sao_Paulo')::date::text as dia, u.nome as grupo,
  count(*) filter (where e.acao = 'entrou_rt')::int as entradas, count(*) filter (where e.acao = 'saiu_rt')::int as saidas
from grupos_eventos e join ult u on u.grupo_jid = e.grupo_jid
where e.origem = 'webhook' and e.acao in ('entrou_rt', 'saiu_rt')
group by 1, 2 order by 1, 2;
```

## pessoas_por_dia
```sql
select dia::text as dia, unicos::int as pessoas, inscricoes::int as participacoes from grupos_unicos_dia order by dia
```
