-- Fluxos de email proprios (Amazon SES), 10/11/2026.
-- Espelho dos clientes da Shopify em email_contatos, pedidos pagos em email_pedidos, fila de envios em email_fila.
-- O agendador (email_agendar) cria a fila; o despachante (n8n "[Email] Despachar") pega o que venceu em
-- email_proximos(), manda pelo SES e grava o resultado com email_marcar().
--
-- Modos (email_config.fluxos_modo):
--   teste -> tudo roda, mas o despachante manda para o simulador da AWS (success@simulator.amazonses.com),
--            nunca para o cliente. Serve enquanto os fluxos do Klaviyo estao ligados (senao o cliente recebe 2x).
--   ativo -> manda para o cliente, respeitando email_config.envio_limite_dia (aquecimento).
--   off   -> nada sai; a fila continua sendo montada.
-- So entra na fila o que acontecer depois de email_config.fluxos_inicio: ligar o sistema nao dispara email para
-- a base inteira (boas-vindas para inscrito antigo, VIP para quem ja era VIP etc.).

alter table email_contatos
  add column if not exists shopify_consentimento text,
  add column if not exists consentimento_em timestamptz,
  add column if not exists pedidos int default 0,
  add column if not exists gasto_total numeric default 0,
  add column if not exists ultimo_pedido_em timestamptz,
  add column if not exists cliente_desde timestamptz,
  add column if not exists sincronizado_em timestamptz;
-- status: inscrito | nao_inscrito | descadastrado | bounce | reclamacao
create index if not exists email_contatos_shopify_idx on email_contatos (shopify_customer_id);

create table if not exists email_pedidos (
  pedido_id text primary key,
  numero text,
  email text,
  shopify_customer_id text,
  criado_em timestamptz,
  tem_imunofosfo boolean default false,
  pedidos_do_cliente int,
  cancelado boolean default false,
  registrado_em timestamptz default now()
);
create index if not exists email_pedidos_email_idx on email_pedidos (email, criado_em);
alter table email_pedidos enable row level security;

create table if not exists email_fila (
  id bigserial primary key,
  email text not null,
  slug text not null references email_templates (slug),
  fluxo text not null,
  ref text not null,
  enviar_em timestamptz not null,
  status text not null default 'pendente', -- pendente | enviado | teste | pulado | expirado | erro
  motivo text,
  ses_message_id text,
  tentativas int default 0,
  criado_em timestamptz default now(),
  enviado_em timestamptz,
  unique (email, slug, ref)
);
create index if not exists email_fila_venc_idx on email_fila (status, enviar_em);
alter table email_fila enable row level security;

insert into email_config (chave, valor) values
  ('fluxos_modo', 'teste'),
  ('envio_limite_dia', '300'),
  ('fluxos_inicio', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  ('sync_clientes_desde', '2000-01-01T00:00:00Z'),
  ('sync_pedidos_desde', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (chave) do nothing;

-- 1) Clientes da Shopify (lote do GraphQL: customers.nodes)
create or replace function email_sync_contatos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; maior text; c jsonb; v_email text; v_cons text;
begin
  for c in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v_email := lower(trim(coalesce(c->>'email', '')));
    if maior is null or (c->>'updatedAt') > maior then maior := c->>'updatedAt'; end if;
    continue when v_email = '' or position('@' in v_email) = 0;
    v_cons := c->'emailMarketingConsent'->>'marketingState';
    insert into email_contatos as e (email, nome, shopify_customer_id, status, origem, shopify_consentimento,
      consentimento_em, pedidos, gasto_total, ultimo_pedido_em, cliente_desde, sincronizado_em, atualizado_em)
    values (v_email, nullif(c->>'firstName', ''), c->>'id',
      case when v_cons = 'SUBSCRIBED' then 'inscrito' else 'nao_inscrito' end, 'shopify', v_cons,
      nullif(c->'emailMarketingConsent'->>'consentUpdatedAt', '')::timestamptz,
      coalesce((c->>'numberOfOrders')::int, 0), coalesce((c->'amountSpent'->>'amount')::numeric, 0),
      nullif(c->'lastOrder'->>'createdAt', '')::timestamptz, nullif(c->>'createdAt', '')::timestamptz, now(), now())
    on conflict (email) do update set
      nome = coalesce(excluded.nome, e.nome),
      shopify_customer_id = excluded.shopify_customer_id,
      shopify_consentimento = excluded.shopify_consentimento,
      consentimento_em = excluded.consentimento_em,
      pedidos = excluded.pedidos, gasto_total = excluded.gasto_total,
      ultimo_pedido_em = excluded.ultimo_pedido_em, cliente_desde = excluded.cliente_desde,
      sincronizado_em = now(), atualizado_em = now(),
      -- bounce e reclamacao nunca voltam por aqui; descadastro so volta se a pessoa se inscreveu de novo depois
      status = case
        when e.status in ('bounce', 'reclamacao') then e.status
        when excluded.shopify_consentimento = 'SUBSCRIBED' and e.status = 'descadastrado'
             and excluded.consentimento_em > coalesce(e.descadastrado_em, 'epoch') then 'inscrito'
        when excluded.shopify_consentimento = 'SUBSCRIBED' and e.status = 'nao_inscrito' then 'inscrito'
        when excluded.shopify_consentimento in ('UNSUBSCRIBED') and e.status = 'inscrito' then 'descadastrado'
        when coalesce(excluded.shopify_consentimento, '') not in ('SUBSCRIBED', 'UNSUBSCRIBED') and e.status = 'inscrito'
             and e.origem = 'shopify' then 'nao_inscrito'
        else e.status end,
      descadastrado_em = case when excluded.shopify_consentimento = 'UNSUBSCRIBED' and e.status = 'inscrito'
        then now() else e.descadastrado_em end;
    n := n + 1;
  end loop;
  if maior is not null then
    update email_config set valor = maior where chave = 'sync_clientes_desde' and valor < maior;
  end if;
  return jsonb_build_object('contatos', n, 'ate', maior);
end $$;

-- 2) Pedidos pagos (lote do GraphQL: orders.nodes)
create or replace function email_sync_pedidos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; maior text; o jsonb;
begin
  for o in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if maior is null or (o->>'updatedAt') > maior then maior := o->>'updatedAt'; end if;
    insert into email_pedidos (pedido_id, numero, email, shopify_customer_id, criado_em, tem_imunofosfo,
      pedidos_do_cliente, cancelado)
    values (o->>'id', o->>'name', lower(trim(coalesce(o->>'email', o->'customer'->>'email', ''))), o->'customer'->>'id',
      (o->>'createdAt')::timestamptz,
      exists (select 1 from jsonb_array_elements(coalesce(o->'lineItems'->'nodes', '[]'::jsonb)) li
              where li->>'title' ilike '%imunofosfo%'),
      nullif(o->'customer'->>'numberOfOrders', '')::int, (o->>'cancelledAt') is not null)
    on conflict (pedido_id) do update set cancelado = excluded.cancelado;
    n := n + 1;
  end loop;
  if maior is not null then
    update email_config set valor = maior where chave = 'sync_pedidos_desde' and valor < maior;
  end if;
  return jsonb_build_object('pedidos', n, 'ate', maior);
