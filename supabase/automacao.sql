-- =====================================================================
--  Automação do Financeiro: regras de classificação, recorrências
--  previstas a partir do histórico e anexos no banco.
--  Idempotente. Roda pelo workflow "Financeiro · Setup (schema)" depois
--  de schema.sql. Também redefine fin_api (ops de anexo e tabela regras).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Regras de classificação
--    Uma regra casa por contato e/ou por padrão (regex, sem diferenciar
--    maiúsculas) na descrição, e define categoria e, opcionalmente, o
--    rateio de centros de custo. Aplicada por trigger em todo lançamento
--    novo que chegue sem categoria (ou em "A classificar"): Inter, extrato,
--    importações. O app também pode criar regras à mão.
-- ---------------------------------------------------------------------
create table if not exists regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text,
  tipo text check (tipo in ('pagar', 'receber')),   -- null = vale pros dois
  contato_id uuid references contatos(id) on delete cascade,
  padrao text,                                       -- regex na descrição (case-insensitive)
  categoria_id uuid references categorias(id),
  rateio_centros jsonb,                              -- [{centro_id, percent}] opcional
  prioridade int not null default 100,               -- menor = avaliada antes
  ativa boolean not null default true,
  origem text not null default 'manual',             -- manual | aprendida
  acertos int not null default 0,
  ultimo_acerto timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  deletado_em timestamptz
);
create index if not exists regras_emp on regras (empresa_id) where deletado_em is null;

-- Devolve a primeira regra ativa que casa com o lançamento (ou null).
create or replace function fin_regra_para(p_empresa uuid, p_tipo text, p_contato uuid, p_descricao text) returns regras language sql stable as $$
  select r.* from regras r
  where r.empresa_id = p_empresa and r.deletado_em is null and r.ativa
    and (r.tipo is null or r.tipo = p_tipo)
    and (r.contato_id is not null or r.padrao is not null)
    and (r.contato_id is null or r.contato_id = p_contato)
    and (r.padrao is null or coalesce(p_descricao, '') ~* r.padrao)
  order by r.prioridade, (r.contato_id is not null and r.padrao is not null) desc, (r.contato_id is not null) desc, r.criado_em
  limit 1;
$$;

-- Trigger: classifica lançamentos que chegam sem categoria. Nome começa com
-- "trg_a_" pra rodar antes de trg_centro_padrao (ordem alfabética).
create or replace function fin_classificar() returns trigger language plpgsql as $$
declare r regras; sem uuid; ctipo text;
begin
  if new.tipo not in ('pagar', 'receber') then return new; end if;
  select id into sem from categorias where empresa_id = new.empresa_id and deletado_em is null and nome ilike 'a classificar' limit 1;
  if new.categoria_id is not null and new.categoria_id is distinct from sem then return new; end if;
  r := fin_regra_para(new.empresa_id, new.tipo, new.contato_id, new.descricao);
  if r.id is not null and r.categoria_id is not null then
    select tipo into ctipo from categorias where id = r.categoria_id and deletado_em is null;
    if ctipo = (case new.tipo when 'pagar' then 'out' else 'in' end) then
      new.categoria_id := r.categoria_id;
      if r.rateio_centros is not null and jsonb_typeof(r.rateio_centros) = 'array' and jsonb_array_length(r.rateio_centros) > 0
         and (new.rateio_centros is null or jsonb_typeof(new.rateio_centros) <> 'array' or jsonb_array_length(new.rateio_centros) = 0) then
        new.rateio_centros := r.rateio_centros;
      end if;
      update regras set acertos = acertos + 1, ultimo_acerto = now() where id = r.id;
      return new;
    end if;
  end if;
  if new.categoria_id is null then
    if new.tipo = 'pagar' then new.categoria_id := sem;
    else select id into new.categoria_id from categorias where empresa_id = new.empresa_id and deletado_em is null and tipo = 'in' and nome ilike 'outras receitas' limit 1; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_a_classificar on lancamentos;
create trigger trg_a_classificar before insert on lancamentos for each row execute function fin_classificar();

