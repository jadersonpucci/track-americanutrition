-- =====================================================================
--  Loja própria (substitui a Shopify): catálogo, conteúdo, pedidos,
--  clientes e cupons. Idempotente. Depende de schema.sql (fin_usuarios,
--  fin_sessoes, fin_login: o painel usa os mesmos usuários do Financeiro)
--  e de checkout_config.
--
--  Painel:  POST /webhook/loja-api  →  select loja_api($json.body)
--  Build:   op "publicado" devolve tudo no formato de loja/data/loja.json
--  Checkout (n8n): loja_pedido_criar(payload) e loja_cupom_validar(code)
--  respondem no mesmo formato que os fluxos usam hoje com a Shopify.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo e conteúdo. Cada registro guarda o objeto inteiro em
--    `dados` (mesmo formato do loja.json); colunas de busca ao lado.
-- ---------------------------------------------------------------------
create table if not exists loja_produtos (
  id text primary key,                 -- id da Shopify preservado (numérico em texto)
  handle text not null unique,
  titulo text not null,
  status text not null default 'ativo' check (status in ('ativo', 'rascunho', 'arquivado')),
  dados jsonb not null,                -- {titulo, descricao_html, imagens[], opcoes[], variantes[], seo, avaliacao, tags…}
  landing_html text,                   -- landing própria (seções copiadas da Shopify)
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create table if not exists loja_colecoes (id text primary key, handle text not null unique, dados jsonb not null, atualizado_em timestamptz default now());
create table if not exists loja_paginas  (id text primary key, handle text not null, dados jsonb not null, landing_html text, atualizado_em timestamptz default now());
create table if not exists loja_blogs    (id text primary key, handle text not null unique, dados jsonb not null, atualizado_em timestamptz default now());
create table if not exists loja_artigos  (id text primary key, blog text not null, handle text not null, dados jsonb not null, atualizado_em timestamptz default now(), unique (blog, handle));
create table if not exists loja_depoimentos (id text primary key, dados jsonb not null, atualizado_em timestamptz default now());
create table if not exists loja_config   (chave text primary key, valor jsonb not null, atualizado_em timestamptz default now());  -- config, home, redirects

-- variantes "achatadas": o checkout valida preço e estoque por aqui
create or replace view loja_variantes as
  select (v->>'id') as id, p.id as produto_id, p.handle, p.titulo as produto, v->>'titulo' as titulo, v->>'sku' as sku,
         (v->>'preco')::numeric as preco, nullif(v->>'preco_comparacao', '')::numeric as preco_comparacao,
         coalesce((v->>'disponivel')::boolean, true) as disponivel, nullif(v->>'estoque', '')::int as estoque,
         coalesce(nullif(v->>'peso_g', '')::int, 0) as peso_g, p.status,
         (select i->>'url' from jsonb_array_elements(p.dados->'imagens') i where i->>'id' = v->>'imagem' limit 1) as imagem_variante,
         p.dados->'imagens'->0->>'url' as imagem
    from loja_produtos p, jsonb_array_elements(p.dados->'variantes') v;

-- ---------------------------------------------------------------------
-- 2) Pedidos, cupons, publicações
-- ---------------------------------------------------------------------
create sequence if not exists loja_pedido_numero start 50001;   -- ajuste com setval() para continuar a numeração da Shopify
create table if not exists loja_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('loja_pedido_numero'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem text not null default 'checkout',          -- checkout | pix | manual | serena | assinatura | us | shopify (importado)
  idempotency_key text unique,                       -- mesmo valor do AN Checkout Gate: não duplica
  cliente jsonb not null default '{}',               -- {nome, email, telefone, cpf}
  endereco jsonb not null default '{}',              -- {cep, logradouro, numero, complemento, bairro, cidade, uf, pais}
  itens jsonb not null default '[]',                 -- [{variante_id, produto_id, titulo, variante, sku, qtd, preco, imagem}]
  subtotal numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  frete numeric(12,2) not null default 0,
  frete_servico text,
  total numeric(12,2) not null default 0,
  cupom text,
  pagamento jsonb not null default '{}',             -- {metodo: cartao|pix|boleto, gateway: pagarme|inter|stripe, transacao, parcelas}
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente', 'pago', 'cancelado', 'reembolsado', 'parcial')),
  status_entrega text not null default 'nao_enviado' check (status_entrega in ('nao_enviado', 'preparando', 'enviado', 'entregue', 'devolvido')),
  rastreio text,
  transportadora text,
  ref text,                                          -- afiliado (cookie an_ref / an_aff)
  atribuicao jsonb,                                  -- an_src, utm, gclid, fbclid
  notas text,
  tags text[] not null default '{}',
  eventos jsonb not null default '[]',               -- [{em, texto, por}]
  shopify_id text unique,                            -- pedidos importados / espelhados da Shopify
  pago_em timestamptz,
  enviado_em timestamptz
);
create index if not exists loja_pedidos_criado on loja_pedidos (criado_em desc);
create index if not exists loja_pedidos_email on loja_pedidos (lower(cliente->>'email'));
create index if not exists loja_pedidos_cpf on loja_pedidos ((regexp_replace(coalesce(cliente->>'cpf', ''), '\D', '', 'g')));
create index if not exists loja_pedidos_rastreio on loja_pedidos (rastreio) where rastreio is not null;

