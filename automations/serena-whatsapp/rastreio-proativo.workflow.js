// id OtzYsPkyTEIfPG4P
// n8n Workflow SDK — [Serena] Rastreio Proativo (cron 6h): avisa o cliente antes dele perguntar quando o pedido para na transportadora
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 6 horas', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// pedidos enviados (aviso pedido_enviado ja foi) sem aviso de entrega, nos ultimos 45 dias
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Em Transito', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'rastreio_proativo'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'rastreio_parado_dias'), '3')::int as parado_dias, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), env as (select m.id, regexp_replace(coalesce(m.phone, ''), '\\D', '', 'g') as telefone, m.first_name as nome, m.template_params::jsonb as tp, m.enviada_em, substring(m.reference_id from '^[a-z]+_[0-9]+') as ref from scheduled_messages m where m.template_name = 'pedido_enviado' and m.status = 'enviada' and coalesce(m.erro, '') not like 'skip:%' and m.enviada_em > now() - interval '45 days'), lista as (select e.tp->'custom_fields'->>'tracking_number' as codigo, e.tp->'custom_fields'->>'order_name' as pedido, e.tp->'custom_fields'->>'tracking_company' as transportadora, e.telefone, e.nome, e.enviada_em, (select c.id::text from serena_contatos c where regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') = e.telefone order by c.atualizado_em desc limit 1) as contato_id, a.avisado_em, coalesce(a.avisos, 0) as avisos, a.ultimo_evento_em as ultimo_evento_antes from env e left join serena_rastreio_alertas a on a.codigo = e.tp->'custom_fields'->>'tracking_number' where nullif(e.tp->'custom_fields'->>'tracking_number', '') is not null and not exists (select 1 from scheduled_messages o where o.template_name = 'pedido_entregue' and o.status = 'enviada' and substring(o.reference_id from '^[a-z]+_[0-9]+') = e.ref) and coalesce(a.entregue, false) = false and (a.atualizado_em is null or a.atualizado_em < now() - interval '5 hours') and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = e.telefone) and not exists (select 1 from disparos_wpp d where d.numero = e.telefone and d.optout) order by e.enviada_em asc limit 25) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(lista)) from lista), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', parado_dias: 3, hora: 10 }, lista: [] }] });

