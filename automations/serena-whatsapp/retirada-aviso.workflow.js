// id m4RXocg2pK1nlvqC
// n8n Workflow SDK — [Serena] Aviso de Retirada (cron 1h): quando os Correios deixam o pedido para retirada, a Serena
// manda pelo WhatsApp o endereco da unidade, o que levar e o prazo. Lembrete depois de 3 dias se continuar la.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada hora', parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// Pacotes dos Correios (formato AA123456789BR) com aviso "pedido_enviado" nos ultimos 25 dias, ainda nao finalizados,
// sem consulta nas ultimas ~2h. Os entregues saem da lista na primeira consulta, entao o volume cai rapido.
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Pacotes Correios', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'retirada_aviso'), 'simulacao') as modo, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), env as (select distinct on (upper(m.template_params::jsonb->'custom_fields'->>'tracking_number')) upper(m.template_params::jsonb->'custom_fields'->>'tracking_number') as codigo, m.template_params::jsonb->'custom_fields'->>'order_name' as pedido, regexp_replace(coalesce(m.phone, ''), '\\D', '', 'g') as telefone, m.first_name as nome, m.enviada_em from scheduled_messages m where m.template_name = 'pedido_enviado' and m.status = 'enviada' and coalesce(m.erro, '') not like 'skip:%' and m.enviada_em > now() - interval '25 days' and m.enviada_em < now() - interval '20 hours' order by upper(m.template_params::jsonb->'custom_fields'->>'tracking_number'), m.enviada_em desc), lista as (select e.codigo, e.pedido, e.telefone, e.nome, a.avisado_em, a.lembrete_em, coalesce(a.avisos, 0) as avisos, (select c.id::text from serena_contatos c where regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') = e.telefone order by c.atualizado_em desc limit 1) as contato_id from env e left join serena_retirada_avisos a on a.codigo = e.codigo where e.codigo ~ '^[A-Z]{2}[0-9]{9}BR$' and coalesce(a.finalizado, false) = false and (a.checado_em is null or a.checado_em < now() - interval '115 minutes') and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = e.telefone) and not exists (select 1 from disparos_wpp d where d.numero = e.telefone and d.optout) order by a.checado_em asc nulls first, e.enviada_em asc limit 60) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(lista)) from lista), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { modo: 'simulacao', hora: 10 }, lista: [] }] });

const verificar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Consultar e Avisar Retirada', parameters: { jsCode: `// Consulta o motor de rastreio; quando ele devolve rastreio.retirada (no 'Detectar Retirada'), a Serena avisa o cliente
// com endereco, link do mapa, documentos e prazo. Modo em serena_config.retirada_aviso: off | simulacao | on.
// Em simulacao nada e enviado: o texto sai no resultado e a equipe recebe a lista no Telegram.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const modo = String(cfg.modo || 'simulacao');
const horaOk = Number(cfg.hora) >= 8 && Number(cfg.hora) <= 20;
const RASTREIO = 'https://n8n.americanutrition.com/webhook/rastreio/buscar';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const TOKEN = 'an-serena-9Kx4Lm2Q';
const NL = String.fromCharCode(10);
const DIA = 86400000;
if (modo === 'off') return [{ json: { payload: '[]', msgs: '[]', modo, consultados: 0 } }];

const primeiroNome = n => { const p = String(n || '').trim().split(/\\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };
const dataBR = iso => { try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } };
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function texto(tipo, it, r) {
  const nome = primeiroNome(it.nome);
  const oi = nome ? 'Oi, ' + nome + '!' : 'Oi!';
  const onde = r.endereco ? '📍 *' + r.endereco + '*' + NL + '🗺️ ' + r.maps_url : '📍 Unidade dos Correios de *' + [r.cidade, r.uf].filter(Boolean).join('/') + '* (o endereço exato aparece em https://track.americanutrition.com/' + it.codigo + ')';
  const prazo = r.prazo_ate ? NL + NL + '⏰ Retire até *' + dataBR(r.prazo_ate) + '*. Depois disso os Correios devolvem o pacote para nós.' : '';
  const docs = 'Leve o código *' + it.codigo + '* e um documento oficial com foto. Se outra pessoa for buscar, ela precisa de uma autorização sua assinada e de uma cópia do seu documento.';
  if (tipo === 'lembrete') {
    return oi + ' Aqui é a Serena, da America Nutrition 💙' + NL + NL + 'Passando para lembrar que o seu pedido *' + (it.pedido || '') + '* continua esperando você na agência dos Correios:' + NL + NL + onde + NL + NL + docs + prazo + NL + NL + 'Se tiver qualquer dificuldade para buscar, me chama aqui que a gente resolve junto.';
  }
  const motivo = /sem entrega|restri/i.test(r.motivo || '') ? 'Os Correios não fazem entrega domiciliar no seu endereço' : 'Os Correios não conseguiram entregar no seu endereço';
  return oi + ' Aqui é a Serena, da America Nutrition 💙' + NL + NL + motivo + ', então o seu pedido *' + (it.pedido || '') + '* ficou disponível para retirada aqui:' + NL + NL + onde + NL + NL + docs + prazo + NL + NL + 'Qualquer dúvida, é só me chamar por aqui!';
}

