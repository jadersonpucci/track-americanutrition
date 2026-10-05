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
create sequence if not exists loja_pedido_numero start 15845;   -- continua a numeração da Shopify (AN-15844…); o import de pedidos ajusta com setval()
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
-- 2b) Estoque, no modelo da Shopify: por local, "em mãos" e "comprometido"
--     (reservado para pedidos pagos ainda não enviados); disponível = em mãos − comprometido.
--     Toda mudança passa por loja_estoque_mover e fica no histórico (loja_estoque_mov).
--     A vitrine vende o disponível dos locais "online"; as variantes guardam o total em
--     dados.variantes[].estoque / disponivel (o checkout lê pela view loja_variantes).
-- ---------------------------------------------------------------------
create table if not exists loja_locais (
  id text primary key,
  nome text not null,
  ativo boolean not null default true,
  online boolean not null default false,             -- atende os pedidos do site
  ordem int not null default 0,
  endereco jsonb,
  atualizado_em timestamptz default now()
);
create table if not exists loja_estoque (
  variante_id text not null,
  local_id text not null references loja_locais (id) on update cascade,
  em_maos int not null default 0,
  comprometido int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (variante_id, local_id)
);
create table if not exists loja_estoque_mov (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  variante_id text not null,
  local_id text not null,
  em_maos int not null default 0,                    -- variação
  comprometido int not null default 0,
  saldo_em_maos int, saldo_comprometido int,
  motivo text not null,                              -- correcao | contagem | recebido | danificado | perda | promocao | transferencia | devolucao | pedido | importado | outro
  nota text,
  pedido_id uuid, pedido_numero bigint,
  usuario text
);
create index if not exists loja_estoque_mov_var on loja_estoque_mov (variante_id, criado_em desc);
create index if not exists loja_estoque_mov_data on loja_estoque_mov (criado_em desc);
alter table loja_pedidos add column if not exists estoque_estado text;   -- null | reservado | baixado | devolvido | importado (pedidos da Shopify: não mexem no saldo)

create or replace function loja_estoque_mover(p_var text, p_local text, p_em_maos int, p_comp int, p_motivo text, p_nota text default null, p_pedido uuid default null, p_numero bigint default null, p_usuario text default null)
returns void language plpgsql as $$
declare e loja_estoque;
begin
  if coalesce(p_em_maos, 0) = 0 and coalesce(p_comp, 0) = 0 then return; end if;
  insert into loja_estoque (variante_id, local_id, em_maos, comprometido) values (p_var, p_local, coalesce(p_em_maos, 0), greatest(0, coalesce(p_comp, 0)))
  on conflict (variante_id, local_id) do update set em_maos = loja_estoque.em_maos + coalesce(p_em_maos, 0),
     comprometido = greatest(0, loja_estoque.comprometido + coalesce(p_comp, 0)), atualizado_em = now()
  returning * into e;
  insert into loja_estoque_mov (variante_id, local_id, em_maos, comprometido, saldo_em_maos, saldo_comprometido, motivo, nota, pedido_id, pedido_numero, usuario)
  values (p_var, p_local, coalesce(p_em_maos, 0), coalesce(p_comp, 0), e.em_maos, e.comprometido, p_motivo, p_nota, p_pedido, p_numero, p_usuario);
end $$;

-- ---------------------------------------------------------------------
-- Fila de eventos: o banco não chama HTTP; o fluxo n8n "Loja · Eventos" lê a fila a cada minuto e entrega
--   klaviyo  → POST /api/events (Placed Order, Ordered Product, Fulfilled Order, Delivered Order,
--              Cancelled Order, Refunded Order, Codigo de Acesso)
--   aviso    → mensagem no Telegram da equipe (pedido pago, produto esgotou, estoque baixo)
--   whatsapp → mensagem pelo WhatsApp (código de acesso da Minha conta)
--   publicar → deploy hook da Vercel (site estático atualizado quando um produto esgota ou volta)
-- ---------------------------------------------------------------------
create table if not exists loja_eventos (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  destino text not null,
  tipo text not null,
  chave text unique,                                 -- evita duplicar (ex.: placed:<pedido>)
  dados jsonb not null default '{}',
  enviado_em timestamptz,
  tentativas int not null default 0,
  pego_em timestamptz,
  erro text
);
create index if not exists loja_eventos_pendentes on loja_eventos (id) where enviado_em is null;

create or replace function loja_evento(p_destino text, p_tipo text, p_chave text, p_dados jsonb) returns void language sql as $$
  insert into loja_eventos (destino, tipo, chave, dados) values (p_destino, p_tipo, p_chave, coalesce(p_dados, '{}')) on conflict (chave) do nothing;
$$;
-- o worker pega um lote (trava por 5 min) e marca cada um como enviado ou com erro
create or replace function loja_eventos_pegar(p_limite int default 50) returns setof loja_eventos language sql as $$
  update loja_eventos set pego_em = now(), tentativas = tentativas + 1
   where id in (select id from loja_eventos where enviado_em is null and tentativas < 8 and (pego_em is null or pego_em < now() - interval '5 minutes')
                 order by id limit p_limite for update skip locked)
  returning *;
$$;
create or replace function loja_eventos_marcar(p_id bigint, p_ok boolean, p_erro text default null) returns void language sql as $$
  update loja_eventos set enviado_em = case when p_ok then now() end, erro = case when p_ok then null else left(p_erro, 500) end where id = p_id;
$$;

-- controla quantidade? marcação explícita na variante; sem ela, só se já existe posição de estoque.
-- Kits (variante com "componentes") não têm estoque próprio: seguem o dos componentes.
create or replace function loja_variante_rastreia(v jsonb) returns boolean language sql stable as $$
  select case when jsonb_array_length(coalesce(v->'componentes', '[]')) > 0 then false
              else coalesce((v->>'rastrear')::boolean, exists (select 1 from loja_estoque e where e.variante_id = v->>'id')) end;
$$;
create or replace function loja_variante(p_id text) returns jsonb language sql stable as $$
  select x || jsonb_build_object('_produto', p.id, '_handle', p.handle, '_titulo', p.titulo) from loja_produtos p, jsonb_array_elements(p.dados->'variantes') x where x->>'id' = p_id limit 1;
