-- WhatsApp transacional so com opt-in (21/11/2026, pedido do Jaderson apos o aviso "Sua conta podera ser restringida"
-- no numero da Serena). Pedido pago / enviado / entregue so saem pelo WhatsApp para quem:
--   - marcou "WhatsApp opt-in = sim" no checkout; ou
--   - marcou "nao", mas escreveu para a Serena pelo WhatsApp nas ultimas 24h; ou
--   - pedido sem o atributo (draft order da Serena, checkout-us) e ja escreveu alguma vez para a Serena pelo WhatsApp.
-- O resto recebe so o e-mail (que nao depende de scheduled_messages).
--
-- Como funciona: este gatilho segura toda mensagem desses 3 templates que vira 'pendente' sem a marca
-- template_params.optin_ok, trocando o status para 'checar_optin'. O workflow
-- "[Transacional] Checar opt-in WhatsApp" (checar-optin.workflow.js, cron 1 min) consulta o atributo do pedido na Shopify
-- e a conversa, grava optin_ok (o motivo) e devolve para 'pendente' (o Dispatcher envia) ou marca 'sem_optin'.
-- O "pedido enviado" passa pelo gatilho quando o "Liberar Pedido Enviado" muda de aguardando_postagem para pendente.
-- Kill switch: serena_config.wpp_optin_filtro = 'off' (volta ao comportamento antigo; o que ja esta retido o
-- workflow continua decidindo).

-- numero nacional so com digitos (tira o 55 do Brasil), para comparar telefone com e sem DDI
create or replace function fone_nat(t text) returns text language sql immutable as $$
  select case when length(d) >= 12 and left(d, 2) = '55' then substr(d, 3) else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

create or replace function sm_reter_sem_optin() returns trigger language plpgsql as $$
begin
  if new.status = 'pendente'
     and new.template_name in ('pedido_pago_confirmado', 'pedido_enviado', 'pedido_entregue')
     and coalesce(new.template_params->>'optin_ok', '') = ''
     and coalesce((select valor from serena_config where chave = 'wpp_optin_filtro'), 'on') <> 'off'
  then
    new.status := 'checar_optin';
  end if;
  return new;
end $$;

drop trigger if exists trg_sm_reter_sem_optin on scheduled_messages;
create trigger trg_sm_reter_sem_optin
  before insert or update of status on scheduled_messages
  for each row execute function sm_reter_sem_optin();

insert into serena_config (chave, valor) values ('wpp_optin_filtro', 'on')
  on conflict (chave) do nothing;