create table if not exists loja_cupons (
  id text primary key,
  codigo text not null unique,
  dados jsonb not null,                              -- {tipo: percentual|fixo|frete, valor, minimo, inicio, fim, limite, uso_por_cliente, ativo, descricao}
  usos int not null default 0,
  atualizado_em timestamptz default now()
);

create table if not exists loja_publicacoes (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  usuario text, nota text,
  status text not null default 'pendente'            -- pendente → o workflow chama o deploy hook → ok | erro
);
insert into checkout_config (chave, valor) values ('loja_deploy_hook', '') on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- 3) Pacote publicado (o build lê exatamente isto)
-- ---------------------------------------------------------------------
create or replace function loja_publicado() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'versao', 1, 'gerado_em', now(),
    'config', coalesce((select valor from loja_config where chave = 'config'), '{}'),
    'home', coalesce((select valor from loja_config where chave = 'home'), '{"ordem":[],"secoes":{}}'),
    'redirects', coalesce((select valor from loja_config where chave = 'redirects'), '[]'),
    'produtos', coalesce((select jsonb_agg(p.dados || jsonb_build_object('id', p.id, 'handle', p.handle, 'titulo', p.titulo, 'status', p.status, 'landing_html', coalesce(p.landing_html, '')) order by p.criado_em) from loja_produtos p), '[]'),
    'colecoes', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id)) from loja_colecoes), '[]'),
    'paginas', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id, 'landing_html', coalesce(landing_html, ''))) from loja_paginas), '[]'),
    'blogs', coalesce((select jsonb_agg(dados) from loja_blogs), '[]'),
    'artigos', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id)) from loja_artigos), '[]'),
    'depoimentos', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id)) from loja_depoimentos), '[]'),
    'cupons', '[]'::jsonb
  );
$$;

