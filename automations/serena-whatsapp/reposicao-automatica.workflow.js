// id nWHsrcGNkuBDgYA2
// n8n Workflow SDK — [Serena] Reposicao Automatica (cron 1h)
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada hora', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// novos: pedidos entregues (aviso "pedido_entregue" ja enviado) ainda sem agendamento; prontos: agendamentos vencidos dentro do horario comercial
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Entregues e Vencidos', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'reposicao_ativa'), 'on') as ativa, coalesce((select valor from serena_config where chave = 'reposicao_dias_antes'), '5')::int as dias_antes, coalesce((select valor from serena_config where chave = 'reposicao_min_dias'), '15')::int as min_dias, coalesce((select valor from serena_config where chave = 'reposicao_hora_ini'), '9')::int as h_ini, coalesce((select valor from serena_config where chave = 'reposicao_hora_fim'), '20')::int as h_fim, coalesce((select valor from serena_config where chave = 'base_treinamento'), '') as base, coalesce((select valor from serena_config where chave = 'modelo'), 'claude-sonnet-5') as modelo, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), novos as (select m.id::text as referencia, regexp_replace(coalesce(m.phone, ''), '\\D', '', 'g') as telefone, m.first_name as nome, m.template_params::text as template_params, m.enviada_em from scheduled_messages m where m.template_name = 'pedido_entregue' and m.status = 'enviada' and coalesce(m.erro, '') not like 'skip:%' and m.enviada_em > now() - interval '3 days' and not exists (select 1 from serena_reposicao r where r.referencia = m.id::text) and not exists (select 1 from serena_reposicao r2 where r2.telefone = regexp_replace(coalesce(m.phone, ''), '\\D', '', 'g') and r2.status = 'agendado') order by m.enviada_em desc limit 15), prontos as (select r.id, r.telefone, r.nome, r.pedido, r.produtos, r.entregue_em, r.dura_dias, r.avisar_em, exists(select 1 from scheduled_messages s where s.template_name = 'pedido_pago_confirmado' and regexp_replace(coalesce(s.phone, ''), '\\D', '', 'g') = r.telefone and s.send_at > r.entregue_em) as comprou_depois, exists(select 1 from disparos_wpp d where d.numero = r.telefone and d.optout) as optout, exists(select 1 from serena_wpp_bloqueados b where b.telefone = r.telefone) as bloqueado, exists(select 1 from serena_wpp_pausas p where p.telefone = r.telefone and p.ate > now()) as pausada, exists(select 1 from serena_reposicao r3 where r3.telefone = r.telefone and r3.status = 'enviado' and r3.enviado_em > now() - interval '30 days') as enviado_recente from serena_reposicao r, cfg where r.status = 'agendado' and r.avisar_em <= now() and cfg.hora between cfg.h_ini and cfg.h_fim order by r.avisar_em limit 8) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(novos)) from novos), '[]'::jsonb) as novos, coalesce((select jsonb_agg(row_to_json(prontos)) from prontos), '[]'::jsonb) as prontos",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativa: 'on', dias_antes: 5, min_dias: 15, h_ini: 9, h_fim: 20, base: '', modelo: 'claude-sonnet-5', hora: 10 }, novos: [], prontos: [] }] });

const processar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Estimar Duracao e Avisar', parameters: { jsCode: `// 1) Para cada pedido entregue, estima com a base de treinamento quantos dias os produtos duram e agenda o aviso.
// 2) Para cada aviso vencido, a Serena escreve a mensagem (Core modo proativo) e envia pelo Samuel.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const modelo = cfg.modelo || 'claude-sonnet-5';
const modeloNovo = /claude-(sonnet|opus|fable)-5|claude-(sonnet|opus)-4-[678]/.test(String(modelo));
const NL = String.fromCharCode(10);

