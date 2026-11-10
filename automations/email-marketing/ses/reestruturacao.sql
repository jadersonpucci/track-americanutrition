-- Reestruturacao dos emails (v2), 10/11/2026.
-- O que muda em relacao a fluxos.sql:
--   * pos-compra passa a contar da ENTREGA (aviso "pedido_entregue" do rastreio em scheduled_messages), com conteudo
--     montado pelos produtos do pedido (catalogo email_produtos, gerado por padrao.py em produtos.sql);
--   * 6 emails de pos-compra parecidos viram 3 (guia de uso na entrega, complemento certo para o produto, avaliacao);
--   * recompra calculada: unidades x capsulas / dose diaria, contando do dia seguinte a entrega. Aviso alguns dias antes
--     de acabar e um lembrete curto depois, os dois cancelados se a pessoa comprou de novo;
--   * carrinho abandonado (carrinhos_abandonados, o checkout proprio): 3 emails com os itens e o link do carrinho;
--   * boas-vindas: 4 emails viram 3 (o convite da comunidade foi para dentro do 1.4);
--   * controle de frequencia no envio: no maximo 1 email por pessoa por rodada, intervalo minimo entre emails
--     (servico 18h, marketing 44h), horario comercial para marketing, e quem nao abre nada para de receber marketing.
-- Servico (carrinho, guia na entrega, recompra) vai para quem nao se descadastrou; marketing continua exigindo inscricao.

-- ------------------------------------------------------------------ estrutura
create table if not exists email_produtos (
  chave text primary key,
  padrao text not null,          -- regex (sem diferenciar maiusculas) sobre o titulo do item do pedido
  nome text, foto text, url text, variant_id text, preco numeric,
  ordem int,                     -- o primeiro padrao que casar leva (os especificos vem antes do ImunoFosfo)
  unidades int,                  -- capsulas/gomas por frasco quando a variante nao diz ("90 Caps")
  dose_dia numeric,              -- unidades por dia na posologia padrao da base da Serena
  dias_fixos int,                -- duracao de 1 unidade quando a conta nao e por capsula (gotas, semanal, 100 doses)
  complemento text,              -- chave do produto sugerido no email de complemento
  recompra boolean default true, -- false quando nao da para calcular (pet pelo peso, uso topico, proteina)
  guia_html text,                -- bloco "como usar" (email de entrega). Marcadores __QTD__ e __DURACAO__
  card_html text,                -- cartao do produto quando ele e o complemento sugerido
  atualizado_em timestamptz default now()
);
alter table email_produtos enable row level security;

alter table email_pedidos
  add column if not exists itens jsonb default '[]'::jsonb,   -- [{titulo, variante, variant_id, qtd}]
  add column if not exists entregue_em timestamptz,
  add column if not exists entrega_estimada boolean default false,
  add column if not exists agendado_em timestamptz;          -- quando os emails de entrega/recompra foram agendados
create index if not exists email_pedidos_numero_idx on email_pedidos (numero);

alter table email_fila
  add column if not exists dados jsonb default '{}'::jsonb,  -- variaveis do email ({{ chave }}), montadas no agendamento
  add column if not exists prioridade int default 2,         -- 1 servico, 2 marketing
  add column if not exists adiamentos int default 0;
create index if not exists email_fila_email_idx on email_fila (email, status);

alter table email_templates add column if not exists exemplo jsonb; -- variaveis de exemplo para a previa do painel

-- ------------------------------------------------------------------ utilitarios
create or replace function email_produto(p_titulo text) returns text
language sql stable set search_path = public as $$
  select chave from email_produtos where coalesce(p_titulo, '') ~* padrao order by ordem limit 1
$$;

create or replace function email_brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(round(coalesce(v, 0), 2), 'FM999990.00'), '.', ',')
$$;

-- horario local (America/Sao_Paulo) de um dia: email_as(ts, 10) = 10h do dia de ts
create or replace function email_as(ts timestamptz, h int) returns timestamptz language sql immutable as $$
  select (((ts at time zone 'America/Sao_Paulo')::date + make_time(h, 0, 0))) at time zone 'America/Sao_Paulo'
$$;

-- um dia (date) em horario local
create or replace function email_dia(d date, h int) returns timestamptz language sql immutable as $$
  select (d + make_time(h, 0, 0)) at time zone 'America/Sao_Paulo'