const verificar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Consultar Rastreio e Avisar', parameters: { jsCode: `// Consulta o motor de rastreio (o mesmo do track.americanutrition.com). Parado ha N dias sem entrega: a Serena avisa o cliente,
// abre nota + etiqueta no contato e a equipe recebe um resumo no Telegram (topico de alertas).
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const RASTREIO = 'https://n8n.americanutrition.com/webhook/rastreio/buscar';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const TOKEN = 'an-serena-9Kx4Lm2Q';
const TRACK = 'https://track.americanutrition.com/';
const NL = String.fromCharCode(10);
const paradoDias = Number(cfg.parado_dias || 3);
const horaOk = Number(cfg.hora) >= 8 && Number(cfg.hora) <= 20;
const ativo = String(cfg.ativo || 'on') === 'on';
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function dataDe(ev) {
  if (!ev) return null;
  const cands = [ev.data_iso, ev.timestamp, ev.data_hora, ev.data];
  for (const c of cands) {
    if (!c) continue;
    let t = new Date(c); if (!isNaN(t)) return t;
    const m = String(c).match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})(?:\\s+(\\d{2}):(\\d{2}))?/);
    if (m) { t = new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T' + (m[4] || '12') + ':' + (m[5] || '00') + ':00-03:00'); if (!isNaN(t)) return t; }
  }
  return null;
}
const rows = [], avisados = [];
for (const it of lista) {
  let x = null;
  try {
    const rr0 = await this.helpers.httpRequest({ method: 'POST', url: RASTREIO, json: true, timeout: 40000, body: { modo: 'codigo', codigo: it.codigo } });
    const rr = rr0 && (rr0.body || rr0);
    x = (rr && rr.sucesso && rr.rastreio) || null;
  } catch (e) { x = null; }
  const evs = (x && Array.isArray(x.eventos) ? x.eventos : []).filter(e => !e.eh_importacao);
  const statusTxt = x ? String(x.status_atual || (evs[0] && evs[0].status) || '') : 'sem retorno do rastreio';
  const entregue = !!(x && (x.status_chave === 'delivered' || /entreg/i.test(x.status_atual || '')));
  // cancelado, devolvido ao remetente ou extraviado: nao e caso de aviso de "parado"; fecha o acompanhamento (entregue=true = finalizado)
  const finalizado = !!(x && (['canceled', 'cancelled', 'returned', 'return_to_sender', 'lost', 'exception'].indexOf(String(x.status_chave || '')) >= 0 || /cancel|devolvid|retornad|extraviad|returned|devolu/i.test(statusTxt)));
  const ultimo = dataDe(evs[0]) || (it.ultimo_evento_antes ? new Date(it.ultimo_evento_antes) : null) || new Date(it.enviada_em);
  const parado = Math.floor((Date.now() - ultimo.getTime()) / 86400000);
  const row = { codigo: it.codigo, pedido: it.pedido, telefone: it.telefone, nome: it.nome || '', ultimo_evento_em: ultimo.toISOString(), status_chave: x ? (x.status_chave || null) : null, status_txt: statusTxt.slice(0, 200), entregue: entregue || finalizado, avisar: false };
  const podeAvisar = ativo && horaOk && !entregue && !finalizado && x && parado >= paradoDias && Number(it.avisos || 0) < 2 && (!it.avisado_em || (Date.now() - new Date(it.avisado_em).getTime()) > 4 * 86400000);
  if (podeAvisar) {
    const link = TRACK + encodeURIComponent(it.codigo);
    const instr = 'RASTREIO PARADO: o pedido ' + (it.pedido || '') + ' (rastreio ' + it.codigo + (it.transportadora ? ', ' + it.transportadora : '') + ') esta sem movimentacao ha ' + parado + ' dias. Ultimo status: "' + statusTxt + '". Link oficial de acompanhamento: ' + link + '. Escreva UMA mensagem curta (ate 500 caracteres) avisando o cliente ANTES que ele pergunte: diga que notamos a parada, que ja estamos verificando com a transportadora e que ele nao precisa fazer nada; inclua o link; nao prometa data nem reenvio; termine dizendo que qualquer novidade voce avisa por aqui e que ele pode responder se quiser.';
    let texto = '';
    try {
      const c = await this.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 150000, body: { canal: 'whatsapp', telefone: it.telefone, nome: it.nome || '', modo: 'proativo', tipo_proativo: 'rastreio_parado', instrucao: instr } });
      texto = (c && c.ok && !c.pausada && c.resposta) ? String(c.resposta).trim() : '';
    } catch (e) { texto = ''; }
    if (texto && texto.length > 30 && texto.length < 1200) {
      let ok = false;
      try { const s = await this.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: it.telefone, text: texto, delay: 2500 } }); ok = !!(s && s.ok); } catch (e) { ok = false; }
      if (ok) {
        row.avisar = true;
        avisados.push({ nome: it.nome, pedido: it.pedido, codigo: it.codigo, parado: parado, status: statusTxt, contato_id: it.contato_id });
        if (it.contato_id) {
          try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000, body: { t: TOKEN, acao: 'nota', contato_id: it.contato_id, chave: 'rastreio parado', texto: 'Pedido ' + (it.pedido || '') + ' (' + it.codigo + ') parado ha ' + parado + ' dias: "' + statusTxt + '". Serena avisou o cliente em ' + new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Verificar com a transportadora.', autor: 'serena' } }); } catch (e) {}
          try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000, body: { t: TOKEN, acao: 'etiquetar', contato_id: it.contato_id, etiqueta: 'rastreio-parado', autor: 'serena' } }); } catch (e) {}
        }
        await new Promise(res => setTimeout(res, 15000 + Math.floor(Math.random() * 10000)));
      }
    }
  }
  rows.push(row);
}
if (avisados.length) {
  const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=' + TOKEN;
  const txt = '\\u{1F4E6} <b>Rastreio parado: ' + avisados.length + ' pedido(s)</b>' + NL + 'A Serena ja avisou os clientes. Vale abrir verificacao com a transportadora:' + NL + avisados.map(a => '\\u2022 ' + esc(a.nome || 'Cliente') + ' - ' + esc(a.pedido || '') + ' <code>' + esc(a.codigo) + '</code> parado ha ' + a.parado + ' dias (' + esc(a.status) + ')' + (a.contato_id ? ' <a href="' + INBOX + '&c=' + a.contato_id + '">Inbox</a>' : '')).join(NL);
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage', json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt, parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e) {}
}
return [{ json: { payload: JSON.stringify(rows), consultados: rows.length, avisados: avisados.length, entregues: rows.filter(r => r.entregue).length } }];` } },
  output: [{ payload: '[]', consultados: 0, avisados: 0, entregues: 0 }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Estado', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into serena_rastreio_alertas (codigo, pedido, telefone, nome, ultimo_evento_em, status_chave, status_txt, avisado_em, avisos, entregue) select x->>'codigo', x->>'pedido', x->>'telefone', x->>'nome', nullif(x->>'ultimo_evento_em', '')::timestamptz, x->>'status_chave', x->>'status_txt', case when (x->>'avisar')::boolean then now() else null end, case when (x->>'avisar')::boolean then 1 else 0 end, coalesce((x->>'entregue')::boolean, false) from p, jsonb_array_elements(p.j) x on conflict (codigo) do update set pedido = excluded.pedido, ultimo_evento_em = excluded.ultimo_evento_em, status_chave = excluded.status_chave, status_txt = excluded.status_txt, avisado_em = coalesce(excluded.avisado_em, serena_rastreio_alertas.avisado_em), avisos = serena_rastreio_alertas.avisos + excluded.avisos, entregue = excluded.entregue, atualizado_em = now() returning 1",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ success: true }] });

const nota = sticky('## Rastreio proativo\n\nA cada 6h consulta o motor de rastreio para os pedidos enviados sem aviso de entrega. Se o ultimo evento tem mais de rastreio_parado_dias (padrao 3) e ainda nao foi entregue: a Serena avisa o cliente (Core proativo, tipo rastreio_parado), grava nota + etiqueta rastreio-parado no contato e a equipe recebe a lista no Telegram (topico 289). No maximo 2 avisos por codigo, com 4 dias de intervalo. Kill switch: rastreio_proativo = off.', { color: 4, width: 420, height: 220 });

export default workflow('serena-rastreio-proativo', '[Serena] Rastreio Proativo', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(verificar).to(gravar).add(nota);
