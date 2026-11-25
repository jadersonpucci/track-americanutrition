-- No "Coletar Buffer" da Entrada Samuel (zeJ8nScEpt7TckFb). $1 = {"telefone":"55...","buffer_id":"123"} (payload do Pode Responder?).
-- Junta as mensagens picadas do telefone. Devolve segurar=true (o fluxo espera 3 s e tenta de novo) quando:
--   1) existe trava serena_wpp_lock ativa para o telefone (a Serena ainda esta respondendo a mensagem anterior), ou
--   2) a mensagem mais nova chegou ha menos de 3 s (o cliente ainda esta digitando).
-- Se uma mensagem mais nova ja tem outra execucao cuidando (buffer_id nao e o mais recente), nao devolve nada.
with e as (select $1::jsonb j),
trava as (select 1 from serena_wpp_lock l, e where l.telefone = e.j->>'telefone' and l.ate > now()),
pend as (select b.id, b.criado_em from serena_wpp_buffer b, e where b.telefone = e.j->>'telefone' and b.processado = false order by b.criado_em desc limit 1),
segurar as (select (exists (select 1 from trava) or coalesce((select max(criado_em) from pend) > now() - interval '3 seconds', false)) as v),
upd as (update serena_wpp_buffer b set processado = true, processado_em = now() from e where b.telefone = e.j->>'telefone' and b.processado = false and (select id from pend) = (e.j->>'buffer_id')::bigint and not (select v from segurar) returning b.telefone, b.texto, b.nome, b.criado_em)
select max(telefone) as telefone, string_agg(texto, E'\n' order by criado_em) as texto, max(nome) as nome, count(*)::int as n, false as segurar from upd having count(*) > 0
union all
select e.j->>'telefone', null, null, 0, true from e where (select v from segurar) and (select id from pend) = (e.j->>'buffer_id')::bigint
