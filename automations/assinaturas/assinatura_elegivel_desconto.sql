-- 27/10/2026 (Jaderson): os 10% de assinante valem ja na 1a compra para todo mundo, menos para quem
-- TEM assinatura ativa/inadimplente ou PAGOU alguma assinatura nos ultimos 60 dias (anti-farm: assinar,
-- pegar o desconto e cancelar). Antes bastava ter assinado uma vez na vida (assinatura_elegibilidade).
-- Usada pelo pre-check do checkout (assinatura-elegivel) e pela cobranca da 1a compra (assinatura-criar).
create or replace function assinatura_elegivel_desconto(p_cpf text, p_whatsapp text, p_email text)
returns boolean language sql stable as $fn$
  with par as (
    select nullif(regexp_replace(coalesce(p_cpf,''),'\D','','g'),'') as cpf,
           nullif(right(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),11),'') as wpp,
           nullif(lower(trim(coalesce(p_email,''))),'') as email
  ), alvo as (
    select a.id, a.status from assinaturas a, par
    where (par.cpf is not null and regexp_replace(coalesce(a.cpf,''),'\D','','g') = par.cpf)
       or (par.wpp is not null and length(par.wpp) >= 10 and right(regexp_replace(coalesce(a.whatsapp,''),'\D','','g'),11) = par.wpp)
       or (par.email is not null and lower(trim(coalesce(a.email,''))) = par.email)
  )
  select not exists (
    select 1 from alvo
    where alvo.status in ('ativa','inadimplente')
       or exists (select 1 from assinatura_cobrancas c where c.assinatura_id = alvo.id and c.status = 'pago'
                  and coalesce(c.atualizado_em, c.criado_em) > now() - interval '60 days')
  );
$fn$;
select 'fabiana' q, assinatura_elegivel_desconto('33949327843','13997449086','fabianabigliacano.fbc@gmail.com')
union all select 'winslow', assinatura_elegivel_desconto('16382431826','15997349858','winslowxb957@gmail.com')
union all select 'novo', assinatura_elegivel_desconto('52998224725','11999990000','novo-xyz@exemplo.com')
union all select 'claudia(ativa)', assinatura_elegivel_desconto('', '34999959242', '')
