-- Limite global de mensagens proativas no WhatsApp da Serena (21/11/2026, pedido do Jaderson apos o aviso
-- "Sua conta podera ser restringida"). Pico medido: 19 mensagens/minuto (18/11).
--
-- Quem chama: o no "Limite proativo" do "[Serena WhatsApp] Envio Samuel" (nodes/envio-limite-proativo.js), via
-- POST /webhook/wpp-vaga (wpp-vaga.workflow.js), ANTES de cada envio. Nenhum robo precisa mudar.
--   - conversa ativa (a pessoa escreveu para a Serena nos ultimos 15 min), equipe, LID: passa na hora;
--   - o resto (pedido pago/enviado, lembrete, carrinho, comunidade, rastreio, satisfacao...) espera vaga:
--     no maximo wpp_limite_por_minuto (6) envios proativos em 60s, somando todos os robos. Espera no maximo
--     wpp_limite_espera_s (30s; os robos chamam o envio com timeout de 60s) e depois segue mesmo assim.
-- A fila e um advisory lock: um proativo por vez decide, com o contador ja gravado pelo anterior.
-- Kill switch: serena_config.wpp_limite_proativo = 'off'.

create table if not exists wpp_envios_proativos (
  id bigserial primary key,
  criado_em timestamptz not null default clock_timestamp(),
  numero text,
  esperou_ms integer,
  estourou boolean not null default false
);
create index if not exists wpp_envios_proativos_criado_em on wpp_envios_proativos (criado_em);

create or replace function wpp_aguardar_vaga(p_numero text) returns jsonb language plpgsql as $$
declare
  bruto text := coalesce(p_numero, '');
  d text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  nat text := fone_nat(p_numero);
  alt text;
  limite integer;
  espera_max integer;
  ini timestamptz := clock_timestamp();
  n integer;
  ms integer;
begin
  if coalesce((select valor from serena_config where chave = 'wpp_limite_proativo'), 'on') = 'off' then
    return jsonb_build_object('tipo', 'desligado');
  end if;
  if bruto ilike '%@lid%' or left(d, 3) = '000' then return jsonb_build_object('tipo', 'lid'); end if;
  if length(nat) < 10 then return jsonb_build_object('tipo', 'numero_invalido'); end if;
  if d in ('5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555')
     or nat in ('13981885555', '11959275555') then
    return jsonb_build_object('tipo', 'equipe');
  end if;
  -- com e sem o 9 (Brasil)
  alt := case when length(nat) = 11 and substr(nat, 3, 1) = '9' then left(nat, 2) || substr(nat, 4)
              when length(nat) = 10 then left(nat, 2) || '9' || substr(nat, 3)
              else nat end;
  if exists (select 1 from serena_contatos c join serena_mensagens m on m.contato_id = c.id
             where c.telefone in (d, '+' || d, nat, alt, '55' || nat, '55' || alt, '+55' || nat, '+55' || alt)
               and m.papel = 'cliente' and m.criado_em > now() - interval '15 minutes') then
    return jsonb_build_object('tipo', 'conversa');
  end if;

  limite := coalesce(nullif((select valor from serena_config where chave = 'wpp_limite_por_minuto'), '')::integer, 6);
  espera_max := coalesce(nullif((select valor from serena_config where chave = 'wpp_limite_espera_s'), '')::integer, 30);
  perform pg_advisory_xact_lock(hashtext('wpp_limite_proativo'));
  loop
    select count(*) into n from wpp_envios_proativos where criado_em > clock_timestamp() - interval '60 seconds';
    exit when n < limite or clock_timestamp() - ini >= make_interval(secs => espera_max);
    perform pg_sleep(2);
  end loop;
  ms := round(extract(epoch from clock_timestamp() - ini) * 1000);
  insert into wpp_envios_proativos (numero, esperou_ms, estourou) values (d, ms, n >= limite);
  delete from wpp_envios_proativos where criado_em < now() - interval '30 days';
  return jsonb_build_object('tipo', 'proativo', 'esperou_ms', ms, 'estourou', n >= limite);
end $$;

insert into serena_config (chave, valor) values ('wpp_limite_proativo', 'on'), ('wpp_limite_por_minuto', '6'), ('wpp_limite_espera_s', '30')
  on conflict (chave) do nothing;
