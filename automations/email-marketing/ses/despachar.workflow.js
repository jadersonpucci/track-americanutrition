// n8n "[Email] Despachar fila (SES)", cron 5 min. Ate 150 por rodada, 10 por segundo (limite da conta: 14/s).
// Credenciais do n8n (Postgres account, AWS SES, Shopify API Token).
// v2 (10/11/2026, noite): substitui rkAbBsGIbcznBPjk. O ultimo email do carrinho (6.3) ganha um cupom de 10% unico,
// de uso unico, valido por 24h a partir do envio, criado na Shopify na hora (discountCodeBasicCreate). O link do
// checkout vai com &discount=CODIGO (o checkout proprio aplica sozinho). Se o cupom nao for criado, o email nao sai
// nessa rodada (fica pendente e tenta de novo; na 3a falha vira erro).
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 5 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const proximos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Proximos envios', parameters: { operation: 'executeQuery', query: 'select email_proximos(150) as r', options: {} }, credentials: PG } });

const prep = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar cupons', parameters: { jsCode: `// Um cupom de 10% por email 6.3 (so no modo ativo). Sem nenhum: um item neutro, para o fluxo seguir.
const r = ($input.first().json.r) || {};
if (r.modo !== 'ativo') return [{ json: { fila_id: null, body: JSON.stringify({ query: '{ shop { id } }' }) } }];
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ini = new Date(), fim = new Date(ini.getTime() + 24 * 3600 * 1000);
const out = (r.itens || []).filter(it => it.slug === '6.3-carrinho-ultima-chamada').map(function (it) {
  let c = 'VOLTA10-'; for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
  const d = { title: 'Carrinho 24h ' + c, code: c, startsAt: ini.toISOString(), endsAt: fim.toISOString(), context: { all: 'ALL' },
    customerGets: { value: { percentage: 0.1 }, items: { all: true } }, appliesOncePerCustomer: true, usageLimit: 1,
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true } };
  return { json: { fila_id: it.id, codigo: c, body: JSON.stringify({ query: 'mutation($d: DiscountCodeBasicInput!){ discountCodeBasicCreate(basicCodeDiscount:$d){ codeDiscountNode{ id } userErrors{ field message } } }', variables: { d: d } }) } };
});
return out.length ? out : [{ json: { fila_id: null, body: JSON.stringify({ query: '{ shop { id } }' }) } }];` } } });

const criarCupom = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Criar cupom', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.body }}'), options: {} }, credentials: SHOP, onError: 'continueRegularOutput', alwaysOutputData: true } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar emails', parameters: { jsCode: `// Monta o corpo do SendEmail (SES v2) de cada item vencido da email_fila.
// Modo teste: o SQL ja troca o destinatario pelo simulador da AWS (nao conta na cota, nao chega a ninguem).
const r = ($('Proximos envios').first().json.r) || {};
const teste = r.modo !== 'ativo';
// cupons criados com sucesso (pareados pela ordem com o no Preparar cupons)
const prep = $('Preparar cupons').all().map(x => x.json), res = $('Criar cupom').all().map(x => x.json || {});
const cupom = {};
prep.forEach(function (p, i) { if (!p.fila_id) return; const d = ((res[i] || {}).data || {}).discountCodeBasicCreate || {};
  if (d.codeDiscountNode && !(d.userErrors || []).length) cupom[p.fila_id] = p.codigo; });
