// No "Cancelar NF-e" do workflow AN · NF-e Focus (emitir e anexar) (s1JHMJosqDcEeWbr). 11/11/2026, pedido do Jaderson:
// pedido cancelado na Shopify -> cancela a NF-e na Focus/SEFAZ, se ainda estiver no prazo (24 h da autorizacao).
// Entradas:
//   - Shopify orders/cancelled -> POST /webhook/nfe-cancelar (corpo = pedido). Sem token: o aviso so dispara uma
//     conferencia; quem decide e a propria Shopify (o pedido precisa estar cancelado de verdade) e a nfe_emissoes.
//   - Rede de seguranca a cada 30 min: notas autorizadas nas ultimas 30 h cujo pedido foi cancelado.
// Regras:
//   - so cancela nota 'autorizado' / 'autorizado_sem_anexo' de pedido com cancelledAt na Shopify;
//   - pedido ja enviado (fulfillment) nao cancela sozinho: avisa no Telegram (mercadoria saiu, precisa devolucao);
//   - fora do prazo (mais de PRAZO_H horas desde a emissao) nao tenta: avisa no Telegram para emitir NF-e de entrada
//     (devolucao) com o contador;
//   - cada pedido e tratado uma vez (nfe_emissoes.cancel_status); o aviso de fora do prazo nao repete.
// Modo em serena_config.nfe_cancelar_auto: off | simulacao (so avisa o que faria) | on.
// Chaves lidas do no 'Chaves NF-e (não apagar)', como no 'Emitir e Anexar'.
const _fonte = String((($('Chaves NF-e (não apagar)').params) || {}).jsCode || '');
const _chave = (k) => { const m = _fonte.match(new RegExp('const ' + k + " = '([^']*)'")); return m ? m[1] : ''; };
const SK = _chave('SK');
const SB = 'https://supabase.americanutrition.com/pg/query';
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const FOCUS = 'https://api.focusnfe.com.br';
const FOCUS_TOKEN = _chave('FOCUS_TOKEN');
const TG_BOT = _chave('TG_BOT');
const TG_CHAT = '-1003766435449';
const PRAZO_H = 23.5; // a SEFAZ aceita cancelamento ate 24 h depois da autorizacao; margem de 30 min
const JUSTIFICATIVA = 'Pedido cancelado a pedido do cliente antes do envio da mercadoria.';
const self = this;
if (!SK || !FOCUS_TOKEN) return [{ json: { ok: false, erro: 'chaves do emissor nao encontradas no no Chaves NF-e (não apagar)' } }];

const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const html = (s) => String(s == null ? '' : s).replace(/[<>&]/g, ' ');
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const d = resp && resp.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || resp).slice(0, 300));
  return d.data;
}
async function focus(method, path, body) {
  const r = await self.helpers.httpRequest({ method: method, url: FOCUS + path, json: true, body: body, timeout: 60000, returnFullResponse: true, ignoreHttpStatusErrors: true,
    headers: { Authorization: 'Basic ' + Buffer.from(FOCUS_TOKEN + ':').toString('base64') } });
  return { status: r.statusCode, body: r.body || {} };
}
async function alerta(texto) {
  try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 10000,
    body: { chat_id: TG_CHAT, parse_mode: 'HTML', disable_web_page_preview: true, text: texto } }); } catch (e) {}
}
async function marcar(pedido, st, extra) {
  await sql('update nfe_emissoes set cancel_status = ' + E(st) + ', cancel_em = now()'
    + (extra && extra.cancelado ? ", status = 'cancelado'" : '')
    + (extra && extra.resposta ? ', resposta = coalesce(resposta, \'{}\'::jsonb) || jsonb_build_object(\'cancelamento\', ' + E(JSON.stringify(extra.resposta)) + '::jsonb)' : '')
    + ', atualizado_em = now() where pedido = ' + E(pedido));
}

const ent = $input.first().json || {};
const corpo = (ent.body && typeof ent.body === 'object') ? ent.body : {};
const evShopify = !!(corpo.admin_graphql_api_id && corpo.name);

const cfg = {};
(await sql("select chave, valor from serena_config where chave in ('nfe_cancelar_auto')")).forEach((x) => { cfg[x.chave] = x.valor; });
const modo = String(cfg.nfe_cancelar_auto || 'off');
if (modo === 'off') return [{ json: { ok: true, modo: modo, nada: true } }];

