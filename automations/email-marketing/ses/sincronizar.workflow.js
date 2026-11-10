// n8n "[Email] Sincronizar Shopify e agendar fluxos" (M3em7RCOHKjzJffe), publicado em 10/11/2026. Cron 2 min.
// Credenciais do n8n (Postgres account, Shopify API Token); nenhuma chave no codigo.
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 2 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const cursores = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cursores', parameters: { operation: 'executeQuery', query: "select (select valor from email_config where chave = 'sync_clientes_desde') as cli, (select valor from email_config where chave = 'sync_pedidos_desde') as ped", options: {} }, credentials: PG } });

// 250 clientes por rodada, em ordem de updated_at; o cursor avanca dentro de email_sync_contatos
const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Clientes Shopify', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String){ customers(first:250, sortKey:UPDATED_AT, query:$q){ nodes{ id email firstName createdAt updatedAt numberOfOrders amountSpent{ amount } lastOrder{ createdAt } emailMarketingConsent{ marketingState consentUpdatedAt } } } }', variables: { q: \"updated_at:>='\" + $('Cursores').first().json.cli + \"'\" } }) }}"),
  options: {} }, credentials: SHOP, executeOnce: true } });

const gravarCli = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar clientes', parameters: { operation: 'executeQuery',
  query: expr("{{ 'select email_sync_contatos($j$' + JSON.stringify((($json.data || {}).customers || {}).nodes || []) + '$j$::jsonb) as r' }}"), options: {} }, credentials: PG, executeOnce: true } });

const pedidos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Pedidos Shopify', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String){ orders(first:100, sortKey:UPDATED_AT, query:$q){ nodes{ id name email createdAt updatedAt cancelledAt customer{ id email numberOfOrders } lineItems(first:20){ nodes{ title } } } } }', variables: { q: \"updated_at:>='\" + $('Cursores').first().json.ped + \"' AND financial_status:paid\" } }) }}"),
  options: {} }, credentials: SHOP, executeOnce: true } });

const gravarPed = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar pedidos', parameters: { operation: 'executeQuery',
  query: expr("{{ 'select email_sync_pedidos($j$' + JSON.stringify((($json.data || {}).orders || {}).nodes || []) + '$j$::jsonb) as r' }}"), options: {} }, credentials: PG, executeOnce: true } });

const agendar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Agendar fluxos', parameters: { operation: 'executeQuery', query: 'select email_agendar() as r', options: {} }, credentials: PG, executeOnce: true } });

export default workflow('email-sync', '[Email] Sincronizar Shopify e agendar fluxos')
  .add(cron).to(cursores).to(clientes).to(gravarCli).to(pedidos).to(gravarPed).to(agendar);
