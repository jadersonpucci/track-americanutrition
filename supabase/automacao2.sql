-- =====================================================================
--  Automação v2: trilha de alterações (auditoria + desfazer), sugestão
--  de categoria por IA e entrada de boletos pelo Telegram.
--  Idempotente. Roda depois de automacao.sql (redefine fin_api).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Trilha de alterações
--    Trigger em lançamentos, contatos, categorias, contas, centros, tags e
--    regras grava quem mudou o quê. O usuário vem de fin_api (set_config
--    'fin.usuario'); integrações aparecem como "sistema" com a origem.
-- ---------------------------------------------------------------------
create table if not exists auditoria (
  id bigserial primary key,
  empresa_id uuid,
  tabela text not null,
  registro_id uuid not null,
  acao text not null,                 -- criou | alterou | excluiu | restaurou
  antes jsonb,
  depois jsonb,
  campos text[],
  usuario_id uuid,
  usuario_nome text,
  origem text,
  criado_em timestamptz default now()
);
create index if not exists auditoria_reg on auditoria (tabela, registro_id, criado_em desc);
create index if not exists auditoria_emp on auditoria (empresa_id, criado_em desc);

create or replace function fin_auditar() returns trigger language plpgsql as $$
declare a jsonb; d jsonb; campos text[]; acao text; who text := current_setting('fin.usuario', true); uid uuid; unome text; emp uuid; rid uuid; org text;
  ignorar text[] := array['atualizado_em', 'acertos', 'ultimo_acerto'];
begin
  if tg_op = 'INSERT' then d := to_jsonb(new); acao := 'criou';
  elsif tg_op = 'DELETE' then a := to_jsonb(old); acao := 'excluiu';
  else
    a := to_jsonb(old); d := to_jsonb(new);
    select array_agg(k) into campos from (
      select key as k from jsonb_each(d) where not (key = any(ignorar)) and d->key is distinct from a->key
      union select key from jsonb_each(a) where not (key = any(ignorar)) and a->key is distinct from d->key) s;
    if campos is null or array_length(campos, 1) is null then return new; end if;
    if (a->>'deletado_em') is null and (d->>'deletado_em') is not null then acao := 'excluiu';
    elsif (a->>'deletado_em') is not null and (d->>'deletado_em') is null then acao := 'restaurou';
    else acao := 'alterou'; end if;
  end if;
  if who is not null and who <> '' then uid := nullif(split_part(who, '|', 1), '')::uuid; unome := nullif(split_part(who, '|', 2), ''); end if;
  emp := coalesce(d->>'empresa_id', a->>'empresa_id')::uuid; rid := coalesce(d->>'id', a->>'id')::uuid;
  org := coalesce(d->>'origem', a->>'origem');
  insert into auditoria (empresa_id, tabela, registro_id, acao, antes, depois, campos, usuario_id, usuario_nome, origem)
    values (emp, tg_table_name, rid, acao, a - ignorar, d - ignorar, campos, uid, coalesce(unome, 'sistema'), org);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['lancamentos', 'contatos', 'categorias', 'contas', 'centros', 'tags', 'regras'] loop
    execute format('drop trigger if exists trg_z_auditar on %I', t);
    execute format('create trigger trg_z_auditar after insert or update or delete on %I for each row execute function fin_auditar()', t);
  end loop;
end $$;

