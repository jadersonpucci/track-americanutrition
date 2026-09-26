-- =====================================================================
--  Financeiro · America Nutrition — schema para Supabase (self-hosted)
--  Rode no SQL Editor. Idempotente (pode rodar de novo).
--  Modelo espelha o que o app usa em memória: uma linha por registro,
--  listas (baixas, rateios, tags, anexos) em jsonb.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  cor text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  banco text not null default 'outro',          -- slug em js/bancos.js (inter, btg, stone, pagarme…)
  tipo text not null default 'corrente',        -- corrente | poupanca | investimento | gateway | cartao | caixa
  agencia text, numero text,
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date,
  dia_fechamento int, dia_vencimento int,       -- cartão de crédito
  cor text,
  arquivada boolean not null default false,
  ordem int default 0,
  nibo_id text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('in','out')),
  grupo int not null default 3,                 -- 1 receitas, 2 custos, 3 despesas, 4 investimentos, 5 financiamentos/sócios
  subgrupo text,
  codigo text,
  icone text,
  cor text,
  arquivada boolean not null default false,
  ordem int default 0,
  nibo_id text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists centros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cor text,
  arquivado boolean not null default false,
  nibo_id text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'fornecedor',      -- cliente | fornecedor | ambos | socio | funcionario
  documento text, email text, telefone text, pix text, cidade text, uf text,
  segmento text, observacoes text,
  arquivado boolean not null default false,
  nibo_id text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cor text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);

create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('pagar','receber','transferencia')),
  descricao text not null,
  valor numeric(14,2) not null,
  vencimento date not null,
  competencia date,
  categoria_id uuid references categorias(id),
  contato_id uuid references contatos(id),
  conta_id uuid references contas(id),
  conta_destino_id uuid references contas(id),  -- só transferência
  forma_pagamento text default 'pix',
  status text default 'aberto',                 -- aberto | pago (derivado das baixas) | cancelado
  baixas jsonb not null default '[]'::jsonb,    -- [{id, data, valor, conta_id, juros, multa, desconto, observacao}]
  rateio_categorias jsonb not null default '[]'::jsonb,  -- [{categoria_id, valor, descricao}]
  rateio_centros jsonb not null default '[]'::jsonb,     -- [{centro_id, percent}]
  tags jsonb not null default '[]'::jsonb,      -- ["Recorrente","USA"]
  anexos jsonb not null default '[]'::jsonb,    -- [{nome, url, tipo, tamanho}]
  referencia text, observacoes text,
  parcela_num int, parcela_total int, grupo_parcelas_id uuid,
  recorrencia jsonb, recorrencia_id uuid,
  conciliado_fitid text,
  origem text default 'manual',                 -- manual | pagarme | shopify | nibo | importacao | extrato
  origem_ref text,                              -- id externo (charge do Pagar.me, pedido Shopify…) — evita duplicar
  exemplo boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);
create index if not exists lancamentos_emp_venc on lancamentos (empresa_id, vencimento);
create index if not exists lancamentos_emp_tipo on lancamentos (empresa_id, tipo);
create unique index if not exists lancamentos_origem_ref on lancamentos (empresa_id, origem, origem_ref) where origem_ref is not null;

create table if not exists extrato_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas(id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null,
  descricao text,
  fitid text,                                   -- id da transação no OFX (evita reimportar)
  lancamento_id uuid references lancamentos(id) on delete set null,
  ignorado boolean not null default false,
  importado_em timestamptz default now(),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);
create unique index if not exists extrato_fitid on extrato_itens (conta_id, fitid) where fitid is not null;

-- atualizado_em automático
create or replace function set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['empresas','contas','categorias','centros','contatos','tags','lancamentos','extrato_itens'] loop
    execute format('drop trigger if exists trg_atualizado on %I', t);
    execute format('create trigger trg_atualizado before update on %I for each row execute function set_atualizado_em()', t);
  end loop; end $$;