-- Reaplica as regras no que ficou em "A classificar" (ex.: regra criada depois).
create or replace function fin_classificar_pendentes(p_empresa uuid) returns int language plpgsql as $$
declare n int := 0; l record; r regras; ctipo text;
begin
  for l in select x.id, x.tipo, x.contato_id, x.descricao, x.rateio_centros from lancamentos x
           join categorias c on c.id = x.categoria_id
           where x.empresa_id = p_empresa and x.deletado_em is null and x.tipo in ('pagar', 'receber') and c.nome ilike 'a classificar' loop
    r := fin_regra_para(p_empresa, l.tipo, l.contato_id, l.descricao);
    if r.id is null or r.categoria_id is null then continue; end if;
    select tipo into ctipo from categorias where id = r.categoria_id and deletado_em is null;
    if ctipo <> (case l.tipo when 'pagar' then 'out' else 'in' end) then continue; end if;
    update lancamentos set categoria_id = r.categoria_id, atualizado_em = now(),
      rateio_centros = case when r.rateio_centros is not null and jsonb_typeof(r.rateio_centros) = 'array' and jsonb_array_length(r.rateio_centros) > 0 then r.rateio_centros else rateio_centros end
      where id = l.id;
    update regras set acertos = acertos + 1, ultimo_acerto = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Aprende regras contato → categoria a partir do histórico: contatos com
-- 3+ lançamentos nos últimos 15 meses em que uma categoria responde por
-- 70% ou mais. Não sobrescreve regra existente do mesmo contato.
create or replace function fin_regras_aprender(p_empresa uuid) returns int language plpgsql as $$
declare qtd int;
begin
  insert into regras (empresa_id, nome, tipo, contato_id, categoria_id, origem, prioridade)
  select p_empresa, ct.nome || ' → ' || cat.nome, x.tipo, x.contato_id, x.categoria_id, 'aprendida', 200
  from (
    select s.*, sum(s.n) over (partition by s.tipo, s.contato_id) as tot, row_number() over (partition by s.tipo, s.contato_id order by s.n desc, s.categoria_id) as rn
    from (
      select l.tipo, l.contato_id, l.categoria_id, count(*) as n
      from lancamentos l join categorias c on c.id = l.categoria_id and c.deletado_em is null and not c.arquivada and c.nome not ilike 'a classificar'
      where l.empresa_id = p_empresa and l.deletado_em is null and l.status <> 'cancelado' and l.tipo in ('pagar', 'receber')
        and l.contato_id is not null and l.origem <> 'recorrencia' and l.vencimento >= current_date - interval '15 months'
      group by 1, 2, 3
    ) s
  ) x
  join contatos ct on ct.id = x.contato_id and ct.deletado_em is null and upper(ct.nome) <> 'IDENTIFICAR'
  join categorias cat on cat.id = x.categoria_id
  where x.rn = 1 and x.tot >= 3 and x.n::numeric / x.tot >= 0.7
    and not exists (select 1 from regras r where r.empresa_id = p_empresa and r.deletado_em is null and r.contato_id = x.contato_id and r.padrao is null and (r.tipo is null or r.tipo = x.tipo));
  get diagnostics qtd = row_count;
  return qtd;
end $$;

