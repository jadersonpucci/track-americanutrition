-- =====================================================================
--  Financeiro · America Nutrition — schema para Supabase (self-hosted)
--  Rode no SQL Editor. Idempotente (pode rodar de novo).
--  Modelo espelha o que o app usa em memória: uma linha por registro,
--  listas (baixas, rateios, tags, anexos) em jsonb.
-- =====================================================================
create extension if not exists pgcrypto;

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
