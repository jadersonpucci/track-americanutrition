// n8n Workflow SDK — [Serena] Indicacao: Primeiro Contato (cron 10 min)
// Cliente passa o numero de outra pessoa pedindo que a gente fale com ela. Antes isso virava escalar_humano
// (que silenciava a Serena por 12h na conversa de quem estava comprando) e ninguem contatava a pessoa.
// Agora: o SQL acha o numero e aplica as travas, o Claude confirma que e mesmo uma indicacao, e a Serena
// manda a primeira mensagem para a pessoa indicada, dizendo quem passou o contato.
// Caso real: Jean Carlo (08/10, +55 93 99119-5295) passou o numero da irma as 18:44, a Serena escalou,
// ficou muda nas 4 mensagens seguintes dele (inclusive "Sim vou querer os dois imunopet liquidos") e a irma
// nunca foi contatada.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 10 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// Candidatos: mensagem de cliente com telefone dentro, numero diferente do dele, que nao e contato ativo
// nosso, nao esta bloqueado e ainda nao foi indicado. O contexto vai junto para o Claude decidir.
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Indicacoes', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'indicacao_auto'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'indicacao_janela_min'), '40')::int as janela_min, coalesce((select valor from serena_config where chave = 'indicacao_hora_ini'), '9')::int as h_ini, coalesce((select valor from serena_config where chave = 'indicacao_hora_fim'), '19')::int as h_fim, coalesce((select valor from serena_config where chave = 'indicacao_cooldown_dias'), '90')::int as cooldown_d, coalesce((select valor from serena_config where chave = 'modelo'), 'claude-sonnet-5-5') as modelo, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), base as (select m.id as msg_id, m.contato_id, m.criado_em, m.texto, coalesce(c.nome, '') as indicador_nome, serena_tel_canon(coalesce(c.telefone, '')) as indicador_telefone from serena_mensagens m join serena_contatos c on c.id = m.contato_id, cfg where cfg.ativo = 'on' and m.papel = 'cliente' and m.canal = 'whatsapp' and m.criado_em > now() - (cfg.janela_min * interval '1 minute') and m.texto ~ '[0-9]{4}[ .-]?[0-9]{4}' and not exists (select 1 from serena_indicacoes i where i.msg_id = m.id) order by m.criado_em limit 20), alvos as (select base.*, serena_tel_canon(case when length(regexp_replace(x.achado, '\\D', '', 'g')) between 10 and 11 then '55' || regexp_replace(x.achado, '\\D', '', 'g') else regexp_replace(x.achado, '\\D', '', 'g') end) as alvo from base, lateral (select (regexp_matches(base.texto, '(\\(?[0-9]{2}\\)?[ .-]?9?[0-9]{4}[ .-]?[0-9]{4})', 'g'))[1] as achado) x), filtrados as (select distinct on (msg_id) msg_id, contato_id, criado_em, texto, indicador_nome, indicador_telefone, alvo from alvos, cfg where length(alvo) between 12 and 13 and length(indicador_telefone) between 12 and 13 and alvo <> indicador_telefone and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = alvos.alvo) and not exists (select 1 from serena_indicacoes i2 where i2.indicado_telefone = alvos.alvo and i2.contatado_em > now() - (cfg.cooldown_d * interval '1 day')) and not exists (select 1 from disparos_wpp d where d.numero = alvos.alvo and d.optout) and not exists (select 1 from serena_contatos c2 join serena_mensagens m2 on m2.contato_id = c2.id where serena_tel_canon(coalesce(c2.telefone, '')) = alvos.alvo and m2.criado_em > now() - interval '60 days') order by msg_id, criado_em) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(jsonb_build_object('msg_id', f.msg_id, 'contato_id', f.contato_id::text, 'indicador_nome', f.indicador_nome, 'indicador_telefone', f.indicador_telefone, 'alvo', f.alvo, 'texto', left(f.texto, 400), 'contexto', coalesce((select jsonb_agg(jsonb_build_object('papel', h.papel, 'texto', left(h.texto, 300)) order by h.criado_em) from (select papel, texto, criado_em from serena_mensagens hh where hh.contato_id = f.contato_id and hh.criado_em <= f.criado_em + interval '15 minutes' order by hh.criado_em desc limit 8) h), '[]'::jsonb))) from filtrados f), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', janela_min: 40, h_ini: 9, h_fim: 19, cooldown_d: 90, modelo: 'claude-sonnet-5-5', hora: 10 }, lista: [] }] });