-- ---------------------------------------------------------------------
-- 2) Recorrências previstas
--    Pares contato+categoria de despesas que aparecem em 6+ dos últimos 9
--    meses viram lançamentos "Previsto" nos próximos meses (valor mediano,
--    dia mediano). Quando o pagamento real entra (Inter, Pagar.me, manual),
--    o previsto do mesmo contato/mês é removido automaticamente.
-- ---------------------------------------------------------------------
create or replace function fin_recorrencias_gerar(p_empresa uuid, p_meses int default 6) returns jsonb language plpgsql as $$
declare n int := 0; k int; pares int := 0; r record; m date; venc date; v_valor numeric; ini date := date_trunc('month', current_date)::date;
begin
  insert into tags (empresa_id, nome, cor) select p_empresa, 'Previsto', '#5B667E'
    where not exists (select 1 from tags where empresa_id = p_empresa and deletado_em is null and nome = 'Previsto');
  for r in
    with hist as (
      select l.contato_id, l.categoria_id, date_trunc('month', coalesce(l.competencia, l.vencimento))::date as mes,
             sum(l.valor) as valor, min(extract(day from l.vencimento))::int as dia
      from lancamentos l
      where l.empresa_id = p_empresa and l.deletado_em is null and l.status <> 'cancelado' and l.tipo = 'pagar'
        and l.origem <> 'recorrencia' and l.contato_id is not null and l.categoria_id is not null
        and coalesce(l.competencia, l.vencimento) >= (date_trunc('month', current_date) - interval '9 months')::date
        and coalesce(l.competencia, l.vencimento) < (date_trunc('month', current_date) + interval '1 month')::date
      group by 1, 2, 3
    ), pares as (
      select contato_id, categoria_id, count(*) as meses,
             percentile_cont(0.5) within group (order by valor) as valor_med,
             percentile_cont(0.5) within group (order by dia) as dia_med,
             -- valor dos dois meses mais recentes: se repetiu, é o valor atual (reajuste de salário, aluguel etc.)
             (array_agg(valor order by mes desc))[1] as ultimo,
             (array_agg(valor order by mes desc))[2] as penultimo
      from hist group by 1, 2
      -- 6+ meses no histórico e ainda em curso (apareceu num dos 2 últimos meses fechados)
      having count(*) >= 6 and max(mes) >= (date_trunc('month', current_date) - interval '2 months')::date
    )
    select p.contato_id, p.categoria_id, p.valor_med, p.dia_med, p.ultimo, p.penultimo,
      (select l.descricao from lancamentos l where l.empresa_id = p_empresa and l.deletado_em is null and l.tipo = 'pagar' and l.origem <> 'recorrencia'
         and l.contato_id = p.contato_id and l.categoria_id = p.categoria_id group by l.descricao order by count(*) desc, max(l.vencimento) desc limit 1) as descricao,
      (select coalesce((l.baixas->0->>'conta_id')::uuid, l.conta_id) from lancamentos l where l.empresa_id = p_empresa and l.deletado_em is null and l.tipo = 'pagar' and l.origem <> 'recorrencia'
         and l.contato_id = p.contato_id and l.categoria_id = p.categoria_id and coalesce((l.baixas->0->>'conta_id')::uuid, l.conta_id) is not null order by l.vencimento desc limit 1) as conta_id,
      (select l.forma_pagamento from lancamentos l where l.empresa_id = p_empresa and l.deletado_em is null and l.tipo = 'pagar' and l.origem <> 'recorrencia'
         and l.contato_id = p.contato_id and l.categoria_id = p.categoria_id and l.forma_pagamento is not null group by l.forma_pagamento order by count(*) desc limit 1) as forma,
      -- parcelamento em andamento: só projeta as parcelas que faltam
      (select case when l.parcela_total is not null and l.parcela_num is not null then greatest(l.parcela_total - l.parcela_num, 0) end
         from lancamentos l where l.empresa_id = p_empresa and l.deletado_em is null and l.tipo = 'pagar' and l.origem <> 'recorrencia'
         and l.contato_id = p.contato_id and l.categoria_id = p.categoria_id order by l.vencimento desc limit 1) as parcelas_restantes
    from pares p
    join contatos ct on ct.id = p.contato_id and ct.deletado_em is null and not coalesce(ct.arquivado, false) and upper(ct.nome) <> 'IDENTIFICAR'
    join categorias cat on cat.id = p.categoria_id and cat.deletado_em is null and not cat.arquivada and cat.nome not ilike 'a classificar'
  loop
    if r.parcelas_restantes = 0 then continue; end if;
    pares := pares + 1;
    v_valor := round((case when r.ultimo is not null and r.ultimo = r.penultimo then r.ultimo else r.valor_med end)::numeric, 2);
    -- previstos já criados e ainda sem baixa acompanham o valor atual, exceto os
    -- editados à mão (recorrencia.manual) ou cujo valor já não é o gerado (valor_auto)
    update lancamentos l set valor = v_valor, recorrencia = l.recorrencia || jsonb_build_object('valor_auto', v_valor), atualizado_em = now()
      where l.empresa_id = p_empresa and l.deletado_em is null and l.origem = 'recorrencia' and (l.recorrencia->>'auto') = 'true'
        and l.contato_id = r.contato_id and l.categoria_id = r.categoria_id and l.status = 'aberto'
        and jsonb_array_length(coalesce(l.baixas, '[]'::jsonb)) = 0 and l.valor <> v_valor
        and coalesce((l.recorrencia->>'manual')::boolean, false) = false
        and ((l.recorrencia->>'valor_auto') is null or (l.recorrencia->>'valor_auto')::numeric = l.valor);
    for i in 0 .. least(greatest(p_meses, 1), coalesce(r.parcelas_restantes, p_meses)) loop
      m := (ini + (i || ' months')::interval)::date;
      if exists (select 1 from lancamentos l where l.empresa_id = p_empresa and l.deletado_em is null and l.status <> 'cancelado' and l.tipo = 'pagar'
                   and l.contato_id = r.contato_id and l.categoria_id = r.categoria_id and date_trunc('month', coalesce(l.competencia, l.vencimento))::date = m) then continue; end if;
      venc := least(m + (greatest(round(r.dia_med)::int, 1) - 1), (m + interval '1 month - 1 day')::date);
      -- no mês corrente só cria se o dia ainda não passou (senão nasceria atrasado)
      if i = 0 and venc < current_date then continue; end if;
      insert into lancamentos (empresa_id, tipo, descricao, valor, vencimento, competencia, categoria_id, contato_id, conta_id, forma_pagamento, status, baixas, tags, recorrencia, recorrencia_id, origem, origem_ref)
      values (p_empresa, 'pagar', coalesce(r.descricao, 'Previsto'), v_valor, venc, m, r.categoria_id, r.contato_id, r.conta_id, coalesce(r.forma, 'pix'), 'aberto', '[]'::jsonb, '["Previsto"]'::jsonb,
              jsonb_build_object('freq', 'mensal', 'auto', true, 'valor_auto', v_valor), md5(p_empresa::text || r.contato_id::text || r.categoria_id::text)::uuid, 'recorrencia',
              'auto:' || r.contato_id || ':' || r.categoria_id || ':' || to_char(m, 'YYYYMM'))
      on conflict (empresa_id, origem, origem_ref) where origem_ref is not null do nothing;
      get diagnostics k = row_count; n := n + k;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'pares', pares, 'criados', n);