$$;
-- itens de pedido "abertos": kit vira os componentes (qtd × qtd do componente)
create or replace function loja_itens_expandidos(p_itens jsonb) returns table (variante_id text, qtd int, kit text) language sql stable as $$
  select coalesce(c->>'variante_id', it->>'variante_id'), coalesce((it->>'qtd')::int, 1) * coalesce((c->>'qtd')::int, 1), case when c is not null then it->>'variante_id' end
    from jsonb_array_elements(coalesce(p_itens, '[]')) it
    left join lateral jsonb_array_elements(coalesce(loja_variante(it->>'variante_id')->'componentes', '[]')) c on true;
$$;
-- disponível na loja online
create or replace function loja_disponivel_online(p_var text) returns int language sql stable as $$
  select coalesce(sum(e.em_maos - e.comprometido), 0)::int from loja_estoque e join loja_locais l on l.id = e.local_id and l.ativo and l.online where e.variante_id = p_var;
$$;

-- recalcula estoque/disponivel das variantes (todas, ou só p_ids e os kits que as usam); devolve as que mudaram de
-- disponibilidade. Quando muda, agenda a publicação do site; avisa a equipe quando esgota ou fica abaixo do mínimo.
create or replace function loja_estoque_sincronizar(p_ids text[] default null) returns jsonb language plpgsql as $$
declare pr record; novo jsonb; mudou jsonb := '[]'; n jsonb; o jsonb;
begin
  for pr in select p.id, p.titulo, p.dados from loja_produtos p
             where p_ids is null or exists (select 1 from jsonb_array_elements(p.dados->'variantes') v
                     where v->>'id' = any(p_ids) or exists (select 1 from jsonb_array_elements(coalesce(v->'componentes', '[]')) c where c->>'variante_id' = any(p_ids)))
             order by (select count(*) from jsonb_array_elements(p.dados->'variantes') v where jsonb_array_length(coalesce(v->'componentes', '[]')) > 0) loop
    select jsonb_agg(case
        when jsonb_array_length(coalesce(v->'componentes', '[]')) > 0 then   -- kit: quantos kits completos dá para montar
          v || (select jsonb_build_object('estoque', coalesce(min(floor(loja_disponivel_online(c->>'variante_id')::numeric / greatest(1, coalesce((c->>'qtd')::int, 1)))), 0)::int,
                                          'disponivel', coalesce((v->>'vender_sem_estoque')::boolean, false) or coalesce(min(floor(loja_disponivel_online(c->>'variante_id')::numeric / greatest(1, coalesce((c->>'qtd')::int, 1)))), 0) > 0)
                  from jsonb_array_elements(v->'componentes') c)
        when (p_ids is null or v->>'id' = any(p_ids)) and loja_variante_rastreia(v) then
          v || jsonb_build_object('estoque', loja_disponivel_online(v->>'id'), 'disponivel', coalesce((v->>'vender_sem_estoque')::boolean, false) or loja_disponivel_online(v->>'id') > 0)
        else v end order by ord)
      into novo
      from jsonb_array_elements(pr.dados->'variantes') with ordinality x(v, ord);
    for n in select * from jsonb_array_elements(novo) loop
      select x into o from jsonb_array_elements(pr.dados->'variantes') x where x->>'id' = n->>'id';
      if coalesce((o->>'disponivel')::boolean, true) is distinct from coalesce((n->>'disponivel')::boolean, true) then
        mudou := mudou || jsonb_build_array(jsonb_build_object('produto', pr.titulo, 'variante', n->>'titulo', 'disponivel', (n->>'disponivel')::boolean));
        if not (n->>'disponivel')::boolean then
          perform loja_evento('aviso', 'Esgotou', 'esgotou:' || (n->>'id') || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
            jsonb_build_object('texto', '⛔ Esgotou na loja: ' || pr.titulo || case when n->>'titulo' <> 'Default Title' then ' · ' || (n->>'titulo') else '' end));
        end if;
      elsif nullif(n->>'estoque', '') is not null and nullif(o->>'estoque', '') is not null and (n->>'estoque')::int > 0
            and (n->>'estoque')::int <= coalesce((n->>'estoque_minimo')::int, 10) and (o->>'estoque')::int > coalesce((n->>'estoque_minimo')::int, 10)
            and jsonb_array_length(coalesce(n->'componentes', '[]')) = 0 then
        perform loja_evento('aviso', 'Estoque baixo', 'baixo:' || (n->>'id') || ':' || to_char(now(), 'YYYYMMDD'),
          jsonb_build_object('texto', '⚠️ Estoque baixo: ' || pr.titulo || case when n->>'titulo' <> 'Default Title' then ' · ' || (n->>'titulo') else '' end || ' — restam ' || (n->>'estoque') || ' na loja'));
      end if;
    end loop;
    if novo is distinct from pr.dados->'variantes' then
      update loja_produtos set dados = jsonb_set(dados, '{variantes}', novo) where id = pr.id;
    end if;
  end loop;
  if jsonb_array_length(mudou) > 0 then
    perform loja_evento('publicar', 'Publicar', 'publicar:' || to_char(now(), 'YYYYMMDDHH24MI'), jsonb_build_object('motivo', 'disponibilidade', 'mudou', mudou));
  end if;
  return mudou;
end $$;

-- aplica no estoque a diferença entre o estado atual do pedido e o que o status pede:
--   pago e não enviado → reservado (comprometido); enviado/entregue → baixado (sai de em mãos);
--   cancelado antes de enviar → nada (libera a reserva); devolvido depois de enviado → volta para em mãos.
-- Kits movem os componentes. O local escolhido fica no item (local_id; em kits, locais por componente).
create or replace function loja_pedido_estoque(p_id uuid, p_usuario text default null) returns jsonb language plpgsql as $$
declare
  ped loja_pedidos; de text; para text; a0 int; c0 int; a1 int; c1 int; it jsonb; novos jsonb := '[]'; ids text[] := '{}';
  txt text; linha record; locs jsonb; loc text; v jsonb;