-- ---------------------------------------------------------------------
--  Segurança: qualquer usuário autenticado (Authentication → Users) lê e
--  escreve tudo. A service_role (usada só no n8n) ignora RLS.
--  Se quiser restringir por empresa/usuário, troque as policies por
--  checagens em uma tabela usuarios_empresas.
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['empresas','contas','categorias','centros','contatos','tags','lancamentos','extrato_itens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "autenticados" on %I', t);
    execute format('create policy "autenticados" on %I for all to authenticated using (true) with check (true)', t);
  end loop; end $$;

-- ---------------------------------------------------------------------
--  Views úteis pra n8n / relatórios externos
-- ---------------------------------------------------------------------
create or replace view v_lancamentos as
select l.*, c.nome as categoria, k.nome as contato, a.nome as conta,
  coalesce((select sum((b->>'valor')::numeric - coalesce((b->>'juros')::numeric,0) - coalesce((b->>'multa')::numeric,0) + coalesce((b->>'desconto')::numeric,0)) from jsonb_array_elements(l.baixas) b), 0) as liquidado
from lancamentos l
left join categorias c on c.id = l.categoria_id
left join contatos k on k.id = l.contato_id
left join contas a on a.id = l.conta_id
where l.deletado_em is null;

create or replace view v_saldos as
select a.id as conta_id, a.empresa_id, a.nome, a.banco,
  a.saldo_inicial
  + coalesce((select sum(case when l.tipo='receber' then (b->>'valor')::numeric else -(b->>'valor')::numeric end)
       from lancamentos l, jsonb_array_elements(l.baixas) b
       where l.deletado_em is null and l.status <> 'cancelado' and l.tipo in ('pagar','receber') and (b->>'conta_id')::uuid = a.id
         and (a.data_saldo_inicial is null or (b->>'data')::date >= a.data_saldo_inicial)), 0)
  + coalesce((select sum(case when l.conta_destino_id = a.id then l.valor else -l.valor end)
       from lancamentos l where l.deletado_em is null and l.tipo='transferencia' and (l.conta_id = a.id or l.conta_destino_id = a.id)
         and (a.data_saldo_inicial is null or l.vencimento >= a.data_saldo_inicial)), 0) as saldo
from contas a where a.deletado_em is null;

-- =====================================================================
--  API pelo n8n (webhook financeiro-api → fin_api). Autenticação própria:
--  usuários e sessões em tabelas, senha com bcrypt (pgcrypto). O navegador
--  nunca vê chave do Supabase; fala só com o webhook do n8n.
-- =====================================================================
create table if not exists fin_usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text,
  senha_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);
create table if not exists fin_sessoes (
  token text primary key,
  usuario_id uuid not null references fin_usuarios(id) on delete cascade,
  criado_em timestamptz default now(),
  ultimo_uso timestamptz default now(),
  expira_em timestamptz not null,
  origem text
);
create index if not exists fin_sessoes_usuario on fin_sessoes (usuario_id);

create or replace function fin_criar_usuario(p_email text, p_nome text, p_senha text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into fin_usuarios (email, nome, senha_hash) values (lower(trim(p_email)), p_nome, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)))
  on conflict (email) do update set nome = excluded.nome, senha_hash = excluded.senha_hash, ativo = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function fin_login(p_email text, p_senha text, p_origem text default null) returns jsonb language plpgsql as $$
declare u fin_usuarios; tok text;
begin
  select * into u from fin_usuarios where email = lower(trim(coalesce(p_email,''))) and ativo;
  if not found or u.senha_hash <> extensions.crypt(coalesce(p_senha,''), u.senha_hash) then
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'erro', 'E-mail ou senha incorretos');
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into fin_sessoes (token, usuario_id, expira_em, origem) values (tok, u.id, now() + interval '30 days', p_origem);
  return jsonb_build_object('ok', true, 'token', tok, 'user', jsonb_build_object('id', u.id, 'email', u.email, 'nome', u.nome));
end $$;