$$;

-- empurra para a janela 8h-21h (horario de Brasilia)
create or replace function email_janela(ts timestamptz) returns timestamptz language sql immutable as $$
  select case when extract(hour from ts at time zone 'America/Sao_Paulo') < 8 then email_as(ts, 8) + interval '30 minutes'
              when extract(hour from ts at time zone 'America/Sao_Paulo') >= 21 then email_as(ts + interval '1 day', 8) + interval '30 minutes'
              else ts end
$$;

-- troca {{ chave }} pelos valores de dados (texto)
create or replace function email_preencher(t text, d jsonb) returns text
language plpgsql immutable as $$
declare k text; v text;
begin
  if t is null or d is null then return t; end if;
  for k, v in select key, value from jsonb_each_text(d) loop
    t := replace(t, '{{ ' || k || ' }}', coalesce(v, ''));
  end loop;
  return t;
end $$;

-- ------------------------------------------------------------------ dados de um pedido entregue
-- Devolve {pos:{...}, rec:{...}|null, chaves:[...], novos:bool}
--   pos: produto_principal, produto_foto, guia_produtos, complemento_chave, complemento_nome, complemento_bloco
--   rec: produto_principal, produto_foto, data_fim, fim, dias, recompra_itens, recompra_url
create or replace function email_dados_pedido(p_itens jsonb, p_entregue timestamptz, p_email text, p_pedido text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  molde text := (select valor from email_config where chave = 'molde_item');
  dia0 date := (p_entregue at time zone 'America/Sao_Paulo')::date + 1;  -- comeca a contar no dia seguinte a entrega
  antes text[]; agora text[]; guia text; prin record; comp record; rprin record;
  rec_itens text; rec_url text; pos jsonb; rec jsonb := null; novos boolean;
  recs jsonb := '[]'::jsonb; lim int; gchaves jsonb;
begin
  set local client_min_messages = warning;
  create temp table if not exists _it (chave text, nome text, foto text, url text, qtd int, dias int, recompra boolean,
    complemento text, guia_html text, peso numeric, ordem int) on commit drop;
  truncate _it;
  insert into _it
  select pr.chave, min(pr.nome), min(pr.foto), min(pr.url), sum(l.q)::int,
         case when bool_and(l.d is not null) then sum(l.d)::int end, bool_or(pr.recompra), min(pr.complemento), min(pr.guia_html),
         sum(l.q * coalesce(pr.preco, 0)), min(pr.ordem)
    from (select i, coalesce(nullif(i->>'qtd', '')::int, 1) as q from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i) x
    cross join lateral (select * from email_produtos e where coalesce(x.i->>'titulo', '') ~* e.padrao order by e.ordem limit 1) pr
    cross join lateral (select x.q,
        case when pr.dias_fixos is not null then pr.dias_fixos * x.q
             when pr.dose_dia is not null then floor(coalesce(nullif(substring(coalesce(x.i->>'variante', '') from '(\d+)\s*[Cc][aá]p'), '')::int,
                                                    pr.unidades) * x.q / pr.dose_dia)::int end as d) l
   group by pr.chave;

  select coalesce(array_agg(chave), '{}') into agora from _it;
  -- o que essa pessoa ja comprou antes (pedidos sincronizados)
  select coalesce(array_remove(array_agg(distinct email_produto(i->>'titulo')), null), '{}') into antes
    from email_pedidos o cross join lateral jsonb_array_elements(coalesce(o.itens, '[]'::jsonb)) i
   where o.email = p_email and o.pedido_id <> coalesce(p_pedido, '') and not o.cancelado
     and o.criado_em > now() - interval '400 days';
  novos := exists (select 1 from _it where not (chave = any (antes)));

  -- principal: o que pesa mais no pedido
  select * into prin from _it order by peso desc, ordem limit 1;
  if prin.chave is null then return null; end if;

  select string_agg(replace(replace(t.guia_html, '__QTD__', t.qtd || case when t.qtd > 1 then ' unidades' else ' unidade' end),
           '__DURACAO__', case when t.recompra and t.dias is not null then
             '<div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#07388E;background:#EEF3FC;border-radius:12px;padding:12px 14px;">&#128197; Com ' ||
             t.qtd || case when t.qtd > 1 then ' unidades' else ' unidade' end || ', seu estoque dura cerca de <b>' || t.dias || ' dias</b>, até por volta de <b>' ||
             to_char(dia0 + t.dias, 'DD/MM') || '</b>. A gente te avisa antes de acabar.</div>' else '' end), '' order by t.peso desc)
    into guia from _it t;

  -- complemento: do produto mais importante para o menos, o primeiro sugerido que a pessoa ainda nao tem
  select c.* into comp from _it t join email_produtos c on c.chave = t.complemento
   where not (c.chave = any (agora)) and not (c.chave = any (antes))
   order by t.peso desc limit 1;

  pos := jsonb_build_object('produto_principal', prin.nome, 'produto_foto', prin.foto, 'guia_produtos', coalesce(guia, ''),
           'complemento_chave', comp.chave, 'complemento_nome', comp.nome, 'complemento_bloco', comp.card_html);

  -- recompra: um aviso para cada data de termino. Produtos que acabam ate 10 dias depois do primeiro do grupo
  -- vao juntos no mesmo aviso (e no mesmo link); o que acaba bem depois ganha o seu proprio aviso.
  for rprin in select * from _it where recompra and dias is not null and dias > 0 order by dias, peso desc loop
    if lim is not null and rprin.dias <= lim then continue; end if;   -- ja entrou no grupo anterior
    lim := rprin.dias + 10;
    select string_agg(replace(replace(replace(replace(molde, '__FOTO__', t.foto), '__NOME__', t.nome),
             '__DETALHE__', t.qtd || case when t.qtd > 1 then ' unidades' else ' unidade' end || ' · acaba por volta de <b>' || to_char(dia0 + t.dias, 'DD/MM') || '</b>'),
             '__VALOR__', case when dia0 + t.dias - current_date <= 0 then 'acabou' else (dia0 + t.dias - current_date) || ' dias' end), '' order by t.dias),
           jsonb_agg(t.chave)
      into rec_itens, gchaves from _it t where t.recompra and t.dias is not null and t.dias between rprin.dias and lim;
    select string_agg(v || '%3A' || q, '%2C') into rec_url
      from (select regexp_replace(coalesce(i->>'variant_id', ''), '\D', '', 'g') v, sum(coalesce(nullif(i->>'qtd', '')::int, 1)) q,
                   min(email_produto(i->>'titulo')) ch
              from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i group by 1) z
     where v <> '' and gchaves ? z.ch;
    rec := jsonb_build_object('produto_principal', rprin.nome, 'produto_foto', rprin.foto,
             'data_fim', to_char(dia0 + rprin.dias, 'DD/MM'), 'fim', (dia0 + rprin.dias)::text, 'dias', rprin.dias,
             'recompra_itens', coalesce(rec_itens, ''), 'chaves', gchaves, 'pedido_id', p_pedido,
             'recompra_url', case when rec_url is null then rprin.url else 'https://checkout.americanutrition.com/?items=' || rec_url end);
    recs := recs || jsonb_build_array(rec);
  end loop;

  return jsonb_build_object('pos', pos, 'rec', recs->0, 'recs', recs, 'chaves', to_jsonb(agora), 'novos', novos);
end $$;

-- ------------------------------------------------------------------ dados de um carrinho
create or replace function email_dados_carrinho(c carrinhos_abandonados) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare molde text := (select valor from email_config where chave = 'molde_item');
  aviso text := (select valor from email_config where chave = 'molde_aviso');
  itens text; txt text := '';
begin
  select string_agg(replace(replace(replace(replace(molde,
           '__FOTO__', coalesce((select e.foto from email_produtos e where coalesce(i->>'name', '') ~* e.padrao order by e.ordem limit 1),
                                (select foto from email_produtos where chave = 'imunofosfo'))),
           '__NOME__', coalesce(i->>'name', 'Produto')),
           '__DETALHE__', coalesce(nullif(i->>'qty', ''), '1') || case when coalesce(nullif(i->>'qty', '')::int, 1) > 1 then ' unidades' else ' unidade' end),
           '__VALOR__', email_brl(coalesce(nullif(i->>'unit', '')::numeric, 0) * coalesce(nullif(i->>'qty', '')::int, 1))), '')
    into itens
    from jsonb_array_elements(case when coalesce(c.itens, '') like '[%' then c.itens::jsonb else '[]'::jsonb end) i;

  if c.recusa_cartao then
    txt := '&#128179; <b>O pagamento com cartão não foi aprovado.</b> Isso costuma ser limite ou trava de segurança do banco. No mesmo link você pode tentar outro cartão ou pagar com PIX.';
  elsif c.boleto_pendente and coalesce(c.boleto_url, '') <> '' then
    txt := '&#129534; <b>Seu boleto já está gerado.</b> <a href="' || c.boleto_url || '" style="color:#7A4A00;font-weight:700;text-decoration:underline;">Abrir o boleto</a>. Se preferir, pague com PIX pelo botão abaixo: a confirmação é na hora.';
  end if;

  return jsonb_build_object('carrinho_itens', coalesce(itens, ''), 'checkout_url', c.checkout_url,
    'carrinho_aviso', case when txt = '' then '' else replace(aviso, '__TEXTO__', txt) end,
    'carrinho_total', email_brl(c.total), 'nome', nullif(initcap(split_part(trim(coalesce(c.first_name, '')), ' ', 1)), ''));
end $$;

-- ------------------------------------------------------------------ sincronizacao de pedidos (agora com itens)
create or replace function email_sync_pedidos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; maior text; o jsonb;
begin
  for o in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if maior is null or (o->>'updatedAt') > maior then maior := o->>'updatedAt'; end if;
    insert into email_pedidos (pedido_id, numero, email, shopify_customer_id, criado_em, tem_imunofosfo,
      pedidos_do_cliente, cancelado, total, itens)
    values (o->>'id', o->>'name', lower(trim(coalesce(o->>'email', o->'customer'->>'email', ''))), o->'customer'->>'id',
      (o->>'createdAt')::timestamptz,
      exists (select 1 from jsonb_array_elements(coalesce(o->'lineItems'->'nodes', '[]'::jsonb)) li
              where li->>'title' ilike '%imunofosfo%'),
      nullif(o->'customer'->>'numberOfOrders', '')::int, (o->>'cancelledAt') is not null,
      nullif(o->'totalPriceSet'->'shopMoney'->>'amount', '')::numeric,
      (select coalesce(jsonb_agg(jsonb_build_object('titulo', li->>'title', 'variante', li->'variant'->>'title',
                'variant_id', regexp_replace(coalesce(li->'variant'->>'id', ''), '\D', '', 'g'),
                'qtd', coalesce(nullif(li->>'quantity', '')::int, 1))), '[]'::jsonb)
         from jsonb_array_elements(coalesce(o->'lineItems'->'nodes', '[]'::jsonb)) li))
    on conflict (pedido_id) do update set cancelado = excluded.cancelado,
      total = coalesce(excluded.total, email_pedidos.total),
      itens = case when jsonb_array_length(excluded.itens) > 0 then excluded.itens else email_pedidos.itens end;
    n := n + 1;
  end loop;
  return jsonb_build_object('pedidos', n, 'ate', maior);
end $$;

-- ------------------------------------------------------------------ agendador
create or replace function email_agendar() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ini timestamptz := (select valor from email_config where chave = 'fluxos_inicio')::timestamptz;
  a int := 0; c int := 0; e int := 0; g int := 0; k int := 0; r int := 0; v int := 0;
  pd record; d jsonb; car carrinhos_abandonados; fim date; rg jsonb; n bigint; rref text; nv record; w int := 0;
begin
  -- 1) Boas-vindas: inscreveu depois do inicio e ainda nao comprou (3 emails)
  with novos as (
    select e.email from email_contatos e
     where e.status = 'inscrito' and e.consentimento_em >= ini and coalesce(e.pedidos, 0) = 0
       and not exists (select 1 from email_fila f where f.email = e.email and f.fluxo = 'boas_vindas')
  ), ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade)
    select n.email, s.slug, 'boas_vindas', 'contato', now() + s.espera, s.pri from novos n
    cross join (values ('1.1-boas-vindas-cupom', interval '0', 1), ('1.3-boas-vindas-como-age', interval '1 day', 2),
      ('1.4-boas-vindas-depoimentos', interval '3 days', 2)) s(slug, espera, pri)
    on conflict do nothing returning 1)
  select count(*) into a from ins;

  -- 2) Carrinho abandonado (checkout proprio): 3 emails. Um por pessoa por vez.
  for car in
    select distinct on (lower(trim(x.email))) x.* from carrinhos_abandonados x
     where x.status = 'abandonado' and x.abandonado_em >= greatest(ini, now() - interval '2 days')
       and coalesce(x.email, '') like '%@%' and coalesce(x.checkout_url, '') <> ''
       and not exists (select 1 from email_fila f where f.ref = 'carrinho:' || x.id)
       and not exists (select 1 from email_fila f where f.email = lower(trim(x.email)) and f.fluxo = 'carrinho'
                        and (f.status = 'pendente' or f.criado_em > now() - interval '4 days'))
     order by lower(trim(x.email)), x.abandonado_em desc
  loop
    d := email_dados_carrinho(car);
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
    select lower(trim(car.email)), s.slug, 'carrinho', 'carrinho:' || car.id, s.quando, 1, d
      from (values ('6.1-carrinho-itens', car.abandonado_em + interval '20 minutes'),
                   ('6.2-carrinho-duvidas', email_janela(car.abandonado_em + interval '1 day')),
                   ('6.3-carrinho-ultima-chamada', email_janela(car.abandonado_em + interval '3 days'))) s(slug, quando)
    on conflict do nothing;
    c := c + 1;
  end loop;

  -- 3) Entregas: liga o aviso "pedido entregue" (rastreio) ao pedido pelo numero (AN-xxxxx)
  update email_pedidos p set entregue_em = m.quando, entrega_estimada = false
    from (select distinct on (sm.template_params->'custom_fields'->>'order_name')
                 sm.template_params->'custom_fields'->>'order_name' as numero, sm.send_at as quando
            from scheduled_messages sm
           where sm.template_name = 'pedido_entregue' and sm.send_at > now() - interval '75 days'
           order by sm.template_params->'custom_fields'->>'order_name', sm.send_at) m
   where p.numero = m.numero and (p.entregue_em is null or p.entrega_estimada) and p.agendado_em is null
     and p.criado_em >= ini - interval '45 days';
  -- sem aviso de entrega em 14 dias: considera entregue 7 dias depois do pedido (so para recompra/complemento)
  update email_pedidos set entregue_em = criado_em + interval '7 days', entrega_estimada = true
   where entregue_em is null and agendado_em is null and not cancelado and criado_em >= ini - interval '45 days'
     and criado_em < now() - interval '14 days';

  -- 4) Pos-entrega e recompra, pedido a pedido
  for pd in
    select * from email_pedidos
     where entregue_em is not null and agendado_em is null and not cancelado and email like '%@%'
       and criado_em >= ini - interval '45 days'
     order by entregue_em limit 300
  loop
    d := email_dados_pedido(pd.itens, pd.entregue_em, pd.email, pd.pedido_id);
    if d is not null then
      -- guia de uso: entrega real depois do inicio, recente, e com algum produto novo para a pessoa
      if not pd.entrega_estimada and pd.entregue_em >= ini and pd.entregue_em > now() - interval '2 days'
         and ((d->>'novos')::boolean or coalesce(pd.pedidos_do_cliente, 1) <= 1) then
        insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
        values (pd.email, '2.1-pos-entrega-leia-antes', 'pos_compra', 'pedido:' || pd.pedido_id,
                email_janela(greatest(now(), pd.entregue_em + interval '30 minutes')), 1, d->'pos')
        on conflict do nothing;
        g := g + 1;
      end if;
      -- complemento e avaliacao: so entregas a partir do inicio
      if pd.entregue_em >= ini - interval '3 days' then
        if d->'pos'->>'complemento_chave' is not null
           and not exists (select 1 from email_fila f where f.email = pd.email and f.slug = '2.2-pos-entrega-complemento'
                            and f.criado_em > now() - interval '60 days') then
          insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
          values (pd.email, '2.2-pos-entrega-complemento', 'pos_compra', 'pedido:' || pd.pedido_id,
                  email_as(pd.entregue_em + interval '10 days', 10), 2, d->'pos')
          on conflict do nothing;
          k := k + 1;
        end if;
        if not exists (select 1 from email_fila f where f.email = pd.email and f.slug = '2.3-pos-entrega-avaliacao'
                        and f.criado_em > now() - interval '90 days') then
          insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
          values (pd.email, '2.3-pos-entrega-avaliacao', 'pos_compra', 'pedido:' || pd.pedido_id,
                  email_as(pd.entregue_em + interval '15 days', 11), 2, d->'pos')
          on conflict do nothing;
          e := e + 1;
        end if;
      end if;
      -- recompra calculada: um par 3.1/3.2 por data de termino (ref pedido:<id>, pedido:<id>#2, ...)
      for rg, n in select x, o from jsonb_array_elements(coalesce(d->'recs', '[]'::jsonb)) with ordinality t(x, o) loop
        fim := (rg->>'fim')::date;
        rref := 'pedido:' || pd.pedido_id || case when n > 1 then '#' || n else '' end;
        if email_dia(fim - case when (rg->>'dias')::int <= 12 then 3 else 5 end, 10) > now() then
          insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
          values (pd.email, '3.1-recompra-acabando', 'recompra', rref,
                  email_dia(fim - case when (rg->>'dias')::int <= 12 then 3 else 5 end, 10), 1, rg)
          on conflict do nothing;
          r := r + 1;
        end if;
        if email_dia(fim + 3, 10) > now() then
          insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
          values (pd.email, '3.2-recompra-acabou', 'recompra', rref, email_dia(fim + 3, 10), 1, rg)
          on conflict do nothing;
        end if;
      end loop;
    end if;
    update email_pedidos set agendado_em = now() where pedido_id = pd.pedido_id;
  end loop;

  -- 5b) Navegacao abandonada (site, so pessoas identificadas): viu produto ha mais de 2h (e menos de 2 dias),
  --     nao comprou nem abriu carrinho desde entao e nao recebeu este email nos ultimos 7 dias.
  for nv in
    select e.email, min(e.criado_em) primeiro, max(e.criado_em) ultimo from email_nav_eventos e
     where e.criado_em > now() - interval '2 days' and e.criado_em >= ini
     group by e.email having max(e.criado_em) < now() - interval '2 hours'
  loop
    continue when exists (select 1 from email_fila f where f.email = nv.email and f.slug = '4.1-navegacao-abandonada'
                           and f.criado_em > now() - interval '7 days');
    continue when exists (select 1 from email_pedidos p where p.email = nv.email and p.criado_em > nv.primeiro - interval '1 hour');
    continue when exists (select 1 from carrinhos_abandonados c where lower(trim(c.email)) = nv.email
                           and c.criado_em > nv.primeiro - interval '1 hour');
    d := email_dados_nav(nv.email, nv.primeiro);
    continue when d is null;
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade, dados)
    values (nv.email, '4.1-navegacao-abandonada', 'navegacao', 'nav:' || to_char(nv.ultimo at time zone 'UTC', 'YYYYMMDDHH24MI'),
            email_janela(now()), 2, d)
    on conflict do nothing;
    w := w + 1;
  end loop;
  delete from email_nav_eventos where criado_em < now() - interval '45 days';

  -- 5) VIP: o pedido pago que fez o cliente chegar a 3 pedidos (3 dias depois, para nao bater com o resto)
  with ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade)
    select p.email, '5.1-cliente-vip', 'vip', 'vip', email_as(p.criado_em + interval '3 days', 10), 2 from email_pedidos p
     where p.criado_em >= ini and not p.cancelado and p.email <> '' and p.pedidos_do_cliente = 3
    on conflict do nothing returning 1)
  select count(*) into v from ins;

  return jsonb_build_object('boas_vindas', a, 'carrinho', c, 'guia', g, 'complemento', k, 'avaliacao', e, 'recompra', r, 'navegacao', w, 'vip', v);