const falar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Confirmar e Falar', parameters: { jsCode: `// O regex do SQL so garante que existe um telefone na frase. Quem decide se e indicacao de verdade
// (e se o cliente pediu que a gente fale com a pessoa) e o Claude, para nao abordar quem nunca pediu nada.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const NL = String.fromCharCode(10);
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const self = this;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const corta = (s, n) => { const t = String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '...' : t; };
const prim = s => String(s || '').trim().split(/\\s+/)[0] || '';
if (String(cfg.ativo || 'on') !== 'on' || !lista.length) { return [{ json: { payload: '[]', contatados: 0 } }]; }

const hora = Number(cfg.hora);
const dentroDoHorario = hora >= Number(cfg.h_ini) && hora <= Number(cfg.h_fim);
const rows = [];
const linhas = [];
for (const it of lista) {
  const ctx = (Array.isArray(it.contexto) ? it.contexto : []).map(h => (h.papel === 'cliente' ? 'CLIENTE: ' : 'SERENA: ') + h.texto).join(NL);
  const pergunta = 'Conversa de WhatsApp da America Nutrition (suplementos). O cliente se chama ' + (it.indicador_nome || 'sem nome') + '.' + NL + NL +
    ctx + NL + NL + 'A ULTIMA mensagem do cliente foi: "' + String(it.texto || '') + '"' + NL +
    'Nela aparece o telefone ' + it.alvo + '.' + NL + NL +
    'Responda SO com JSON: {"indicacao": true/false, "pediu_contato": true/false, "nome": "", "relacao": "", "motivo": ""}.' + NL +
    'indicacao = true somente se esse telefone e de OUTRA PESSOA que o cliente esta apresentando para a gente (parente, amigo, conhecido), nao o telefone dele mesmo, nem codigo de rastreio, CPF, CEP, valor ou numero de pedido.' + NL +
    'pediu_contato = true somente se o cliente pediu, pediu que entrassemos em contato, ou deixou claro que quer que a gente fale com essa pessoa.' + NL +
    'nome = o nome dessa pessoa, se aparecer na conversa (senao vazio). relacao = irma, mae, amigo, etc, se aparecer. motivo = em poucas palavras, o que ela procura (ex.: ImunoPet para a cadela), so se estiver na conversa.';
  let j = null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 60000,
      body: { model: cfg.modelo || 'claude-sonnet-5-5', max_tokens: 300, output_config: { effort: 'low' }, messages: [{ role: 'user', content: pergunta }] } });
    const txt = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ');
    const m = txt.match(/\\{[\\s\\S]*\\}/);
    if (m) j = JSON.parse(m[0]);
  } catch (e) { j = null; }
  if (!j || j.indicacao !== true || j.pediu_contato !== true) {
    rows.push({ msg_id: it.msg_id, indicador_contato_id: it.contato_id, indicador_nome: it.indicador_nome, indicador_telefone: it.indicador_telefone, indicado_telefone: it.alvo, indicado_nome: (j && j.nome) || '', relacao: (j && j.relacao) || '', contexto: corta(it.texto, 300), status: 'descartado', resultado: j ? 'nao e indicacao com pedido de contato' : 'classificacao falhou', contatado: false });
    continue;
  }
  if (!dentroDoHorario) { continue; }   // fica para a proxima rodada dentro do horario
  const quem = prim(it.indicador_nome) || 'um cliente nosso';
  const comoChamar = String(j.nome || '').trim();
  const instr = 'Primeiro contato com uma pessoa INDICADA. ' + quem + (j.relacao ? ' (' + j.relacao + ' dela)' : '') +
    ' passou o contato dela para a gente e pediu que falassemos com ela' + (j.motivo ? ', porque ela procura: ' + j.motivo : '') + '. ' +
    'Escreva a PRIMEIRA mensagem para essa pessoa: cumprimente' + (comoChamar ? ' pelo nome (' + comoChamar + ')' : '') +
    ', apresente-se em uma frase, diga que foi o ' + quem + ' que passou o contato dela, e pergunte como voce pode ajudar' +
    (j.motivo ? ' no que ela procura' : '') + '. No maximo 3 linhas. Nao mande link, nao mande preco, nao fale de saude dela e nao invente nada que nao esteja aqui. Termine deixando claro que ela pode responder por aqui.';
  let texto = '';
  try {
    const c = await self.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 150000,
      body: { canal: 'whatsapp', telefone: it.alvo, nome: comoChamar, modo: 'proativo', tipo_proativo: 'indicacao', instrucao: instr } });
    texto = (c && c.ok !== false && !c.pausada && c.resposta) ? String(c.resposta).trim() : '';
  } catch (e) { texto = ''; }
  if (!texto || texto.length < 20) {
    texto = 'Oi' + (comoChamar ? ', ' + comoChamar : '') + '! \\u{1F499} Aqui e a Serena, da America Nutrition. O ' + quem + ' passou seu contato e pediu que eu falasse com voce. Como posso te ajudar?';
  }
  let ok = false, det = null;
  try { const s = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: it.alvo, text: texto, delay: 2500 } }); ok = !!(s && s.ok); det = ok ? null : JSON.stringify(s).slice(0, 200); }
  catch (e) { det = String(e.message || e); }
  rows.push({ msg_id: it.msg_id, indicador_contato_id: it.contato_id, indicador_nome: it.indicador_nome, indicador_telefone: it.indicador_telefone, indicado_telefone: it.alvo, indicado_nome: comoChamar, relacao: String(j.relacao || ''), contexto: corta(j.motivo || it.texto, 300), status: ok ? 'contatado' : 'falhou', resultado: ok ? null : det, contatado: ok });
  if (ok) {
    linhas.push('\\u2022 <b>' + esc(comoChamar || 'Indicada') + '</b> (+' + esc(it.alvo) + '), indicada por ' + esc(prim(it.indicador_nome) || it.indicador_telefone) + NL + '   "' + esc(corta(texto, 180)) + '"');
  } else {
    linhas.push('\\u26A0\\uFE0F Nao consegui falar com +' + esc(it.alvo) + ' (indicada por ' + esc(prim(it.indicador_nome)) + '): ' + esc(corta(det, 120)));
  }
  await new Promise(res => setTimeout(res, 12000 + Math.floor(Math.random() * 6000)));
}