function produtosDe(tp) {
  let j = tp; if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { j = {}; } }
  const cf = (j && j.custom_fields) || {};
  return { produtos: String(cf.produto_entregue || cf.produtos || '').trim(), pedido: String(cf.order_name || '').trim() };
}
function chuteDias(produtos) {
  // fallback sem IA: soma capsulas/comprimidos e assume 2 por dia; nada reconhecido = 30 dias
  let caps = 0; const re = /(\\d+)\\s*x\\s*[^,;]*?(\\d{2,3})\\s*(c[aá]ps|comprimidos|tabs|softgel)/gi; let m;
  while ((m = re.exec(produtos))) caps += Number(m[1]) * Number(m[2]);
  if (!caps) { const re2 = /(\\d{2,3})\\s*(c[aá]ps|comprimidos|tabs|softgel)/gi; while ((m = re2.exec(produtos))) caps += Number(m[1]); }
  return caps ? Math.max(10, Math.round(caps / 2)) : 30;
}

const novos = [];
for (const n of (Array.isArray(d.novos) ? d.novos : [])) {
  const p = produtosDe(n.template_params);
  if (!n.telefone || n.telefone.length < 12) { novos.push({ referencia: n.referencia, telefone: n.telefone || '0', nome: n.nome, pedido: p.pedido, produtos: p.produtos, entregue_em: n.enviada_em, dura_dias: 0, avisar_em: n.enviada_em, status: 'cancelado', motivo: 'sem_telefone' }); continue; }
  let dias = 0, resumo = p.produtos;
  if (p.produtos) {
    try {
      const sys = [];
      if (cfg.base) sys.push({ type: 'text', text: cfg.base, cache_control: { type: 'ephemeral', ttl: '1h' } });
      sys.push({ type: 'text', text: 'Com base na base de treinamento acima (doses recomendadas), estime em quantos dias o cliente termina TODOS os produtos do pedido abaixo, usando a dose padrao de cada um (quantidade x capsulas por frasco / capsulas por dia; frascos iguais se somam, produtos diferentes se tomam em paralelo, entao vale o que dura MAIS). Responda SOMENTE um JSON: {"dias": numero_inteiro, "produtos_resumo": "lista curta dos produtos com quantidade"}. Se nao souber a dose, assuma 2 capsulas por dia.' });
      const corpo = { model: modelo, max_tokens: 150, system: sys, messages: [{ role: 'user', content: 'Pedido ' + p.pedido + ': ' + p.produtos }] };
      if (modeloNovo) corpo.output_config = { effort: 'low' };
      const r = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 60000, body: corpo });
      const txt = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      const m = txt.match(/\\{[\\s\\S]*\\}/);
      if (m) { const j = JSON.parse(m[0]); dias = Math.max(7, Math.min(180, Number(j.dias) || 0)); if (j.produtos_resumo) resumo = String(j.produtos_resumo).slice(0, 300); }
    } catch (e) { dias = 0; }
  }
  if (!dias) dias = chuteDias(p.produtos);
  const espera = Math.max(Number(cfg.min_dias || 15), dias - Number(cfg.dias_antes || 5));
  const avisar = new Date(new Date(n.enviada_em).getTime() + espera * 86400000).toISOString();
  novos.push({ referencia: n.referencia, telefone: n.telefone, nome: n.nome || '', pedido: p.pedido, produtos: resumo, entregue_em: n.enviada_em, dura_dias: dias, avisar_em: avisar, status: p.produtos ? 'agendado' : 'cancelado', motivo: p.produtos ? null : 'sem_produtos' });
}

