-- Funcao registrar_conversao_manual (lancamento manual de comissao pelo painel de afiliados).
-- 04/11/2026: a trava contra pedido ja atribuido compara so os digitos do numero do pedido
-- (o automatico grava "16314" e o manual "AN-16314": o AN-16314 ficou com comissao em dobro, ids 2349/2350 cancelados).
-- Lancamento automatico de R$ 0 (caso da Nair, que recebe pelo manual) nao bloqueia o manual.

CREATE OR REPLACE FUNCTION public.registrar_conversao_manual(p_afiliado_id uuid, p_order_id text, p_order_number text, p_cliente_nome text, p_order_value numeric, p_frete numeric DEFAULT 0, p_comissao numeric DEFAULT NULL::numeric, p_data timestamp with time zone DEFAULT now(), p_produtos text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS afiliado_conversoes
 LANGUAGE plpgsql
AS $function$
declare v_tipo text; v_valor numeric; v_com numeric; v_ref text;
  v_auto boolean; v_status text; v_parent uuid; v_n2 numeric; v_row afiliado_conversoes;
  v_exist afiliado_conversoes; v_exist_nome text;
begin
  select * into v_exist from afiliado_conversoes
   where nivel=1 and status not in ('cancelled','refunded','tag_excluida')
     -- 04/11/2026: compara so os digitos ('16314' do automatico x 'AN-16314' do manual duplicou o AN-16314).
     -- Lancamento automatico de R$ 0 (caso da Nair) nao bloqueia o manual.
     and coalesce(comissao_valor,0) > 0
     and ( (regexp_replace(coalesce(p_order_number,''),'\D','','g')<>'' and regexp_replace(order_number,'\D','','g')=regexp_replace(p_order_number,'\D','','g')) or order_id=p_order_id )
   order by created_at asc limit 1;
  if found then
    if v_exist.afiliado_id = p_afiliado_id then
      return v_exist;
    elsif not p_force then
      select nome into v_exist_nome from afiliados where id=v_exist.afiliado_id;
      raise exception 'PEDIDO_JA_ATRIBUIDO|%|%', coalesce(v_exist_nome,'outro afiliado'), v_exist.id using errcode='23505';
    else
      update afiliado_conversoes set status='cancelled'
       where status not in ('cancelled','refunded','tag_excluida','paid')
         and ( (regexp_replace(coalesce(p_order_number,''),'\D','','g')<>'' and regexp_replace(order_number,'\D','','g')=regexp_replace(p_order_number,'\D','','g')) or order_id=v_exist.order_id );
      perform recalc_saldos(v_exist.afiliado_id);
    end if;
  end if;

  if p_comissao is not null then v_com:=p_comissao;
  else select tipo,valor into v_tipo,v_valor from af_comissao_efetiva(p_afiliado_id);
       if v_tipo='fixed' then v_com:=v_valor; else v_com:=round(p_order_value*(v_valor/100.0),2); end if; end if;

  select aprovacao_automatica into v_auto from afiliado_config where id=true;
  v_status := case when v_auto then 'approved' else 'pending' end;
  select ref_code into v_ref from afiliados where id=p_afiliado_id;

  insert into afiliado_conversoes(afiliado_id,ref_code,order_id,order_number,cliente_nome,produtos,
    order_value,frete,comissao_valor,origem,nivel,status,approved_at,created_at)
  values (p_afiliado_id,v_ref,p_order_id,p_order_number,p_cliente_nome,p_produtos,
    p_order_value,coalesce(p_frete,0),v_com,'manual',1,v_status,case when v_auto then now() else null end,p_data)
  returning * into v_row;
  perform recalc_saldos(p_afiliado_id);

  select parent_id into v_parent from afiliados where id=p_afiliado_id;
  if v_parent is not null then
    select nivel2_percent into v_n2 from afiliados where id=v_parent and status='active';
    if v_n2 is not null and v_n2>0
       and not exists (select 1 from afiliado_conversoes where afiliado_id=v_parent and order_id=p_order_id and nivel=2 and status not in ('cancelled','refunded','tag_excluida')) then
      insert into afiliado_conversoes(afiliado_id,ref_code,order_id,order_number,cliente_nome,produtos,
        order_value,frete,comissao_valor,origem,nivel,status,approved_at,created_at)
      values (v_parent,(select ref_code from afiliados where id=v_parent),p_order_id,p_order_number,p_cliente_nome,p_produtos,
        p_order_value,coalesce(p_frete,0),round(p_order_value*(v_n2/100.0),2),'nivel2',2,v_status,
        case when v_auto then now() else null end,p_data);
      perform recalc_saldos(v_parent);
    end if;
  end if;
  return v_row;
end; $function$

