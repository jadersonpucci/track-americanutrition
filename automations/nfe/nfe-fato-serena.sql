-- 02/11/2026: nota autorizada vira um fato no contato do cliente (serena_fatos), para a Serena enviar o PDF
-- quando o cliente pedir a nota fiscal. O contato e achado pelo telefone da nota (DDD + 8 ultimos digitos).
create or replace function nfe_fato_serena() returns trigger language plpgsql as $f$
declare
  tel text := regexp_replace(coalesce(new.payload->>'telefone_destinatario', ''), '\D', '', 'g');
  tn text;
begin
  if new.status <> 'autorizado' or new.danfe_url is null or length(tel) < 10 then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'autorizado' and old.danfe_url is not distinct from new.danfe_url then return new; end if;
  tn := left(right(tel, 11), 2) || right(tel, 8);
  insert into serena_fatos (contato_id, chave, valor, origem, atualizado_em)
  select c.id, 'nota fiscal ' || new.pedido,
    'Pedido ' || new.pedido || ': NF-e ' || coalesce(new.numero, '?') || ' (serie ' || coalesce(new.serie, '?') || ') emitida em '
      || to_char(coalesce(new.atualizado_em, now()) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      || '. Envie SOMENTE se o cliente pedir a nota fiscal deste pedido: uma frase curta e, na ultima linha, este link (o sistema troca pelo PDF): '
      || new.danfe_url,
    'sistema', now()
  from serena_contatos c
  where left(right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 11), 2) || right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = tn
  on conflict (contato_id, chave) do update set valor = excluded.valor, atualizado_em = now();
  return new;
end $f$;
drop trigger if exists trg_nfe_fato_serena on nfe_emissoes;
create trigger trg_nfe_fato_serena after insert or update of status, danfe_url on nfe_emissoes for each row execute function nfe_fato_serena();
