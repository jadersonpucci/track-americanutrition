// id 1oB1bJlRNnuIR97Z
// n8n Workflow SDK — [Serena] Auditoria Diaria + Lacunas (cron 07:30 BRT)
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Todo dia 07:30 BRT', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 10 * * *' }] } } }, output: [{ timestamp: '2026-01-01T10:30:00Z' }] });

// amostra de conversas de ontem (BRT) com cliente + Serena, ainda nao auditadas; lacunas e numeros do dia
const amostra = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Amostra de Ontem', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'auditoria_ativa'), 'on') as ativa, coalesce((select valor from serena_config where chave = 'auditoria_amostra'), '15')::int as amostra, coalesce((select valor from serena_config where chave = 'auditoria_nota_alerta'), '6')::int as nota_alerta, coalesce((select valor from serena_config where chave = 'base_treinamento'), '') as base, coalesce((select valor from serena_config where chave = 'modelo'), 'claude-sonnet-5') as modelo), dia as (select (now() at time zone 'America/Sao_Paulo')::date - 1 as d, ((now() at time zone 'America/Sao_Paulo')::date - 1)::timestamp at time zone 'America/Sao_Paulo' as ini, ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo' as fim), cand as (select m.contato_id, count(*) filter (where m.papel = 'cliente') as n_cli, count(*) filter (where m.papel = 'serena' and coalesce(m.autor, '') not like 'transacional:%' and coalesce(m.autor, '') <> 'ack') as n_ser from serena_mensagens m, dia where m.criado_em >= dia.ini and m.criado_em < dia.fim group by m.contato_id having count(*) filter (where m.papel = 'cliente') > 0 and count(*) filter (where m.papel = 'serena' and coalesce(m.autor, '') not like 'transacional:%' and coalesce(m.autor, '') <> 'ack') > 0), sel as (select c.contato_id, ct.nome, ct.telefone from cand c join serena_contatos ct on ct.id = c.contato_id, cfg, dia where not exists (select 1 from serena_auditorias a where a.contato_id = c.contato_id and a.dia = dia.d) and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = regexp_replace(coalesce(ct.telefone, ''), '\\D', '', 'g')) order by (c.n_cli + c.n_ser) desc, random() limit (select amostra from cfg)), conv as (select s.contato_id, s.nome, s.telefone, (select jsonb_agg(jsonb_build_object('p', x.papel, 't', left(x.texto, 700), 'a', x.autor, 'q', to_char(x.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI')) order by x.criado_em) from (select * from serena_mensagens m, dia where m.contato_id = s.contato_id and m.criado_em >= dia.ini - interval '12 hours' and m.criado_em < dia.fim and m.texto is not null order by m.criado_em desc limit 40) x) as msgs from sel s) select (select row_to_json(cfg) from cfg) as cfg, (select d from dia) as dia, coalesce((select jsonb_agg(row_to_json(conv)) from conv), '[]'::jsonb) as conversas, (select count(*) from cand)::int as total_conversas, coalesce((select jsonb_agg(jsonb_build_object('pergunta', l.pergunta, 'tema', l.tema, 'contato_id', l.contato_id, 'nome', (select nome from serena_contatos where id = l.contato_id)) order by l.criado_em desc) from (select * from serena_lacunas l, dia where l.criado_em >= dia.ini and l.criado_em < dia.fim order by l.criado_em desc limit 12) l), '[]'::jsonb) as lacunas, (select count(*) from serena_lacunas l, dia where l.criado_em >= dia.ini and l.criado_em < dia.fim)::int as lacunas_dia, (select count(*) from serena_lacunas where status = 'aberta')::int as lacunas_abertas, (select count(*) from serena_atribuicoes a, dia where a.atribuido_em >= dia.ini and a.atribuido_em < dia.fim and a.motivo in ('handoff', 'irritado'))::int as handoffs, (select count(*) from serena_trocas t, dia where t.criado_em >= dia.ini and t.criado_em < dia.fim)::int as trocas",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativa: 'on', amostra: 15, nota_alerta: 6, base: '', modelo: 'claude-sonnet-5' }, dia: '2026-09-02', conversas: [], total_conversas: 0, lacunas: [], lacunas_dia: 0, lacunas_abertas: 0, handoffs: 0, trocas: 0 }] });

const auditar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Auditar com Claude', parameters: { jsCode: `// Um segundo modelo (com a mesma base de treinamento, em cache) le cada conversa e da nota: fatos errados, tom, resolveu ou nao, invencao.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const modelo = cfg.modelo || 'claude-sonnet-5';
const modeloNovo = /claude-(sonnet|opus|fable)-5|claude-(sonnet|opus)-4-[678]/.test(String(modelo));
const NL = String.fromCharCode(10);
const out = [];
if (String(cfg.ativa || 'on') !== 'on') return [{ json: { payload: '[]', auditadas: 0, dia: d.dia, resumo: d } }];
for (const c of (Array.isArray(d.conversas) ? d.conversas : [])) {
  const msgs = Array.isArray(c.msgs) ? c.msgs : [];
  if (!msgs.length) continue;
  const transcript = msgs.map(m => '[' + m.q + '] ' + (m.p === 'cliente' ? 'CLIENTE' : (m.p === 'humano' ? 'ATENDENTE ' + (m.a || '') : 'SERENA' + (m.a ? ' (' + m.a + ')' : ''))) + ': ' + String(m.t || '').replace(/\\s+/g, ' ')).join(NL);
  const sys = [];
  if (cfg.base) sys.push({ type: 'text', text: cfg.base, cache_control: { type: 'ephemeral', ttl: '1h' } });
  sys.push({ type: 'text', text: 'Voce e o auditor de qualidade do atendimento da America Nutrition. Acima esta a base de treinamento oficial da assistente Serena (fonte da verdade). Avalie a conversa abaixo SOMENTE nas falas da SERENA (mensagens transacionais automaticas e falas de ATENDENTE nao contam). Responda SOMENTE um JSON: {"nota": 1-10, "resolveu": true|false, "problemas": [{"tipo": "fato_errado|invencao|nao_respondeu|tom|processo|formato|outro", "trecho": "citacao curta da Serena", "explicacao": "ate 25 palavras"}], "resumo": "1 frase: o que o cliente queria e como terminou", "sugestao": "1 frase: o que a Serena deveria ter feito ou o que falta na base de treinamento, ou vazio"}. Criterios: nota 9-10 = correta, no tom, resolveu; 7-8 = pequenos deslizes; 5-6 = erro relevante ou nao resolveu sem motivo; 1-4 = informacao errada/inventada, promessa indevida ou cliente prejudicado. fato_errado = contradiz a base; invencao = afirmou algo que nao esta na base nem veio de ferramenta; nao_respondeu = ignorou pergunta objetiva; processo = nao usou ferramenta/consulta quando devia ou nao escalou quando devia; tom = fora do tom (frio, robotico, prolixo, ## ou ** no WhatsApp). Sem problemas = lista vazia. Nao invente problemas.' });
  let j = null;
  try {
    const corpo = { model: modelo, max_tokens: 600, system: sys, messages: [{ role: 'user', content: 'Cliente: ' + (c.nome || 'sem nome') + '. Conversa de ' + d.dia + ' (fim do dia anterior incluso para contexto):' + NL + transcript }] };
    if (modeloNovo) corpo.output_config = { effort: 'low' };
    const r = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 120000, body: corpo });
    const txt = (r.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
    const m = txt.match(/\\{[\\s\\S]*\\}/);
    if (m) j = JSON.parse(m[0]);
  } catch (e) { j = null; }
  if (!j) continue;
  out.push({ contato_id: c.contato_id, nome: c.nome, dia: d.dia, nota: Math.max(1, Math.min(10, Number(j.nota) || 0)), resolveu: j.resolveu === true, problemas: Array.isArray(j.problemas) ? j.problemas.slice(0, 6) : [], resumo: String(j.resumo || '').slice(0, 500), sugestao: String(j.sugestao || '').slice(0, 500), modelo: modelo, msgs: msgs.length });
}
return [{ json: { payload: JSON.stringify(out), auditadas: out.length, dia: d.dia, media: out.length ? Math.round(10 * out.reduce((s, x) => s + x.nota, 0) / out.length) / 10 : null, resumo: { total_conversas: d.total_conversas, lacunas: d.lacunas, lacunas_dia: d.lacunas_dia, lacunas_abertas: d.lacunas_abertas, handoffs: d.handoffs, trocas: d.trocas, nota_alerta: cfg.nota_alerta } } }];` } },
  output: [{ payload: '[]', auditadas: 0, dia: '2026-09-02', media: null, resumo: {} }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Auditorias', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into serena_auditorias (contato_id, dia, nota, resolveu, problemas, resumo, sugestao, modelo, msgs) select (x->>'contato_id')::uuid, (x->>'dia')::date, (x->>'nota')::int, (x->>'resolveu')::boolean, x->'problemas', x->>'resumo', x->>'sugestao', x->>'modelo', (x->>'msgs')::int from p, jsonb_array_elements(p.j) x on conflict (contato_id, dia) do update set nota = excluded.nota, resolveu = excluded.resolveu, problemas = excluded.problemas, resumo = excluded.resumo, sugestao = excluded.sugestao returning id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG, alwaysOutputData: true },
  output: [{ id: 1 }] });

const relatorio = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Relatorio no Telegram', parameters: { jsCode: `// Boletim diario no topico de alertas: media, conversas com nota baixa (com link do Inbox) e perguntas sem resposta de ontem.
const a = $('Auditar com Claude').first().json || {};
const r = a.resumo || {};
let itens = []; try { itens = JSON.parse(a.payload || '[]'); } catch (e) { itens = []; }
const NL = String.fromCharCode(10);
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const dia = a.dia ? String(a.dia).slice(0, 10).split('-').reverse().join('/') : 'ontem';
const notaAlerta = Number(r.nota_alerta || 6);
const ruins = itens.filter(x => x.nota <= notaAlerta).sort((x, y) => x.nota - y.nota);
let txt = '\\u{1F4CB} <b>Auditoria da Serena - ' + esc(dia) + '</b>' + NL;
txt += 'Conversas: ' + (r.total_conversas || 0) + ' | Auditadas: ' + (a.auditadas || 0) + (a.media != null ? ' | Media: <b>' + a.media + '/10</b>' : '') + ' | Handoffs: ' + (r.handoffs || 0) + ' | Trocas: ' + (r.trocas || 0) + NL;
if (ruins.length) {
  txt += NL + '\\u26A0\\uFE0F <b>Precisam de olhar (nota ' + notaAlerta + ' ou menos):</b>' + NL;
  for (const x of ruins.slice(0, 8)) {
    const pr = (x.problemas && x.problemas[0]) ? (x.problemas[0].tipo + ': ' + x.problemas[0].explicacao) : '';
    txt += '\\u2022 <b>' + x.nota + '/10</b> ' + esc(x.nome || 'Sem nome') + ' - ' + esc(x.resumo || '') + (pr ? NL + '   \\u21B3 ' + esc(pr) : '') + NL + '   <a href="' + INBOX + '&c=' + x.contato_id + '">abrir no Inbox</a>' + NL;
  }
} else if (a.auditadas) {
  txt += NL + '\\u2705 Nenhuma conversa abaixo de ' + notaAlerta + '.' + NL;
}
const sug = itens.filter(x => x.sugestao && x.nota <= 8).slice(0, 4);
if (sug.length) { txt += NL + '\\u{1F4A1} <b>Sugestoes para a base:</b>' + NL + sug.map(x => '\\u2022 ' + esc(x.sugestao)).join(NL) + NL; }
const lac = Array.isArray(r.lacunas) ? r.lacunas : [];
txt += NL + '\\u2753 <b>Perguntas sem resposta ontem: ' + (r.lacunas_dia || 0) + '</b> (abertas no total: ' + (r.lacunas_abertas || 0) + ')' + NL;
if (lac.length) txt += lac.slice(0, 8).map(l => '\\u2022 ' + esc(l.pergunta) + ' <i>(' + esc(l.tema || 'outro') + ')</i>').join(NL) + NL;
txt += NL + '<a href="' + INBOX + '&modal=auditoria">Ver auditoria completa no Inbox</a> | <a href="' + INBOX + '&modal=lacunas">Ver lacunas</a>';
let tg = null;
if ((a.auditadas || 0) > 0 || (r.lacunas_dia || 0) > 0) {
  try { tg = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage', json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e) { tg = { erro: String(e.message) }; }
}
return [{ json: { enviado: !!(tg && tg.ok), auditadas: a.auditadas || 0, media: a.media, ruins: ruins.length, lacunas_dia: r.lacunas_dia || 0, texto: txt } }];` } },
  output: [{ enviado: true, auditadas: 0, media: null, ruins: 0, lacunas_dia: 0, texto: '' }] });

const nota = sticky('## Auditoria diaria + lacunas\n\nTodo dia 07:30 (BRT): pega ate auditoria_amostra conversas de ontem (cliente + Serena), um segundo modelo com a mesma base de treinamento da nota 1-10 e aponta fatos errados, invencoes, tom e perguntas ignoradas. Grava em serena_auditorias e manda o boletim no Telegram (topico 289) com as conversas abaixo de auditoria_nota_alerta e as perguntas sem resposta (serena_lacunas) do dia.\n\nKill switch: auditoria_ativa = off. Rodar manualmente audita o dia de ontem.', { color: 4, width: 440, height: 230 });

export default workflow('serena-auditoria', '[Serena] Auditoria Diaria + Lacunas', { settings: { executionOrder: 'v1' } })
  .add(cron).to(amostra).to(auditar).to(gravar).to(relatorio).add(nota);
