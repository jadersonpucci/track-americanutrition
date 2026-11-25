-- No "Marcar Entregue" da Entrada Samuel. $1 = contato_id, $2 = telefone (do Chamar Serena Core).
-- Marca as respostas como entregues e solta a trava do telefone (serena_wpp_lock).
with m as (update serena_mensagens set entregue = true where contato_id = $1::uuid and papel = 'serena' and canal = 'whatsapp' and criado_em > now() - interval '15 minutes' and entregue is distinct from true returning id),
l as (delete from serena_wpp_lock where telefone = $2 returning telefone)
select (select count(*) from m)::int as marcadas, (select count(*) from l)::int as travas