end $$;

-- 3) Agendador: monta a fila a partir do que aconteceu depois de fluxos_inicio
create or replace function email_agendar() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ini timestamptz := (select valor from email_config where chave = 'fluxos_inicio')::timestamptz;
  a int := 0; b int := 0; r int := 0; v int := 0;
begin
  -- Boas-vindas: inscreveu no email marketing depois do inicio e ainda nao comprou
  with novos as (
    select e.email from email_contatos e
     where e.status = 'inscrito' and e.consentimento_em >= ini and coalesce(e.pedidos, 0) = 0
       and not exists (select 1 from email_fila f where f.email = e.email and f.fluxo = 'boas_vindas')
  ), ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em)
    select n.email, s.slug, 'boas_vindas', 'contato', now() + s.espera from novos n
    cross join (values ('1.1-boas-vindas-cupom', interval '0'), ('1.2-boas-vindas-comunidade', interval '1 hour'),
      ('1.3-boas-vindas-como-age', interval '25 hours'), ('1.4-boas-vindas-depoimentos', interval '49 hours')) s(slug, espera)
    on conflict do nothing returning 1)
  select count(*) into a from ins;

  -- Pos-compra: pedido pago depois do inicio; uma serie por cliente a cada 60 dias
  with ped as (
    select distinct on (p.email) p.pedido_id, p.email, p.criado_em from email_pedidos p
     where p.criado_em >= ini and not p.cancelado and p.email <> ''
       and p.registrado_em > now() - interval '3 days'
       and not exists (select 1 from email_fila f where f.email = p.email and f.fluxo = 'pos_compra'
                        and f.criado_em > now() - interval '60 days')
     order by p.email, p.criado_em
  ), ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em)
    select ped.email, s.slug, 'pos_compra', 'pedido:' || ped.pedido_id, ped.criado_em + s.espera from ped
    cross join (values ('2.1-pos-compra-guia-de-uso', interval '2 days'), ('2.2-pos-compra-comunidade', interval '4 days'),
      ('2.3-pos-compra-historia-carla', interval '8 days'), ('2.4-pos-compra-omega3', interval '12 days'),
      ('2.5-pos-compra-avaliacao', interval '18 days'), ('2.6-pos-compra-4-semanas', interval '33 days')) s(slug, espera)
    on conflict do nothing returning 1)
  select count(*) into b from ins;

  -- Recompra: pedido com ImunoFosfo, 22 dias depois (no envio confere se nao houve pedido mais novo)
  with ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em)
    select p.email, '3.1-recompra-imunofosfo', 'recompra', 'pedido:' || p.pedido_id, p.criado_em + interval '22 days'
      from email_pedidos p
     where p.criado_em >= ini and p.tem_imunofosfo and not p.cancelado and p.email <> ''
    on conflict do nothing returning 1)
  select count(*) into r from ins;

  -- VIP: o pedido pago que fez o cliente chegar a 3 pedidos
  with ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em)
    select p.email, '5.1-cliente-vip', 'vip', 'vip', now() from email_pedidos p
     where p.criado_em >= ini and not p.cancelado and p.email <> '' and p.pedidos_do_cliente = 3
    on conflict do nothing returning 1)
  select count(*) into v from ins;

  return jsonb_build_object('boas_vindas', a, 'pos_compra', b, 'recompra', r, 'vip', v);
