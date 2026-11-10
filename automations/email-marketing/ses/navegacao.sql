-- Navegacao abandonada no sistema proprio, 10/11/2026 (noite).
-- O site (snippet an-nav no tema) so manda eventos de quem ja esta identificado:
--   e:<fila_id>-<assinatura>  -> veio de um link de email nosso (o despachante poe ?an_e= nos links do site)
--   c:<customer_id>-<assin.>  -> cliente logado na loja (assinatura feita no Liquid com o mesmo segredo)
--   f:<email>                 -> preencheu um formulario do site (newsletter/popup)
-- Visitante anonimo nao e rastreado. Os eventos vao para o webhook n8n "[Email] Navegacao (site)" -> email_nav_registrar.
-- O agendador (email_agendar) olha quem viu produto ha mais de 2h e nao comprou nem abriu carrinho, e agenda o 4.1.

insert into email_config (chave, valor)
values ('nav_segredo', encode(extensions.gen_random_bytes(16), 'hex'))
on conflict (chave) do nothing;

alter table email_produtos add column if not exists pitch text, add column if not exists nav_html text;

create table if not exists email_nav_eventos (
  id bigserial primary key,
  email text not null,
  cid text,
  origem text,            -- e | c | f
  titulo text, handle text, variant_id text, preco numeric, foto text, url text,
  criado_em timestamptz default now()
);
create index if not exists email_nav_eventos_email_idx on email_nav_eventos (email, criado_em);
create index if not exists email_nav_eventos_data_idx on email_nav_eventos (criado_em);
alter table email_nav_eventos enable row level security;

create or replace function email_nav_assinatura(p text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select left(encode(extensions.hmac(p, (select valor from email_config where chave = 'nav_segredo'), 'sha256'), 'hex'), 16)
$$;

-- token que vai nos links dos emails (?an_e=)
create or replace function email_nav_token(p_fila bigint) returns text
language sql stable security definer set search_path = public, extensions as $$
  select p_fila || '-' || email_nav_assinatura('e' || p_fila)
$$;

create or replace function email_nav_registrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare id text := coalesce(p->>'id', ''); tipo text := left(id, 1); v text := substr(id, 3);
  v_email text; n int; pr jsonb := coalesce(p->'produto', '{}'::jsonb);
begin
  if tipo = 'e' and v ~ '^\d+-[0-9a-f]{16}$' and split_part(v, '-', 2) = email_nav_assinatura('e' || split_part(v, '-', 1)) then
    select f.email into v_email from email_fila f where f.id = split_part(v, '-', 1)::bigint;
  elsif tipo = 'c' and v ~ '^\d+-[0-9a-f]{16}$' and split_part(v, '-', 2) = email_nav_assinatura(split_part(v, '-', 1)) then
    select e.email into v_email from email_contatos e
     where e.shopify_customer_id in (split_part(v, '-', 1), 'gid://shopify/Customer/' || split_part(v, '-', 1)) limit 1;
  elsif tipo = 'f' and v ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    v_email := lower(trim(v));
  end if;
  if v_email is null then return jsonb_build_object('ok', false); end if;
  if coalesce(p->>'tipo', '') <> 'produto' or coalesce(pr->>'titulo', '') = '' then
    return jsonb_build_object('ok', true, 'identificado', true);
  end if;
  -- trava simples contra abuso: no maximo 60 eventos por pessoa por hora
  select count(*) into n from email_nav_eventos where email_nav_eventos.email = v_email and criado_em > now() - interval '1 hour';
  if n >= 60 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  insert into email_nav_eventos (email, cid, origem, titulo, handle, variant_id, preco, foto, url)
  values (v_email, left(p->>'cid', 64), tipo, left(pr->>'titulo', 200), left(pr->>'handle', 200),
          left(regexp_replace(coalesce(pr->>'variant_id', ''), '\D', '', 'g'), 40),
          nullif(regexp_replace(coalesce(pr->>'preco', ''), '[^0-9.]', '', 'g'), '')::numeric,
          left(pr->>'foto', 500), left(pr->>'url', 500));
  return jsonb_build_object('ok', true);
end $$;

-- variaveis do email 4.1: o produto mais visto (e mais recente) + ate 2 outros que a pessoa viu
create or replace function email_dados_nav(p_email text, p_desde timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare molde text := (select valor from email_config where chave = 'molde_item');
  top record; outros text; bloco text;
begin
  select e.handle, max(e.titulo) titulo, max(e.foto) foto, max(e.url) url, max(e.variant_id) vid, max(e.preco) preco,
         count(*) n, max(e.criado_em) ult, email_produto(max(e.titulo)) chave
    into top from email_nav_eventos e where e.email = p_email and e.criado_em >= p_desde
   group by e.handle order by count(*) desc, max(e.criado_em) desc limit 1;
  if top.handle is null and top.titulo is null then return null; end if;

  select pr.nav_html into bloco from email_produtos pr where pr.chave = top.chave;
  if bloco is null then   -- produto fora do catalogo: cartao simples com o que veio do site
    bloco := replace(replace(replace(replace(molde, '__FOTO__', coalesce(top.foto, '')), '__NOME__', coalesce(top.titulo, '')),
               '__DETALHE__', '<a href="' || coalesce(top.url, 'https://americanutrition.com') || '" style="color:#07388E;font-weight:700;">Ver o produto &rarr;</a>'),
               '__VALOR__', case when top.preco is not null then email_brl(top.preco) else '' end);
  end if;

  select string_agg(replace(replace(replace(replace(molde, '__FOTO__', coalesce(pr.foto, o.foto, '')), '__NOME__', coalesce(pr.nome, o.titulo)),
           '__DETALHE__', '<a href="' || coalesce(pr.url, o.url, 'https://americanutrition.com') || '" style="color:#07388E;font-weight:700;">Ver de novo &rarr;</a>'),
           '__VALOR__', case when coalesce(pr.preco, o.preco) is not null then email_brl(coalesce(pr.preco, o.preco)) else '' end), '' order by o.ult desc)
    into outros
    from (select e.handle, max(e.titulo) titulo, max(e.foto) foto, max(e.url) url, max(e.preco) preco, max(e.criado_em) ult
            from email_nav_eventos e where e.email = p_email and e.criado_em >= p_desde and e.handle is distinct from top.handle
           group by e.handle order by max(e.criado_em) desc limit 2) o
    left join email_produtos pr on pr.chave = email_produto(o.titulo);

  return jsonb_build_object(
    'produto_nome', coalesce((select nome from email_produtos where chave = top.chave), top.titulo),
    'produto_foto', coalesce((select foto from email_produtos where chave = top.chave), top.foto),
    'produto_url', coalesce((select url from email_produtos where chave = top.chave), top.url),
    'produto_chave', top.chave, 'visto_em', top.ult,
    'nav_bloco', bloco,
    'nav_outros', case when outros is null then '' else
      '<div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8A94A6;margin:6px 0 10px;text-align:center;">Você também olhou</div>' || outros end);
end $$;

revoke all on function email_nav_registrar(jsonb), email_dados_nav(text, timestamptz), email_nav_token(bigint),
  email_nav_assinatura(text) from public, anon, authenticated;
grant execute on function email_nav_registrar(jsonb) to postgres, service_role;
