-- Painel do email: lista dos modelos com o fluxo e quando cada um sai, e o HTML de cada um para a previa. 10/11/2026.
create or replace function email_modelos(p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p_token is distinct from (select valor from email_config where chave = 'painel_token') then '[]'::jsonb
  else coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'nome', t.nome, 'fluxo', m.fluxo, 'ordem', m.ordem,
      'quando', m.quando,
      'assunto', regexp_replace(t.assunto, '\{\{\s*nome\s*\}\}', 'Maria', 'g'),
      'previa', regexp_replace(coalesce(t.previa, ''), '\{\{\s*nome\s*\}\}', 'Maria', 'g'),
      'atualizado_em', t.atualizado_em) order by m.ordem)
    from email_templates t
    join (values
      ('1.1-boas-vindas-cupom', 'boas_vindas', 11, 'Na hora da inscrição'),
      ('1.2-boas-vindas-comunidade', 'boas_vindas', 12, '1 hora depois'),
      ('1.3-boas-vindas-como-age', 'boas_vindas', 13, '1 dia depois'),
      ('1.4-boas-vindas-depoimentos', 'boas_vindas', 14, '2 dias depois'),
      ('2.1-pos-compra-guia-de-uso', 'pos_compra', 21, '2 dias após o pedido'),
      ('2.2-pos-compra-comunidade', 'pos_compra', 22, '4 dias após o pedido'),
      ('2.3-pos-compra-historia-carla', 'pos_compra', 23, '8 dias após o pedido'),
      ('2.4-pos-compra-omega3', 'pos_compra', 24, '12 dias após o pedido'),
      ('2.5-pos-compra-avaliacao', 'pos_compra', 25, '18 dias após o pedido'),
      ('2.6-pos-compra-4-semanas', 'pos_compra', 26, '33 dias após o pedido'),
      ('3.1-recompra-imunofosfo', 'recompra', 31, '22 dias após comprar ImunoFosfo'),
      ('4.1-navegacao-abandonada', 'navegacao', 41, 'Ainda no Klaviyo'),
      ('5.1-cliente-vip', 'vip', 51, 'No 3º pedido')) m(slug, fluxo, ordem, quando) on m.slug = t.slug), '[]'::jsonb) end
$$;

create or replace function email_modelo_html(p_token text, p_slug text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when p_token is distinct from (select valor from email_config where chave = 'painel_token') then '<p>acesso negado</p>'
  else coalesce((select regexp_replace(regexp_replace(t.html, '\{\{\s*nome\s*\}\}', 'Maria', 'g'),
      '\{\{\s*link_descadastro\s*\}\}', '#', 'g') from email_templates t where t.slug = p_slug), '<p>modelo não encontrado</p>') end
$$;

revoke all on function email_modelos(text), email_modelo_html(text, text) from public, anon, authenticated;
grant execute on function email_modelos(text), email_modelo_html(text, text) to postgres, service_role;