end $$;

-- 4) Proximos envios: aplica as regras, pula o que nao deve sair e devolve o que sai agora (ja com o HTML pronto)
create or replace function email_proximos(p_limite int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare modo text := coalesce((select valor from email_config where chave = 'fluxos_modo'), 'teste');
  lim_dia int := coalesce((select valor from email_config where chave = 'envio_limite_dia'), '300')::int;
  hoje int; cota int; res jsonb;
begin
  if modo = 'off' then return jsonb_build_object('modo', modo, 'itens', '[]'::jsonb); end if;

  -- expira o que passou do ponto (mais de 2 dias atrasado): nao manda email velho fora de contexto
  update email_fila set status = 'expirado', motivo = 'atrasado mais de 2 dias'
   where status = 'pendente' and enviar_em < now() - interval '2 days';

  -- pula quem nao pode receber
  update email_fila f set status = 'pulado', motivo = z.motivo
    from (select f2.id, coalesce(e.status, 'sem contato') || '/' || coalesce(e.shopify_consentimento, '-') as motivo,
                 (e.email is null or e.status <> 'inscrito' or coalesce(e.shopify_consentimento, '') <> 'SUBSCRIBED') as bloqueia
            from email_fila f2 left join email_contatos e on e.email = f2.email
           where f2.status = 'pendente' and f2.enviar_em <= now()) z
   where f.id = z.id and z.bloqueia;
  -- recompra: se ja comprou de novo, nao precisa
  update email_fila f set status = 'pulado', motivo = 'comprou de novo'
   where f.status = 'pendente' and f.fluxo = 'recompra' and f.enviar_em <= now()
     and exists (select 1 from email_pedidos p where p.email = f.email and not p.cancelado
                  and p.criado_em > (select p0.criado_em from email_pedidos p0 where 'pedido:' || p0.pedido_id = f.ref));
  -- boas-vindas: o cupom de primeira compra nao faz sentido para quem ja comprou
  update email_fila f set status = 'pulado', motivo = 'ja comprou'
   where f.status = 'pendente' and f.slug = '1.1-boas-vindas-cupom' and f.enviar_em <= now()
     and exists (select 1 from email_contatos e where e.email = f.email and coalesce(e.pedidos, 0) > 0);

  select count(*) into hoje from email_fila
   where status = 'enviado' and enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  cota := case when modo = 'ativo' then greatest(0, least(p_limite, lim_dia - hoje)) else p_limite end;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into res from (
    select f.id, f.email, f.slug, f.fluxo,
      case when modo = 'ativo' then f.email else 'success@simulator.amazonses.com' end as para,
      regexp_replace(regexp_replace(t.assunto, '\{\{\s*nome\s*\}\}', coalesce(nullif(initcap(split_part(e.nome, ' ', 1)), ''), 'você'), 'g'),
        '\{\{\s*link_descadastro\s*\}\}', email_link_descadastro(f.email), 'g') as assunto,
      regexp_replace(regexp_replace(t.html, '\{\{\s*nome\s*\}\}', coalesce(nullif(initcap(split_part(e.nome, ' ', 1)), ''), 'você'), 'g'),
        '\{\{\s*link_descadastro\s*\}\}', email_link_descadastro(f.email), 'g') as html,
      email_link_descadastro(f.email) as link
      from email_fila f join email_templates t on t.slug = f.slug left join email_contatos e on e.email = f.email
     where f.status = 'pendente' and f.enviar_em <= now()
     order by f.enviar_em limit cota) x;
  return jsonb_build_object('modo', modo, 'enviados_hoje', hoje, 'cota', cota, 'itens', res);
end $$;

-- 5) Resultado do envio: [{id, ok, message_id, erro, teste}]
create or replace function email_marcar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  with r as (select (x->>'id')::bigint id, (x->>'ok')::boolean ok, x->>'message_id' mid, x->>'erro' erro,
                    coalesce((x->>'teste')::boolean, false) teste from jsonb_array_elements(p) x),
  u as (update email_fila f set
          status = case when r.ok and r.teste then 'teste' when r.ok then 'enviado'
                        when f.tentativas >= 2 then 'erro' else 'pendente' end,
          ses_message_id = r.mid, motivo = left(r.erro, 300), tentativas = f.tentativas + 1,
          enviado_em = case when r.ok then now() end
        from r where f.id = r.id returning 1)
  select count(*) into n from u;
  return jsonb_build_object('marcados', n);
end $$;

revoke all on function email_sync_contatos(jsonb), email_sync_pedidos(jsonb), email_agendar(), email_proximos(int),
  email_marcar(jsonb) from public, anon, authenticated;
grant execute on function email_sync_contatos(jsonb), email_sync_pedidos(jsonb), email_agendar(), email_proximos(int),
  email_marcar(jsonb) to postgres, service_role;
