import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Entrega a fila loja_eventos a cada minuto: Klaviyo, aviso no Telegram, WhatsApp (Samuel) e publicação do site.
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada minuto', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });
const pegar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Pegar eventos', parameters: { operation: 'executeQuery', query: 'select id, destino, tipo, chave, dados, criado_em from loja_eventos_pegar(50)', options: {} }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });

// Klaviyo (mesmos nomes de evento da integração da Shopify)
const soKlaviyo = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Klaviyo?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.destino }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'klaviyo' }], combinator: 'and' } } } });
const montarK = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar evento Klaviyo', parameters: { mode: 'runOnceForEachItem', jsCode: `const e = $json, d = e.dados || {};
const body = { data: { type: 'event', attributes: { properties: d.props || {}, time: new Date(e.criado_em).toISOString(), unique_id: e.chave,
  metric: { data: { type: 'metric', attributes: { name: e.tipo } } }, profile: { data: { type: 'profile', attributes: d.perfil || {} } } } } };
if (d.valor != null) body.data.attributes.value = Number(d.valor);
return { json: { id: e.id, body } };` } } });
const enviarK = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Klaviyo', onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://a.klaviyo.com/api/events/', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'revision', value: '2024-10-15' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}'),
  options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 } }, credentials: { httpHeaderAuth: { id: '9yp614suxMd4bzzz', name: 'Klaviyo-API-Key' } } } });
const marcarK = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Klaviyo', parameters: { operation: 'executeQuery', query: 'select loja_eventos_marcar($1::bigint, $2::boolean, $3)', options: { queryReplacement: expr("{{ [ $('Montar evento Klaviyo').item.json.id, $json.statusCode >= 200 && $json.statusCode < 300, String($json.statusCode || '') + ' ' + JSON.stringify($json.body || $json.error || '').slice(0, 300) ] }}") } }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });

// Aviso no Telegram da equipe
const soAviso = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Aviso?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.destino }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'aviso' }], combinator: 'and' } } } });
const telegram = node({ type: 'n8n-nodes-base.telegram', version: 1.2, config: { name: 'Telegram', onError: 'continueRegularOutput', parameters: {
  resource: 'message', operation: 'sendMessage', chatId: '6531084136', text: expr('{{ $json.dados.texto }}'), additionalFields: { appendAttribution: false, disable_web_page_preview: true } },
  credentials: { telegramApi: { id: '5FInpXVy62zrG60P', name: 'Telegram account' } } } });
const marcarT = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar aviso', parameters: { operation: 'executeQuery', query: 'select loja_eventos_marcar($1::bigint, $2::boolean, $3)', options: { queryReplacement: expr("{{ [ $('Aviso?').item.json.id, !$json.error, $json.error ? String($json.error.message || $json.error) : null ] }}") } }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });

// WhatsApp (Samuel / Evolution): código de acesso da Minha conta
const soWpp = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'WhatsApp?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.destino }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'whatsapp' }], combinator: 'and' } } } });
const wpp = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'WhatsApp Samuel', onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/message/sendText/Samuel', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ number: $json.dados.numero, text: $json.dados.texto }) }}'), options: { timeout: 20000 } },
  credentials: { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } } } });
const marcarW = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar WhatsApp', parameters: { operation: 'executeQuery', query: 'select loja_eventos_marcar($1::bigint, $2::boolean, $3)', options: { queryReplacement: expr("{{ [ $('WhatsApp?').item.json.id, !$json.error, $json.error ? String($json.error.message || $json.error) : null ] }}") } }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });

// Publicar o site (uma chamada por rodada, por mais eventos que tenham chegado)
const soPub = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Publicar?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.destino }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'publicar' }], combinator: 'and' } } } });
const hook = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Deploy hook', executeOnce: true, parameters: { operation: 'executeQuery',
  query: "select nullif(valor, '') as hook, (select string_agg(id::text, ',') from loja_eventos where destino = 'publicar' and enviado_em is null) as ids from checkout_config where chave = 'loja_deploy_hook'", options: {} }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });
const disparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Disparar build', parameters: { jsCode: `const { hook, ids } = $input.first().json;
let ok = false, erro = null;
if (!hook) erro = 'sem deploy hook (checkout_config.loja_deploy_hook)';
else { try { await this.helpers.httpRequest({ method: 'POST', url: hook, timeout: 20000 }); ok = true; } catch (e) { erro = String(e.message || e).slice(0, 200); } }
return (ids || '').split(',').filter(Boolean).map(function (id) { return { json: { id: id, ok: ok, erro: erro } }; });` } } });
const marcarP = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar publicação', parameters: { operation: 'executeQuery', query: 'select loja_eventos_marcar($1::bigint, $2::boolean, $3)', options: { queryReplacement: expr("{{ [ $json.id, $json.ok, $json.erro ] }}") } }, credentials: { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } } } });

export default workflow('loja-eventos', 'Loja · Eventos (Klaviyo, avisos, WhatsApp, publicar)')
  .add(cron).to(pegar)
  .to(soKlaviyo.to(montarK.to(enviarK.to(marcarK))))
  .add(pegar).to(soAviso.to(telegram.to(marcarT)))
  .add(pegar).to(soWpp.to(wpp.to(marcarW)))
  .add(pegar).to(soPub.to(hook.to(disparar.to(marcarP))));