const rows = [], msgs = [], avisados = [];
for (const it of lista) {
  let x = null;
  try {
    const rr0 = await this.helpers.httpRequest({ method: 'POST', url: RASTREIO, json: true, timeout: 40000, body: { modo: 'codigo', codigo: it.codigo } });
    const rr = rr0 && (rr0.body || rr0);
    x = (rr && rr.sucesso && rr.rastreio) || null;
  } catch (e) { x = null; }
  const statusTxt = x ? String(x.status_atual || '') : 'sem retorno do rastreio';
  const r = x && x.retirada && x.retirada.aguardando ? x.retirada : null;
  const finalizado = !!(x && !r && (x.status_chave === 'delivered' || x.extraviado || /entregue|devolvid|devolu|cancelad|extraviad/i.test(statusTxt)));
  const row = { codigo: it.codigo, pedido: it.pedido, telefone: it.telefone, nome: it.nome || '', status_chave: x ? (x.status_chave || null) : null, status_txt: statusTxt.slice(0, 200), finalizado, retirada_endereco: r ? (r.endereco || [r.cidade, r.uf].filter(Boolean).join('/')) : null, retirada_desde: r ? r.desde : null, retirada_prazo: r ? r.prazo_ate : null, avisou: null };
  let tipo = null;
  if (r && horaOk) {
    const prazoOk = !r.prazo_ate || new Date(r.prazo_ate).getTime() - Date.now() > 6 * 3600000;
    if (!it.avisado_em && prazoOk) tipo = 'aviso';
    else if (it.avisado_em && !it.lembrete_em && Date.now() - new Date(it.avisado_em).getTime() > 3 * DIA && prazoOk) tipo = 'lembrete';
  }
  if (tipo) {
    const t = texto(tipo, it, r);
    if (modo === 'on') {
      let ok = false;
      try { const s = await this.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: it.telefone, text: t, delay: 2500 } }); ok = !!(s && s.ok); } catch (e) { ok = false; }
      if (ok) {
        row.avisou = tipo;
        msgs.push({ telefone: it.telefone, texto: t });
        if (it.contato_id) {
          try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000, body: { t: TOKEN, acao: 'nota', contato_id: it.contato_id, chave: 'retirada correios', texto: 'Pedido ' + (it.pedido || '') + ' (' + it.codigo + ') aguardando retirada em ' + (row.retirada_endereco || '?') + (r.prazo_ate ? ', prazo ' + dataBR(r.prazo_ate) : '') + '. Serena avisou o cliente (' + tipo + ').', autor: 'serena' } }); } catch (e) {}
          try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000, body: { t: TOKEN, acao: 'etiquetar', contato_id: it.contato_id, etiqueta: 'retirada-correios', autor: 'serena' } }); } catch (e) {}
        }
        await new Promise(res => setTimeout(res, 12000 + Math.floor(Math.random() * 10000)));
      }
    }
    avisados.push({ tipo, nome: it.nome, pedido: it.pedido, codigo: it.codigo, endereco: row.retirada_endereco, prazo: r.prazo_ate, enviado: row.avisou === tipo, contato_id: it.contato_id, texto: t });
  }
  rows.push(row);
}
if (avisados.length) {
  const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=' + TOKEN;
  const cab = modo === 'on' ? '\\u{1F4EE} <b>Retirada nos Correios: ' + avisados.length + ' aviso(s) enviado(s)</b>' : '\\u{1F9EA} <b>Retirada nos Correios (simulação, nada enviado): ' + avisados.length + '</b>';
  const txt = cab + NL + avisados.map(a => '\\u2022 ' + (a.tipo === 'lembrete' ? '[lembrete] ' : '') + esc(a.nome || 'Cliente') + ' - ' + esc(a.pedido || '') + ' <code>' + esc(a.codigo) + '</code>' + NL + '   ' + esc(a.endereco || '') + (a.prazo ? ' · até ' + esc(dataBR(a.prazo)) : '') + (modo === 'on' && !a.enviado ? ' · <b>falhou o envio</b>' : '') + (a.contato_id ? ' <a href="' + INBOX + '&c=' + a.contato_id + '">Inbox</a>' : '')).join(NL);
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e) {}
}
return [{ json: { payload: JSON.stringify(rows), msgs: JSON.stringify(msgs), modo, consultados: rows.length, retirada: rows.filter(r => r.retirada_endereco).length, avisos: avisados, finalizados: rows.filter(r => r.finalizado).length } }];` } },
  output: [{ payload: '[]', msgs: '[]', modo: 'simulacao', consultados: 0 }] });

// Grava o estado de cada codigo e registra no historico da conversa as mensagens enviadas
const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Estado', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j, $2::jsonb m), up as (insert into serena_retirada_avisos (codigo, pedido, telefone, nome, status_chave, status_txt, finalizado, retirada_endereco, retirada_desde, retirada_prazo, avisado_em, lembrete_em, avisos, checado_em) select x->>'codigo', x->>'pedido', x->>'telefone', x->>'nome', x->>'status_chave', x->>'status_txt', coalesce((x->>'finalizado')::boolean, false), x->>'retirada_endereco', nullif(x->>'retirada_desde', '')::timestamptz, nullif(x->>'retirada_prazo', '')::timestamptz, case when x->>'avisou' = 'aviso' then now() end, case when x->>'avisou' = 'lembrete' then now() end, case when x->>'avisou' is not null then 1 else 0 end, now() from p, jsonb_array_elements(p.j) x on conflict (codigo) do update set pedido = excluded.pedido, telefone = excluded.telefone, status_chave = excluded.status_chave, status_txt = excluded.status_txt, finalizado = excluded.finalizado, retirada_endereco = coalesce(excluded.retirada_endereco, serena_retirada_avisos.retirada_endereco), retirada_desde = coalesce(excluded.retirada_desde, serena_retirada_avisos.retirada_desde), retirada_prazo = coalesce(excluded.retirada_prazo, serena_retirada_avisos.retirada_prazo), avisado_em = coalesce(serena_retirada_avisos.avisado_em, excluded.avisado_em), lembrete_em = coalesce(serena_retirada_avisos.lembrete_em, excluded.lembrete_em), avisos = serena_retirada_avisos.avisos + excluded.avisos, checado_em = now(), atualizado_em = now() returning 1), hist as (insert into serena_mensagens (contato_id, papel, texto, autor, entregue) select (select c.id from serena_contatos c where regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') = y->>'telefone' order by c.atualizado_em desc limit 1), 'serena', y->>'texto', 'proativo:retirada', true from p, jsonb_array_elements(p.m) y where exists (select 1 from serena_contatos c where regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') = y->>'telefone') returning 1) select (select count(*) from up)::int as gravados, (select count(*) from hist)::int as historico",
  options: { queryReplacement: "={{ [$json.payload, $json.msgs] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ gravados: 0, historico: 0 }] });

const nota = sticky('## Aviso de retirada (Correios)\n\nA cada hora (avisos so entre 8h e 20h) consulta o motor de rastreio para os pacotes dos Correios enviados nos ultimos 25 dias. Quando o motor devolve rastreio.retirada (endereco da unidade), a Serena manda o endereco, o link do mapa, o que levar e o prazo. Lembrete 3 dias depois se continuar la. Cada codigo e consultado no maximo a cada ~2h; entregues saem da lista. serena_config.retirada_aviso: off | simulacao | on.', { color: 4, width: 440, height: 220 });

export default workflow('serena-aviso-retirada', '[Serena] Aviso de Retirada', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(verificar).to(gravar).add(nota);
