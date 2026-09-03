// n8n Workflow SDK — [Serena WhatsApp] Watchdog -> Telegram (id sYBUj3v8LGAtZYR8)
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const EVO = { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const estado = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Estado do Samuel', parameters: {
  method: 'GET', url: 'http://evolution-api-aru6-api-1:8080/instance/connectionState/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  options: { response: { response: { neverError: true } }, timeout: 20000 } }, credentials: EVO, onError: 'continueRegularOutput' },
  output: [{ instance: { instanceName: 'Samuel', state: 'open' } }] });

// Lista clientes cuja ultima mensagem e deles ha mais de wpp_alerta_min (pausada = ia_pausada ou pausa do WhatsApp),
// mais as atribuicoes abertas (handoff) sem resposta humana ha mais de 30 min. Alertas ja enviados vem de serena_alertas.
const diagnostico = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Diagnostico', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'wpp_modo'), 'teste') as modo, coalesce((select valor from serena_config where chave = 'wpp_teste_numeros'), '') as teste_numeros, coalesce((select valor from serena_config where chave = 'wpp_alerta_min'), '10')::int as min_espera), ult as (select distinct on (m.contato_id) m.contato_id, m.papel, m.criado_em, m.canal from serena_mensagens m where m.criado_em > now() - interval '6 hours' order by m.contato_id, m.criado_em desc), esp as (select c.id, c.nome, c.telefone, u.canal, round(extract(epoch from (now() - u.criado_em)) / 60)::int as minutos, (coalesce((select v.ia_pausada from serena_conversas v where v.contato_id = c.id order by v.aberta_em desc limit 1), false) or exists(select 1 from serena_wpp_pausas p where p.telefone = regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') and p.ate > now())) as pausada, exists(select 1 from serena_wpp_bloqueados b where b.telefone = regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g')) as bloqueado from ult u join serena_contatos c on c.id = u.contato_id, cfg where u.papel = 'cliente' and u.criado_em < now() - make_interval(mins => cfg.min_espera)) select (select modo from cfg) as modo, (select teste_numeros from cfg) as teste_numeros, (select min_espera from cfg) as min_espera, coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'telefone', x.telefone, 'canal', x.canal, 'minutos', x.minutos, 'pausada', x.pausada)) from (select * from esp where not bloqueado order by minutos desc limit 30) x), '[]'::jsonb) as lista, coalesce((select jsonb_agg(jsonb_build_object('id', a.contato_id, 'nome', c.nome, 'telefone', c.telefone, 'canal', a.motivo, 'minutos', round(extract(epoch from (now() - a.atribuido_em)) / 60)::int, 'pausada', true)) from serena_atribuicoes a join serena_contatos c on c.id = a.contato_id where a.status = 'aberto' and a.atribuido_em < now() - interval '30 minutes' and a.atribuido_em > now() - interval '3 days' and not exists (select 1 from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'humano' and m.criado_em > a.atribuido_em)), '[]'::jsonb) as fila_atrib, coalesce((select jsonb_object_agg(chave, ultimo_em) from serena_alertas), '{}'::jsonb) as alertas, (select count(*) from serena_mensagens where criado_em > now() - interval '30 minutes' and papel = 'cliente')::int as msgs_30min, (select count(*) from serena_mensagens where criado_em > now() - interval '30 minutes' and papel = 'serena')::int as resp_30min",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ modo: 'producao', teste_numeros: '', min_espera: 10, lista: [], fila_atrib: [], alertas: {}, msgs_30min: 0, resp_30min: 0 }] });

const avaliar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avaliar', parameters: { jsCode: `const d = $input.first().json || {};
const ev = $('Estado do Samuel').first().json || {};
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
const NL = String.fromCharCode(10);
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const estado = String((ev.instance && ev.instance.state) || ev.state || '').toLowerCase();
const alertas = d.alertas || {};
const agora = Date.now();
function minutosDesde(k) { return alertas[k] ? (agora - new Date(alertas[k]).getTime()) / 60000 : Infinity; }
const modo = String(d.modo || 'teste').toLowerCase();
const out = [];

// 1) conexao do Samuel com o WhatsApp
if (estado !== 'open') {
  if (minutosDesde('evolution_down') > 30) {
    out.push({ chave: 'evolution_down', acao: 'set', texto: '🔴 <b>Samuel desconectado do WhatsApp</b>' + NL + 'Estado na Evolution: <code>' + esc(estado || 'sem resposta') + '</code>' + NL + NL + 'A Serena nao consegue receber nem responder por WhatsApp. Abra a Evolution e leia o QR code de novo.' });
  }
} else if (alertas.evolution_down) {
  out.push({ chave: 'evolution_down', acao: 'del', texto: '🟢 <b>Samuel reconectado</b>' + NL + 'A Serena voltou a receber e responder normalmente.' });
}

// 2) clientes esperando a Serena (ativa, sem pausa) ha mais de wpp_alerta_min
const lista = Array.isArray(d.lista) ? d.lista : [];
const teste = String(d.teste_numeros || '').split(/[\\s,;]+/).map(n => n.replace(/\\D/g, '')).filter(Boolean);
const filaSerena = lista.filter(x => !x.pausada && (modo === 'producao' || (modo === 'teste' && teste.indexOf(String(x.telefone || '').replace(/\\D/g, '')) >= 0)));
if (modo !== 'off' && filaSerena.length && minutosDesde('serena_sem_resposta') > 30) {
  out.push({ chave: 'serena_sem_resposta', acao: 'set', texto: '⚠️ <b>Serena sem responder</b>' + NL + filaSerena.length + ' cliente(s) esperando ha mais de ' + d.min_espera + ' min com a Serena ativa:' + NL + filaSerena.slice(0, 8).map(x => '• ' + esc(x.nome || 'Sem nome') + ' (' + esc(x.telefone || x.canal || '') + ') ha ' + x.minutos + ' min').join(NL) + NL + NL + 'Confira as execucoes de Entrada Samuel e Serena Core no n8n.' + NL + '<a href="' + INBOX + '">Abrir o Inbox</a>' });
} else if (!filaSerena.length && alertas.serena_sem_resposta) {
  out.push({ chave: 'serena_sem_resposta', acao: 'del', texto: '' });
}

// 3) clientes esperando um atendente humano ha mais de 30 min (pausados com msg pendente ou handoff/atribuicao aberta sem resposta humana)
const vistos = {};
const filaHumano = [];
lista.filter(x => x.pausada && Number(x.minutos) >= 30).forEach(x => { vistos[x.id] = true; filaHumano.push(x); });
(Array.isArray(d.fila_atrib) ? d.fila_atrib : []).forEach(x => { if (!vistos[x.id]) { vistos[x.id] = true; filaHumano.push(x); } });
if (filaHumano.length && minutosDesde('fila_humano') > 60) {
  out.push({ chave: 'fila_humano', acao: 'set', texto: '🙋 <b>Clientes aguardando atendente</b>' + NL + filaHumano.length + ' conversa(s) esperando um humano ha mais de 30 min:' + NL + filaHumano.slice(0, 8).map(x => '• ' + esc(x.nome || 'Sem nome') + ' (' + esc(x.telefone || x.canal || '') + ') ha ' + x.minutos + ' min').join(NL) + NL + NL + '<a href="' + INBOX + '&fila=humano">Abrir a fila no Inbox</a>' });
} else if (!filaHumano.length && alertas.fila_humano) {
  out.push({ chave: 'fila_humano', acao: 'del', texto: '' });
}

return out.map(o => ({ json: o }));` } },
  output: [{ chave: 'evolution_down', acao: 'set', texto: 'x' }] });

const telegram = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Avisar no Telegram', parameters: {
  method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_DO_BOT>/sendMessage',
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ chat_id: '-1003766435449', message_thread_id: 289, text: $json.texto || '(sem texto)', parse_mode: 'HTML', disable_web_page_preview: true }) }}",
  options: { response: { response: { neverError: true } }, timeout: 20000 } }, onError: 'continueRegularOutput' },
  output: [{ ok: true }] });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar Alerta', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), del as (delete from serena_alertas a using p where p.j->>'acao' = 'del' and a.chave = p.j->>'chave' returning 1), ins as (insert into serena_alertas (chave, ultimo_em, detalhe) select p.j->>'chave', now(), left(p.j->>'texto', 500) from p where p.j->>'acao' = 'set' on conflict (chave) do update set ultimo_em = now(), detalhe = excluded.detalhe returning 1) select (select count(*) from del)::int as removidos, (select count(*) from ins)::int as gravados",
  options: { queryReplacement: "={{ [JSON.stringify($('Avaliar').item.json)] }}", queryBatching: 'independently' } }, credentials: PG },
  output: [{ removidos: 0, gravados: 1 }] });

const nota = sticky('## Watchdog da Serena no WhatsApp\n\nA cada 5 min confere: Samuel conectado na Evolution, clientes esperando a Serena (ativa) ha mais de wpp_alerta_min, e clientes esperando atendente ha mais de 30 min.\n\nAvisa no Telegram (topico 289) com dedupe em serena_alertas: desconexao a cada 30 min, Serena muda a cada 30 min, fila humana a cada 60 min. Manda "reconectado" quando volta.', [estado, avaliar], { color: 3 });

export default workflow('serena-wpp-watchdog', '[Serena WhatsApp] Watchdog -> Telegram')
  .add(cron).to(estado).to(diagnostico).to(avaliar).to(telegram).to(registrar).add(nota);
