-- Correcao de erros obvios de digitacao no dominio do email (10/11/2026). Ex.: vitalinarocha67@gamil.vom bounceou
-- no carrinho; o certo e @gmail.com. ~2% dos emails do checkout tem esse tipo de erro (gamil, gmsil, hormail,
-- gmail.comm, gmail.com.br, yahoo.com.bt...). A mesma regra roda no checkout (site/checkout-email-sugestao.js),
-- onde a pessoa ve "Voce quis dizer ...?" antes de pagar.
-- So mexe em provedor conhecido (gmail, hotmail, outlook, yahoo, icloud) e em final de dominio claramente errado
-- (.vom, .con, .cim...). Dominio desconhecido fica como esta.
create or replace function email_corrigir(p text) returns text
language plpgsql immutable as $$
declare s text := regexp_replace(regexp_replace(replace(lower(trim(coalesce(p, ''))), ',', '.'), '\s+', '', 'g'), '\.{2,}', '.', 'g');
  i int; u text; d text; base text; resto text; prov text; br boolean;
begin
  i := length(s) - strpos(reverse(s), '@') + 1;
  if strpos(s, '@') = 0 or i < 2 then return s; end if;
  u := substr(s, 1, i - 1); d := regexp_replace(substr(s, i + 1), '^\.+|\.+$', '', 'g');
  -- final de dominio errado em qualquer provedor (bol.cim.br -> bol.com.br, x.vom -> x.com)
  d := regexp_replace(d, '\.(cim|vom|xom|cpm|con|coom|comm|cm|clm)(\.br)?$', '.com\2');
  base := split_part(d, '.', 1); resto := substr(d, length(base) + 1);
  prov := case
    when base = 'gmail' or base = any (array['gamil','gmial','gmai','gmal','gmil','gnail','gmsil','gmqil','gmaill','gamail','gemail',
      'gemil','gmaol','gmaim','gxmail','fmail','gmeil','gnsil','gmali','gmaik','gimail','gmaio','gmaul','gmaij','gmaii']) then 'gmail'
    when base = 'hotmail' or base = any (array['hotmial','hotmal','hotmai','hormail','hotmsil','hitmail','htmail','hotmil','hptmail',
      'rotmail','homail','hotamil','hotmaill','hotnail','hotmeil','hoymail','jotmail','hotmaii']) then 'hotmail'
    when base = 'outlook' or base = any (array['outlok','otlook','putlook','outllok','oulook','outloo','outlock','outloook']) then 'outlook'
    when base = 'yahoo' or base = any (array['yaoo','yahho','yhoo','yaho','yahooo','tahoo','yahou']) then 'yahoo'
    when base = 'icloud' or base = any (array['iclod','icoud','iclould','icluod','icloude']) then 'icloud'
  end;
  if prov is null then return u || '@' || d; end if;
  -- provedor conhecido com dominio de outro pais (yahoo.fr, hotmail.co.uk): mantem
  if base = prov and resto ~ '^\.(fr|de|it|es|pt|co\.uk|com\.ar|com\.mx|ca)$' then return u || '@' || d; end if;
  br := resto ~ '\.b[rt]' or resto ~ 'br$';
  return u || '@' || case when prov in ('gmail', 'icloud') then prov || '.com'
                          when br then prov || '.com.br' else prov || '.com' end;
end $$;
