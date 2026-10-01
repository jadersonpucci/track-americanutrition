-- Extrato bancário importado (OFX ou API do Inter) aplicado no Financeiro.
-- fin_extrato_aplicar: para os itens pendentes de uma conta,
--   1. descarta duplicatas entre OFX e API (mesma conta, data e valor);
--   2. concilia com lançamentos já existentes (baixa na conta, mesmo valor, até 3 dias de diferença);
--   3. tarifas do banco viram uma despesa paga por dia (categoria Tarifas bancárias, contato "Banco <conta>");
--   4. PIX recebidos sem par viram receita paga (categoria do último PIX sincronizado pelo webhook);
--   5. o resto fica pendente na aba Conciliação.
create or replace function fin_extrato_aplicar(p_empresa uuid, p_conta uuid) returns jsonb language plpgsql as $$
declare
  conta_nome text; cat_tar uuid; cat_rec uuid; cc_rec jsonb; ct_banco uuid; ct_pix uuid;
  it record; par record; dia record; lid uuid; v_nome text;
  n_dup int := 0; n_conc int := 0; n_tar int := 0; n_pix int := 0; n_pend int := 0;
begin
  select nome into conta_nome from contas where id = p_conta and empresa_id = p_empresa;
  if conta_nome is null then return jsonb_build_object('ok', false, 'erro', 'conta não encontrada'); end if;

  -- 1. duplicatas: item da API (fitid pix:/inter:) com item do OFX de mesma data e valor ainda sem par
  for it in
    select a.id, a.data, a.valor from extrato_itens a
    where a.conta_id = p_conta and a.deletado_em is null and a.lancamento_id is null and not a.ignorado
      and (a.fitid like 'pix:%' or a.fitid like 'inter:%')
    order by a.data, a.id
  loop
    select o.id into par from extrato_itens o
    where o.conta_id = p_conta and o.deletado_em is null and o.data = it.data and o.valor = it.valor
      and o.fitid is not null and o.fitid not like 'pix:%' and o.fitid not like 'inter:%'
      and not exists (select 1 from extrato_itens x where x.conta_id = p_conta and x.deletado_em is not null and x.descricao like '%[dup de ' || o.id || ']%')
    limit 1;
    if found then
      update extrato_itens set deletado_em = now(), descricao = coalesce(descricao, '') || ' [dup de ' || par.id || ']' where id = it.id;
      n_dup := n_dup + 1;
    end if;
  end loop;

  -- 2. conciliação com lançamentos existentes
  for it in
    select a.* from extrato_itens a
    where a.conta_id = p_conta and a.deletado_em is null and a.lancamento_id is null and not a.ignorado
    order by a.data, a.id
  loop
    select l.id, l.tipo into par from lancamentos l
    left join lateral (select b from jsonb_array_elements(coalesce(l.baixas, '[]'::jsonb)) b) bx on true
    where l.empresa_id = p_empresa and l.deletado_em is null and coalesce(l.status, '') <> 'cancelado'
      and (l.conciliado_fitid is null or l.conciliado_fitid = it.fitid)
      and not exists (select 1 from extrato_itens x where x.lancamento_id = l.id and x.deletado_em is null and x.id <> it.id and (l.tipo <> 'pagar' or true))
      and (
        (l.tipo = 'transferencia' and l.valor = abs(it.valor) and abs(l.vencimento - it.data) <= 3
          and ((it.valor < 0 and l.conta_id = p_conta) or (it.valor > 0 and l.conta_destino_id = p_conta)))
        or (l.tipo in ('pagar', 'receber') and ((it.valor < 0 and l.tipo = 'pagar') or (it.valor > 0 and l.tipo = 'receber'))
          and (bx.b->>'conta_id')::uuid = p_conta and (bx.b->>'valor')::numeric = abs(it.valor)
          and abs((bx.b->>'data')::date - it.data) <= 3)
      )
    order by case when l.tipo = 'transferencia' then abs(l.vencimento - it.data) else abs((bx.b->>'data')::date - it.data) end, l.criado_em
    limit 1;
    if found then
      update extrato_itens set lancamento_id = par.id where id = it.id;
      update lancamentos set conciliado_fitid = coalesce(conciliado_fitid, it.fitid) where id = par.id;
      n_conc := n_conc + 1;
    end if;
  end loop;

  -- 3. tarifas: uma despesa paga por dia (só dias já fechados)
  select id into cat_tar from categorias where empresa_id = p_empresa and deletado_em is null and tipo = 'out' and nome ilike 'tarifa%' order by nome limit 1;
  if cat_tar is null then select id into cat_tar from categorias where empresa_id = p_empresa and deletado_em is null and tipo = 'out' and nome ilike 'a classificar' limit 1; end if;
  for dia in
    select a.data, count(*) as n, sum(-a.valor) as total,
           string_agg('R$ ' || replace(to_char(-a.valor, 'FM999G999G990D00'), '.', ',') || ' · ' || coalesce(a.descricao, ''), E'\n' order by a.id) as obs,
           array_agg(a.id order by a.id) as ids, min(a.fitid) as fitid
    from extrato_itens a
    where a.conta_id = p_conta and a.deletado_em is null and a.lancamento_id is null and not a.ignorado
      and a.valor < 0 and a.descricao ~* 'tarifa|taxa|anuidade|mensalidade|\miof\M' and a.data < current_date
    group by a.data
  loop
    if ct_banco is null then ct_banco := fin_contato_garantir(p_empresa, 'Banco ' || conta_nome, 'fornecedor', null); end if;
    lid := gen_random_uuid();
    insert into lancamentos (id, empresa_id, tipo, descricao, valor, vencimento, competencia, categoria_id, contato_id, conta_id, forma_pagamento, status, baixas, tags, anexos, observacoes, rateio_categorias, rateio_centros, origem, conciliado_fitid)
    values (lid, p_empresa, 'pagar', 'Tarifas ' || conta_nome || ' · ' || dia.n || ' cobrança' || case when dia.n = 1 then '' else 's' end, round(dia.total, 2), dia.data, date_trunc('month', dia.data)::date,
            cat_tar, ct_banco, p_conta, 'debito', 'pago',
            jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'data', dia.data, 'valor', round(dia.total, 2), 'conta_id', p_conta, 'juros', 0, 'multa', 0, 'desconto', 0, 'observacao', 'Extrato do banco')),
            '[]'::jsonb, '[]'::jsonb, dia.obs, '[]'::jsonb, '[]'::jsonb, 'extrato', dia.fitid);
    update extrato_itens set lancamento_id = lid where id = any(dia.ids);
    n_tar := n_tar + 1;
  end loop;

  -- 4. PIX recebidos sem par: receita paga, categoria do último PIX vindo do webhook
  select l.categoria_id, coalesce(l.rateio_centros, '[]'::jsonb) into cat_rec, cc_rec from lancamentos l
  where l.empresa_id = p_empresa and l.deletado_em is null and l.tipo = 'receber' and l.conta_id = p_conta and l.origem in ('inter', 'extrato') and l.categoria_id is not null
  order by l.criado_em desc limit 1;
  for it in
    select a.* from extrato_itens a
    where a.conta_id = p_conta and a.deletado_em is null and a.lancamento_id is null and not a.ignorado
      and a.valor > 0 and a.descricao ~* '^pix (autom[aá]tico )?recebido'
    order by a.data, a.id
  loop
    v_nome := nullif(trim(regexp_replace(split_part(it.descricao, ' · ', 2), '^Cp ?:[0-9]+-', '')), '');
    ct_pix := case when v_nome is not null then fin_contato_garantir(p_empresa, v_nome, 'cliente', null) else null end;
    lid := gen_random_uuid();
    insert into lancamentos (id, empresa_id, tipo, descricao, valor, vencimento, competencia, categoria_id, contato_id, conta_id, forma_pagamento, status, baixas, tags, anexos, observacoes, rateio_categorias, rateio_centros, origem, conciliado_fitid)
    values (lid, p_empresa, 'receber', 'PIX recebido' || coalesce(' · ' || v_nome, ''), it.valor, it.data, date_trunc('month', it.data)::date,
            cat_rec, ct_pix, p_conta, 'pix', 'pago',
            jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'data', it.data, 'valor', it.valor, 'conta_id', p_conta, 'juros', 0, 'multa', 0, 'desconto', 0, 'observacao', 'Extrato do banco')),
            '[]'::jsonb, '[]'::jsonb, it.descricao, '[]'::jsonb, coalesce(cc_rec, '[]'::jsonb), 'extrato', it.fitid);
    update extrato_itens set lancamento_id = lid where id = it.id;
    n_pix := n_pix + 1;
  end loop;

  select count(*) into n_pend from extrato_itens a where a.conta_id = p_conta and a.deletado_em is null and a.lancamento_id is null and not a.ignorado;
  return jsonb_build_object('ok', true, 'conta', conta_nome, 'duplicatas', n_dup, 'conciliados', n_conc, 'tarifas', n_tar, 'pix_recebidos', n_pix, 'pendentes', n_pend);
end $$;
