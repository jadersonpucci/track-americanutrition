// [Brindes] Brinde pendente -> pedido de bonificacao (28/11/2026, pedido do Jaderson)
// Caso que originou: cliente comprou 3 frascos no Esquenta e a Black ficou mais barata; combinamos 1 ImunoFosfo 90 de
// presente no proximo pedido. Para nao passar batido, o brinde e marcado no CLIENTE da Shopify com a tag
//   "BRINDE PENDENTE: <qtd> <produto>"     ex.: "BRINDE PENDENTE: 1 ImunoFosfo 90"
// e este fluxo, a cada 15 min, procura pedidos PAGOS atualizados nas ultimas 3 h de clientes com essa tag. Para cada um:
//   1. cria um pedido de R$ 0 (rascunho com 100% de desconto, frete R$ 0, CPF do pedido, mesmo endereco) com a tag
//      BONIFICACAO: a NF-e sai como remessa em bonificacao (automations/nfe/README.md, "Reenvio ou brinde sem custo");
//   2. marca o pedido de venda com "BRINDE INCLUIDO: <pedido do brinde>" e o pedido do brinde com "BRINDE DE: <venda>",
//      para a separacao mandar os dois juntos;
//   3. troca a tag do cliente para "BRINDE ENVIADO: ..." (nao repete);
//   4. avisa a equipe no Telegram (serena-alerta).
// Workflow n8n JCUNAiZTB65Mx9eH (publicado em 28/11/2026). Testado com pedido simulado (para no IF 'De verdade?') e
// rascunho real criado e apagado (#D4202, R$ 0). A data da busca vai entre aspas: sem elas a Shopify corta no ':' e usa o dia todo.
// Produto que nao esta no mapa PRODUTOS: so avisa no Telegram (1x por dia por pedido) e nao cria nada.
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 15 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } } });

const buscar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Buscar pedidos pagos', credentials: SHOP, parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String){ orders(first:100, sortKey:UPDATED_AT, reverse:true, query:$q){ nodes{ id name createdAt cancelledAt tags email phone customer{ id displayName tags } shippingAddress{ firstName lastName address1 address2 city provinceCode zip phone } customAttributes{ key value } } } }', variables: { q: 'financial_status:paid -tag:BONIFICACAO updated_at:>=\"' + new Date(Date.now() - 3 * 3600000).toISOString() + '\"' } }) }}"), options: { timeout: 30000 } } } });

