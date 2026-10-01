// id klTuJjVCATqxxJfp
// n8n Workflow SDK — [Serena] Fila Humana Parada (cron 20 min)
// Cliente escalado para atendimento humano que fica sem resposta. Nao existia alerta nenhum:
// em 01/10 havia 13 clientes esperando, um deles ha 528 horas (22 dias) desde 09/09.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 20 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 20 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// encaminhamento aberto + ultima mensagem do cliente mais nova que a nossa resposta + esperando ha mais de N min
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Fila Parada', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'fila_alerta'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'fila_alerta_min'), '20')::int as min_espera, coalesce((select valor from serena_config where chave = 'fila_realerta_horas'), '4')::int as realerta_h, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), abertas as (select a.contato_id, a.agente, a.atribuido_em, a.motivo, a.alertado_em, c.nome, regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as telefone, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente') as ult_cliente, (select max(m.criado_em) from serena_mensagens m where m.contato_id = a.contato_id and m.papel in ('serena', 'humano')) as ult_nossa, (select m.texto from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'cliente' order by m.criado_em desc limit 1) as ultima_msg from serena_atribuicoes a join serena_contatos c on c.id = a.contato_id where a.status = 'aberto'), lista as (select contato_id::text as contato_id, nome, telefone, motivo, atribuido_em, ult_cliente, left(coalesce(ultima_msg, ''), 120) as ultima_msg, round(extract(epoch from (now() - ult_cliente)) / 3600, 1) as horas from abertas, cfg where ult_cliente > coalesce(ult_nossa, '2000-01-01'::timestamptz) and ult_cliente < now() - (cfg.min_espera * interval '1 minute') and (alertado_em is null or alertado_em < now() - (cfg.realerta_h * interval '1 hour')) and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = abertas.telefone) order by ult_cliente limit 25) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(lista)) from lista), '[]'::jsonb) as lista, (select count(*) from abertas where ult_cliente > coalesce(ult_nossa, '2000-01-01'::timestamptz)) as total_esperando",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', min_espera: 20, realerta_h: 4, hora: 10 }, lista: [], total_esperando: 0 }] });

const avisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisar Telegram', parameters: { jsCode: `// Um aviso por rodada com todo mundo que esta esperando, do que espera ha mais tempo para o mais novo.
// Cada contato so volta a aparecer depois de fila_realerta_horas, para a equipe nao receber a mesma lista de 20 em 20 min.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const NL = String.fromCharCode(10);
const TOKEN = 'an-serena-9Kx4Lm2Q';
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=' + TOKEN;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
if (String(cfg.ativo || 'on') !== 'on' || !lista.length) { return [{ json: { payload: '[]', avisados: 0 } }]; }
const tempo = h => { const n = Number(h) || 0; if (n < 1) return Math.round(n * 60) + ' min'; if (n < 48) return n.toFixed(1).replace('.0', '') + 'h'; return Math.round(n / 24) + ' dias'; };
const linhas = lista.map(function (x) {
  return '\\u2022 <b>' + esc(x.nome || 'Cliente') + '</b> (+' + esc(x.telefone) + ') esperando <b>' + tempo(x.horas) + '</b>' + NL +
    '   \"' + esc(String(x.ultima_msg || '').replace(/\\s+/g, ' ')) + '\"' + NL +
    '   <a href=\"' + INBOX + '&c=' + x.contato_id + '\">abrir no Inbox</a>';
});
const total = Number(d.total_esperando) || lista.length;
const txt = '\\u{1F6A8} <b>Fila humana parada: ' + lista.length + ' cliente(s) sem resposta</b>' + NL +
  (total > lista.length ? '<i>' + total + ' na fila ao todo; os demais ja foram avisados nas ultimas horas.</i>' + NL : '') + NL +
  linhas.join(NL + NL) + NL + NL + '<i>A Serena esta pausada nessas conversas por causa do encaminhamento: quem responde agora e a equipe.</i>';
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000,
    body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true } });
} catch (e) { return [{ json: { payload: '[]', avisados: 0, erro: String(e.message) } }]; }
return [{ json: { payload: JSON.stringify(lista.map(function (x) { return x.contato_id; })), avisados: lista.length } }];` } },
  output: [{ payload: '[]', avisados: 0 }] });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Alertado', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_atribuicoes a set alertado_em = now() from p, jsonb_array_elements_text(p.j) x where a.contato_id = x::uuid and a.status = 'aberto' returning a.contato_id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ contato_id: '' }] });

const nota = sticky('## Fila humana parada\n\nA cada 20 min procura cliente que foi encaminhado para atendimento humano (serena_atribuicoes status aberto), mandou mensagem depois da ultima resposta nossa e esta esperando ha mais de fila_alerta_min (padrao 20 min). Manda a lista no Telegram (topico 289) com o tempo de espera, a ultima frase do cliente e o link do Inbox.\n\nCada contato so volta a aparecer depois de fila_realerta_horas (padrao 4h). Pula bloqueados. Kill switch: serena_config fila_alerta = off.\n\nNasceu em 01/10/2026: a Serena pausa 12h ao encaminhar, e sem ninguem avisado havia 13 clientes esperando, um deles ha 22 dias.', { color: 3, width: 420, height: 260 });

export default workflow('serena-fila-parada', '[Serena] Fila Humana Parada', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(avisar).to(marcar).add(nota);