end $$;

-- ------------------------------------------------------------------ despachante (com controle de frequencia)
create or replace function email_proximos(p_limite int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare modo text := coalesce((select valor from email_config where chave = 'fluxos_modo'), 'teste');
  lim_dia int := coalesce((select valor from email_config where chave = 'envio_limite_dia'), '300')::int;
  hora int := extract(hour from now() at time zone 'America/Sao_Paulo');
  hoje int; cota int; res jsonb;
begin
  if modo = 'off' then return jsonb_build_object('modo', modo, 'itens', '[]'::jsonb); end if;

  -- expira o que passou do ponto: nao manda email velho fora de contexto
  update email_fila set status = 'expirado', motivo = 'atrasado demais'
   where status = 'pendente' and (enviar_em < now() - interval '2 days'
         or (slug = '6.1-carrinho-itens' and enviar_em < now() - interval '12 hours'));

  -- quem nao pode receber: marketing exige inscricao; servico so respeita descadastro/bounce/reclamacao
  update email_fila f set status = 'pulado', motivo = z.motivo
    from (select f2.id, coalesce(e.status, 'sem contato') || '/' || coalesce(e.shopify_consentimento, '-') as motivo,
                 case when f2.fluxo in ('carrinho', 'recompra') or f2.slug = '2.1-pos-entrega-leia-antes'
                      then coalesce(e.status, '') in ('descadastrado', 'bounce', 'reclamacao')
                      else (e.email is null or e.status <> 'inscrito' or coalesce(e.shopify_consentimento, '') <> 'SUBSCRIBED') end as bloqueia
            from email_fila f2 left join email_contatos e on e.email = f2.email
           where f2.status = 'pendente' and f2.enviar_em <= now()) z
   where f.id = z.id and z.bloqueia;

  -- email que nem corrigido e valido (ou dominio de teste): nao manda
  update email_fila f set status = 'pulado', motivo = 'email invalido'
   where f.status = 'pendente' and f.enviar_em <= now()
     and (email_corrigir(f.email) !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$'
          or split_part(email_corrigir(f.email), '@', 2) in ('example.com', 'example.org', 'example.net', 'teste.com', 'test.com',
                                                               'teste-an.com', 'dasda.com', 'asdas.com'));

  -- regras de cada fluxo
  -- recompra: cancela se, depois do pedido de referencia, a pessoa comprou algum dos produtos do aviso
  update email_fila f set status = 'pulado', motivo = 'comprou de novo'
   where f.status = 'pendente' and f.fluxo = 'recompra' and f.enviar_em <= now()
     and exists (select 1 from email_pedidos p where p.email = f.email and not p.cancelado
                  and p.criado_em > (select p0.criado_em from email_pedidos p0
                                      where p0.pedido_id = coalesce(f.dados->>'pedido_id', substr(f.ref, 8)))
                  and (f.dados->'chaves' is null
                       or exists (select 1 from jsonb_array_elements(coalesce(p.itens, '[]'::jsonb)) i
                                   where f.dados->'chaves' ? email_produto(i->>'titulo'))));
  update email_fila f set status = 'pulado', motivo = 'ja comprou'
   where f.status = 'pendente' and f.fluxo = 'boas_vindas' and f.enviar_em <= now()
     and (exists (select 1 from email_contatos e where e.email = f.email and coalesce(e.pedidos, 0) > 0)
          or exists (select 1 from email_pedidos p where p.email = f.email and not p.cancelado));
  update email_fila f set status = 'pulado', motivo = 'carrinho finalizado'
   where f.status = 'pendente' and f.fluxo = 'carrinho' and f.enviar_em <= now()
     and (exists (select 1 from carrinhos_abandonados c where 'carrinho:' || c.id = f.ref and c.status = 'convertido')
          or exists (select 1 from email_pedidos p where p.email = f.email and not p.cancelado and p.criado_em > f.criado_em - interval '1 hour'));
  update email_fila f set status = 'pulado', motivo = 'ja tem o complemento'
   where f.status = 'pendente' and f.slug = '2.2-pos-entrega-complemento' and f.enviar_em <= now()
     and exists (select 1 from email_pedidos p cross join lateral jsonb_array_elements(coalesce(p.itens, '[]'::jsonb)) i
                  where p.email = f.email and not p.cancelado and p.criado_em > f.criado_em - interval '30 days'
                    and email_produto(i->>'titulo') = f.dados->>'complemento_chave');
  update email_fila f set status = 'pulado', motivo = 'comprou ou abriu carrinho depois de navegar'
   where f.status = 'pendente' and f.fluxo = 'navegacao' and f.enviar_em <= now()
     and (exists (select 1 from email_pedidos p where p.email = f.email and not p.cancelado and p.criado_em > f.criado_em - interval '3 hours')
          or exists (select 1 from carrinhos_abandonados c where lower(trim(c.email)) = f.email and c.criado_em > f.criado_em - interval '3 hours'));
  -- marketing para quem recebeu 5+ emails em 60 dias e nao abriu nem clicou nenhum: para
  update email_fila f set status = 'pulado', motivo = 'sem engajamento'
   where f.status = 'pendente' and f.prioridade = 2 and f.enviar_em <= now()
     and (select count(*) from email_fila x where x.email = f.email and x.status = 'enviado' and x.enviado_em > now() - interval '60 days') >= 5
     and not exists (select 1 from email_fila x join email_eventos ev on ev.detalhe->>'messageId' = x.ses_message_id
                      where x.email = f.email and x.status = 'enviado' and x.enviado_em > now() - interval '60 days'
                        and ev.tipo in ('open', 'click'));

  -- frequencia: 1 email por pessoa por rodada e intervalo minimo desde o ultimo (servico 18h, marketing 44h).
  -- O que nao pode sair agora e adiado (nao perdido); depois de 5 adiamentos, pula.
  with due as (
    select f.id, f.adiamentos, case when f.prioridade = 1 then interval '18 hours' else interval '44 hours' end as gap,
           row_number() over (partition by f.email order by f.prioridade, f.enviar_em, f.id) as rn,
           (select max(x.enviado_em) from email_fila x where x.email = f.email and x.status = 'enviado') as ultimo
      from email_fila f where f.status = 'pendente' and f.enviar_em <= now()
       and (case when f.prioridade = 1 then hora between 7 and 21 else hora between 8 and 20 end)
  )
  update email_fila f set
      status = case when d.adiamentos >= 5 then 'pulado' else 'pendente' end,
      motivo = case when d.adiamentos >= 5 then 'muitos emails seguidos' else 'adiado pela frequencia' end,
      adiamentos = d.adiamentos + 1,
      enviar_em = case when d.rn > 1 then greatest(now(), coalesce(d.ultimo, now())) + d.gap else d.ultimo + d.gap end
    from due d
   where f.id = d.id and (d.rn > 1 or (d.ultimo is not null and d.ultimo > now() - d.gap));

  select count(*) into hoje from email_fila
   where status = 'enviado' and enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  cota := case when modo = 'ativo' then greatest(0, least(p_limite, lim_dia - hoje)) else p_limite end;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into res from (
    select f.id, f.email, f.slug, f.fluxo,
      case when modo = 'ativo' then email_corrigir(f.email) else 'success@simulator.amazonses.com' end as para,  -- corrige gamil.vom etc.
      email_preencher(regexp_replace(t.assunto, '\{\{\s*nome\s*\}\}', n.nome, 'g'), f.dados) as assunto,
      email_preencher(regexp_replace(regexp_replace(t.html, '\{\{\s*nome\s*\}\}', n.nome, 'g'),
        '\{\{\s*link_descadastro\s*\}\}', email_link_descadastro(f.email), 'g'), f.dados) as html,
      email_link_descadastro(f.email) as link, f.dados->>'checkout_url' as checkout_url, email_nav_token(f.id) as nav
      from email_fila f join email_templates t on t.slug = f.slug left join email_contatos e on e.email = f.email
      cross join lateral (select coalesce(nullif(initcap(split_part(trim(coalesce(e.nome, '')), ' ', 1)), ''),
                                          nullif(f.dados->>'nome', ''), 'você') as nome) n
     where f.status = 'pendente' and f.enviar_em <= now()
       -- marketing so em horario comercial; servico 7h-22h
       and (case when f.prioridade = 1 then hora between 7 and 21 else hora between 8 and 20 end)
     order by f.prioridade, f.enviar_em limit cota) x;
  return jsonb_build_object('modo', modo, 'enviados_hoje', hoje, 'cota', cota, 'itens', res);
end $$;

revoke all on function email_agendar(), email_proximos(int), email_sync_pedidos(jsonb),
  email_dados_pedido(jsonb, timestamptz, text, text), email_dados_carrinho(carrinhos_abandonados) from public, anon, authenticated;