-- Desfaz uma entrada da trilha: volta o registro ao estado "antes" (ou
-- arquiva o que foi criado). Devolve o registro como ficou.
create or replace function fin_desfazer(p_id bigint) returns jsonb language plpgsql as $$
declare e auditoria; setlist text; alvo jsonb; res jsonb;
begin
  select * into e from auditoria where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if e.acao = 'criou' then
    execute format('update %I set deletado_em = now(), atualizado_em = now() where id = %L returning to_jsonb(%I.*)', e.tabela, e.registro_id, e.tabela) into res;
    return jsonb_build_object('ok', true, 'registro', res, 'removido', true);
  end if;
  alvo := e.antes || jsonb_build_object('atualizado_em', now());
  select string_agg(format('%I = v.%I', column_name, column_name), ', ') into setlist
    from information_schema.columns where table_schema = 'public' and table_name = e.tabela and column_name not in ('id', 'criado_em');
  execute format('update %I t set %s from jsonb_populate_record(null::%I, %L::jsonb) v where t.id = %L returning to_jsonb(t.*)', e.tabela, setlist, e.tabela, alvo::text, e.registro_id) into res;
  if res is null then
    -- registro apagado de vez: recria
    execute format('insert into %I select * from jsonb_populate_record(null::%I, %L::jsonb) returning to_jsonb(%I.*)', e.tabela, e.tabela, alvo::text, e.tabela) into res;
  end if;
  return jsonb_build_object('ok', true, 'registro', res, 'removido', (res->>'deletado_em') is not null);
end $$;

-- ---------------------------------------------------------------------
-- 2) Sugestão de categoria por IA (preenchida pelo workflow
--    "Financeiro · Classificar com IA"): {categoria_id, confianca, motivo, em}
-- ---------------------------------------------------------------------
alter table lancamentos add column if not exists sugestao jsonb;

-- Lançamentos em "A classificar" ainda sem sugestão, com o plano de contas e
-- exemplos recentes, num único JSON pro modelo.
create or replace function fin_ia_pendentes(p_empresa uuid, p_limite int default 25) returns jsonb language plpgsql as $$
declare sem uuid; pend jsonb; cats jsonb; ex jsonb;
begin
  select id into sem from categorias where empresa_id = p_empresa and deletado_em is null and nome ilike 'a classificar' limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'tipo', l.tipo, 'descricao', l.descricao, 'valor', l.valor, 'data', l.vencimento, 'contato', ct.nome, 'observacoes', l.observacoes)), '[]'::jsonb) into pend
    from (select * from lancamentos where empresa_id = p_empresa and deletado_em is null and status <> 'cancelado' and categoria_id = sem and sugestao is null order by vencimento desc limit p_limite) l
    left join contatos ct on ct.id = l.contato_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', case c.tipo when 'out' then 'saida' else 'entrada' end, 'grupo', c.grupo, 'subgrupo', c.subgrupo) order by c.grupo, c.codigo), '[]'::jsonb) into cats
    from categorias c where c.empresa_id = p_empresa and c.deletado_em is null and not c.arquivada and c.nome not ilike 'a classificar';
  select coalesce(jsonb_agg(jsonb_build_object('descricao', x.descricao, 'contato', x.contato, 'categoria', x.categoria)), '[]'::jsonb) into ex
    from (select l.descricao, ct.nome as contato, c.nome as categoria
          from lancamentos l join categorias c on c.id = l.categoria_id left join contatos ct on ct.id = l.contato_id
          where l.empresa_id = p_empresa and l.deletado_em is null and l.status <> 'cancelado' and l.origem <> 'recorrencia' and c.nome not ilike 'a classificar' and l.tipo in ('pagar', 'receber')
          order by l.vencimento desc limit 120) x;
  return jsonb_build_object('pendentes', pend, 'categorias', cats, 'exemplos', ex, 'n', jsonb_array_length(pend));
end $$;

