-- Eventos do Amazon SES (configuration set an-marketing -> SNS -> n8n "[Email] Eventos SES"). 05/11/2026.
-- Regras de bloqueio:
--   bounce Permanent (endereco nao existe)          -> status 'bounce'
--   3 bounces Transient (caixa cheia etc.) em 30 dias -> status 'bounce'
--   complaint (marcou como spam)                     -> status 'reclamacao' (e o n8n descadastra na Shopify)
-- delivery, open, click, reject, rendering_failure, delivery_delay: so historico.
-- A supressao da conta no SES (BOUNCE e COMPLAINT) continua ligada como segunda barreira.

create index if not exists email_eventos_tipo_idx on email_eventos (tipo, criado_em);

create or replace function email_registrar_evento(p_email text, p_tipo text, p_detalhe jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_antes text;
  v_novo text;
  v_transitorios int;
begin
  if v_email = '' or p_tipo is null then
    return jsonb_build_object('ok', false);
  end if;

  insert into email_eventos (email, tipo, detalhe) values (v_email, p_tipo, p_detalhe);

  select status into v_antes from email_contatos where email = v_email;

  if p_tipo = 'complaint' then
    v_novo := 'reclamacao';
  elsif p_tipo = 'bounce' and coalesce(p_detalhe->>'bounceType', '') = 'Permanent' then
    v_novo := 'bounce';
  elsif p_tipo = 'bounce' then
    select count(*) into v_transitorios from email_eventos
     where email = v_email and tipo = 'bounce' and criado_em > now() - interval '30 days';
    if v_transitorios >= 3 then v_novo := 'bounce'; end if;
  end if;

  -- reclamacao vale mais que bounce; nao rebaixa quem ja reclamou
  if v_novo is not null and coalesce(v_antes, '') <> 'reclamacao' and coalesce(v_antes, '') <> v_novo then
    insert into email_contatos (email, status, motivo, origem, descadastrado_em, atualizado_em)
    values (v_email, v_novo, p_tipo, 'ses', now(), now())
    on conflict (email) do update set status = excluded.status, motivo = excluded.motivo,
      origem = 'ses', descadastrado_em = now(), atualizado_em = now();
    return jsonb_build_object('ok', true, 'email', v_email, 'status', v_novo, 'mudou', true);
  end if;

  return jsonb_build_object('ok', true, 'email', v_email, 'status', coalesce(v_antes, 'inscrito'), 'mudou', false);
end $$;

revoke all on function email_registrar_evento(text, text, jsonb) from public, anon, authenticated;
grant execute on function email_registrar_evento(text, text, jsonb) to postgres, service_role;