// notas candidatas: a do aviso, ou as autorizadas nas ultimas 30 h ainda nao tratadas
let rows;
if (evShopify) {
  if (!corpo.cancelled_at) return [{ json: { ok: true, ignorado: 'aviso sem cancelled_at', pedido: corpo.name } }];
  rows = await sql("select pedido, shopify_order_id, status, numero, serie, criado_em from nfe_emissoes where pedido = " + E(String(corpo.name).trim().toUpperCase())
    + " and status in ('autorizado', 'autorizado_sem_anexo') and cancel_status is null");
} else {
  rows = await sql("select pedido, shopify_order_id, status, numero, serie, criado_em from nfe_emissoes where status in ('autorizado', 'autorizado_sem_anexo')"
    + " and cancel_status is null and criado_em > now() - interval '30 hours' and shopify_order_id is not null order by criado_em limit 100");
}
if (!rows.length) return [{ json: { ok: true, modo: modo, candidatas: 0 } }];

// situacao de cada pedido na Shopify (a fonte da verdade e a Shopify, nao o aviso)
const gid = (id) => /^gid:/.test(String(id)) ? String(id) : 'gid://shopify/Order/' + String(id).replace(/\D/g, '');
const ids = rows.filter((r) => r.shopify_order_id).map((r) => gid(r.shopify_order_id));
const situ = {};
for (let i = 0; i < ids.length; i += 50) {
  const d = await gql('query($ids:[ID!]!){ nodes(ids:$ids){ ... on Order { id name cancelledAt cancelReason displayFulfillmentStatus } } }', { ids: ids.slice(i, i + 50) });
  (d.nodes || []).forEach((o) => { if (o && o.name) situ[String(o.name).toUpperCase()] = o; });
}

const saida = { ok: true, modo: modo, candidatas: rows.length, itens: [] };
for (const r of rows) {
  const o = situ[String(r.pedido).toUpperCase()];
  if (!o || !o.cancelledAt) continue; // pedido nao cancelado: nada a fazer
  const nota = 'NF-e ' + html(r.numero) + (r.serie ? '/' + html(r.serie) : '');
  const horas = (Date.now() - new Date(r.criado_em).getTime()) / 3600000;
  const enviado = /FULFILLED|PARTIAL/i.test(String(o.displayFulfillmentStatus || '')) && !/UNFULFILLED/i.test(String(o.displayFulfillmentStatus || ''));
  if (enviado) {
    if (modo === 'on') await marcar(r.pedido, 'enviado_alertado');
    await alerta('⚠️ <b>Pedido cancelado já enviado</b>: ' + html(r.pedido) + ' (' + nota + ').\nA nota não foi cancelada automaticamente porque a mercadoria saiu. Ver com o contador a NF-e de devolução.');
    saida.itens.push({ pedido: r.pedido, resultado: 'ja_enviado' });
    continue;
  }
  if (horas > PRAZO_H) {
    if (modo === 'on') await marcar(r.pedido, 'fora_prazo');
    await alerta('⚠️ <b>NF-e fora do prazo de cancelamento</b>: ' + html(r.pedido) + ' (' + nota + '), emitida há ' + Math.round(horas) + ' h.\nA SEFAZ só cancela até 24 h. Precisa de NF-e de entrada (devolução): falar com o contador.');
    saida.itens.push({ pedido: r.pedido, resultado: 'fora_prazo', horas: Math.round(horas) });
    continue;
  }
  if (modo !== 'on') {
    await alerta('🧪 <b>Simulação</b>: cancelaria a ' + nota + ' do pedido ' + html(r.pedido) + ' (cancelado na Shopify, emitida há ' + Math.round(horas * 10) / 10 + ' h).');
    saida.itens.push({ pedido: r.pedido, resultado: 'simulado' });
    continue;
  }
  const resp = await focus('DELETE', '/v2/nfe/' + encodeURIComponent(r.pedido), { justificativa: JUSTIFICATIVA });
  const b = resp.body || {};
  const ok = resp.status < 300 && (b.status === 'cancelado' || String(b.status_sefaz || '') === '135' || String(b.status_sefaz || '') === '155');
  if (ok) {
    await marcar(r.pedido, 'cancelado', { cancelado: true, resposta: b });
    await alerta('🧾❌ <b>NF-e cancelada</b>: ' + nota + ' do pedido ' + html(r.pedido) + ' (pedido cancelado na Shopify). SEFAZ ' + html(b.status_sefaz || '') + ' ' + html(b.mensagem_sefaz || ''));
    saida.itens.push({ pedido: r.pedido, resultado: 'cancelado', sefaz: b.status_sefaz });
  } else {
    await marcar(r.pedido, 'erro', { resposta: { http: resp.status, body: b } });
    await alerta('⚠️ <b>Falha ao cancelar NF-e</b>: ' + nota + ' do pedido ' + html(r.pedido) + '.\nFocus ' + resp.status + ': ' + html(b.mensagem_sefaz || b.mensagem || JSON.stringify(b).slice(0, 200)) + '\nCancelar à mão na Focus enquanto estiver dentro das 24 h.');
    saida.itens.push({ pedido: r.pedido, resultado: 'erro', http: resp.status });
  }
}
return [{ json: saida }];