begin
  select * into ped from loja_pedidos where id = p_id for update;
  if not found or ped.estoque_estado = 'importado' then return '[]'; end if;
  de := coalesce(ped.estoque_estado, '');
  para := case
    when ped.status_entrega = 'devolvido' then case when de in ('baixado', 'devolvido') then 'devolvido' else '' end
    when ped.status_pagamento in ('pago', 'parcial') then case when ped.status_entrega in ('enviado', 'entregue') then 'baixado' else 'reservado' end
    when de = 'baixado' then 'baixado'
    else '' end;
  if de = para then return '[]'; end if;
  select x[1], x[2] into a0, c0 from (select case de when 'reservado' then array[0, 1] when 'baixado' then array[-1, 0] else array[0, 0] end x) z;
  select x[1], x[2] into a1, c1 from (select case para when 'reservado' then array[0, 1] when 'baixado' then array[-1, 0] else array[0, 0] end x) z;
  txt := case de || '>' || para when '>reservado' then 'Reservado para o pedido' when 'reservado>baixado' then 'Pedido enviado' when '>baixado' then 'Pedido enviado'
    when 'reservado>' then 'Reserva liberada (pedido cancelado)' when 'baixado>devolvido' then 'Pedido devolvido' when 'devolvido>baixado' then 'Pedido reenviado' else 'Pedido' end;
  for it in select * from jsonb_array_elements(ped.itens) loop
    locs := coalesce(it->'locais', case when it->>'local_id' is not null then jsonb_build_object(it->>'variante_id', it->>'local_id') else '{}' end);
    for linha in select * from loja_itens_expandidos(jsonb_build_array(it)) loop
      v := loja_variante(linha.variante_id);
      continue when linha.variante_id is null or v is null or not loja_variante_rastreia(v);
      loc := locs->>linha.variante_id;
      if loc is null then   -- o local online com mais disponível dessa variante
        select l.id into loc from loja_locais l left join loja_estoque e on e.local_id = l.id and e.variante_id = linha.variante_id
         where l.ativo and l.online order by coalesce(e.em_maos - e.comprometido, 0) desc, l.ordem limit 1;
        loc := coalesce(loc, (select id from loja_locais order by ordem limit 1));
      end if;
      continue when loc is null;
      perform loja_estoque_mover(linha.variante_id, loc, (a1 - a0) * linha.qtd, (c1 - c0) * linha.qtd, case when para = 'devolvido' then 'devolucao' else 'pedido' end,
        txt || case when linha.kit is not null then ' (kit)' else '' end, ped.id, ped.numero, p_usuario);
      ids := ids || linha.variante_id;
      locs := locs || jsonb_build_object(linha.variante_id, loc);
    end loop;
    if locs <> '{}'::jsonb then
      it := it || jsonb_build_object('locais', locs) || case when locs ? (it->>'variante_id') then jsonb_build_object('local_id', locs->>(it->>'variante_id')) else '{}'::jsonb end;
    end if;
    novos := novos || jsonb_build_array(it);
  end loop;
  update loja_pedidos set estoque_estado = nullif(para, ''), itens = novos where id = ped.id;
  return loja_estoque_sincronizar(ids);
end $$;

-- vendas por variante (para previsão de ruptura): unidades pagas nos últimos N dias, kits abertos nos componentes
create or replace function loja_vendas_variantes(p_dias int default 30) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(variante_id, q), '{}') from (
    select x.variante_id, sum(x.qtd)::int q from loja_pedidos p, loja_itens_expandidos(p.itens) x
     where p.status_pagamento in ('pago', 'parcial') and p.criado_em >= now() - make_interval(days => p_dias) and x.variante_id is not null
     group by 1) z;
$$;

-- carga inicial (locais e saldos em mãos vindos da Shopify): {locais:[{id,nome,ativo,online,ordem}], estoque:[{variante_id,local_id,em_maos}]}
create or replace function loja_estoque_importar(d jsonb) returns jsonb language plpgsql as $$
declare l jsonb; e jsonb; atual int;
begin
  for l in select * from jsonb_array_elements(coalesce(d->'locais', '[]')) loop
    insert into loja_locais (id, nome, ativo, online, ordem) values (l->>'id', l->>'nome', coalesce((l->>'ativo')::boolean, true), coalesce((l->>'online')::boolean, false), coalesce((l->>'ordem')::int, 0))
    on conflict (id) do update set nome = excluded.nome, ativo = excluded.ativo, online = excluded.online, ordem = excluded.ordem, atualizado_em = now();
  end loop;
  for e in select * from jsonb_array_elements(coalesce(d->'estoque', '[]')) loop
    select em_maos into atual from loja_estoque where variante_id = e->>'variante_id' and local_id = e->>'local_id';
    perform loja_estoque_mover(e->>'variante_id', e->>'local_id', (e->>'em_maos')::int - coalesce(atual, 0), 0, 'importado', 'Saldo da Shopify');
  end loop;
  return loja_estoque_sincronizar(null);
end $$;

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
    -- estoque/disponível vêm do saldo (o painel não sobrescreve)
    if to_regclass('loja_estoque') is not null then perform loja_estoque_sincronizar(array(select jsonb_array_elements(r->'variantes')->>'id')); end if;
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
      perform loja_pedido_estoque(ped.id, 'pagamento');
    end if;
    return jsonb_build_object('ok', true, 'duplicado', true, 'id', ped.id, 'numero', ped.numero, 'order_number', ped.numero, 'name', 'AN-' || ped.numero);
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
  -- estoque: pedido pago reserva (comprometido) no local online com saldo; pedidos importados da Shopify não mexem no saldo
  if ped.origem = 'shopify' then update loja_pedidos set estoque_estado = 'importado' where id = ped.id;
  else perform loja_pedido_estoque(ped.id, ped.origem); end if;
  return jsonb_build_object('ok', true, 'duplicado', false, 'id', ped.id, 'numero', ped.numero, 'order_number', ped.numero, 'name', 'AN-' || ped.numero, 'total', ped.total);
end $$;

drop function if exists loja_estoque_baixar(jsonb);   -- substituída por loja_pedido_estoque

