// id: uAMAhYyFsr1fMQPx
// n8n Workflow SDK — [Serena] Proposta Semanal da Base (segunda 8h BRT + manual)
// Le a base de treinamento atual, os adendos ja aprovados (serena_config.system_prompt), as lacunas e as correcoes da
// semana, e pede ao Claude ate 8 adendos prontos para a base. Grava em serena_base_propostas e manda ao Telegram (topico 289)
// com botoes de aprovar (link para /webhook/serena-base-proposta). Nada entra na base sem clique.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Segunda 8h', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1' }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const gerar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Gerar Proposta', parameters: { jsCode: `const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
const SB = 'https://supabase.americanutrition.com/pg/query';
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const TG = 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage';
const APROVAR = 'https://n8n.americanutrition.com/webhook/serena-base-proposta';
const TOKEN = 'an-base-5Rk8Wq2T';
const self = this;
const NL = String.fromCharCode(10);
async function sql(q) { const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 60000 }); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); return r; }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cfg = (await sql("select coalesce((select valor from serena_config where chave='base_proposta'),'on') as ativo, coalesce((select valor from serena_config where chave='base_treinamento'),'') as base, coalesce((select valor from serena_config where chave='system_prompt'),'') as adendos, coalesce((select valor from serena_config where chave='modelo'),'claude-sonnet-5') as modelo, to_char((now() at time zone 'America/Sao_Paulo')::date - 7, 'DD/MM') as ini, to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM') as fim"))[0];
if (cfg.ativo !== 'on') return [{ json: { ok: true, pulado: 'base_proposta=off' } }];
const lacunas = await sql("select id, tema, pergunta, left(coalesce(resposta_serena,''), 400) as resposta_serena, status from serena_lacunas where criado_em > now() - interval '7 days' and status <> 'resolvida' order by criado_em desc limit 40");
const correcoes = await sql("select id, left(coalesce(texto_serena,''), 400) as texto_serena, correcao, autor from serena_correcoes where criado_em > now() - interval '7 days' order by criado_em desc limit 30");
if (!lacunas.length && !correcoes.length) return [{ json: { ok: true, pulado: 'sem lacunas nem correcoes na semana' } }];