end $$;

-- Remove o previsto quando o lançamento real do mesmo contato e mês existe
-- (mesma categoria, ou valor até 15% de diferença). Só mexe em previstos
-- ainda sem baixa.
create or replace function fin_recorrencias_conciliar(p_empresa uuid) returns int language plpgsql as $$
declare n int;
begin
  update lancamentos a set deletado_em = now(), atualizado_em = now()
  where a.empresa_id = p_empresa and a.deletado_em is null and a.origem = 'recorrencia' and (a.recorrencia->>'auto') = 'true'
    and a.status = 'aberto' and jsonb_array_length(coalesce(a.baixas, '[]'::jsonb)) = 0
    and exists (
      select 1 from lancamentos b
      where b.empresa_id = a.empresa_id and b.deletado_em is null and b.id <> a.id and b.origem <> 'recorrencia' and b.tipo = 'pagar' and b.status <> 'cancelado'
        and b.contato_id = a.contato_id and date_trunc('month', coalesce(b.competencia, b.vencimento)) = date_trunc('month', a.competencia)
        and (b.categoria_id = a.categoria_id or abs(b.valor - a.valor) <= greatest(50, a.valor * 0.15)));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 3) Anexos (boleto, nota, comprovante) guardados no banco. O lançamento
--    guarda só os metadados em lancamentos.anexos [{id, nome, tipo, tamanho}];
--    o conteúdo vai e volta pelas ops anexo_put / anexo_get da fin_api.
-- ---------------------------------------------------------------------
create table if not exists anexos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lancamento_id uuid references lancamentos(id) on delete cascade,
  nome text not null,
  tipo text,
  tamanho int,
  conteudo bytea not null,
  criado_em timestamptz default now(),
  criado_por uuid,
  deletado_em timestamptz
);
create index if not exists anexos_lanc on anexos (lancamento_id) where deletado_em is null;

-- Anexos enviados e nunca vinculados a um lançamento salvo (formulário abandonado).
create or replace function fin_anexos_limpar() returns int language plpgsql as $$
declare n int;
begin
  delete from anexos an
   where an.criado_em < now() - interval '2 days'
     and not exists (select 1 from lancamentos l where l.deletado_em is null and l.anexos::text like '%' || an.id::text || '%');
  get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------------