-- Rastreio: o fluxo de etiqueta/rastreio grava o código; a página track.americanutrition.com pode consultar por aqui.
create or replace function loja_pedido_rastreio(p_numero bigint, p_codigo text, p_transportadora text default null) returns jsonb language plpgsql as $$
declare ped loja_pedidos;
begin
  update loja_pedidos set rastreio = upper(p_codigo), transportadora = coalesce(p_transportadora, transportadora), status_entrega = 'enviado', enviado_em = now(), atualizado_em = now(),
         eventos = eventos || jsonb_build_object('em', now(), 'texto', 'Enviado · ' || upper(p_codigo))
   where numero = p_numero returning * into ped;
  if not found then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
  perform loja_pedido_estoque(ped.id, 'rastreio');
  return jsonb_build_object('ok', true, 'id', ped.id, 'numero', ped.numero);
end $$;

-- ---------------------------------------------------------------------
-- 4b) Eventos de pedido → Klaviyo (os mesmos nomes da integração da Shopify) e aviso para a equipe
-- ---------------------------------------------------------------------
alter table loja_pedidos add column if not exists avaliacao_token text;

create or replace function loja_klaviyo_perfil(p loja_pedidos) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'email', nullif(lower(p.cliente->>'email'), ''),
    'phone_number', case when length(regexp_replace(coalesce(p.cliente->>'telefone', ''), '\D', '', 'g')) between 10 and 11 then '+55' || regexp_replace(p.cliente->>'telefone', '\D', '', 'g')
                         when length(regexp_replace(coalesce(p.cliente->>'telefone', ''), '\D', '', 'g')) between 12 and 13 then '+' || regexp_replace(p.cliente->>'telefone', '\D', '', 'g') end,
    'first_name', nullif(split_part(coalesce(p.cliente->>'nome', ''), ' ', 1), ''),
    'last_name', nullif(trim(substr(coalesce(p.cliente->>'nome', ''), length(split_part(coalesce(p.cliente->>'nome', ''), ' ', 1)) + 1)), ''),
    'location', jsonb_strip_nulls(jsonb_build_object('city', p.endereco->>'cidade', 'region', p.endereco->>'uf', 'zip', p.endereco->>'cep', 'country', 'Brazil'))));
$$;

create or replace function loja_klaviyo_pedido(p loja_pedidos) returns jsonb language sql stable as $$
  select jsonb_build_object('perfil', loja_klaviyo_perfil(p), 'valor', p.total, 'props', jsonb_strip_nulls(jsonb_build_object(
    'OrderId', 'AN-' || p.numero, 'OrderNumber', p.numero, '$value', p.total,
    'ItemNames', (select coalesce(jsonb_agg(i->>'titulo'), '[]') from jsonb_array_elements(p.itens) i),
    'ItemCount', (select coalesce(sum((i->>'qtd')::int), 0) from jsonb_array_elements(p.itens) i),
    'Items', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'ProductID', i->>'produto_id', 'VariantID', i->>'variante_id', 'SKU', i->>'sku', 'ProductName', i->>'titulo', 'VariantName', nullif(i->>'variante', 'Default Title'),
        'Quantity', (i->>'qtd')::int, 'ItemPrice', (i->>'preco')::numeric, 'RowTotal', (i->>'preco')::numeric * (i->>'qtd')::int, 'ImageURL', i->>'imagem',
        'ProductURL', 'https://www.americanutrition.com/products/' || (select handle from loja_produtos where id = i->>'produto_id')))), '[]') from jsonb_array_elements(p.itens) i),
    'Subtotal', p.subtotal, 'DiscountCode', p.cupom, 'DiscountValue', nullif(p.desconto, 0), 'Shipping', p.frete, 'ShippingMethod', p.frete_servico,
    'PaymentMethod', p.pagamento->>'metodo', 'Origem', p.origem, 'Afiliado', p.ref,
    'TrackingNumber', p.rastreio, 'TrackingURL', case when p.rastreio is not null then 'https://track.americanutrition.com/' || p.rastreio end,
    'Carrier', p.transportadora,
    'ReviewURL', case when p.avaliacao_token is not null then 'https://www.americanutrition.com/account?avaliar=' || p.avaliacao_token end,
    'AccountURL', 'https://www.americanutrition.com/account')));
$$;

