-- Painel do email: lista dos modelos com o fluxo e quando cada um sai, e o HTML de cada um para a previa. 10/11/2026.
-- v2: modelos novos (carrinho, entrega, recompra) com variaveis; a previa usa os dados do ultimo envio do modelo ou o exemplo.
create or replace function email_modelos(p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p_token is distinct from (select valor from email_config where chave = 'painel_token') then '[]'::jsonb
  else coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'nome', t.nome, 'fluxo', m.fluxo, 'ordem', m.ordem,
      'quando', m.quando,
      'assunto', email_preencher(regexp_replace(t.assunto, '\{\{\s*nome\s*\}\}', 'Maria', 'g'), t.exemplo),
      'previa', regexp_replace(coalesce(t.previa, ''), '\{\{\s*nome\s*\}\}', 'Maria', 'g'),
      'atualizado_em', t.atualizado_em) order by m.ordem)
    from email_templates t
    join (values
      ('1.1-boas-vindas-cupom', 'boas_vindas', 11, 'Na hora da inscrição'),
      ('1.3-boas-vindas-como-age', 'boas_vindas', 13, '1 dia depois'),
      ('1.4-boas-vindas-depoimentos', 'boas_vindas', 14, '3 dias depois'),
      ('6.1-carrinho-itens', 'carrinho', 21, '1 hora após abandonar'),
      ('6.2-carrinho-duvidas', 'carrinho', 22, '1 dia após abandonar'),
      ('6.3-carrinho-ultima-chamada', 'carrinho', 23, '3 dias após abandonar'),
      ('2.1-pos-entrega-leia-antes', 'pos_compra', 31, 'Quando o pedido é entregue'),
      ('2.2-pos-entrega-complemento', 'pos_compra', 32, '10 dias após a entrega'),
      ('2.3-pos-entrega-avaliacao', 'pos_compra', 33, '15 dias após a entrega'),
      ('3.1-recompra-acabando', 'recompra', 41, 'Alguns dias antes de acabar (calculado)'),
      ('3.2-recompra-acabou', 'recompra', 42, '3 dias depois de acabar'),
      ('5.1-cliente-vip', 'vip', 51, '3 dias após o 3º pedido'),
      ('4.1-navegacao-abandonada', 'navegacao', 61, 'Ainda no Klaviyo')) m(slug, fluxo, ordem, quando) on m.slug = t.slug), '[]'::jsonb) end
$$;

create or replace function email_modelo_html(p_token text, p_slug text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when p_token is distinct from (select valor from email_config where chave = 'painel_token') then '<p>acesso negado</p>'
  else coalesce((select email_preencher(regexp_replace(regexp_replace(t.html, '\{\{\s*nome\s*\}\}', 'Maria', 'g'),
      '\{\{\s*link_descadastro\s*\}\}', '#', 'g'),
      coalesce((select f.dados from email_fila f where f.slug = t.slug and f.dados <> '{}'::jsonb order by f.id desc limit 1), t.exemplo))
      from email_templates t where t.slug = p_slug), '<p>modelo não encontrado</p>') end
$$;

revoke all on function email_modelos(text), email_modelo_html(text, text) from public, anon, authenticated;
grant execute on function email_modelos(text), email_modelo_html(text, text) to postgres, service_role;

-- exemplos para a previa (pedido com 2 ImunoFosfo 90 + 1 Omega entregue hoje; carrinho com os mesmos itens)
update email_templates set exemplo = (select d->'pos' from (select email_dados_pedido('[{"titulo":"ImunoFosfo","variante":"Tradicionais / 90 Caps","variant_id":"44436756234412","qtd":2},{"titulo":"Omega 3 - Ultra Pure Fish Oil - Com Vitamina E","variante":"Default Title","variant_id":"43843399712940","qtd":1}]'::jsonb, now(), '', '') d) z)
 where slug = '2.1-pos-entrega-leia-antes';
update email_templates set exemplo = (select d->'pos' from (select email_dados_pedido('[{"titulo":"ImunoFosfo","variante":"Tradicionais / 90 Caps","variant_id":"44436756234412","qtd":2}]'::jsonb, now(), '', '') d) z)
 where slug in ('2.2-pos-entrega-complemento', '2.3-pos-entrega-avaliacao');
update email_templates set exemplo = (select d->'rec' from (select email_dados_pedido('[{"titulo":"ImunoFosfo","variante":"Tradicionais / 90 Caps","variant_id":"44436756234412","qtd":2},{"titulo":"Omega 3 - Ultra Pure Fish Oil - Com Vitamina E","variante":"Default Title","variant_id":"43843399712940","qtd":1}]'::jsonb, now() - interval '24 days', '', '') d) z)
 where slug in ('3.1-recompra-acabando', '3.2-recompra-acabou');
update email_templates set exemplo = email_dados_carrinho(row(0, 'maria@exemplo.com', null, 'Maria', null, false, null, null,
   '[{"variant_id":"44436756234412","name":"ImunoFosfo","qty":2,"unit":327},{"variant_id":"43843399712940","name":"Omega 3 - Ultra Pure Fish Oil - Com Vitamina E","qty":1,"unit":77}]',
   731, 0, 731, 'https://checkout.americanutrition.com/?items=44436756234412%3A2%2C43843399712940%3A1', 'abandonado', now(), now(), null, now(), now(),
   true, false, null, null, null, null)::carrinhos_abandonados)
 where slug like '6.%';