const prontos = [];
for (const r of (Array.isArray(d.prontos) ? d.prontos : [])) {
  const base = { id: r.id };
  if (String(cfg.ativa || 'on') !== 'on') { break; }
  if (r.comprou_depois) { prontos.push(Object.assign(base, { status: 'comprou', motivo: 'comprou_depois' })); continue; }
  if (r.optout) { prontos.push(Object.assign(base, { status: 'cancelado', motivo: 'optout' })); continue; }
  if (r.bloqueado) { prontos.push(Object.assign(base, { status: 'cancelado', motivo: 'bloqueado' })); continue; }
  if (r.enviado_recente) { prontos.push(Object.assign(base, { status: 'cancelado', motivo: 'enviado_recente' })); continue; }
  if (r.pausada) { continue; } // humano atendendo: tenta na proxima hora
  const diasDesde = Math.round((Date.now() - new Date(r.entregue_em).getTime()) / 86400000);
  const restam = Math.max(0, Number(r.dura_dias || 30) - diasDesde);
  const instr = 'REPOSICAO: o cliente recebeu o pedido ' + (r.pedido || '') + ' com ' + (r.produtos || 'os produtos') + ' ha ' + diasDesde + ' dias. Pela dose recomendada, deve estar acabando em cerca de ' + restam + ' dias. Escreva UMA mensagem curta e calorosa (ate 500 caracteres): pergunte como esta sendo o uso e os resultados, comente que pelo calculo o produto esta perto de acabar e ofereca separar a reposicao para nao interromper o uso, perguntando se ele quer que voce mande o link. NAO mande link agora, nao invente preco nem promocao, nao pressione. Se ele responder que sim, o link sera gerado na proxima mensagem.';
  let texto = '', status = 'cancelado', motivo = 'core_sem_resposta';
  try {
    const c = await this.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 150000, body: { canal: 'whatsapp', telefone: r.telefone, nome: r.nome || '', modo: 'proativo', tipo_proativo: 'reposicao', instrucao: instr } });
    if (c && c.pausada) { continue; }
    texto = (c && c.ok && c.resposta) ? String(c.resposta).trim() : '';
  } catch (e) { motivo = 'core: ' + String(e.message).slice(0, 120); }
  if (texto && texto.length > 30 && texto.length < 1200) {
    try {
      const s = await this.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: r.telefone, text: texto, delay: 2500 } });
      if (s && s.ok) { status = 'enviado'; motivo = null; } else { motivo = 'envio: ' + JSON.stringify(s).slice(0, 150); }
    } catch (e) { motivo = 'envio: ' + String(e.message).slice(0, 120); }
  }
  prontos.push(Object.assign(base, { status: status, motivo: motivo, texto: texto }));
  await new Promise(res => setTimeout(res, 20000 + Math.floor(Math.random() * 15000)));
}
return [{ json: { payload: JSON.stringify({ novos: novos, prontos: prontos }), agendados: novos.length, processados: prontos.length, enviados: prontos.filter(p => p.status === 'enviado').length } }];` } },
  output: [{ payload: '{}', agendados: 0, processados: 0, enviados: 0 }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), ins as (insert into serena_reposicao (referencia, telefone, nome, pedido, produtos, entregue_em, dura_dias, avisar_em, status, motivo) select x->>'referencia', x->>'telefone', x->>'nome', x->>'pedido', x->>'produtos', (x->>'entregue_em')::timestamptz, (x->>'dura_dias')::int, (x->>'avisar_em')::timestamptz, coalesce(x->>'status', 'agendado'), x->>'motivo' from p, jsonb_array_elements(coalesce(p.j->'novos', '[]'::jsonb)) x on conflict (referencia) do nothing returning 1), up as (update serena_reposicao r set status = x->>'status', motivo = x->>'motivo', texto = coalesce(x->>'texto', r.texto), enviado_em = case when x->>'status' = 'enviado' then now() else r.enviado_em end, atualizado_em = now() from p, jsonb_array_elements(coalesce(p.j->'prontos', '[]'::jsonb)) x where r.id = (x->>'id')::bigint returning 1) select (select count(*) from ins)::int as agendados, (select count(*) from up)::int as atualizados",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ agendados: 0, atualizados: 0 }] });

const nota = sticky('## Reposicao automatica\n\nA cada hora:\n1. Pedidos com aviso "entregue" enviado viram um agendamento: a Serena estima (pela base de treinamento) quantos dias os produtos duram e marca o aviso para dias_antes do fim (minimo reposicao_min_dias).\n2. Agendamentos vencidos, dentro do horario (reposicao_hora_ini..fim BRT), viram uma mensagem escrita pela Serena (Core proativo, tipo reposicao) enviada pelo Samuel.\n\nPula: quem comprou de novo, opt-out, bloqueados, pausados (tenta depois) e quem ja recebeu reposicao em 30 dias.\nKill switch: serena_config reposicao_ativa = off.', { color: 4, width: 420, height: 260 });

export default workflow('serena-reposicao', '[Serena] Reposicao Automatica', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(processar).to(gravar).add(nota);