create or replace function loja_pedidos_eventos() returns trigger language plpgsql as $$
declare d jsonb; i jsonb; k int := 0; mudou_pag boolean; mudou_ent boolean;
begin
  if new.origem = 'shopify' then return new; end if;            -- histórico importado: a Shopify já mandou
  mudou_pag := tg_op = 'INSERT' or old.status_pagamento is distinct from new.status_pagamento;
  mudou_ent := tg_op = 'INSERT' or old.status_entrega is distinct from new.status_entrega;
  if not (mudou_pag or mudou_ent) then return new; end if;
  d := loja_klaviyo_pedido(new);
  if mudou_pag and new.status_pagamento = 'pago' then
    perform loja_evento('klaviyo', 'Placed Order', 'placed:' || new.id, d);
    for i in select * from jsonb_array_elements(d#>'{props,Items}') loop
      k := k + 1;
      perform loja_evento('klaviyo', 'Ordered Product', 'ordered:' || new.id || ':' || k,
        jsonb_build_object('perfil', d->'perfil', 'valor', i->'RowTotal', 'props', i || jsonb_build_object('OrderId', 'AN-' || new.numero, '$value', i->'RowTotal')));
    end loop;
    perform loja_evento('aviso', 'Pedido pago', 'pago:' || new.id, jsonb_build_object('texto',
      '🛒 AN-' || new.numero || ' pago · R$ ' || translate(to_char(new.total, 'FM999,999,990.00'), ',.', '.,') || ' · ' || coalesce(new.cliente->>'nome', '') ||
      coalesce(' (' || nullif(new.endereco->>'uf', '') || ')', '') || E'\n' ||
      (select string_agg((i2->>'qtd') || '× ' || (i2->>'titulo') || coalesce(' · ' || nullif(i2->>'variante', 'Default Title'), ''), E'\n') from jsonb_array_elements(new.itens) i2) ||
      coalesce(E'\nCupom ' || new.cupom, '') || coalesce(E'\nAfiliado ' || new.ref, '')));
  end if;
  if mudou_pag and new.status_pagamento = 'cancelado' and tg_op = 'UPDATE' then perform loja_evento('klaviyo', 'Cancelled Order', 'cancelled:' || new.id, d); end if;
  if mudou_pag and new.status_pagamento = 'reembolsado' and tg_op = 'UPDATE' then perform loja_evento('klaviyo', 'Refunded Order', 'refunded:' || new.id, d); end if;
  if mudou_ent and new.status_entrega = 'enviado' then perform loja_evento('klaviyo', 'Fulfilled Order', 'fulfilled:' || new.id, d); end if;
  if mudou_ent and new.status_entrega = 'entregue' then perform loja_evento('klaviyo', 'Delivered Order', 'delivered:' || new.id, d); end if;
  return new;
end $$;
drop trigger if exists loja_pedidos_eventos on loja_pedidos;
create trigger loja_pedidos_eventos after insert or update of status_pagamento, status_entrega on loja_pedidos for each row execute function loja_pedidos_eventos();

-- link de avaliação: cada pedido ganha um token (usado no e-mail de entrega e na Minha conta)
create or replace function loja_pedidos_token() returns trigger language plpgsql as $$
begin
  if new.avaliacao_token is null then new.avaliacao_token := encode(extensions.gen_random_bytes(12), 'hex'); end if;
  return new;
end $$;
drop trigger if exists loja_pedidos_token on loja_pedidos;
create trigger loja_pedidos_token before insert or update on loja_pedidos for each row execute function loja_pedidos_token();

-- ---------------------------------------------------------------------
-- 4c) Minha conta (clientes): entra com e-mail ou celular + código de 6 dígitos
--     (código por e-mail via evento Klaviyo "Codigo de Acesso" e por WhatsApp quando houver celular).
--     Webhook público n8n "Loja · Público": POST /webhook/loja-publico → select loja_publico(body, ip)
-- ---------------------------------------------------------------------
create table if not exists loja_clientes_codigos (
  id bigserial primary key, criado_em timestamptz not null default now(),
  login text not null,                                  -- e-mail (minúsculo) ou celular (só dígitos)
  codigo_hash text not null, expira_em timestamptz not null, tentativas int not null default 0, usado boolean not null default false, ip text
);
create index if not exists loja_clientes_codigos_login on loja_clientes_codigos (login, criado_em desc);
create table if not exists loja_clientes_sessoes (
  token text primary key, login text not null, criado_em timestamptz not null default now(), expira_em timestamptz not null, ultimo_uso timestamptz
);

-- pedidos de um login (e-mail ou celular)
create or replace function loja_conta_pedidos(p_login text) returns setof loja_pedidos language sql stable as $$
  select * from loja_pedidos
   where (lower(cliente->>'email') = p_login
        or (p_login ~ '^\d{10,13}$' and right(regexp_replace(coalesce(cliente->>'telefone', ''), '\D', '', 'g'), 11) = right(p_login, 11)))
   order by criado_em desc limit 100;
$$;

create or replace function loja_publico(body jsonb, p_ip text default null) returns jsonb language plpgsql as $$
declare
  op text := body->>'op'; p jsonb := coalesce(body->'payload', body); vlogin text; cod text; c loja_clientes_codigos; s loja_clientes_sessoes;
  ult loja_pedidos; tok text; res jsonb;
