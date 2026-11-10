-- Painel do email proprio (SES), 10/11/2026.
-- email_painel(token, dias) devolve tudo o que a pagina mostra. O token fica em email_config.painel_token
-- (gerado no banco) e vai na URL do painel; sem ele a funcao devolve {ok:false}.
--
-- Atribuicao de vendas (mesma ideia do Klaviyo):
--   clique  -> pedido pago ate 5 dias depois de a pessoa clicar num email nosso (o ultimo clique leva)
--   abertura-> sem clique, pedido ate 2 dias depois de abrir um email nosso (venda "influenciada")
-- So contam emails reais (email_fila.status = 'enviado'); testes no simulador ficam de fora.
-- Abertura e estimativa: o Apple Mail abre as imagens sozinho (privacidade), entao a taxa real e menor.

alter table email_pedidos add column if not exists total numeric;

insert into email_config (chave, valor)
values ('painel_token', encode(extensions.gen_random_bytes(18), 'hex'))
on conflict (chave) do nothing;

-- pedidos agora guardam o valor (totalPriceSet.shopMoney.amount); o cursor e movido por email_sync_cursor
create or replace function email_sync_pedidos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; maior text; o jsonb;
begin
  for o in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if maior is null or (o->>'updatedAt') > maior then maior := o->>'updatedAt'; end if;
    insert into email_pedidos (pedido_id, numero, email, shopify_customer_id, criado_em, tem_imunofosfo,
      pedidos_do_cliente, cancelado, total)
    values (o->>'id', o->>'name', lower(trim(coalesce(o->>'email', o->'customer'->>'email', ''))), o->'customer'->>'id',
      (o->>'createdAt')::timestamptz,
      exists (select 1 from jsonb_array_elements(coalesce(o->'lineItems'->'nodes', '[]'::jsonb)) li
              where li->>'title' ilike '%imunofosfo%'),
      nullif(o->'customer'->>'numberOfOrders', '')::int, (o->>'cancelledAt') is not null,
      nullif(o->'totalPriceSet'->'shopMoney'->>'amount', '')::numeric)
    on conflict (pedido_id) do update set cancelado = excluded.cancelado,
      total = coalesce(excluded.total, email_pedidos.total);
    n := n + 1;
  end loop;
  return jsonb_build_object('pedidos', n, 'ate', maior);
end $$;

create or replace function email_painel(p_token text, p_dias int) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  dias int := greatest(1, least(coalesce(p_dias, 30), 365));
  ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
                     - make_interval(days => dias - 1);
  res jsonb;
