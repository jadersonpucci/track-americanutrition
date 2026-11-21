-- Opt-out "SAIR" no WhatsApp da Serena (21/11/2026, aprovado pelo Jaderson). Parte do item 3 da protecao do numero.
--
-- 1. Quem manda SAIR (ou PARAR / STOP / SAIR DA LISTA) vira opt-out: gatilho em serena_mensagens grava em
--    serena_wpp_optout e marca disparos_wpp.optout (que o Dispatcher e a reposicao ja respeitam).
-- 2. wpp_aguardar_vaga (limite-proativo.sql) devolve tipo 'optout' para mensagem proativa a quem saiu; o no
--    "Limite proativo" do Envio Samuel nao envia e responde { ok: false, erro: 'optout_sair' }.
--    Conversa continua normal: se a pessoa escrever de novo, a Serena responde.
-- 3. A Serena responde ao SAIR com o texto aprovado (adendo de 21/11 em serena_config.system_prompt).
-- 4. Mensagem proativa (nao transacional, nao rastreio/retirada, quando a ultima mensagem da conversa nao e do
--    cliente) ganha no fim: "_Se preferir não receber mensagens por aqui, é só responder SAIR._"
-- Tirar alguem do opt-out: delete from serena_wpp_optout where telefone = '55...'; e
-- update disparos_wpp set optout = false where msg_id = 'optout_55...';

create table if not exists serena_wpp_optout (
  telefone text primary key,
  contato_id uuid,
  texto text,
  criado_em timestamptz not null default now()
);

create or replace function serena_texto_sair(t text) returns boolean language sql immutable as $$
  select upper(regexp_replace(coalesce(t, ''), '[^[:alpha:]]', '', 'g')) in ('SAIR', 'PARAR', 'STOP', 'SAIRDALISTA')
$$;

create or replace function serena_registrar_optout() returns trigger language plpgsql as $$
declare tel text;
begin
  if new.papel = 'cliente' and coalesce(new.canal, 'whatsapp') = 'whatsapp' and serena_texto_sair(new.texto) then
    select regexp_replace(coalesce(telefone, ''), '\D', '', 'g') into tel from serena_contatos where id = new.contato_id;
    if length(coalesce(tel, '')) >= 10 then
      insert into serena_wpp_optout (telefone, contato_id, texto) values (tel, new.contato_id, left(new.texto, 100))
        on conflict (telefone) do update set criado_em = now(), texto = excluded.texto;
      begin
        insert into disparos_wpp (msg_id, numero, origem, enviado_em, hora_brt, optout, optout_em, optout_texto)
          values ('optout_' || tel, tel, 'optout_sair', now(), extract(hour from now() at time zone 'America/Sao_Paulo')::smallint,
                  true, now(), left(new.texto, 100))
          on conflict (msg_id) do update set optout = true, optout_em = now();
      exception when others then null;
      end;
    end if;
  end if;
  return new;
exception when others then
  return new;  -- nunca atrapalha a gravacao da mensagem
end $$;

drop trigger if exists trg_serena_optout on serena_mensagens;
create trigger trg_serena_optout after insert on serena_mensagens
  for each row execute function serena_registrar_optout();

-- quem ja tinha pedido para parar antes do gatilho
insert into serena_wpp_optout (telefone, contato_id, texto, criado_em)
select distinct on (regexp_replace(c.telefone, '\D', '', 'g')) regexp_replace(c.telefone, '\D', '', 'g'), c.id, left(m.texto, 100), m.criado_em
  from serena_mensagens m join serena_contatos c on c.id = m.contato_id
 where m.papel = 'cliente' and coalesce(m.canal, 'whatsapp') = 'whatsapp' and serena_texto_sair(m.texto)
   and length(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 10
 order by regexp_replace(c.telefone, '\D', '', 'g'), m.criado_em desc
on conflict (telefone) do nothing;

insert into disparos_wpp (msg_id, numero, origem, enviado_em, hora_brt, optout, optout_em, optout_texto)
select 'optout_' || o.telefone, o.telefone, 'optout_sair', o.criado_em, extract(hour from o.criado_em at time zone 'America/Sao_Paulo')::smallint,
       true, o.criado_em, o.texto
  from serena_wpp_optout o
on conflict (msg_id) do update set optout = true;