const system = 'Voce e o editor da base de treinamento da Serena, assistente de atendimento da America Nutrition (WhatsApp). Sua tarefa: a partir das LACUNAS (perguntas de clientes que a Serena nao soube responder) e das CORRECOES feitas pela equipe na semana, propor ADENDOS prontos para entrar na base. Regras: 1) Proponha um adendo so quando a base atual e os adendos ja aprovados NAO cobrem o assunto; se ja cobrem, nao repita (pode propor um ajuste de redacao, tipo "ajuste", citando o trecho). 2) Escreva no mesmo estilo da base: direto, operacional, portugues do Brasil, 2 a 8 linhas, pronto para colar. 3) NUNCA invente fatos sobre produto, saude, prazos, precos ou politica. Se a informacao necessaria nao estiver na base nem nas correcoes, faca um item do tipo "pergunta": diga o que a equipe precisa definir e sugira como a Serena deve responder ENQUANTO nao houver definicao (ex.: encaminhar para a equipe). 4) Agrupe lacunas parecidas em um adendo so. 5) No maximo 8 itens, os mais frequentes ou mais criticos primeiro. 6) Responda SOMENTE um JSON valido, sem markdown: {"resumo":"2 frases sobre a semana","itens":[{"titulo":"...","tipo":"novo|ajuste|pergunta","secao":"modulo/secao da base onde entra","texto":"texto pronto do adendo","motivo":"por que (ate 200 caracteres)","lacunas":[ids das lacunas cobertas]}]}';
const user = 'BASE DE TREINAMENTO ATUAL (' + cfg.base.length + ' caracteres):' + NL + cfg.base.slice(0, 380000) + NL + NL + 'ADENDOS JA APROVADOS (system_prompt):' + NL + (cfg.adendos || '(nenhum)') + NL + NL + 'LACUNAS DA SEMANA (' + lacunas.length + '):' + NL + lacunas.map(l => '- id ' + l.id + ' [' + l.tema + '] ' + l.pergunta + (l.resposta_serena ? ' | Serena respondeu: "' + l.resposta_serena.replace(/\\s+/g, ' ') + '"' : '')).join(NL) + NL + NL + 'CORRECOES DA EQUIPE (' + correcoes.length + '):' + NL + (correcoes.map(c => '- Serena disse: "' + c.texto_serena.replace(/\\s+/g, ' ') + '" -> Correto (' + (c.autor || 'equipe') + '): ' + c.correcao).join(NL) || '(nenhuma)');
const modeloNovo = /claude-(sonnet|opus|fable)-5|claude-(sonnet|opus)-4-[678]/.test(String(cfg.modelo));
const corpo = { model: cfg.modelo, max_tokens: 12000, system: system, messages: [{ role: 'user', content: user }] };
if (modeloNovo) corpo.output_config = { effort: 'high' };
const r = await self.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 240000, body: corpo });
const txt = ((r && r.content) || []).filter(c => c.type === 'text').map(c => c.text).join('').trim().replace(/^\\s*```(?:json)?/i, '').replace(/```\\s*$/, '').trim();
function parseSolto(s) { const ini = s.indexOf('{'); if (ini < 0) return null; s = s.slice(ini); try { return JSON.parse(s); } catch (e) {} const fim = s.lastIndexOf('}'); if (fim < 0) return null; const base = s.slice(0, fim + 1); for (const tail of [']}', '}]}', '"}]}', '"]}]}']) { try { return JSON.parse(base + tail); } catch (e) {} } return null; }
const j = parseSolto(txt);
if (!j || !Array.isArray(j.itens)) return [{ json: { ok: false, erro: 'resposta sem JSON', stop: r && r.stop_reason, tamanho: txt.length, bruto: txt.slice(0, 500), fim: txt.slice(-300) } }];
if (r && r.stop_reason === 'max_tokens') j.resumo = (j.resumo || '') + ' (resposta cortada no limite; itens finais podem faltar)';
const itens = (Array.isArray(j.itens) ? j.itens : []).slice(0, 8).map((it, i) => ({ n: i + 1, titulo: String(it.titulo || 'Adendo ' + (i + 1)).slice(0, 120), tipo: ['novo','ajuste','pergunta'].indexOf(it.tipo) >= 0 ? it.tipo : 'novo', secao: String(it.secao || '').slice(0, 120), texto: String(it.texto || '').trim(), motivo: String(it.motivo || '').slice(0, 300), lacunas: Array.isArray(it.lacunas) ? it.lacunas.map(Number).filter(Boolean) : [], status: 'pendente' }));
if (!itens.length) return [{ json: { ok: true, pulado: 'Claude nao propos itens', resumo: j.resumo } }];
const token = TOKEN + '-' + Math.random().toString(36).slice(2, 10);
const ins = await sql('insert into serena_base_propostas (periodo_ini, periodo_fim, resumo, itens, status, token) values ((now() at time zone ' + E('America/Sao_Paulo') + ')::date - 7, (now() at time zone ' + E('America/Sao_Paulo') + ')::date, ' + E(j.resumo || '') + ', ' + E(JSON.stringify(itens)) + '::jsonb, ' + E('pendente') + ', ' + E(token) + ') returning id');
const id = ins[0].id;
const link = (acao, item) => APROVAR + '?t=' + encodeURIComponent(token) + '&id=' + id + '&acao=' + acao + (item ? '&item=' + item : '');
const ICON = { novo: '\\u2795', ajuste: '\\u270F\\uFE0F', pergunta: '\\u2753' };
function montar(prev) {
  let t = '\\uD83D\\uDCDA <b>Proposta de atualiza\\u00e7\\u00e3o da base \\u00b7 ' + cfg.ini + ' a ' + cfg.fim + '</b>' + NL + esc(j.resumo || '') + NL + NL;
  t += 'Base: ' + lacunas.length + ' lacunas e ' + correcoes.length + ' corre\\u00e7\\u00f5es na semana. ' + itens.length + ' adendos propostos:' + NL + NL;
  for (const it of itens) {
    t += (ICON[it.tipo] || '') + ' <b>' + it.n + '. ' + esc(it.titulo) + '</b> <i>(' + it.tipo + (it.secao ? ' \\u00b7 ' + esc(it.secao) : '') + ')</i>' + NL;
    if (prev > 0) t += esc(it.texto.length > prev ? it.texto.slice(0, prev) + '\\u2026' : it.texto) + NL;
    t += '<i>Motivo: ' + esc(it.motivo.length > 160 ? it.motivo.slice(0, 160) + '\\u2026' : it.motivo) + '</i>' + NL + NL;
  }
  t += 'Aprovar entra em serena_config.system_prompt (adendos), que a Serena l\\u00ea junto com a base e o sync do site n\\u00e3o apaga. Use "Ver completo" para ler o texto inteiro.';
  return t;
}
let t = montar(300);
if (t.length > 4000) t = montar(140);
if (t.length > 4000) t = montar(0);
const teclado = [[{ text: '\\u2705 Aplicar todos', url: link('aplicar') }, { text: '\\uD83D\\uDD0D Ver completo', url: link('ver') }, { text: '\\u274C Descartar', url: link('descartar') }]];
const linhaItens = itens.map(it => ({ text: '\\u2705 s\\u00f3 ' + it.n, url: link('aplicar', it.n) }));
for (let i = 0; i < linhaItens.length; i += 4) teclado.push(linhaItens.slice(i, i + 4));
let tg = null;
try { tg = await self.helpers.httpRequest({ method: 'POST', url: TG, json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 289, text: t, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: teclado } } }); } catch (e) { return [{ json: { ok: false, etapa: 'telegram', erro: String(e.message || e), id: id, texto: t } }]; }
try { await sql('update serena_base_propostas set telegram_msg_id = ' + E(tg && tg.result ? tg.result.message_id : '') + ' where id = ' + Number(id)); } catch (e) {}
return [{ json: { ok: true, id: id, itens: itens.length, resumo: j.resumo, uso: r.usage || null } }];` } }, output: [{ ok: true, id: 1, itens: 3 }] });

const nota = sticky('## Proposta semanal da base\n\nSegunda 8h BRT (ou execucao manual): junta base atual + adendos aprovados + lacunas e correcoes da semana, pede ao Claude ate 8 adendos prontos (tipo novo / ajuste / pergunta quando a informacao nao existe), grava em serena_base_propostas e manda ao Telegram (topico 289) com botoes que abrem /webhook/serena-base-proposta (aplicar todos, so um item, ver completo, descartar).\n\nAprovar grava em serena_config.system_prompt (bloco de adendos que o Core carrega junto com a base). Nao mexe em base_treinamento, que e sobrescrita pelo sync do site. Desligar: serena_config base_proposta = off.', [cron, gerar], { color: 6 });

export default workflow('serena-proposta-base', '[Serena] Proposta Semanal da Base', { settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo' } })
  .add(cron).to(gerar).add(nota);
