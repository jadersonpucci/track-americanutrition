-- Tag nos pedidos da Shopify que vieram do email proprio (SES). 12/11/2026, pedido do Jaderson.
-- Mesma regra de atribuicao do painel (painel.sql), para o painel e a Shopify baterem:
--   clique   -> pedido ate 5 dias depois de a pessoa clicar num email nosso (o ultimo clique leva)
--   abertura -> sem clique, pedido ate 2 dias depois de abrir um email nosso
-- So emails reais (email_fila.status = 'enviado'), nunca testes. Pedido cancelado nao entra.
-- Tags (no estilo das que ja existem: SERENA, WPP, ASSINATURA):
--   EMAIL                       todo pedido atribuido
--   email:clique | email:abertura
--   email:<modelo>              ex.: email:7.1-campanha-esquenta
-- Quem aplica: workflow "[Email] Marcar vendas na Shopify" (marcar-vendas.workflow.js), a cada 10 min.

alter table email_pedidos add column if not exists tag_email text;
alter table email_pedidos add column if not exists tag_email_em timestamptz;

-- pedidos atribuidos ainda sem tag (janela de 7 dias para tras: a sincronizacao roda a cada 2 min)
create or replace function email_vendas_para_marcar(p_desde timestamptz default now() - interval '7 days')
returns table (pedido_id text, numero text, tipo text, fluxo text, slug text, tags text[])
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.tipo, e.email, e.criado_em, f.fluxo, f.slug
      from email_eventos e
      join email_fila f on f.ses_message_id = e.detalhe->>'messageId' and f.status = 'enviado'
     where e.tipo in ('click', 'open') and e.criado_em >= p_desde - interval '5 days'
  )
  select p.pedido_id, p.numero, a.tipo, a.fluxo, a.slug,
         array['EMAIL', 'email:' || a.tipo, 'email:' || a.slug]
    from email_pedidos p
    cross join lateral (
      select ev.fluxo, ev.slug, case when ev.tipo = 'click' then 'clique' else 'abertura' end as tipo
        from ev
       where ev.email = p.email and ev.criado_em <= p.criado_em
         and ev.criado_em >= p.criado_em - case when ev.tipo = 'click' then interval '5 days' else interval '2 days' end
       order by (ev.tipo = 'click') desc, ev.criado_em desc
       limit 1) a
   where p.criado_em >= p_desde and not p.cancelado and p.tag_email is null
     and p.pedido_id like 'gid://shopify/Order/%'
   order by p.criado_em
   limit 50
$$;

create or replace function email_venda_marcada(p_pedido_id text, p_tags text) returns void
language sql security definer set search_path = public as $$
  update email_pedidos set tag_email = p_tags, tag_email_em = now() where pedido_id = p_pedido_id
$$;