begin
  if op = 'conta_codigo' then
    vlogin := lower(trim(coalesce(p->>'login', '')));
    if vlogin !~ '@' then vlogin := regexp_replace(vlogin, '\D', '', 'g'); if length(vlogin) in (10, 11) then vlogin := '55' || vlogin; end if; end if;
    if vlogin = '' or (vlogin !~ '@' and length(vlogin) < 12) then return jsonb_build_object('ok', false, 'erro', 'login_invalido'); end if;
    if (select count(*) from loja_clientes_codigos where loja_clientes_codigos.login = vlogin and criado_em > now() - interval '1 hour') >= 5
       or (p_ip is not null and (select count(*) from loja_clientes_codigos where ip = p_ip and criado_em > now() - interval '1 hour') >= 20) then
      return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
    end if;
    select * into ult from loja_conta_pedidos(vlogin) limit 1;
    -- mesma resposta com ou sem pedidos (não revela quem é cliente); só envia código para quem tem pedido
    if ult.id is not null then
      cod := lpad((floor(random() * 1000000))::int::text, 6, '0');
      insert into loja_clientes_codigos (login, codigo_hash, expira_em, ip) values (vlogin, extensions.crypt(cod, extensions.gen_salt('bf', 6)), now() + interval '15 minutes', p_ip) returning * into c;
      if vlogin ~ '@' then
        perform loja_evento('klaviyo', 'Codigo de Acesso', 'codigo:' || c.id, jsonb_build_object('perfil', jsonb_build_object('email', vlogin), 'props', jsonb_build_object('codigo', cod, 'validade_minutos', 15, 'nome', split_part(coalesce(ult.cliente->>'nome', ''), ' ', 1))));
      end if;
      if vlogin !~ '@' or length(regexp_replace(coalesce(ult.cliente->>'telefone', ''), '\D', '', 'g')) >= 10 then
        perform loja_evento('whatsapp', 'Codigo de Acesso', 'codigo-wpp:' || c.id, jsonb_build_object(
          'numero', case when vlogin ~ '@' then (case when length(regexp_replace(ult.cliente->>'telefone', '\D', '', 'g')) in (10, 11) then '55' else '' end) || regexp_replace(ult.cliente->>'telefone', '\D', '', 'g') else vlogin end,
          'texto', 'Seu código de acesso à sua conta America Nutrition: *' || cod || '*' || E'\n\nVale por 15 minutos. Se não foi você, ignore esta mensagem.'));
      end if;
    end if;
    return jsonb_build_object('ok', true, 'via', case when vlogin ~ '@' then 'email' else 'whatsapp' end);
  end if;

  if op = 'conta_entrar' then
    vlogin := lower(trim(coalesce(p->>'login', '')));
    if vlogin !~ '@' then vlogin := regexp_replace(vlogin, '\D', '', 'g'); if length(vlogin) in (10, 11) then vlogin := '55' || vlogin; end if; end if;
    select * into c from loja_clientes_codigos where loja_clientes_codigos.login = vlogin and not usado and expira_em > now() order by id desc limit 1;
    if not found then perform pg_sleep(0.3); return jsonb_build_object('ok', false, 'erro', 'codigo_invalido'); end if;
    if c.tentativas >= 5 then return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas'); end if;
    if c.codigo_hash <> extensions.crypt(regexp_replace(coalesce(p->>'codigo', ''), '\D', '', 'g'), c.codigo_hash) then
      update loja_clientes_codigos set tentativas = tentativas + 1 where id = c.id; perform pg_sleep(0.3);
      return jsonb_build_object('ok', false, 'erro', 'codigo_invalido');
    end if;
    update loja_clientes_codigos set usado = true where id = c.id;
    tok := encode(extensions.gen_random_bytes(24), 'hex');
    insert into loja_clientes_sessoes (token, login, expira_em) values (tok, vlogin, now() + interval '90 days');
    return jsonb_build_object('ok', true, 'token', tok);
  end if;

  -- daqui em diante: sessão do cliente
  if op in ('conta', 'conta_sair') then
    select * into s from loja_clientes_sessoes where token = p->>'token' and expira_em > now();
    if not found then return jsonb_build_object('ok', false, 'erro', 'sessao_invalida'); end if;
    if op = 'conta_sair' then delete from loja_clientes_sessoes where token = s.token; return jsonb_build_object('ok', true); end if;
    update loja_clientes_sessoes set ultimo_uso = now() where token = s.token;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'numero', x.numero, 'nome', 'AN-' || x.numero, 'criado_em', x.criado_em, 'total', x.total, 'subtotal', x.subtotal, 'desconto', x.desconto, 'frete', x.frete,
        'status_pagamento', x.status_pagamento, 'status_entrega', x.status_entrega, 'rastreio', x.rastreio, 'transportadora', x.transportadora, 'endereco', x.endereco,
        'pagamento', x.pagamento->>'metodo', 'avaliar', case when x.status_entrega in ('enviado', 'entregue') then x.avaliacao_token end,
        'itens', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('variante_id', i->>'variante_id', 'titulo', i->>'titulo', 'variante', nullif(i->>'variante', 'Default Title'), 'qtd', (i->>'qtd')::int,
                    'preco', (i->>'preco')::numeric, 'imagem', i->>'imagem', 'handle', (select handle from loja_produtos where id = i->>'produto_id')))) from jsonb_array_elements(x.itens) i)))
        order by x.criado_em desc), '[]')
      into res from loja_conta_pedidos(s.login) x;
    select * into ult from loja_conta_pedidos(s.login) limit 1;
    return jsonb_build_object('ok', true, 'cliente', jsonb_build_object('nome', ult.cliente->>'nome', 'email', ult.cliente->>'email', 'telefone', ult.cliente->>'telefone', 'login', s.login), 'pedidos', res);
  end if;

  -- link de avaliação vindo do e-mail/WhatsApp (sem vlogin): devolve os produtos do pedido para avaliar
  if op = 'avaliar_pedido' then
    select * into ult from loja_pedidos where avaliacao_token = p->>'t';
    if not found then return jsonb_build_object('ok', false, 'erro', 'link_invalido'); end if;
    return jsonb_build_object('ok', true, 'nome', split_part(coalesce(ult.cliente->>'nome', ''), ' ', 1), 'email', ult.cliente->>'email', 'numero', ult.numero,
      'itens', (select jsonb_agg(distinct jsonb_build_object('titulo', i->>'titulo', 'handle', (select handle from loja_produtos where id = i->>'produto_id'), 'imagem', i->>'imagem')) from jsonb_array_elements(ult.itens) i));
  end if;

  return jsonb_build_object('ok', false, 'erro', 'op_desconhecida');
end $$;

-- ---------------------------------------------------------------------
-- 4d) Painel: papéis de usuário e registro de atividade
--     dono (tudo) · gerente (tudo menos usuários) · expedicao (pedidos e estoque, sem valores) · conteudo (catálogo e site)
-- ---------------------------------------------------------------------
create table if not exists loja_papeis (usuario_id uuid primary key references fin_usuarios (id) on delete cascade, papel text not null check (papel in ('dono', 'gerente', 'expedicao', 'conteudo', 'sem_acesso')), atualizado_em timestamptz default now());
insert into checkout_config (chave, valor) values ('loja_papel_padrao', 'dono') on conflict (chave) do nothing;
create table if not exists loja_atividade (
  id bigserial primary key, em timestamptz not null default now(), usuario text, op text not null, resumo text, dados jsonb
);
create index if not exists loja_atividade_em on loja_atividade (em desc);

create or replace function loja_papel_pode(p_papel text, p_op text, p jsonb) returns boolean language sql immutable as $$
  select case p_papel
    when 'dono' then true
    when 'gerente' then p_op not in ('usuarios_gravar')
    when 'expedicao' then p_op in ('load', 'logout', 'pedidos', 'pedido', 'pedido_atualizar', 'estoque', 'estoque_ajustar', 'estoque_transferir', 'estoque_mov', 'atividade_minha')
    when 'conteudo' then p_op in ('load', 'logout', 'publicar', 'publicacoes', 'set', 'estoque', 'estoque_mov')
                      or (p_op in ('upsert', 'remove') and p->>'table' in ('produtos', 'colecoes', 'paginas', 'blogs', 'artigos', 'depoimentos'))
    else false end;
$$;

