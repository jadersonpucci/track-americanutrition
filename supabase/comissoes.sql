-- =====================================================================
--  Comissões de afiliados no Financeiro
--
--  O painel de afiliados (Afiliados - API / aff-api) é a fonte das comissões:
--  · fin_comissoes_prever(empresa): a cada rotina, abre uma conta a pagar por
--    afiliado com o que o painel tem a pagar no mês anterior e no mês corrente
--    (vence dia 5 do mês seguinte). Enquanto não for paga, acompanha o valor
--    do painel (venda nova, estorno, desconto). Zerou → some.
--  · fin_lancar_comissao(...): chamado pelo painel ao confirmar o PIX
--    (POST /webhook/nibo-lancar-comissao). Dá baixa na conta aberta com o
--    valor pago; se não existir, cria já paga.
--  · Conta usada: checkout_config.fin_comissao_conta (nome da conta; padrão
--    Inter). O extrato do Inter concilia o PIX enviado com essa baixa
--    (mesmo valor, até 3 dias) e não duplica.
--  Idempotente por afiliado/mês: origem 'afiliado', origem_ref '<afiliado>:<AAAA-MM>'.
-- =====================================================================
insert into checkout_config (chave, valor) values ('fin_comissao_conta', 'Inter') on conflict (chave) do nothing;

create or replace function fin_comissao_conta(p_empresa uuid) returns uuid language plpgsql stable as $$
declare v uuid; v_nome text;
begin
  select nullif(trim(valor), '') into v_nome from checkout_config where chave = 'fin_comissao_conta';
  select id into v from contas where empresa_id = p_empresa and deletado_em is null and nome ilike coalesce(v_nome, 'Inter') order by nome limit 1;
  if v is null then select id into v from contas where empresa_id = p_empresa and deletado_em is null and nome ilike 'Stone' limit 1; end if;
  return v;
end $$;

-- Quanto o painel tem a pagar para um afiliado num mês (mesma regra do
-- registrar_pagamento_mensal do painel: conversões não canceladas/estornadas/pagas).
create or replace function fin_comissao_a_pagar(p_afiliado uuid, p_ano int, p_mes int) returns numeric language sql stable as $$
  select round(greatest(coalesce(sum(c.comissao_valor - coalesce(c.desconto, 0)), 0), 0)::numeric, 2)
  from afiliado_conversoes c
  where c.afiliado_id = p_afiliado and c.status not in ('cancelled', 'refunded', 'paid', 'tag_excluida')
    and extract(year from c.created_at) = p_ano and extract(month from c.created_at) = p_mes
$$;

create or replace function fin_comissoes_prever(p_empresa uuid) returns jsonb language plpgsql as $$
declare
  v_cat uuid; v_conta uuid; r record; v_ref text; v_ct uuid; v_id uuid; v_desc text; v_venc date; v_valor numeric;
  n_novos int := 0; n_atual int := 0; n_zero int := 0; k int;
  m_ant date := (date_trunc('month', current_date) - interval '1 month')::date;
  m_cur date := date_trunc('month', current_date)::date;
begin
  select id into v_cat from categorias where empresa_id = p_empresa and deletado_em is null and tipo = 'out' and nome ilike 'comiss%' order by nome limit 1;
  v_conta := fin_comissao_conta(p_empresa);

  for r in
    select a.id as afiliado_id, coalesce(nullif(a.nome_completo, ''), a.nome) as nome, a.nibo_supplier_id, ms.m,
           fin_comissao_a_pagar(a.id, extract(year from ms.m)::int, extract(month from ms.m)::int) as valor
    from afiliados a cross join (select m_ant as m union all select m_cur) ms
  loop
    if r.valor <= 0 then continue; end if;
    v_ref := r.afiliado_id || ':' || to_char(r.m, 'YYYY-MM');
    v_desc := 'Comissões ' || to_char(r.m, 'MM/YYYY') || ' - ' || r.nome;
    select id into v_id from lancamentos where empresa_id = p_empresa and origem = 'afiliado' and origem_ref = v_ref;
    if v_id is null then
      v_ct := fin_contato_garantir(p_empresa, r.nome, 'fornecedor', r.nibo_supplier_id);
      v_venc := (r.m + interval '1 month' + interval '4 days')::date;
      insert into lancamentos (empresa_id, tipo, descricao, valor, vencimento, competencia, categoria_id, contato_id, conta_id, forma_pagamento, status, baixas, referencia, observacoes, origem, origem_ref)
      values (p_empresa, 'pagar', v_desc, r.valor, v_venc, r.m, v_cat, v_ct, v_conta, 'pix', 'aberto', '[]'::jsonb,
              r.afiliado_id::text, 'Comissão do painel de afiliados · valor acompanha o painel até o pagamento', 'afiliado', v_ref);
      n_novos := n_novos + 1;
    else
      -- ainda aberta e sem baixa: acompanha o painel
      update lancamentos set valor = r.valor, descricao = v_desc, atualizado_em = now()
        where id = v_id and deletado_em is null and status = 'aberto' and jsonb_array_length(coalesce(baixas, '[]'::jsonb)) = 0 and valor <> r.valor;
      get diagnostics k = row_count; n_atual := n_atual + k;
    end if;
  end loop;

  -- comissão que zerou no painel (estorno, cancelamento) e ainda não foi paga: some
  for r in
    select l.id, split_part(l.origem_ref, ':', 1)::uuid as afiliado_id, to_date(split_part(l.origem_ref, ':', 2), 'YYYY-MM') as m
    from lancamentos l
    where l.empresa_id = p_empresa and l.deletado_em is null and l.origem = 'afiliado' and l.status = 'aberto'
      and jsonb_array_length(coalesce(l.baixas, '[]'::jsonb)) = 0 and l.origem_ref ~ '^[0-9a-f-]{36}:[0-9]{4}-[0-9]{2}$'
  loop
    v_valor := fin_comissao_a_pagar(r.afiliado_id, extract(year from r.m)::int, extract(month from r.m)::int);
    if v_valor <= 0 then
      update lancamentos set deletado_em = now(), atualizado_em = now() where id = r.id;
      n_zero := n_zero + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'novos', n_novos, 'atualizados', n_atual, 'zerados', n_zero);