const filtrar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Filtrar', parameters: { mode: 'runOnceForAllItems', jsCode: `
// Mapa nome do brinde (minusculo, sem acento) -> variant id da Shopify. Para brinde novo, acrescentar aqui.
const PRODUTOS = { 'imunofosfo 90': '44436756234412' };
const sem = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
const r = ($input.first().json || {});
const pedidos = (((r.data || {}).orders || {}).nodes) || [];
const out = [];
for (const o of pedidos) {
  if (!o || o.cancelledAt || !o.customer) continue;
  if ((o.tags || []).some((t) => /^BRINDE INCLUIDO/i.test(t))) continue;
  const tagC = (o.customer.tags || []).find((t) => /^BRINDE PENDENTE:/i.test(t));
  if (!tagC) continue;
  const m = tagC.match(/^BRINDE PENDENTE:\\s*(\\d+)\\s+(.+)$/i);
  const qtd = m ? Math.max(1, Math.min(5, parseInt(m[1], 10))) : 0;
  const vid = m ? PRODUTOS[sem(m[2])] : null;
  if (!vid) {
    try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-alerta', json: true, timeout: 8000,
      body: { chave: 'brinde-' + o.name, minutos: 1440, texto: '🎁 Brinde pendente sem produto conhecido: cliente ' + o.customer.displayName + ', pedido ' + o.name + ', tag "' + tagC + '". Incluir o brinde a mao.' } }); } catch (e) {}
    continue;
  }
  const at = (k) => { const a = (o.customAttributes || []).find((x) => String(x.key).toLowerCase() === k); return a ? String(a.value || '') : ''; };
  const cpf = at('cpf');
  const s = o.shippingAddress || {};
  const draft = {
    email: o.email || undefined,
    phone: o.phone || s.phone || undefined,
    note: 'BRINDE: ' + tagC.replace(/^BRINDE PENDENTE:\\s*/i, '') + '. Enviar JUNTO com o pedido ' + o.name + ' (motivo na nota do cliente).',
    tags: ['BONIFICACAO', 'BRINDE', 'BRINDE DE: ' + o.name],
    lineItems: [{ variantId: 'gid://shopify/ProductVariant/' + vid, quantity: qtd }],
    appliedDiscount: { valueType: 'PERCENTAGE', value: 100, title: 'Brinde', description: 'Brinde enviado junto com ' + o.name },
    shippingLine: { title: 'Envio junto com ' + o.name, priceWithCurrency: { amount: '0.00', currencyCode: 'BRL' } },
    shippingAddress: { firstName: s.firstName, lastName: s.lastName, address1: s.address1, address2: s.address2, city: s.city, province: s.provinceCode, zip: s.zip, country: 'Brazil', phone: s.phone || undefined }
  };
  if (cpf) draft.localizationExtensions = [{ key: 'TAX_CREDENTIAL_BR', value: cpf }];
  out.push({ json: { teste: /TESTE/.test(String(o.id)), venda_id: o.id, venda: o.name, cliente_id: o.customer.id, cliente: o.customer.displayName, tag_cliente: tagC, brinde: tagC.replace(/^BRINDE PENDENTE:\\s*/i, ''), draft } });
}
return out;
` } } });

const seguir = ifElse({ version: 2.2, config: { name: 'De verdade?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ id: 'c1', leftValue: '={{ $json.teste }}', rightValue: false, operator: { type: 'boolean', operation: 'false', singleValue: true } }], combinator: 'and' }, options: { looseTypeValidation: true } } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Criar rascunho', credentials: SHOP, parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'mutation($input: DraftOrderInput!){ draftOrderCreate(input:$input){ draftOrder{ id name totalPrice } userErrors{ field message } } }', variables: { input: $json.draft } }) }}"), options: { timeout: 30000 } } } });

const finalizar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Finalizar', credentials: SHOP, parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'mutation($id: ID!){ draftOrderComplete(id:$id, paymentPending:false){ draftOrder{ order{ id name } } userErrors{ field message } } }', variables: { id: (($json.data || {}).draftOrderCreate || {}).draftOrder ? $json.data.draftOrderCreate.draftOrder.id : 'gid://shopify/DraftOrder/0' } }) }}"), options: { timeout: 30000 } } } });

const marcar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Marcar tags', credentials: SHOP, parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ (() => { const f = $('Filtrar').item.json; const ord = ((($json.data || {}).draftOrderComplete || {}).draftOrder || {}).order || {}; if (!ord.name) return JSON.stringify({ query: '{ shop { id } }' }); return JSON.stringify({ query: 'mutation($v:ID!,$c:ID!,$tv:[String!]!,$rem:[String!]!,$tc:[String!]!){ a: tagsAdd(id:$v, tags:$tv){ userErrors{ message } } b: tagsRemove(id:$c, tags:$rem){ userErrors{ message } } c: tagsAdd(id:$c, tags:$tc){ userErrors{ message } } }', variables: { v: f.venda_id, c: f.cliente_id, tv: ['BRINDE INCLUIDO: ' + (ord.name || 'ver pedido BONIFICACAO')], rem: [f.tag_cliente], tc: ['BRINDE ENVIADO: ' + f.brinde + ' (' + (ord.name || '?') + ', junto com ' + f.venda + ')'] } }); })() }}"), options: { timeout: 30000 } } } });

const avisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisar equipe', parameters: { mode: 'runOnceForEachItem', jsCode: `
const f = $('Filtrar').item.json;
const ord = ((($('Finalizar').item.json.data || {}).draftOrderComplete || {}).draftOrder || {}).order || {};
const erros = JSON.stringify([$('Criar rascunho').item.json, $('Finalizar').item.json, $json].map((x) => JSON.stringify(x).match(/"message":"[^"]+"/g)).filter(Boolean));
const ok = !!ord.name;
const texto = ok
  ? '🎁 Brinde incluido: ' + f.brinde + ' para ' + f.cliente + '. Pedido do brinde ' + ord.name + ' (R$ 0, BONIFICACAO). Mandar JUNTO com o pedido ' + f.venda + ' (mesma caixa).'
  : '⚠️ Brinde pendente de ' + f.cliente + ' (pedido ' + f.venda + '): nao consegui criar o pedido do brinde. Incluir a mao. Erros: ' + erros.slice(0, 500);
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-alerta', json: true, timeout: 8000, body: { chave: (ok ? 'brinde-ok-' : 'brinde-erro-') + f.venda, minutos: ok ? 1 : 1440, texto } }); } catch (e) {}
return { json: { ok, venda: f.venda, brinde_pedido: ord.name || null, texto } };
` } } });

export default workflow('brinde-pendente', '[Brindes] Brinde pendente -> pedido de bonificacao')
  .add(cron).to(buscar).to(filtrar).to(seguir.onTrue(criar.to(finalizar).to(marcar).to(avisar)));
