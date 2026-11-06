-- Financeiro · Extrato Inter: PIX recebido contado duas vezes no saldo. 06/11/2026.
-- Causa: fin_extrato_aplicar (passo 4) cria "PIX recebido · Nome" (origem extrato) para todo credito sem lancamento
-- com origem_ref = endToEndId. Quando o pedido e criado DEPOIS do extrato (Pix confirmado tarde, pedido feito a mao,
-- rede de seguranca "Pix pago sem pedido"), o lancamento do pedido (origem inter) ganha a propria baixa e o valor
-- entra duas vezes. Casos corrigidos: AN-16437 (R$ 213,03), AN-16377 (R$ 342,02), AN-16375 (R$ 338,66).
-- Chamado de hora em hora no no "Aplicar no Financeiro" do workflow 7kEbFz6FUD5XeS3D:
--   select fin_extrato_aplicar($1::uuid, $2::uuid) || jsonb_build_object('pix_duplicados_resolvidos', fin_extrato_desduplicar_pix($1::uuid, $2::uuid)) as r
create or replace function fin_extrato_desduplicar_pix(p_empresa uuid, p_conta uuid) returns int language plpgsql as $f$
declare r record; n int := 0;
begin
  for r in
    select e.id as item_id, e.fitid, x.id as dup_id, l.id as bom_id
    from extrato_itens e
    join lancamentos x on x.id = e.lancamento_id and x.origem = 'extrato' and x.tipo = 'receber' and x.deletado_em is null
    join lancamentos l on l.empresa_id = p_empresa and l.deletado_em is null and l.id <> x.id and l.tipo = 'receber'
                       and l.origem_ref = e.fitid and coalesce(l.status, '') <> 'cancelado'
    where e.conta_id = p_conta and e.deletado_em is null and e.valor > 0
      and exists (select 1 from jsonb_array_elements(coalesce(l.baixas, '[]'::jsonb)) b
                  where (b->>'conta_id')::uuid = p_conta and abs((b->>'valor')::numeric - e.valor) < 0.01)
  loop
    update extrato_itens set lancamento_id = r.bom_id where id = r.item_id;
    update lancamentos set conciliado_fitid = coalesce(conciliado_fitid, r.fitid) where id = r.bom_id;
    update lancamentos set deletado_em = now(), atualizado_em = now(),
      observacoes = coalesce(observacoes, '') || E'\n[removido em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ': duplicava o lançamento do pedido ' || r.bom_id || ']'
    where id = r.dup_id;
    n := n + 1;
  end loop;
  return n;
end $f$;
