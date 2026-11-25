-- Renovacao automatica de assinatura nao e venda do email (15/11/2026, pedido do Jaderson).
-- Caso: AN-16614 (Hercules Schwartz) e a renovacao da Compra Programada cobrada no cartao pelo motor de
-- assinaturas; como ele tinha clicado no 3.1-recompra-acabando 5 dias antes, ganhou as tags EMAIL e entrou no
-- painel como venda do email.
-- Renovacao = cobranca paga da assinatura (cartao ou PIX automatico) que nao e a primeira compra, paga ate 2h
-- antes/depois do pedido, com o mesmo email. A primeira compra da assinatura continua podendo ser do email.
create or replace function email_pedido_renovacao(p_email text, p_criado timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assinatura_cobrancas c join assinaturas a on a.id = c.assinatura_id
     where lower(trim(a.email)) = lower(trim(p_email)) and c.status = 'pago'
       and c.ciclo_ref > (select min(c0.ciclo_ref) from assinatura_cobrancas c0 where c0.assinatura_id = c.assinatura_id)
       and c.atualizado_em between p_criado - interval '2 hours' and p_criado + interval '2 hours')
$$;

-- Usado em email_vendas_para_marcar (marcar-vendas.sql) e em email_painel (painel.sql):
--   ... and not p.cancelado ... and not email_pedido_renovacao(p.email, p.criado_em)