-- grava um registro vindo do painel (objeto completo) na tabela certa
create or replace function loja_gravar(p_tabela text, r jsonb) returns void language plpgsql as $$
begin
  if p_tabela = 'produtos' then
    insert into loja_produtos (id, handle, titulo, status, dados, landing_html, criado_em, atualizado_em)
    values (r->>'id', r->>'handle', r->>'titulo', coalesce(r->>'status', 'ativo'), r - 'landing_html' - 'landing', nullif(r->>'landing_html', ''), coalesce((r->>'criado_em')::timestamptz, now()), now())
    on conflict (id) do update set handle = excluded.handle, titulo = excluded.titulo, status = excluded.status, dados = excluded.dados, landing_html = excluded.landing_html, atualizado_em = now();
  elsif p_tabela = 'colecoes' then
    insert into loja_colecoes (id, handle, dados) values (r->>'id', r->>'handle', r) on conflict (id) do update set handle = excluded.handle, dados = excluded.dados, atualizado_em = now();
  elsif p_tabela = 'paginas' then
    insert into loja_paginas (id, handle, dados, landing_html) values (r->>'id', r->>'handle', r - 'landing_html' - 'landing', nullif(r->>'landing_html', ''))
    on conflict (id) do update set handle = excluded.handle, dados = excluded.dados, landing_html = excluded.landing_html, atualizado_em = now();
  elsif p_tabela = 'blogs' then
    insert into loja_blogs (id, handle, dados) values (coalesce(r->>'id', r->>'handle'), r->>'handle', r) on conflict (id) do update set handle = excluded.handle, dados = excluded.dados, atualizado_em = now();
  elsif p_tabela = 'artigos' then
    insert into loja_artigos (id, blog, handle, dados) values (r->>'id', r->>'blog', r->>'handle', r) on conflict (id) do update set blog = excluded.blog, handle = excluded.handle, dados = excluded.dados, atualizado_em = now();
  elsif p_tabela = 'depoimentos' then
    insert into loja_depoimentos (id, dados) values (r->>'id', r) on conflict (id) do update set dados = excluded.dados, atualizado_em = now();
  elsif p_tabela = 'cupons' then
    insert into loja_cupons (id, codigo, dados) values (r->>'id', upper(r->>'codigo'), r - 'usos') on conflict (id) do update set codigo = excluded.codigo, dados = excluded.dados, atualizado_em = now();
  else
    raise exception 'tabela_nao_permitida';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Cupons e pedidos (chamados pelo checkout via n8n)
-- ---------------------------------------------------------------------
-- Mesma resposta do fluxo "Shopify — Validar Cupom": {valid, kind, value, code}
-- kind: percentage | fixed_amount | free_shipping
create or replace function loja_cupom_validar(p_codigo text, p_subtotal numeric default null, p_email text default null, p_cpf text default null) returns jsonb language plpgsql stable as $$
declare c loja_cupons; d jsonb;
begin
  select * into c from loja_cupons where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('valid', false, 'code', upper(trim(coalesce(p_codigo, ''))), 'reason', 'nao_encontrado'); end if;
  d := c.dados;
  if coalesce((d->>'ativo')::boolean, true) = false then return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'inativo'); end if;
  if nullif(d->>'inicio', '') is not null and (d->>'inicio')::timestamptz > now() then return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'ainda_nao_comecou'); end if;
  if nullif(d->>'fim', '') is not null and (d->>'fim')::timestamptz < now() then return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'expirado'); end if;
  if nullif(d->>'limite', '') is not null and c.usos >= (d->>'limite')::int then return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'esgotado'); end if;
  if p_subtotal is not null and nullif(d->>'minimo', '') is not null and p_subtotal < (d->>'minimo')::numeric then
    return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'minimo', 'minimo', (d->>'minimo')::numeric);
  end if;
  if coalesce((d->>'uso_por_cliente')::boolean, false) and (p_email is not null or p_cpf is not null) and exists (
    select 1 from loja_pedidos where cupom = c.codigo and status_pagamento = 'pago'
      and (lower(cliente->>'email') = lower(p_email) or regexp_replace(coalesce(cliente->>'cpf', ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, '-'), '\D', '', 'g'))) then
    return jsonb_build_object('valid', false, 'code', c.codigo, 'reason', 'ja_usado');
  end if;
  return jsonb_build_object('valid', true, 'code', c.codigo,
    'kind', case d->>'tipo' when 'percentual' then 'percentage' when 'frete' then 'free_shipping' else 'fixed_amount' end,
    'value', coalesce((d->>'valor')::numeric, 0), 'minimum', nullif(d->>'minimo', '')::numeric);
end $$;

