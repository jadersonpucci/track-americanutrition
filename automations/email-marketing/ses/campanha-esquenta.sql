-- Campanha Esquenta Black Friday por email (10/11/2026). Modelo 7.1-campanha-esquenta (padrao.py).
-- Publico: inscritos com consentimento SUBSCRIBED, sem os que ja se cadastraram na landing do Esquenta.
-- Ordem: quem comprou mais recente primeiro; quem nunca comprou por ultimo (mais risco de bounce).
-- Ondas as 10h (Brasilia) de 11 a 17/11, acompanhando a rampa de volume diario (envio_rampa), porque a conta de envio
-- e nova. O despachante aplica as regras de sempre (consentimento, frequencia, horario) e o freio de bounce/reclamacao.

insert into email_config (chave, valor) values
  ('envio_rampa', '{"2026-11-11":300,"2026-11-12":500,"2026-11-13":800,"2026-11-14":1200,"2026-11-15":2000,"2026-11-16":2000,"2026-11-17":2500,"2026-11-18":1000}')
on conflict (chave) do update set valor = excluded.valor;

create or replace function email_campanha_esquenta() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  with base as (
    select e.email, coalesce(e.ultimo_pedido_em, '1900-01-01'::timestamptz) ult, coalesce(e.pedidos, 0) ped
      from email_contatos e
     where e.status = 'inscrito' and e.shopify_consentimento = 'SUBSCRIBED'
       and email_corrigir(e.email) ~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$'
       and split_part(email_corrigir(e.email), '@', 2) not in ('example.com', 'example.org', 'example.net', 'teste.com', 'test.com',
            'teste-an.com', 'dasda.com', 'asdas.com', 'americanutrition.com', 'marketplace.americanutrition.com', 'clientes.americanutrition.com')
       and not exists (select 1 from esquenta_leads l where lower(trim(l.email)) = e.email)
  ), r as (
    select email, row_number() over (order by (ped > 0) desc, ult desc, email) rn from base
  ), ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade)
    select email, '7.1-campanha-esquenta', 'campanha', 'esquenta-2026',
           email_dia(case when rn <= 250 then date '2026-11-11' when rn <= 700 then date '2026-11-12'
                          when rn <= 1450 then date '2026-11-13' when rn <= 2600 then date '2026-11-14'
                          when rn <= 4500 then date '2026-11-15' when rn <= 6400 then date '2026-11-16'
                          else date '2026-11-17' end, 10) + (rn % 50) * interval '1 minute', 2
      from r
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return jsonb_build_object('agendados', n);
end $$;
revoke all on function email_campanha_esquenta() from public, anon, authenticated;
