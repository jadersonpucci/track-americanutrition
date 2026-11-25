// n8n "[Email] Marcar vendas na Shopify", 12/11/2026. Cron 10 min.
// Pedido pago atribuido a um email nosso (regra do painel, ver marcar-vendas.sql) ganha as tags
// EMAIL, email:clique|abertura e email:<modelo>. Cada pedido e marcado uma vez (email_pedidos.tag_email).
// Credenciais do n8n (Postgres account, Shopify API Token); nenhuma chave no codigo.
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 10 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } } });

const candidatos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Vendas do email sem tag', parameters: { operation: 'executeQuery',
  query: 'select pedido_id, numero, tipo, slug, tags from email_vendas_para_marcar()', options: {} }, credentials: PG } });

const tag = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Tag na Shopify', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ node{ id } userErrors{ field message } } }', variables: { id: $json.pedido_id, tags: $json.tags } }) }}"),
  options: {} }, credentials: SHOP, onError: 'continueRegularOutput' } });

// so registra quando a Shopify aceitou; com erro, o pedido volta na proxima rodada
const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', parameters: { operation: 'executeQuery',
  query: expr("{{ (() => { const r = ($json.data || {}).tagsAdd; const ok = r && r.node && !(r.userErrors || []).length; const c = $('Vendas do email sem tag').item.json; return ok ? \"select email_venda_marcada('\" + String(c.pedido_id).replace(/'/g, \"''\") + \"', '\" + c.tags.join(',').replace(/'/g, \"''\") + \"') as r\" : 'select 0 as r'; })() }}"),
  options: {} }, credentials: PG } });

export default workflow('email-marcar-vendas', '[Email] Marcar vendas na Shopify')
  .add(cron).to(candidatos).to(tag).to(registrar);
