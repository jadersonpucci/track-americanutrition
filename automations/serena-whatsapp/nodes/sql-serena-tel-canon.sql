-- Telefone canonico: celular brasileiro sem o nono digito (JID antigo do WhatsApp) vira o numero com 9.
-- Fixos (2-5 apos o DDD) e numeros de fora do Brasil ficam como estao. Usado no Core (Normalizar), na Entrada
-- (buffer, pausas, intervencao humana) e nos crons novos.
create or replace function serena_tel_canon(t text) returns text language sql immutable as $$
  select case when d like '55%' and length(d) = 12 and substr(d,5,1) in ('6','7','8','9') then substr(d,1,4) || '9' || substr(d,5) else d end
  from (select regexp_replace(coalesce(t,''), '\D', '', 'g') as d) x
$$;

-- Cache dos pedidos do cliente na Shopify (item 2) e registro dos follow-ups de link (item 3)
create table if not exists serena_pedidos_cache (telefone text primary key, cliente_nome text, total int default 0, pedidos jsonb default '[]'::jsonb, atualizado_em timestamptz default now());
create table if not exists serena_link_followups (msg_id bigint primary key, contato_id uuid, telefone text, slug text, enviado_em timestamptz default now(), resultado text);

-- Unificacao de contatos duplicados (backup reversivel em serena_merge_backup): junta orig em dest em todas as tabelas
-- com contato_id (unique_violation -> apaga a linha do orig) e chama serena_unificar (mensagens, conversas, fatos, contato).
create or replace function serena_unificar_full(p_dest uuid, p_orig uuid) returns void language plpgsql as $$
declare t record;
begin
  if p_dest is null or p_orig is null or p_dest = p_orig then return; end if;
  if not exists (select 1 from serena_contatos where id = p_dest) or not exists (select 1 from serena_contatos where id = p_orig) then return; end if;
  update serena_atribuicoes set contato_id = p_dest where contato_id = p_orig and not exists (select 1 from serena_atribuicoes x where x.contato_id = p_dest);
  delete from serena_atribuicoes where contato_id = p_orig;
  update serena_etiquetas set contato_id = p_dest where contato_id = p_orig and not exists (select 1 from serena_etiquetas x where x.contato_id = p_dest and x.etiqueta = serena_etiquetas.etiqueta);
  delete from serena_etiquetas where contato_id = p_orig;
  for t in (select table_name, data_type from information_schema.columns where table_schema = 'public' and column_name = 'contato_id' and table_name not in ('serena_mensagens','serena_conversas','serena_fatos','serena_contatos','serena_atribuicoes','serena_etiquetas')) loop
    begin
      execute format('update %I set contato_id = $1::%s where contato_id::text = $2', t.table_name, t.data_type) using p_dest, p_orig::text;
    exception when unique_violation then
      execute format('delete from %I where contato_id::text = $1', t.table_name) using p_orig::text;
    end;
  end loop;
  perform serena_unificar(p_dest, p_orig);
end $$;
