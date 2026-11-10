// n8n "[Email] Sincronizar Shopify e agendar fluxos" (M3em7RCOHKjzJffe), publicado em 10/11/2026. Cron 2 min.
// Credenciais do n8n (Postgres account, Shopify API Token); nenhuma chave no codigo.
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 2 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const cursores = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cursores', parameters: { operation: 'executeQuery', query: "select (select valor from email_config where chave = 'sync_clientes_desde') as cli, (select valor from email_config where chave = 'sync_clientes_after') as cli_after, (select valor from email_config where chave = 'sync_pedidos_desde') as ped, (select valor from email_config where chave = 'sync_pedidos_after') as ped_after", options: {} }, credentials: PG } });

// 250 clientes por rodada: filtro fixo updated_at >= desde + paginacao pelo endCursor (email_sync_cursor)
const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Clientes Shopify', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String,$a:String){ customers(first:250, after:$a, sortKey:UPDATED_AT, query:$q){ pageInfo{ hasNextPage endCursor } nodes{ id email firstName createdAt updatedAt numberOfOrders amountSpent{ amount } lastOrder{ createdAt } emailMarketingConsent{ marketingState consentUpdatedAt } } } }', variables: { q: \"updated_at:>='\" + $('Cursores').first().json.cli + \"'\", a: $('Cursores').first().json.cli_after || null } }) }}"),
  options: {} }, credentials: SHOP, executeOnce: true } });

const gravarCli = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar clientes', parameters: { operation: 'executeQuery',
  query: expr("{{ (() => { const c = (($json.data || {}).customers || {}); const n = JSON.stringify(c.nodes || []); const pi = c.pageInfo || {}; return 'select email_sync_contatos($j$' + n + '$j$::jsonb) as r, email_sync_cursor(\\'clientes\\', ' + (pi.hasNextPage ? 'true' : 'false') + ', $c$' + (pi.endCursor || '') + '$c$, email_sync_maior($j$' + n + '$j$::jsonb)) as cursor'; })() }}"), options: {} }, credentials: PG, executeOnce: true } });

const pedidos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Pedidos Shopify', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String,$a:String){ orders(first:100, after:$a, sortKey:UPDATED_AT, query:$q){ pageInfo{ hasNextPage endCursor } nodes{ id name email createdAt updatedAt cancelledAt totalPriceSet{ shopMoney{ amount } } customer{ id email numberOfOrders } lineItems(first:20){ nodes{ title } } } } }', variables: { q: \"updated_at:>='\" + $('Cursores').first().json.ped + \"' AND financial_status:paid\", a: $('Cursores').first().json.ped_after || null } }) }}"),
  options: {} }, credentials: SHOP, executeOnce: true } });

const gravarPed = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar pedidos', parameters: { operation: 'executeQuery',
  query: expr("{{ (() => { const c = (($json.data || {}).orders || {}); const n = JSON.stringify(c.nodes || []); const pi = c.pageInfo || {}; return 'select email_sync_pedidos($j$' + n + '$j$::jsonb) as r, email_sync_cursor(\\'pedidos\\', ' + (pi.hasNextPage ? 'true' : 'false') + ', $c$' + (pi.endCursor || '') + '$c$, email_sync_maior($j$' + n + '$j$::jsonb)) as cursor'; })() }}"), options: {} }, credentials: PG, executeOnce: true } });

const agendar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Agendar fluxos', parameters: { operation: 'executeQuery', query: 'select email_agendar() as r', options: {} }, credentials: PG, executeOnce: true } });

export default workflow('email-sync', '[Email] Sincronizar Shopify e agendar fluxos')
  .add(cron).to(cursores).to(clientes).to(gravarCli).to(pedidos).to(gravarPed).to(agendar);