if (linhas.length) {
  const txt = '\\u{1F91D} <b>Indicacao: ' + linhas.length + ' pessoa(s)</b>' + NL + '<i>Alguem passou o contato delas pedindo que falassemos; a Serena deu o primeiro oi.</i>' + NL + NL + linhas.join(NL + NL);
  try {
    await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000,
      body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true } });
  } catch (e) {}
}
return [{ json: { payload: JSON.stringify(rows), contatados: rows.filter(r => r.contatado).length, descartados: rows.filter(r => r.status === 'descartado').length } }];` } },
  output: [{ payload: '[]', contatados: 0, descartados: 0 }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Indicacoes', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into serena_indicacoes (msg_id, indicador_contato_id, indicador_nome, indicador_telefone, indicado_telefone, indicado_nome, relacao, contexto, status, resultado, contatado_em) select (x->>'msg_id')::bigint, nullif(x->>'indicador_contato_id','')::uuid, nullif(x->>'indicador_nome',''), nullif(x->>'indicador_telefone',''), nullif(x->>'indicado_telefone',''), nullif(x->>'indicado_nome',''), nullif(x->>'relacao',''), nullif(x->>'contexto',''), coalesce(nullif(x->>'status',''),'novo'), nullif(x->>'resultado',''), case when (x->>'contatado')::boolean then now() else null end from p, jsonb_array_elements(p.j) x on conflict (msg_id) do nothing returning id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ id: 1 }] });

const nota = sticky('## Indicacao: primeiro contato\n\nA cada 10 min procura mensagem de cliente com telefone de OUTRA pessoa dentro. O SQL ja descarta: numero do proprio cliente, bloqueado, opt-out, quem ja e contato ativo nosso (mensagem nos ultimos 60 dias) e quem ja foi indicado nos ultimos indicacao_cooldown_dias (90).\n\nO Claude confirma que e indicacao E que o cliente pediu que falassemos com a pessoa. So entao a Serena manda a primeira mensagem (modo proativo), dizendo quem passou o contato. Entre indicacao_hora_ini e _fim (9h-19h); fora disso espera a proxima rodada.\n\nTudo fica em serena_indicacoes, inclusive o que foi descartado e por que. Aviso no Telegram (topico 289). Kill switch: serena_config indicacao_auto = off.\n\nNasceu em 09/10/2026: o Jean passou o numero da irma, a Serena chamou escalar_humano, se pausou 12h e perdeu a venda dele; a irma nunca foi contatada.', { color: 6, width: 460, height: 320 });

export default workflow('serena-indicacao-contato', '[Serena] Indicacao: Primeiro Contato', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(falar).to(gravar).add(nota);