-- 4) fin_api (substitui a versão de schema.sql): + tabela regras,
--    + ops anexo_put / anexo_get / anexo_remove, + vínculo dos anexos no
--    upsert de lançamentos.
-- ---------------------------------------------------------------------
create or replace function fin_api(body jsonb) returns jsonb language plpgsql as $$
declare
  op text := body->>'op'; tok text := body->>'token'; p jsonb := coalesce(body->'payload', '{}'::jsonb);
  s fin_sessoes; u fin_usuarios; tabela text; setlist text; rows jsonb; ids uuid[]; n int; t text;
  permitidas text[] := array['empresas','contas','categorias','centros','contatos','tags','lancamentos','extrato_itens','regras'];
  res jsonb := '{}'::jsonb; ax anexos; b64 text; conteudo bytea;
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
    if tabela = 'lancamentos' then
      -- vincula anexos enviados antes de o lançamento existir
      update anexos an set lancamento_id = v.lid
        from (select (x->>'id')::uuid as lid, (y->>'id')::uuid as aid from jsonb_array_elements(rows) x, jsonb_array_elements(coalesce(x->'anexos', '[]'::jsonb)) y where y ? 'id') v
        where an.id = v.aid and an.lancamento_id is distinct from v.lid;
    end if;
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

  if op = 'anexo_put' then
    b64 := regexp_replace(coalesce(p->>'base64', ''), '^data:[^,]*,', '');
    if b64 = '' or coalesce(p->>'nome', '') = '' then return jsonb_build_object('ok', false, 'erro', 'anexo_invalido'); end if;
    if length(b64) > 16 * 1024 * 1024 then return jsonb_build_object('ok', false, 'erro', 'anexo_grande'); end if;
    conteudo := decode(b64, 'base64');
    insert into anexos (empresa_id, lancamento_id, nome, tipo, tamanho, conteudo, criado_por)
      values ((p->>'empresa_id')::uuid, nullif(p->>'lancamento_id', '')::uuid, left(p->>'nome', 200), p->>'tipo', length(conteudo), conteudo, u.id)
      returning * into ax;
    return jsonb_build_object('ok', true, 'anexo', jsonb_build_object('id', ax.id, 'nome', ax.nome, 'tipo', ax.tipo, 'tamanho', ax.tamanho));
  end if;

  if op = 'anexo_get' then
    select * into ax from anexos where id = (p->>'id')::uuid and deletado_em is null;
    if not found then return jsonb_build_object('ok', false, 'erro', 'anexo_nao_encontrado'); end if;
    return jsonb_build_object('ok', true, 'anexo', jsonb_build_object('id', ax.id, 'nome', ax.nome, 'tipo', ax.tipo, 'tamanho', ax.tamanho, 'base64', replace(encode(ax.conteudo, 'base64'), E'\n', '')));
  end if;

  if op = 'anexo_remove' then
    update anexos set deletado_em = now() where id = (p->>'id')::uuid;
    return jsonb_build_object('ok', true);
  end if;

  if op = 'wipe_empresa' then
    foreach t in array permitidas loop
      if t <> 'empresas' then execute format('delete from %I where empresa_id = %L::uuid', t, p->>'empresa_id'); end if;
    end loop;
    delete from anexos where empresa_id = (p->>'empresa_id')::uuid;
    delete from empresas where id = (p->>'empresa_id')::uuid;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'erro', 'op_desconhecida');
end $$;

-- ---------------------------------------------------------------------
-- 5) Rotina (chamada a cada 10 min pelo workflow de Sync, depois de
--    fin_sync_staging): classifica pendentes, concilia previstos com o
--    real, estende as recorrências e limpa anexos órfãos.
-- ---------------------------------------------------------------------
create or replace function fin_rotina(p_empresa uuid) returns jsonb language plpgsql as $$
declare cls int; conc int; ger jsonb; orf int;
begin
  cls := fin_classificar_pendentes(p_empresa);
  conc := fin_recorrencias_conciliar(p_empresa);
  ger := fin_recorrencias_gerar(p_empresa, 6);
  orf := fin_anexos_limpar();
  return jsonb_build_object('ok', true, 'classificados', cls, 'previstos_removidos', conc, 'previstos_criados', ger->'criados', 'pares', ger->'pares', 'anexos_orfaos', orf);
end $$;
