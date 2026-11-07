-- No "Cadastrar" do workflow [Serena] Esquenta Black Friday (cadastro) (ZlZIbmHyCkAk9zB5), a cada 1 min.
create table if not exists esquenta_bf (
  contato_id uuid primary key, telefone text, nome text, canal text, indicacao text, primeira_msg text,
  cadastrado_em timestamptz default now());
alter table esquenta_bf enable row level security;
alter table esquenta_bf add column if not exists indicacao_cupom text;
with novos as (
  insert into esquenta_bf (contato_id, telefone, nome, canal, indicacao, indicacao_cupom, primeira_msg, cadastrado_em)
  select distinct on (m.contato_id) m.contato_id, c.telefone, btrim(coalesce(c.nome, '') || ' ' || coalesce(c.sobrenome, '')), m.canal,
    af.nome, af.cupom_code, left(m.texto, 300), m.criado_em
  from serena_mensagens m join serena_contatos c on c.id = m.contato_id
  left join lateral (select a.nome, a.cupom_code from afiliados a where a.status = 'active' and coalesce(a.cupom_code, '') <> ''
       and (upper(m.texto) like '%' || upper(a.cupom_code) || '%' or upper(m.texto) like '%' || upper(coalesce(nullif(a.ref_code, ''), a.cupom_code)) || '%')
       order by length(a.cupom_code) desc limit 1) af on true
  where m.papel = 'cliente' and m.texto ~* 'esquenta'
    and m.criado_em > now() - interval '3 hours'
    and m.criado_em >= '2026-11-06 22:00-03' and m.criado_em < '2026-11-27 00:00-03'
  order by m.contato_id, m.criado_em
  on conflict (contato_id) do nothing
  returning *),
nota as (
  insert into serena_fatos (contato_id, chave, valor, origem, atualizado_em)
  select contato_id, 'esquenta black friday',
    'Cadastrado no Esquenta Black Friday em ' || to_char(cadastrado_em at time zone 'America/Sao_Paulo', 'DD/MM') ||
    ' (vale ate 26/11): 10% OFF com 1 unidade, 15% OFF a partir de 2 unidades, em todos os produtos.' ||
    coalesce(' Indicado por ' || indicacao || ' (a comissao vai para ele automaticamente).', ''), 'manual', now()
  from novos
  on conflict do nothing
  returning 1)
select (select count(*) from novos) as novos, (select count(*) from nota) as notas, (select count(*) from esquenta_bf) as total;
