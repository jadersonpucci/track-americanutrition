-- 30/10/2026: o AN Links nao tem arte de previa para o ImunoFosfo Vegano e usava a do frasco normal.
-- Link de checkout so com o vegano (variante 44436756267180) ganha a arte vegana na criacao.
create or replace function anl_links_og_vegano() returns trigger language plpgsql as $f$
begin
  if new.og_image is null and new.destino ~ 'checkout\.americanutrition\.com/.*items=44436756267180(%3A|:)[0-9]+(%3A|:)?[0-9]*(&|$)' then
    new.og_image := 'https://cdn.americanutrition.com/imagens/og/og-checkout-imunofosfo-vegano.jpg';
    new.og_title := coalesce(new.og_title, 'ImunoFosfo Vegano — Finalize sua compra');
    new.og_description := coalesce(new.og_description, 'Seu pedido esta te esperando. Pagamento rapido e 100% seguro via Pix, cartao ou boleto.');
  end if;
  return new;
end $f$;
drop trigger if exists trg_anl_links_og_vegano on anl_links;
create trigger trg_anl_links_og_vegano before insert on anl_links for each row execute function anl_links_og_vegano();