-- ---------------------------------------------------------------------
-- 5) API do painel (login = usuários do Financeiro)
-- ---------------------------------------------------------------------
create or replace function loja_api(body jsonb) returns jsonb language plpgsql as $$
declare
  op text := body->>'op'; tok text := body->>'token'; p jsonb := coalesce(body->'payload', '{}'::jsonb);
  s fin_sessoes; u fin_usuarios; r jsonb; tab text; q text; ped loja_pedidos; res jsonb; papel text; quem text;
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
  quem := coalesce(u.nome, u.email);
  papel := coalesce((select lp.papel from loja_papeis lp where lp.usuario_id = u.id), nullif((select valor from checkout_config where chave = 'loja_papel_padrao'), ''), 'dono');
  if not loja_papel_pode(papel, op, p) then return jsonb_build_object('ok', false, 'erro', case when papel = 'sem_acesso' then 'sem_acesso' else 'sem_permissao' end); end if;
  -- registro de atividade (o que muda alguma coisa)
  if op in ('upsert', 'remove', 'set', 'pedido_atualizar', 'pedido_criar', 'estoque_ajustar', 'estoque_transferir', 'locais_gravar', 'publicar', 'usuarios_gravar') then
    insert into loja_atividade (usuario, op, resumo, dados) values (quem, op, case op
      when 'upsert' then 'Salvou ' || (p->>'table') || ': ' || coalesce((select string_agg(coalesce(x->>'titulo', x->>'codigo', x->>'handle', x->>'id'), ', ') from jsonb_array_elements(p->'rows') x), '')
      when 'remove' then 'Excluiu ' || (p->>'table') || ': ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(p->'ids') x), '')
      when 'set' then 'Alterou ' || (p->>'chave')
      when 'pedido_atualizar' then 'Pedido AN-' || coalesce((select numero::text from loja_pedidos where id = (p->>'id')::uuid), '?') || ': ' || concat_ws(', ', 'entrega ' || (p->>'status_entrega'), 'pagamento ' || (p->>'status_pagamento'), 'rastreio ' || nullif(p->>'rastreio', ''))
      when 'pedido_criar' then 'Criou pedido manual'
      when 'estoque_ajustar' then 'Ajustou estoque de ' || jsonb_array_length(coalesce(p->'itens', '[]')) || ' item(ns)'
      when 'estoque_transferir' then 'Transferiu estoque: ' || (p->>'de') || ' → ' || (p->>'para')
      when 'locais_gravar' then 'Alterou locais de estoque'
      when 'publicar' then 'Publicou a loja'
      when 'usuarios_gravar' then 'Mudou papel de usuário'
      else op end, case when op in ('pedido_atualizar', 'estoque_ajustar', 'estoque_transferir', 'usuarios_gravar') then p end);
  end if;

  if op = 'logout' then delete from fin_sessoes where token = tok; return jsonb_build_object('ok', true); end if;

  if op = 'load' then
    res := loja_publicado();
    res := jsonb_set(res, '{cupons}', coalesce((select jsonb_agg(dados || jsonb_build_object('id', id, 'codigo', codigo, 'usos', usos)) from loja_cupons), '[]'));
    res := res || jsonb_build_object('locais', (select coalesce(jsonb_agg(to_jsonb(l) order by l.ordem, l.nome), '[]') from loja_locais l),
                                     'estoque', (select coalesce(jsonb_agg(jsonb_build_object('variante_id', variante_id, 'local_id', local_id, 'em_maos', em_maos, 'comprometido', comprometido)), '[]') from loja_estoque));
    if papel = 'expedicao' then res := res - 'cupons'; end if;
    return jsonb_build_object('ok', true, 'data', res, 'user', jsonb_build_object('id', u.id, 'email', u.email, 'nome', u.nome, 'papel', papel));
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
    select coalesce(jsonb_agg(to_jsonb(x) - 'eventos' order by x.criado_em desc), '[]') into res from (
      select * from loja_pedidos
       where (nullif(p->>'pagamento', '') is null or status_pagamento = p->>'pagamento')
         and (nullif(p->>'desde', '') is null or criado_em >= (p->>'desde')::timestamptz)
         and (nullif(p->>'entrega', '') is null or status_entrega = p->>'entrega')
         and (q is null or numero::text = regexp_replace(q, '\D', '', 'g') or rastreio ilike q || '%' or cliente->>'nome' ilike '%' || q || '%' or cliente->>'email' ilike '%' || q || '%'
              or regexp_replace(coalesce(cliente->>'cpf', ''), '\D', '', 'g') = regexp_replace(q, '\D', '', 'g') or regexp_replace(coalesce(cliente->>'telefone', ''), '\D', '', 'g') like '%' || nullif(regexp_replace(q, '\D', '', 'g'), '') || '%')
       order by criado_em desc limit least(coalesce((p->>'limite')::int, 100), 2000)) x;
    if papel = 'expedicao' then
      select coalesce(jsonb_agg(x - 'total' - 'subtotal' - 'desconto' - 'frete' - 'pagamento' - 'cupom' - 'ref' - 'atribuicao' || jsonb_build_object('itens', (select jsonb_agg(i - 'preco') from jsonb_array_elements(x->'itens') i))), '[]') into res from jsonb_array_elements(res) x;
    end if;
    return jsonb_build_object('ok', true, 'pedidos', res);
  end if;

  if op = 'pedido' then
    select * into ped from loja_pedidos where id = (p->>'id')::uuid;
    if not found then return jsonb_build_object('ok', false, 'erro', 'pedido_nao_encontrado'); end if;
    if papel = 'expedicao' then
      return jsonb_build_object('ok', true, 'pedido', to_jsonb(ped) - 'total' - 'subtotal' - 'desconto' - 'frete' - 'pagamento' - 'cupom' - 'ref' - 'atribuicao' || jsonb_build_object('itens', (select jsonb_agg(i - 'preco') from jsonb_array_elements(ped.itens) i)));
    end if;
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
    res := loja_pedido_estoque(ped.id, coalesce(u.nome, u.email));
    select * into ped from loja_pedidos where id = ped.id;
    return jsonb_build_object('ok', true, 'pedido', to_jsonb(ped), 'mudou', res);
  end if;

  if op = 'pedido_criar' then
    -- pedido manual pelo painel (mesma função do checkout)
    res := loja_pedido_criar(p || jsonb_build_object('origem', coalesce(p->>'origem', 'manual')));
    if (res->>'ok')::boolean then
      update loja_pedidos set eventos = eventos || jsonb_build_object('em', now(), 'texto', 'Criado no painel', 'por', coalesce(u.nome, u.email)),
             status_entrega = coalesce(p->>'status_entrega', status_entrega), notas = coalesce(p->>'note', notas)
       where id = (res->>'id')::uuid;
      perform loja_pedido_estoque((res->>'id')::uuid, coalesce(u.nome, u.email));
    end if;
    return res;
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

  -- estoque ----------------------------------------------------------
  if op in ('estoque', 'estoque_ajustar', 'estoque_transferir', 'locais_gravar') then
    res := '[]';
    if op = 'estoque_ajustar' then
      -- itens: [{variante_id, local_id, em_maos (novo total) | delta, motivo, nota}]
      for r in select * from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
        perform loja_estoque_mover(r->>'variante_id', r->>'local_id',
          case when r ? 'em_maos' and r->>'em_maos' is not null then (r->>'em_maos')::int - coalesce((select em_maos from loja_estoque where variante_id = r->>'variante_id' and local_id = r->>'local_id'), 0) else coalesce((r->>'delta')::int, 0) end,
          0, coalesce(nullif(r->>'motivo', ''), 'correcao'), nullif(r->>'nota', ''), null, null, coalesce(u.nome, u.email));
      end loop;
      res := loja_estoque_sincronizar(array(select jsonb_array_elements(p->'itens')->>'variante_id'));
    elsif op = 'estoque_transferir' then
      for r in select * from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
        perform loja_estoque_mover(r->>'variante_id', p->>'de', -(r->>'qtd')::int, 0, 'transferencia', 'Para ' || (select nome from loja_locais where id = p->>'para') || coalesce(' · ' || nullif(p->>'nota', ''), ''), null, null, coalesce(u.nome, u.email));
        perform loja_estoque_mover(r->>'variante_id', p->>'para', (r->>'qtd')::int, 0, 'transferencia', 'De ' || (select nome from loja_locais where id = p->>'de') || coalesce(' · ' || nullif(p->>'nota', ''), ''), null, null, coalesce(u.nome, u.email));
      end loop;
      res := loja_estoque_sincronizar(array(select jsonb_array_elements(p->'itens')->>'variante_id'));
    elsif op = 'locais_gravar' then
      for r in select * from jsonb_array_elements(coalesce(p->'locais', '[]')) loop
        insert into loja_locais (id, nome, ativo, online, ordem, endereco) values (r->>'id', r->>'nome', coalesce((r->>'ativo')::boolean, true), coalesce((r->>'online')::boolean, false), coalesce((r->>'ordem')::int, 0), r->'endereco')
        on conflict (id) do update set nome = excluded.nome, ativo = excluded.ativo, online = excluded.online, ordem = excluded.ordem, endereco = excluded.endereco, atualizado_em = now();
      end loop;
      res := loja_estoque_sincronizar(null);
    end if;
    return jsonb_build_object('ok', true, 'mudou', res,
      'locais', (select coalesce(jsonb_agg(to_jsonb(l) order by l.ordem, l.nome), '[]') from loja_locais l),
      'niveis', (select coalesce(jsonb_agg(jsonb_build_object('variante_id', variante_id, 'local_id', local_id, 'em_maos', em_maos, 'comprometido', comprometido)), '[]') from loja_estoque),
      'variantes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'estoque', estoque, 'disponivel', disponivel)), '[]') from loja_variantes),
      'vendas_30d', loja_vendas_variantes(30));
  end if;

  if op = 'estoque_mov' then
    return jsonb_build_object('ok', true, 'itens', (select coalesce(jsonb_agg(to_jsonb(m) order by m.criado_em desc, m.id desc), '[]') from (
      select * from loja_estoque_mov
       where (nullif(p->>'variante_id', '') is null or variante_id = p->>'variante_id') and (nullif(p->>'local_id', '') is null or local_id = p->>'local_id')
       order by criado_em desc, id desc limit least(coalesce((p->>'limite')::int, 200), 1000)) m));
  end if;

  -- relatórios: pedidos do período em formato enxuto (o painel agrega por produto, afiliado, cupom, origem)
  if op = 'relatorio' then
    return jsonb_build_object('ok', true, 'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'criado_em', criado_em, 'origem', origem, 'total', total, 'subtotal', subtotal,
        'desconto', desconto, 'frete', frete, 'cupom', cupom, 'ref', ref, 'status_pagamento', status_pagamento, 'status_entrega', status_entrega, 'uf', endereco->>'uf',
        'utm', atribuicao->>'utm_source', 'cliente', lower(coalesce(nullif(cliente->>'email', ''), cliente->>'cpf', id::text)),
        'itens', (select jsonb_agg(jsonb_build_object('variante_id', i->>'variante_id', 'produto_id', i->>'produto_id', 'titulo', i->>'titulo', 'variante', i->>'variante', 'qtd', (i->>'qtd')::int, 'preco', (i->>'preco')::numeric)) from jsonb_array_elements(itens) i))
        order by criado_em), '[]')
      from loja_pedidos where criado_em >= coalesce(nullif(p->>'desde', '')::timestamptz, now() - interval '30 days') and criado_em < coalesce(nullif(p->>'ate', '')::timestamptz, now() + interval '1 day')));
  end if;

  if op = 'usuarios' then
    return jsonb_build_object('ok', true, 'eu', u.id, 'papel_padrao', coalesce(nullif((select valor from checkout_config where chave = 'loja_papel_padrao'), ''), 'dono'),
      'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('id', fu.id, 'nome', fu.nome, 'email', fu.email, 'ativo', fu.ativo, 'papel', lp.papel,
        'ultimo_acesso', (select max(ultimo_uso) from fin_sessoes fs where fs.usuario_id = fu.id)) order by fu.nome), '[]') from fin_usuarios fu left join loja_papeis lp on lp.usuario_id = fu.id));
  end if;
  if op = 'usuarios_gravar' then
    if (p->>'usuario_id')::uuid = u.id and p->>'papel' <> 'dono' then return jsonb_build_object('ok', false, 'erro', 'nao_pode_rebaixar_a_si_mesmo'); end if;
    if nullif(p->>'papel', '') is null then delete from loja_papeis where usuario_id = (p->>'usuario_id')::uuid;
    else insert into loja_papeis (usuario_id, papel) values ((p->>'usuario_id')::uuid, p->>'papel') on conflict (usuario_id) do update set papel = excluded.papel, atualizado_em = now(); end if;
    return jsonb_build_object('ok', true);
  end if;
  if op = 'atividade' then
    return jsonb_build_object('ok', true, 'itens', (select coalesce(jsonb_agg(to_jsonb(a) order by a.em desc), '[]') from (
      select * from loja_atividade where (nullif(p->>'usuario', '') is null or usuario = p->>'usuario') order by em desc limit least(coalesce((p->>'limite')::int, 200), 1000)) a));
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
