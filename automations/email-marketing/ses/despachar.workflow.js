// n8n "[Email] Despachar fila (SES)" (rkAbBsGIbcznBPjk), publicado em 10/11/2026. Cron 5 min.
// Ate 150 por rodada, 10 por segundo (limite da conta: 14/s). Credenciais do n8n (Postgres account, AWS SES).
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 5 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const proximos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Proximos envios', parameters: { operation: 'executeQuery', query: 'select email_proximos(150) as r', options: {} }, credentials: PG } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar emails', parameters: { jsCode: `// Monta o corpo do SendEmail (SES v2) de cada item vencido da email_fila.
// Modo teste: o SQL ja troca o destinatario pelo simulador da AWS (nao conta na cota, nao chega a ninguem).
const r = ($input.first().json.r) || {};
const itens = r.itens || [];
const teste = r.modo !== 'ativo';
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
return [{ json: { lista: out, ok: out.filter(x => x.ok).length, falhas: out.filter(x => !x.ok).length } }];` } } });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar na fila', parameters: { operation: 'executeQuery', query: expr("{{ 'select email_marcar($j$' + JSON.stringify($json.lista) + '$j$::jsonb) as r' }}"), options: {} }, credentials: PG } });

export default workflow('email-despachar', '[Email] Despachar fila (SES)')
  .add(cron).to(proximos).to(montar).to(ses).to(resultado).to(marcar);