-- Cria (ou atualiza, pela idempotency_key / transação) um pedido.
-- Aceita o formato que os fluxos já montam para a Shopify:
--   { idempotency_key, origem, customer:{name|first_name,last_name,email,phone,cpf}, shipping_address:{zip,address1,number,address2,neighborhood,city,province_code},
--     shopify_items:[{variant_id, quantity, price}], discount_code, discount_amount, shipping_price, shipping_title, total,
--     payment:{method, gateway, transaction_id, installments}, paid:true|false, ref, attribution:{…} }
create or replace function loja_pedido_criar(p jsonb) returns jsonb language plpgsql as $$
declare
  ped loja_pedidos; itens jsonb; sub numeric; cli jsonb; ende jsonb; c jsonb := coalesce(p->'customer', p->'cliente', '{}'); a jsonb := coalesce(p->'shipping_address', p->'endereco', '{}');
  chave text := nullif(p->>'idempotency_key', ''); trans text := nullif(coalesce(p#>>'{payment,transaction_id}', p#>>'{pagamento,transacao}'), '');
  pago boolean := coalesce((p->>'paid')::boolean, (p->>'status_pagamento') = 'pago', false);
begin
  -- itens: preço vem do payload (o checkout já calculou bump/desconto), título/sku/imagem do catálogo
  select coalesce(jsonb_agg(jsonb_build_object(
      'variante_id', x->>'variant_id', 'produto_id', v.produto_id, 'titulo', coalesce(v.produto, x->>'title', 'Produto'), 'variante', v.titulo, 'sku', v.sku,
      'qtd', coalesce((x->>'quantity')::int, 1), 'preco', coalesce((x->>'price')::numeric, v.preco, 0), 'imagem', coalesce(v.imagem_variante, v.imagem))), '[]'::jsonb),
    coalesce(sum(coalesce((x->>'price')::numeric, v.preco, 0) * coalesce((x->>'quantity')::int, 1)), 0)
    into itens, sub
    from jsonb_array_elements(coalesce(p->'shopify_items', p->'itens', p->'items', '[]')) x
    left join loja_variantes v on v.id = coalesce(x->>'variant_id', x->>'variante_id');
  cli := jsonb_strip_nulls(jsonb_build_object('nome', coalesce(c->>'name', c->>'nome', trim(concat(c->>'first_name', ' ', c->>'last_name'))), 'email', lower(c->>'email'), 'telefone', coalesce(c->>'phone', c->>'telefone'), 'cpf', coalesce(c->>'cpf', c->>'document')));
  ende := jsonb_strip_nulls(jsonb_build_object('cep', coalesce(a->>'zip', a->>'cep'), 'logradouro', coalesce(a->>'address1', a->>'logradouro'), 'numero', coalesce(a->>'number', a->>'numero'), 'complemento', coalesce(a->>'address2', a->>'complemento'),
    'bairro', coalesce(a->>'neighborhood', a->>'bairro'), 'cidade', coalesce(a->>'city', a->>'cidade'), 'uf', coalesce(a->>'province_code', a->>'uf'), 'pais', coalesce(a->>'country_code', 'BR')));

  select * into ped from loja_pedidos where (chave is not null and idempotency_key = chave) or (trans is not null and pagamento->>'transacao' = trans) limit 1;
  if found then
    if pago and ped.status_pagamento <> 'pago' then
      update loja_pedidos set status_pagamento = 'pago', pago_em = now(), atualizado_em = now(), eventos = eventos || jsonb_build_object('em', now(), 'texto', 'Pagamento confirmado')
       where id = ped.id returning * into ped;
      if ped.cupom is not null then update loja_cupons set usos = usos + 1 where codigo = ped.cupom; end if;
    end if;
    return jsonb_build_object('ok', true, 'duplicado', true, 'id', ped.id, 'numero', ped.numero, 'order_number', ped.numero, 'name', '#' || ped.numero);
  end if;

  insert into loja_pedidos (origem, idempotency_key, cliente, endereco, itens, subtotal, desconto, frete, frete_servico, total, cupom, pagamento, status_pagamento, ref, atribuicao, notas, tags, eventos, shopify_id, pago_em)
  values (coalesce(p->>'origem', 'checkout'), chave, cli, ende, itens, sub,
    coalesce((p->>'discount_amount')::numeric, (p->>'desconto')::numeric, 0), coalesce((p->>'shipping_price')::numeric, (p->>'frete')::numeric, 0), coalesce(p->>'shipping_title', p->>'frete_servico'),
    coalesce((p->>'total')::numeric, sub - coalesce((p->>'discount_amount')::numeric, 0) + coalesce((p->>'shipping_price')::numeric, 0)),
    nullif(upper(coalesce(p->>'discount_code', p->>'cupom')), ''),
    jsonb_strip_nulls(jsonb_build_object('metodo', coalesce(p#>>'{payment,method}', p#>>'{pagamento,metodo}'), 'gateway', coalesce(p#>>'{payment,gateway}', p#>>'{pagamento,gateway}'), 'transacao', trans, 'parcelas', coalesce(p#>>'{payment,installments}', p#>>'{pagamento,parcelas}')::int)),
    case when pago then 'pago' else 'pendente' end, nullif(p->>'ref', ''), p->'attribution', p->>'note', coalesce((select array_agg(t) from jsonb_array_elements_text(coalesce(p->'tags', '[]')) t), '{}'),
    jsonb_build_array(jsonb_build_object('em', now(), 'texto', case when pago then 'Pedido criado e pago' else 'Pedido criado (aguardando pagamento)' end, 'por', coalesce(p->>'origem', 'checkout'))),
    nullif(p->>'shopify_id', ''), case when pago then now() end)
  returning * into ped;
  if pago and ped.cupom is not null then update loja_cupons set usos = usos + 1 where codigo = ped.cupom; end if;
  -- baixa de estoque nas variantes que controlam quantidade
  if pago then perform loja_estoque_baixar(ped.itens); end if;
  return jsonb_build_object('ok', true, 'duplicado', false, 'id', ped.id, 'numero', ped.numero, 'order_number', ped.numero, 'name', '#' || ped.numero, 'total', ped.total);
end $$;

create or replace function loja_estoque_baixar(p_itens jsonb) returns void language plpgsql as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    update loja_produtos p set dados = jsonb_set(p.dados, '{variantes}', (
        select jsonb_agg(case when v->>'id' = it->>'variante_id' and nullif(v->>'estoque', '') is not null
          then v || jsonb_build_object('estoque', greatest(0, (v->>'estoque')::int - (it->>'qtd')::int), 'disponivel', ((v->>'estoque')::int - (it->>'qtd')::int) > 0)
          else v end) from jsonb_array_elements(p.dados->'variantes') v)), atualizado_em = now()
     where p.id = it->>'produto_id';
  end loop;
end $$;

-- Rastreio: o fluxo de etiqueta/rastreio grava o código; a página track.americanutrition.com pode consultar por aqui.
create or replace function loja_pedido_rastreio(p_numero bigint, p_codigo text, p_transportadora text default null) returns jsonb language plpgsql as $$
declare ped loja_pedidos;
begin
  update loja_pedidos set rastreio = upper(p_codigo), transportadora = coalesce(p_transportadora, transportadora), status_entrega = 'enviado', enviado_em = now(), atualizado_em = now(),
         eventos = eventos || jsonb_build_object('em', now(), 'texto', 'Enviado · ' || upper(p_codigo))
   where numero = p_numero returning * into ped;
  if not found then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  return jsonb_build_object('ok', true, 'id', ped.id, 'numero', ped.numero);
end $$;

-- ---------------------------------------------------------------------
-- 5) API do painel (login = usuários do Financeiro)
-- ---------------------------------------------------------------------
create or replace function loja_api(body jsonb) returns jsonb language plpgsql as $$
declare
  op text := body->>'op'; tok text := body->>'token'; p jsonb := coalesce(body->'payload', '{}'::jsonb);
  s fin_sessoes; u fin_usuarios; r jsonb; tab text; q text; ped loja_pedidos; res jsonb;
begin
  if op = 'login' then return fin_login(p->>'email', p->>'senha', p->>'origem'); end if;
  if op = 'ping' then return jsonb_build_object('ok', true, 'agora', now()); end if;
  -- o build da Vercel lê o pacote publicado com um token próprio (checkout_config.loja_build_token)
  if op = 'publicado' then
    if tok is null or tok <> coalesce((select valor from checkout_config where chave = 'loja_build_token'), '') or tok = '' then return jsonb_build_object('ok', false, 'erro', 'token_invalido'); end if;
    return jsonb_build_object('ok', true, 'data', loja_publicado());
  end if;

  select * into s from fin_sessoes where token = tok and expira_em > now();
  if not found then return jsonb_build_object('ok', false, 'erro', 'sessao_invalida'); end if;
  select * into u from fin_usuarios where id = s.usuario_id and ativo;
  if not found then return jsonb_build_object('ok', false, 'erro', 'usuario_inativo'); end if;
  update fin_sessoes set ultimo_uso = now(), expira_em = now() + interval '30 days' where token = tok;

  if op = 'logout' then delete from fin_sessoes where token = tok; return jsonb_build_object('ok', true); end if;

  if op = 'load' then
    res := loja_publicado();
    res := jsonb_set(res, '{cupons}', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id, 'codigo', codigo, 'usos', usos)) from loja_cupons), '[]'));
    return jsonb_build_object('ok', true, 'data', res, 'user', jsonb_build_object('id', u.id, 'email', u.email, 'nome', u.nome));
  end if;

  if op = 'upsert' then
    tab := p->>'table';
    for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]')) loop perform loja_gravar(tab, r); end loop;
    return jsonb_build_object('ok', true);
  end if;

  if op = 'remove' then
    tab := p->>'table';
    if tab not in ('produtos', 'colecoes', 'paginas', 'blogs', 'artigos', 'depoimentos', 'cupons') then return jsonb_build_object('ok', false, 'erro', 'tabela_nao_permitida'); end if;
    execute format('delete from %I where id = any(select jsonb_array_elements_text($1))', 'loja_' || tab) using p->'ids';
    return jsonb_build_object('ok', true);
  end if;

  if op = 'set' then
    if p->>'chave' not in ('config', 'home', 'redirects') then return jsonb_build_object('ok', false, 'erro', 'chave_invalida'); end if;
    insert into loja_config (chave, valor) values (p->>'chave', p->'valor') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
    return jsonb_build_object('ok', true);
  end if;

  if op = 'pedidos' then
    q := nullif(trim(p->>'q'), '');
    select coalesce(jsonb_agg(to_jsonb(x) - 'itens' - 'eventos' order by x.criado_em desc), '[]') into res from (
      select * from loja_pedidos
       where (nullif(p->>'pagamento', '') is null or status_pagamento = p->>'pagamento')
         and (nullif(p->>'entrega', '') is null or status_entrega = p->>'entrega')
         and (q is null or numero::text = ltrim(q, '#') or rastreio ilike q || '%' or cliente->>'nome' ilike '%' || q || '%' or cliente->>'email' ilike '%' || q || '%'
              or regexp_replace(coalesce(cliente->>'cpf', ''), '\D', '', 'g') = regexp_replace(q, '\D', '', 'g') or regexp_replace(coalesce(cliente->>'telefone', ''), '\D', '', 'g') like '%' || nullif(regexp_replace(q, '\D', '', 'g'), '') || '%')
       order by criado_em desc limit least(coalesce((p->>'limite')::int, 100), 500)) x;
    return jsonb_build_object('ok', true, 'pedidos', res);
  end if;

  if op = 'pedido' then
    select * into ped from loja_pedidos where id = (p->>'id')::uuid;
    if not found then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
    return jsonb_build_object('ok', true, 'pedido', to_jsonb(ped));
  end if;

  if op = 'pedido_atualizar' then
    select * into ped from loja_pedidos where id = (p->>'id')::uuid for update;
    if not found then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
    update loja_pedidos set
      rastreio = case when p ? 'rastreio' then nullif(p->>'rastreio', '') else rastreio end,
      status_entrega = coalesce(p->>'status_entrega', status_entrega),
      status_pagamento = coalesce(p->>'status_pagamento', status_pagamento),
      notas = case when p ? 'notas' then p->>'notas' else notas end,
      tags = case when p ? 'tags' then coalesce((select array_agg(t) from jsonb_array_elements_text(p->'tags') t), '{}') else tags end,
      enviado_em = case when p->>'status_entrega' = 'enviado' and enviado_em is null then now() else enviado_em end,
      atualizado_em = now(),
      eventos = eventos || (select coalesce(jsonb_agg(e), '[]') from (
        select jsonb_build_object('em', now(), 'por', coalesce(u.nome, u.email), 'texto', 'Entrega: ' || (p->>'status_entrega')) e where p->>'status_entrega' is distinct from ped.status_entrega and p ? 'status_entrega'
        union all select jsonb_build_object('em', now(), 'por', coalesce(u.nome, u.email), 'texto', 'Pagamento: ' || (p->>'status_pagamento')) where p->>'status_pagamento' is distinct from ped.status_pagamento and p ? 'status_pagamento'
        union all select jsonb_build_object('em', now(), 'por', coalesce(u.nome, u.email), 'texto', 'Rastreio: ' || (p->>'rastreio')) where nullif(p->>'rastreio', '') is distinct from ped.rastreio and p ? 'rastreio') z)
     where id = ped.id returning * into ped;
    return jsonb_build_object('ok', true, 'pedido', to_jsonb(ped));
  end if;

  if op = 'resumo' then
    select jsonb_build_object(
      'hoje_total', coalesce(sum(total) filter (where criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0),
      'hoje_pedidos', count(*) filter (where criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
      'sem_total', coalesce(sum(total) filter (where criado_em >= now() - interval '7 days'), 0),
      'sem_pedidos', count(*) filter (where criado_em >= now() - interval '7 days'),
      'mes_total', coalesce(sum(total) filter (where criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0),
      'mes_ticket', coalesce(avg(total) filter (where criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0))
      into res from loja_pedidos where status_pagamento = 'pago';
    res := res || jsonb_build_object(
      'a_enviar', (select count(*) from loja_pedidos where status_pagamento = 'pago' and status_entrega in ('nao_enviado', 'preparando')),
      'ultimos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'criado_em', criado_em, 'cliente', cliente, 'total', total, 'status_pagamento', status_pagamento) order by criado_em desc), '[]') from (select * from loja_pedidos order by criado_em desc limit 8) x));
    return jsonb_build_object('ok', true, 'resumo', res);
  end if;

  if op = 'clientes' then
    q := nullif(trim(p->>'q'), '');
    select coalesce(jsonb_agg(c order by (c->>'total')::numeric desc), '[]') into res from (
      select jsonb_build_object('nome', max(cliente->>'nome'), 'email', max(cliente->>'email'), 'telefone', max(cliente->>'telefone'), 'cpf', max(cliente->>'cpf'), 'cidade', max(endereco->>'cidade'),
             'pedidos', count(*), 'total', sum(total), 'primeiro', min(criado_em), 'ultimo', max(criado_em)) c
        from loja_pedidos where status_pagamento = 'pago'
         and (q is null or cliente->>'nome' ilike '%' || q || '%' or cliente->>'email' ilike '%' || q || '%' or regexp_replace(coalesce(cliente->>'telefone', ''), '\D', '', 'g') like '%' || nullif(regexp_replace(q, '\D', '', 'g'), '') || '%')
       group by coalesce(nullif(lower(cliente->>'email'), ''), regexp_replace(coalesce(cliente->>'cpf', ''), '\D', '', 'g'), id::text)
       order by sum(total) desc limit 300) z;
    return jsonb_build_object('ok', true, 'clientes', res);
  end if;

  if op = 'publicar' then
    insert into loja_publicacoes (usuario, nota) values (coalesce(u.nome, u.email), p->>'nota');
    -- o workflow "Loja · API" vê deploy_hook na resposta e faz o POST (o Postgres não chama HTTP)
    return jsonb_build_object('ok', true, 'deploy_hook', nullif((select valor from checkout_config where chave = 'loja_deploy_hook'), ''));
  end if;

  if op = 'publicacoes' then
    return jsonb_build_object('ok', true, 'itens', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]') from (select * from loja_publicacoes order by criado_em desc limit 10) x));
  end if;

  return jsonb_build_object('ok', false, 'erro', 'op_desconhecida');
end $$;