-- Grava as sugestões devolvidas pelo modelo: [{id, categoria_id, confianca, motivo}]
create or replace function fin_ia_gravar(p_empresa uuid, p_sugestoes jsonb) returns int language plpgsql as $$
declare n int := 0; s jsonb; k int;
begin
  for s in select * from jsonb_array_elements(coalesce(p_sugestoes, '[]'::jsonb)) loop
    update lancamentos l set sugestao = jsonb_build_object('categoria_id', (s->>'categoria_id')::uuid, 'confianca', least(greatest(coalesce((s->>'confianca')::numeric, 0), 0), 1), 'motivo', left(coalesce(s->>'motivo', ''), 240), 'em', now())
      where l.id = (s->>'id')::uuid and l.empresa_id = p_empresa and l.deletado_em is null
        and exists (select 1 from categorias c where c.id = (s->>'categoria_id')::uuid and c.empresa_id = p_empresa and c.deletado_em is null and not c.arquivada
                    and c.tipo = (case l.tipo when 'pagar' then 'out' else 'in' end));
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 3) Boleto pelo Telegram: cria a conta a pagar (contato, categoria pela
--    regra, anexo) a partir do que o modelo leu no PDF/foto.
--    p: {empresa_id, fornecedor, cnpj, valor, vencimento, linha_digitavel,
--        descricao, arquivo_nome, arquivo_tipo, base64, file_unique_id, quem}
-- ---------------------------------------------------------------------
create or replace function fin_boleto_criar(p jsonb) returns jsonb language plpgsql as $$
declare emp uuid := (p->>'empresa_id')::uuid; ct uuid; conta uuid; lid uuid; ref text; existente record; conteudo bytea; aid uuid; forn text; catn text; ctn text;
  valor numeric := round(coalesce(nullif(p->>'valor', '')::numeric, 0), 2); venc date; linha text := regexp_replace(coalesce(p->>'linha_digitavel', ''), '\D', '', 'g');