create or replace function fin_api(body jsonb) returns jsonb language plpgsql as $$
declare
  op text := body->>'op'; tok text := body->>'token'; p jsonb := coalesce(body->'payload', '{}'::jsonb);
  s fin_sessoes; u fin_usuarios; tabela text; setlist text; rows jsonb; ids uuid[]; n int; t text;
  permitidas text[] := array['empresas','contas','categorias','centros','contatos','tags','lancamentos','extrato_itens'];
  res jsonb := '{}'::jsonb;
begin
  if op = 'login' then return fin_login(p->>'email', p->>'senha', p->>'origem'); end if;
  if op = 'ping' then return jsonb_build_object('ok', true, 'agora', now()); end if;
  if op = 'primeiro_usuario' then
    if exists (select 1 from fin_usuarios) then return jsonb_build_object('ok', false, 'erro', 'ja_existe_usuario'); end if;
    if length(coalesce(p->>'senha','')) < 8 then return jsonb_build_object('ok', false, 'erro', 'senha_curta'); end if;
    perform fin_criar_usuario(p->>'email', p->>'nome', p->>'senha');
    return fin_login(p->>'email', p->>'senha', 'bootstrap');
  end if;
  select * into s from fin_sessoes where token = tok and expira_em > now();
  if not found then return jsonb_build_object('ok', false, 'erro', 'sessao_invalida'); end if;
  select * into u from fin_usuarios where id = s.usuario_id and ativo;
  if not found then return jsonb_build_object('ok', false, 'erro', 'usuario_inativo'); end if;
  update fin_sessoes set ultimo_uso = now(), expira_em = now() + interval '30 days' where token = tok;

  if op = 'logout' then delete from fin_sessoes where token = tok; return jsonb_build_object('ok', true); end if;
  if op = 'me' then return jsonb_build_object('ok', true, 'user', jsonb_build_object('id', u.id, 'email', u.email, 'nome', u.nome)); end if;

  if op = 'load' then
    foreach t in array permitidas loop
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x where x.deletado_em is null', t) into rows;
      res := res || jsonb_build_object(t, rows);
    end loop;
    return jsonb_build_object('ok', true, 'data', res, 'user', jsonb_build_object('id', u.id, 'email', u.email, 'nome', u.nome));
  end if;

  if op = 'upsert' then
    tabela := p->>'table'; rows := p->'rows';
    if not (tabela = any(permitidas)) then return jsonb_build_object('ok', false, 'erro', 'tabela_nao_permitida'); end if;
    if rows is null or jsonb_typeof(rows) <> 'array' then return jsonb_build_object('ok', false, 'erro', 'rows_invalido'); end if;
    -- strings vazias viram null (campos de data/uuid não aceitam '')
    rows := regexp_replace(rows::text, ':\s*""', ':null', 'g')::jsonb;
    select string_agg(format('%I = excluded.%I', column_name, column_name), ', ') into setlist
      from information_schema.columns where table_schema = 'public' and table_name = tabela and column_name not in ('id', 'criado_em');
    execute format('insert into %I select * from jsonb_populate_recordset(null::%I, %L::jsonb) on conflict (id) do update set %s', tabela, tabela, rows::text, setlist);
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'n', n);
  end if;

  if op = 'remove' then
    tabela := p->>'table';
    if not (tabela = any(permitidas)) then return jsonb_build_object('ok', false, 'erro', 'tabela_nao_permitida'); end if;
    select array_agg(x::uuid) into ids from jsonb_array_elements_text(p->'ids') x;
    execute format('delete from %I where id = any(%L::uuid[])', tabela, ids);
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'n', n);
  end if;

  if op = 'wipe_empresa' then
    foreach t in array permitidas loop
      if t <> 'empresas' then execute format('delete from %I where empresa_id = %L::uuid', t, p->>'empresa_id'); end if;
    end loop;
    delete from empresas where id = (p->>'empresa_id')::uuid;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'erro', 'op_desconhecida');
end $$;
