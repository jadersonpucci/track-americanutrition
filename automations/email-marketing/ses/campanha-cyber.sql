-- Cyber Monday 2026 (aprovada pelo Jaderson em 26/11). Modelo 7.4 (padrao.py) + agendamento.
--  - 7.4-cyber-monday: todos os inscritos com consentimento (mesmo filtro do 7.3, sem tirar quem recebeu o 7.2),
--    seg 30/11 das 8h às 9h40 (rn % 100 minutos). Limite do dia 30/11 subiu para 9.000 em envio_rampa.
-- Cancelar o que falta: update email_fila set status = 'pulado', motivo = 'campanha cancelada'
--   where ref = 'cyber-2026' and status = 'pendente';
insert into email_templates (slug, nome, assunto, previa, html, atualizado_em) values ('7.4-cyber-monday', 'Campanha · Cyber Monday 2026', 'Cyber Monday: último dia com até 40% OFF', 'Só até hoje, 23h59. O desconto entra sozinho no carrinho.', '<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Cyber Monday: último dia com até 40% OFF</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&amp;family=Inter:wght@400;600;700&amp;display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:#E9EEF6;-webkit-text-size-adjust:100%;}
img{border:0;outline:none;text-decoration:none;} a{text-decoration:none;}
@media (max-width:540px){
 .px{padding-left:18px !important;padding-right:18px !important;}
 .h1{font-size:38px !important;line-height:40px !important;}
 .col{max-width:100% !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:#E9EEF6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#E9EEF6;font-size:1px;line-height:1px;">Só até hoje, 23h59. O desconto entra sozinho no carrinho.&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E9EEF6" style="background:#E9EEF6;"><tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#F6F8FC;border-radius:20px;overflow:hidden;">
<tr><td style="padding:0;"><a href="https://americanutrition.com/products/imunofosfo?utm_source=email&utm_medium=email&utm_campaign=cyber-monday-2026"><img src="https://cdn.shopify.com/s/files/1/0643/9000/4908/files/an-cyber-monday-2026-email.jpg?v=1795659752" width="600" alt="Cyber Monday America Nutrition: último dia, até 40% OFF" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr><tr><td class="px" style="padding:30px 32px 10px;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#AD0404;text-align:center;">Cyber Monday · último dia</div><div style="font-family:''Barlow Condensed'',''Arial Narrow'',Arial,sans-serif;font-size:30px;line-height:32px;font-weight:700;color:#07388E;text-align:center;margin-top:6px;">Oi, {{ nome }}! Hoje é Cyber Monday, o último dia da nossa Black.</div></td></tr><tr><td class="px" style="padding:8px 32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#ffffff;border:1px solid #E3E8F2;border-radius:16px;"><tr><td style="padding:24px 26px;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#4B5565;margin:0 0 0px;text-align:left;">Quanto mais frascos, maior o desconto, em toda a linha:</div></td></tr></table></td></tr><tr><td class="px" style="padding:0 32px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#ffffff;border:1px solid #E3E8F2;border-radius:16px;"><tr><td style="padding:22px 24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:11px 0;border-bottom:1px solid #EEF1F6;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:2px;">1 frasco</div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#0F1B33;">20% OFF</div></td></tr><tr><td style="padding:11px 0;border-bottom:1px solid #EEF1F6;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:2px;">2 frascos</div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#0F1B33;">30% OFF</div></td></tr><tr><td style="padding:11px 0;border-bottom:1px solid #EEF1F6;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:2px;">3 frascos</div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#0F1B33;">35% OFF</div></td></tr><tr><td style="padding:11px 0;border-bottom:1px solid #EEF1F6;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A94A6;margin-bottom:2px;">4 ou mais</div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#0F1B33;">40% OFF</div></td></tr></table></td></tr></table></td></tr><tr><td class="px" style="padding:4px 32px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-left:4px solid #AD0404;"><tr><td style="padding:4px 0 4px 18px;"><div style="font-family:''Barlow Condensed'',''Arial Narrow'',Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700;color:#07388E;">4 ImunoFosfo 90 por R$ 784,80 (R$ 196,20 cada), em até 12x, sendo 3x sem juros.</div></td></tr></table></td></tr><tr><td class="px" style="padding:0 32px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#ffffff;border:1px solid #E3E8F2;border-radius:16px;"><tr><td style="padding:24px 26px;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#4B5565;margin:0 0 0px;text-align:left;">O desconto entra sozinho no carrinho e termina hoje, às 23h59.</div></td></tr></table></td></tr><tr><td class="px" style="padding:8px 32px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" bgcolor="#AD0404" style="border-radius:999px;background:#AD0404;border:2px solid #AD0404;"><a href="https://americanutrition.com/products/imunofosfo?utm_source=email&utm_medium=email&utm_campaign=cyber-monday-2026" style="display:block;padding:14px 26px;font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#fff;text-decoration:none;border-radius:999px;">Aproveitar a Cyber Monday</a></td></tr></table><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:12px;color:#8A94A6;text-align:center;margin-top:10px;">Só até hoje, 30/11, às 23h59</div></td></tr>
<tr><td class="px" bgcolor="#07388E" align="center" style="background:#07388E;padding:30px 32px 32px;"><img src="https://cdn.shopify.com/s/files/1/0643/9000/4908/files/an-logo-branco-email.png?v=1793847024" width="112" alt="America Nutrition" style="display:block;width:112px;height:auto;border:0;margin:0 auto 16px;"><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:13px;line-height:1.9;"><a href="https://americanutrition.com" style="color:#ffffff;font-weight:600;text-decoration:none;">Site</a><span style="color:#5D7BB8;">&nbsp;|&nbsp;</span><a href="https://americanutrition.com/pages/depoimentos" style="color:#ffffff;font-weight:600;text-decoration:none;">Depoimentos</a><span style="color:#5D7BB8;">&nbsp;|&nbsp;</span><a href="https://track.americanutrition.com" style="color:#ffffff;font-weight:600;text-decoration:none;">Rastrear pedido</a><span style="color:#5D7BB8;">&nbsp;|&nbsp;</span><a href="https://wa.me/13472225493" style="color:#ffffff;font-weight:600;text-decoration:none;">WhatsApp</a></div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:13px;color:#C9D6F2;margin-top:10px;">Dúvidas? <a href="https://wa.me/13472225493" style="color:#25D366;font-weight:700;text-decoration:none;">Fale com a Serena</a>, 24h por dia.</div><div style="font-family:''Inter'',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8FA6D6;margin-top:16px;">Você recebe este email por ter se cadastrado ou comprado na America Nutrition.<br>Este produto não é um medicamento. · <a href="{{ link_descadastro }}" style="color:#8FA6D6;text-decoration:underline;">Cancelar inscrição</a></div></td></tr>
</table>
</td></tr></table>
</body>
</html>
', now()) on conflict (slug) do update set nome = excluded.nome, assunto = excluded.assunto, previa = excluded.previa, html = excluded.html, atualizado_em = now();

create or replace function email_campanha_cyber() returns jsonb
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
  ), r as (
    select email, row_number() over (order by (ped > 0) desc, ult desc, email) rn from base
  ), ins as (
    insert into email_fila (email, slug, fluxo, ref, enviar_em, prioridade)
    select email, '7.4-cyber-monday', 'campanha', 'cyber-2026', email_dia(date '2026-11-30', 8) + (rn % 100) * interval '1 minute', 2
      from r
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return jsonb_build_object('cyber', n);
end $$;
revoke all on function email_campanha_cyber() from public, anon, authenticated;

update email_config set valor = (valor::jsonb || '{"2026-11-30": 9000}'::jsonb)::text where chave = 'envio_rampa';

do $do$ declare d text; begin
  d := pg_get_functiondef('email_modelos(text)'::regprocedure);
  if position('7.4-cyber-monday' in d) = 0 then
    d := replace(d, '(''7.3-black-friday'', ''campanha'', 73, ''Black: sex 27/11 8h e sáb 28/11 10h (8.442)''))', '(''7.3-black-friday'', ''campanha'', 73, ''Black: sex 27/11 8h e sáb 28/11 10h (8.442)''),
      (''7.4-cyber-monday'', ''campanha'', 74, ''Cyber Monday: seg 30/11 8h às 9h40 (base inteira)''))');
    execute d;
  end if;
end $do$;

select email_campanha_cyber();