end $$;

-- Painel confirmou o PIX: baixa na conta aberta (ou cria já paga).
create or replace function fin_lancar_comissao(p_afiliado_id text, p_valor numeric, p_ano int, p_mes int, p_motivo text default null) returns jsonb language plpgsql as $$
declare
  emp uuid := '6b2e7c1a-0f4d-4a1e-9c3b-2d5e8f7a9b10';
  af record; v_conta uuid; v_cat uuid; v_ct uuid; v_id uuid; v_ref text; v_desc text; v_pago boolean;
  motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_valor numeric := round(coalesce(p_valor, 0), 2); hoje date := current_date;
begin
  if nullif(trim(coalesce(p_afiliado_id, '')), '') is null or v_valor <= 0 or coalesce(p_ano, 0) < 2000 or coalesce(p_mes, 0) not between 1 and 12 then
    return jsonb_build_object('ok', false, 'motivo', 'dados-invalidos');
  end if;
  select a.id::text as id, a.nome, a.nome_completo, a.nibo_supplier_id into af from afiliados a where a.id::text = trim(p_afiliado_id);
  if not found then return jsonb_build_object('ok', false, 'motivo', 'afiliado-nao-encontrado', 'afiliado_id', p_afiliado_id); end if;
  v_conta := fin_comissao_conta(emp);
  if v_conta is null then return jsonb_build_object('ok', false, 'motivo', 'conta-nao-encontrada'); end if;
  select id into v_cat from categorias where empresa_id = emp and deletado_em is null and tipo = 'out' and nome ilike 'comiss%' order by nome limit 1;
  v_ref := af.id || ':' || p_ano || '-' || lpad(p_mes::text, 2, '0');
  v_desc := 'Comissões ' || lpad(p_mes::text, 2, '0') || '/' || p_ano || ' - ' || coalesce(nullif(af.nome_completo, ''), af.nome) || coalesce(' (desc: ' || motivo || ')', '');

  select id, jsonb_array_length(coalesce(baixas, '[]'::jsonb)) > 0 into v_id, v_pago
    from lancamentos where empresa_id = emp and origem = 'afiliado' and origem_ref = v_ref and deletado_em is null;
  if v_id is not null and v_pago then return jsonb_build_object('ok', false, 'motivo', 'ja-lancado', 'afiliado', af.nome, 'lancamento_id', v_id); end if;

  if v_id is not null then
    -- conta aberta pela previsão: baixa com o valor realmente pago
    update lancamentos set valor = v_valor, descricao = v_desc, conta_id = v_conta, forma_pagamento = 'pix', status = 'aberto',
      baixas = jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'data', hoje, 'valor', v_valor, 'conta_id', v_conta, 'juros', 0, 'multa', 0, 'desconto', 0)),
      observacoes = 'Comissao afiliado ' || coalesce(af.nome, '') || coalesce(' - desconto: ' || motivo, '') || ' · PIX confirmado no painel',
      atualizado_em = now()
      where id = v_id;
  else
    v_ct := fin_contato_garantir(emp, coalesce(nullif(af.nome_completo, ''), af.nome), 'fornecedor', af.nibo_supplier_id);
    insert into lancamentos (empresa_id, tipo, descricao, valor, vencimento, competencia, categoria_id, contato_id, conta_id, forma_pagamento, status, baixas, referencia, observacoes, origem, origem_ref)
    values (emp, 'pagar', v_desc, v_valor, hoje, make_date(p_ano, p_mes, 1), v_cat, v_ct, v_conta, 'pix', 'aberto',
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'data', hoje, 'valor', v_valor, 'conta_id', v_conta, 'juros', 0, 'multa', 0, 'desconto', 0)),
      af.id, 'Comissao afiliado ' || coalesce(af.nome, '') || coalesce(' - desconto: ' || motivo, '') || ' · PIX confirmado no painel', 'afiliado', v_ref)
    on conflict (empresa_id, origem, origem_ref) where origem_ref is not null do nothing
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'ja-lancado', 'afiliado', af.nome); end if;
  end if;

  -- previsto automático (clone de meses anteriores) do mesmo contato no mês do pagamento: sai de cena
  update lancamentos a set deletado_em = now(), atualizado_em = now()
    from lancamentos b
    where b.id = v_id and a.empresa_id = emp and a.deletado_em is null and a.origem = 'recorrencia' and (a.recorrencia->>'auto') = 'true'
      and a.contato_id = b.contato_id and a.status = 'aberto' and jsonb_array_length(coalesce(a.baixas, '[]'::jsonb)) = 0
      and date_trunc('month', a.competencia) in (date_trunc('month', hoje), date_trunc('month', b.competencia));

  -- compatibilidade com quem lê afiliado_nibo_lancamentos (nibo_payment_id = id do lançamento)
  begin
    execute 'insert into afiliado_nibo_lancamentos (afiliado_id, ano, mes, valor, nibo_payment_id, status) values ($1, $2, $3, $4, $5, ''ok'') on conflict do nothing'
      using af.id, p_ano, p_mes, v_valor, v_id::text;
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'lancamento_id', v_id, 'afiliado', af.nome, 'valor', v_valor);
end $$;