const precisa = (it) => it.slug === '6.3-carrinho-ultima-chamada';
const itens = (r.itens || []).filter(it => !precisa(it) || teste || cupom[it.id]).map(function (it) {
  if (!precisa(it)) return it;
  const cod = teste ? 'TESTE10' : cupom[it.id];
  const base = String(it.checkout_url || 'https://www.americanutrition.com');
  const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'discount=' + encodeURIComponent(cod);
  const troca = (t) => String(t || '').split('{{ cupom_codigo }}').join(cod).split('{{ checkout_cupom_url }}').join(url.replace(/&/g, '&amp;'));
  return Object.assign({}, it, { html: troca(it.html), assunto: troca(it.assunto) });
});
// UTM (10/11/2026): links do site ganham utm_source=email, utm_medium=fluxo, utm_campaign=<fluxo>, utm_content=<modelo>.
const comUtm = (html, fluxo, slug) => String(html || '').replace(/href="(https:\\/\\/(?:www\\.)?americanutrition\\.com[^"]*)"/g, function (m, u) {
  if (/utm_source=/.test(u)) return m;
  const amp = u.replace(/&amp;/g, '&');
  const [base, hash] = amp.split('#');
  const q = 'utm_source=email&utm_medium=fluxo&utm_campaign=' + encodeURIComponent(fluxo) + '&utm_content=' + encodeURIComponent(slug);
  const novo = base + (base.indexOf('?') >= 0 ? '&' : '?') + q + (hash ? '#' + hash : '');
  return 'href="' + novo.replace(/&/g, '&amp;') + '"';
});
return itens.map(function (it) {
  const tag = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  return { json: { id: it.id, teste: teste, body: JSON.stringify({
    FromEmailAddress: 'America Nutrition <contato@americanutrition.com>',
    ReplyToAddresses: ['contato@americanutrition.com'],
    Destination: { ToAddresses: [it.para] },
    ConfigurationSetName: 'an-marketing',
    EmailTags: [{ Name: 'modelo', Value: tag(it.slug) }, { Name: 'fluxo', Value: tag(it.fluxo) }, { Name: 'fila', Value: String(it.id) }],
    Content: { Simple: {
      Subject: { Data: (teste ? '[TESTE] ' : '') + it.assunto, Charset: 'UTF-8' },
      Body: { Html: { Data: comUtm(it.html, it.fluxo, it.slug), Charset: 'UTF-8' } },
      Headers: [
        { Name: 'List-Unsubscribe', Value: '<' + it.link + '>' },
        { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }
      ]
    } }
  }) } };
});` } } });

const ses = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'SES Enviar', parameters: { method: 'POST', url: 'https://email.sa-east-1.amazonaws.com/v2/email/outbound-emails', authentication: 'predefinedCredentialType', nodeCredentialType: 'aws', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.body }}'),
  options: { batching: { batch: { batchSize: 10, batchInterval: 1000 } }, response: { response: { neverError: true, fullResponse: true } } } },
  credentials: { aws: { id: 'p3jx2hHcCCeC3f6j', name: 'AWS SES' } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const base = $('Montar emails').all();
const out = $input.all().map(function (r, i) {
  const b = base[i] ? base[i].json : {};
  const st = Number(r.json.statusCode || 0);
  let corpo = r.json.body; if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) {} }
  const ok = st >= 200 && st < 300;
  return { id: b.id, ok: ok, teste: !!b.teste, message_id: ok && corpo ? corpo.MessageId : null, erro: ok ? null : (st + ' ' + JSON.stringify(corpo || '').slice(0, 250)) };
});
// emails 6.3 cujo cupom nao foi criado: nao sairam; voltam para a fila (email_marcar conta a tentativa)
const enviados = {}; base.forEach(x => { enviados[x.json.id] = 1; });
$('Preparar cupons').all().forEach(function (p) { const f = p.json.fila_id; if (f && !enviados[f]) out.push({ id: f, ok: false, teste: false, message_id: null, erro: 'cupom nao criado na Shopify' }); });
return [{ json: { lista: out, ok: out.filter(x => x.ok).length, falhas: out.filter(x => !x.ok).length } }];` } } });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar na fila', parameters: { operation: 'executeQuery', query: expr("{{ 'select email_marcar($j$' + JSON.stringify($json.lista) + '$j$::jsonb) as r' }}"), options: {} }, credentials: PG } });

export default workflow('email-despachar-v2', '[Email] Despachar fila (SES)')
  .add(cron).to(proximos).to(prep).to(criarCupom).to(montar).to(ses).to(resultado).to(marcar);