begin
  if p_token is null or p_token is distinct from (select valor from email_config where chave = 'painel_token') then
    return jsonb_build_object('ok', false);
  end if;

  with env as (
    select f.id, f.email, f.slug, f.fluxo, f.enviado_em, f.ses_message_id as mid
      from email_fila f
     where f.status = 'enviado' and f.ses_message_id is not null
       and f.enviado_em >= ini - interval '5 days'
  ), ev as (
    select e.tipo, e.email, e.criado_em, e.detalhe, env.slug, env.fluxo, env.id as fila_id
      from email_eventos e join env on env.mid = e.detalhe->>'messageId'
  ), msg as (
    select env.id, env.slug, env.fluxo, env.email, env.enviado_em,
      coalesce(bool_or(ev.tipo = 'delivery'), false) as entregue,
      coalesce(bool_or(ev.tipo = 'open'), false) as abriu,
      coalesce(bool_or(ev.tipo = 'click'), false) as clicou,
      coalesce(bool_or(ev.tipo = 'bounce'), false) as bounce,
      coalesce(bool_or(ev.tipo = 'complaint'), false) as reclamacao
      from env left join ev on ev.fila_id = env.id
     where env.enviado_em >= ini
     group by 1, 2, 3, 4, 5
  ), atrib as (
    select p.pedido_id, p.numero, p.email, p.criado_em, coalesce(p.total, 0) as total, a.slug, a.fluxo, a.tipo, a.quando
      from email_pedidos p
      cross join lateral (
        select ev.slug, ev.fluxo, case when ev.tipo = 'click' then 'clique' else 'abertura' end as tipo, ev.criado_em as quando
          from ev
         where ev.email = p.email and ev.tipo in ('click', 'open') and ev.criado_em <= p.criado_em
           and ev.criado_em >= p.criado_em - case when ev.tipo = 'click' then interval '5 days' else interval '2 days' end
         order by (ev.tipo = 'click') desc, ev.criado_em desc
         limit 1) a
     where p.criado_em >= ini and not p.cancelado
  ), dia as (
    select d::date as dia from generate_series((ini at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
  ), desc_ev as (
    select e.email, e.criado_em, e.detalhe from email_eventos e
     where e.tipo = 'descadastro' and e.criado_em >= ini
  )
  select jsonb_build_object(
    'ok', true,
    'gerado_em', now(),
    'dias', dias,
    'desde', ini,
    'config', (select jsonb_object_agg(chave, valor) from email_config
                where chave in ('fluxos_modo', 'envio_limite_dia', 'fluxos_inicio')),
    'resumo', (select jsonb_build_object(
        'enviados', count(*),
        'entregues', count(*) filter (where entregue),
        'aberturas', count(*) filter (where abriu),
        'cliques', count(*) filter (where clicou),
        'bounces', count(*) filter (where bounce),
        'reclamacoes', count(*) filter (where reclamacao),
        'vendas', (select count(*) from atrib),
        'vendas_clique', (select count(*) from atrib where tipo = 'clique'),
        'receita', (select coalesce(sum(total), 0) from atrib),
        'receita_clique', (select coalesce(sum(total), 0) from atrib where tipo = 'clique'),
        'descadastros', (select count(*) from desc_ev)) from msg),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dia.dia,
        'enviados', (select count(*) from msg where (msg.enviado_em at time zone 'America/Sao_Paulo')::date = dia.dia),
        'aberturas', (select count(*) from msg where abriu and (msg.enviado_em at time zone 'America/Sao_Paulo')::date = dia.dia),
        'cliques', (select count(*) from msg where clicou and (msg.enviado_em at time zone 'America/Sao_Paulo')::date = dia.dia),
        'vendas', (select count(*) from atrib where (atrib.criado_em at time zone 'America/Sao_Paulo')::date = dia.dia),
        'receita', (select coalesce(sum(total), 0) from atrib where (atrib.criado_em at time zone 'America/Sao_Paulo')::date = dia.dia)
      ) order by dia.dia), '[]'::jsonb) from dia),
    'por_modelo', (select coalesce(jsonb_agg(x order by x->>'fluxo', x->>'slug'), '[]'::jsonb) from (
        select jsonb_build_object('fluxo', t.fluxo, 'slug', t.slug, 'assunto', tp.assunto,
          'enviados', count(m.id), 'entregues', count(m.id) filter (where m.entregue),
          'aberturas', count(m.id) filter (where m.abriu), 'cliques', count(m.id) filter (where m.clicou),
          'bounces', count(m.id) filter (where m.bounce), 'reclamacoes', count(m.id) filter (where m.reclamacao),
          'vendas', (select count(*) from atrib a where a.slug = t.slug),
          'receita', (select coalesce(sum(a.total), 0) from atrib a where a.slug = t.slug),
          'pendentes', (select count(*) from email_fila f where f.slug = t.slug and f.status = 'pendente')) as x
          from (select distinct fluxo, slug from email_fila) t
          left join msg m on m.slug = t.slug
          left join email_templates tp on tp.slug = t.slug
         group by t.fluxo, t.slug, tp.assunto) q),
    'links', (select coalesce(jsonb_agg(l order by (l->>'cliques')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('link', detalhe->>'link', 'cliques', count(*), 'pessoas', count(distinct email)) as l
          from ev where tipo = 'click' and criado_em >= ini and coalesce(detalhe->>'link', '') <> ''
         group by detalhe->>'link' order by count(*) desc limit 15) k),
    'vendas', (select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'email', email, 'quando', criado_em,
        'total', total, 'slug', slug, 'fluxo', fluxo, 'tipo', tipo, 'interacao', quando) order by criado_em desc), '[]'::jsonb)
        from (select * from atrib order by criado_em desc limit 100) v),
    'contatos', (select jsonb_build_object(
        'por_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from email_contatos group by 1) s),
        'novos_inscritos', (select count(*) from email_contatos where status = 'inscrito' and consentimento_em >= ini),
        'engajados_90d', (select count(*) from email_contatos where status = 'inscrito' and shopify_consentimento = 'SUBSCRIBED'
                           and ultimo_pedido_em >= now() - interval '90 days'),
        'descadastros', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'quando', criado_em,
                           'motivo', detalhe->>'motivo', 'origem', detalhe->>'origem') order by criado_em desc), '[]'::jsonb)
                           from (select * from desc_ev order by criado_em desc limit 30) d),
        'sincronizacao', (select jsonb_object_agg(chave, valor) from email_config where chave like 'sync_%'))),
    'fila', (select jsonb_build_object(
        'pendentes', (select coalesce(jsonb_object_agg(fluxo, n), '{}'::jsonb) from (select fluxo, count(*) n from email_fila where status = 'pendente' group by 1) s),
        'proximas_24h', (select count(*) from email_fila where status = 'pendente' and enviar_em <= now() + interval '24 hours'),
        'enviados_hoje', (select count(*) from email_fila where status = 'enviado'
                           and enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
        'status_periodo', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from email_fila where criado_em >= ini group by 1) s),
        'pulados_motivo', (select coalesce(jsonb_object_agg(coalesce(motivo, '-'), n), '{}'::jsonb) from (select motivo, count(*) n from email_fila where status = 'pulado' and criado_em >= ini group by 1 order by 2 desc limit 10) s),
        'erros', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'slug', slug, 'motivo', motivo, 'quando', coalesce(enviado_em, enviar_em)) order by id desc), '[]'::jsonb)
                  from (select * from email_fila where status = 'erro' order by id desc limit 20) e))),
    'problemas', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'email', email, 'quando', criado_em, 'slug', slug,
        'detalhe', coalesce(detalhe->>'bounceType', '') || ' ' || coalesce(detalhe->>'bounceSubType', '') || coalesce(detalhe->>'complaintFeedbackType', '')) order by criado_em desc), '[]'::jsonb)
        from (select * from ev where tipo in ('bounce', 'complaint', 'reject') and criado_em >= ini order by criado_em desc limit 30) b)
  ) into res;
  return res;
end $$;

revoke all on function email_painel(text, int) from public, anon, authenticated;
grant execute on function email_painel(text, int) to postgres, service_role;