begin
  if valor <= 0 then return jsonb_build_object('ok', false, 'erro', 'valor_invalido'); end if;
  begin venc := (p->>'vencimento')::date; exception when others then venc := null; end;
  if venc is null then return jsonb_build_object('ok', false, 'erro', 'vencimento_invalido'); end if;
  ref := coalesce(nullif(linha, ''), nullif(p->>'file_unique_id', ''));
  if ref is not null then
    select l.id, l.descricao, l.valor, l.vencimento into existente from lancamentos l where l.empresa_id = emp and l.deletado_em is null and l.origem = 'telegram' and l.origem_ref = ref limit 1;
    if found then return jsonb_build_object('ok', true, 'duplicado', true, 'id', existente.id, 'descricao', existente.descricao, 'valor', existente.valor, 'vencimento', existente.vencimento); end if;
  end if;
  forn := nullif(trim(coalesce(p->>'fornecedor', '')), '');
  if forn is not null then
    -- casa por CNPJ quando houver, senão por nome
    if nullif(regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'), '') is not null then
      select id into ct from contatos where empresa_id = emp and deletado_em is null and regexp_replace(coalesce(documento, ''), '\D', '', 'g') = regexp_replace(p->>'cnpj', '\D', '', 'g') limit 1;
    end if;
    if ct is null then ct := fin_contato_garantir(emp, forn, 'fornecedor', null); end if;
    if nullif(regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'), '') is not null then update contatos set documento = coalesce(nullif(documento, ''), p->>'cnpj') where id = ct; end if;
  end if;
  select id into conta from contas where empresa_id = emp and deletado_em is null and not arquivada and tipo <> 'cartao' order by (nome ilike 'inter') desc, ordem limit 1;
  insert into lancamentos (empresa_id, tipo, descricao, valor, vencimento, competencia, contato_id, conta_id, forma_pagamento, status, baixas, referencia, observacoes, origem, origem_ref)
    values (emp, 'pagar', left(coalesce(nullif(p->>'descricao', ''), 'Boleto ' || coalesce(forn, '')), 140), valor, venc, date_trunc('month', venc)::date, ct, conta, 'boleto', 'aberto', '[]'::jsonb,
            nullif(linha, ''), nullif('Recebido pelo Telegram' || coalesce(' por ' || nullif(p->>'quem', ''), ''), ''), 'telegram', ref)
    returning id into lid;
  if coalesce(p->>'base64', '') <> '' then
    conteudo := decode(regexp_replace(p->>'base64', '^data:[^,]*,', ''), 'base64');
    insert into anexos (empresa_id, lancamento_id, nome, tipo, tamanho, conteudo) values (emp, lid, left(coalesce(nullif(p->>'arquivo_nome', ''), 'boleto.pdf'), 200), p->>'arquivo_tipo', length(conteudo), conteudo) returning id into aid;
    update lancamentos set anexos = jsonb_build_array(jsonb_build_object('id', aid, 'nome', left(coalesce(nullif(p->>'arquivo_nome', ''), 'boleto.pdf'), 200), 'tipo', p->>'arquivo_tipo', 'tamanho', length(conteudo))) where id = lid;
  end if;
  select c.nome into catn from lancamentos l join categorias c on c.id = l.categoria_id where l.id = lid;
  select nome into ctn from contatos where id = ct;
  return jsonb_build_object('ok', true, 'duplicado', false, 'id', lid, 'valor', valor, 'vencimento', venc, 'fornecedor', ctn, 'categoria', catn, 'descricao', (select descricao from lancamentos where id = lid));
end $$;

-- ---------------------------------------------------------------------
-- 4) fin_api: identifica o usuário pra trilha e expõe historico,
--    atividade e desfazer (vale a definição de automacao.sql + isto).
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
  perform set_config('fin.usuario', u.id::text || '|' || coalesce(u.nome, u.email), true);

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
    rows := regexp_replace(rows::text, ':\s*""', ':null', 'g')::jsonb;
    select string_agg(format('%I = excluded.%I', column_name, column_name), ', ') into setlist
      from information_schema.columns where table_schema = 'public' and table_name = tabela and column_name not in ('id', 'criado_em');
    execute format('insert into %I select * from jsonb_populate_recordset(null::%I, %L::jsonb) on conflict (id) do update set %s', tabela, tabela, rows::text, setlist);
    get diagnostics n = row_count;
    if tabela = 'lancamentos' then
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

  -- trilha de alterações de um registro
  if op = 'historico' then
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'acao', a.acao, 'campos', a.campos, 'quem', a.usuario_nome, 'origem', a.origem, 'em', a.criado_em,
             'de', case when a.acao = 'alterou' then (select jsonb_object_agg(k, a.antes->k) from unnest(a.campos) k) end,
             'para', case when a.acao = 'alterou' then (select jsonb_object_agg(k, a.depois->k) from unnest(a.campos) k) end) order by a.criado_em desc), '[]'::jsonb) into rows
      from (select au.* from auditoria au where au.tabela = p->>'tabela' and au.registro_id = (p->>'registro_id')::uuid order by au.criado_em desc limit coalesce((p->>'limit')::int, 50)) a;
    return jsonb_build_object('ok', true, 'itens', rows);
  end if;

  -- atividade recente da empresa
  if op = 'atividade' then
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tabela', a.tabela, 'registro_id', a.registro_id, 'acao', a.acao, 'campos', a.campos, 'quem', a.usuario_nome, 'origem', a.origem, 'em', a.criado_em,
             'titulo', coalesce(a.depois->>'descricao', a.antes->>'descricao', a.depois->>'nome', a.antes->>'nome'), 'valor', coalesce(a.depois->>'valor', a.antes->>'valor'),
             'apagado', (coalesce(a.depois, a.antes)->>'deletado_em') is not null) order by a.criado_em desc), '[]'::jsonb) into rows
      from (select au.* from auditoria au where au.empresa_id = (p->>'empresa_id')::uuid and (p->>'desde' is null or au.criado_em >= (p->>'desde')::timestamptz) order by au.criado_em desc limit coalesce((p->>'limit')::int, 150)) a;
    return jsonb_build_object('ok', true, 'itens', rows);
  end if;

  if op = 'desfazer' then return fin_desfazer((p->>'id')::bigint); end if;

  if op = 'wipe_empresa' then
    foreach t in array permitidas loop
      if t <> 'empresas' then execute format('delete from %I where empresa_id = %L::uuid', t, p->>'empresa_id'); end if;
    end loop;
    delete from anexos where empresa_id = (p->>'empresa_id')::uuid;
    delete from auditoria where empresa_id = (p->>'empresa_id')::uuid;
    delete from empresas where id = (p->>'empresa_id')::uuid;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'erro', 'op_desconhecida');
end $$;
