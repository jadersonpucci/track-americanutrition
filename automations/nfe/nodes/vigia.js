// No "Vigiar" do workflow AN · NF-e Vigia (pedido pago sem nota). Cron de hora em hora (minuto 25) e
// GET /webhook/nfe-vigia?t=TOKEN[&avisar=0].
// 03/11/2026, pedido do Jaderson: AN-16361 a AN-16368 ficaram sem nota e ninguem viu. Este vigia roda separado do robo de
// emissao (se o robo quebrar, o vigia continua): procura pedido pago ha mais de 2h, dos ultimos 3 dias, com entrega no
// Brasil, que ainda nao tem nota autorizada.
//   - sem registro na nfe_emissoes (o robo nem viu o pedido): pede ao robo para emitir na hora (chamada manual do pedido);
//   - em revisar ou erro (precisa de alguem): so avisa, com o motivo;
//   - processando ou autorizado_sem_anexo ha mais de 2h: avisa.
// Avisa no Telegram (grupo de alertas) no maximo uma vez a cada 12h por pedido (nfe_vigia_alertas).
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const ROBO = 'https://n8n.americanutrition.com/webhook/nfe-focus';
const NFE_TOKEN_MANUAL = '<NFE_TOKEN_MANUAL>';
const TOKEN = '<NFE_VIGIA_TOKEN>';
const TG_BOT = '<TOKEN_ALERTAS>';
const TG_CHAT = '-1003766435449';
const self = this;
const NL = String.fromCharCode(10);
const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const h = (s) => String(s == null ? '' : s).replace(/[<>&]/g, ' ');
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

const ent = $input.first().json || {};
const q = ent.query || {};
const manual = Object.prototype.hasOwnProperty.call(ent, 'query');
if (manual && q.t !== TOKEN) return [{ json: { ok: false, erro: 'acesso negado' } }];
const avisar = !(manual && String(q.avisar) === '0');

const cfg = {};
(await sql("select chave, valor from serena_config where chave like 'nfe_%'")).forEach((x) => { cfg[x.chave] = x.valor; });
if (String(cfg.nfe_modo || 'off') !== 'on') return [{ json: { ok: true, pulado: 'nfe_modo=' + cfg.nfe_modo } }];
const agora = Date.now();
const desde = new Date(Math.max(new Date(cfg.nfe_desde || 0).getTime(), agora - 3 * 86400000)).toISOString();
const ate = new Date(agora - 2 * 3600000).toISOString();

const d = await gql('query($q:String!){ orders(first:150, query:$q, sortKey:CREATED_AT, reverse:true){ nodes{ id name createdAt tags displayFulfillmentStatus shippingAddress{ countryCodeV2 } } } }',
  { q: "created_at:>='" + desde + "' created_at:<='" + ate + "' financial_status:paid -status:cancelled" });
const pedidos = (d.orders.nodes || []).filter((o) => String(((o.shippingAddress || {}).countryCodeV2) || 'BR').toUpperCase() === 'BR'
  && !(o.tags || []).some((t) => String(t).toUpperCase() === 'USA'));
if (!pedidos.length) return [{ json: { ok: true, pedidos: 0 } }];

const linhas = {};
(await sql('select pedido, status, left(coalesce(mensagem, \'\'), 200) as mensagem, extract(epoch from (now() - atualizado_em)) / 3600 as horas from nfe_emissoes where pedido in ('
  + pedidos.map((o) => E(o.name)).join(', ') + ')')).forEach((x) => { linhas[x.pedido] = x; });

const problemas = [];
for (const o of pedidos) {
  const l = linhas[o.name];
  if (l && (l.status === 'autorizado' || l.status === 'ignorado' || l.status === 'cancelado')) continue;
  if (l && (l.status === 'processando' || l.status === 'autorizado_sem_anexo') && Number(l.horas) < 2) continue;
  const p = { pedido: o.name, criado: o.createdAt, enviado: o.displayFulfillmentStatus === 'FULFILLED', status: l ? l.status : 'sem registro', motivo: l ? l.mensagem : '' };
  if (!l) {
    // o robo nem viu o pedido: pede a emissao agora
    try {
      const r = await self.helpers.httpRequest({ method: 'GET', url: ROBO + '?t=' + encodeURIComponent(NFE_TOKEN_MANUAL) + '&pedido=' + encodeURIComponent(o.name) + '&modo=on', json: true, timeout: 120000 });
      const n = ((r && r.novas) || [])[0] || {};
      p.tentativa = n.status || n.erro || 'sem resposta';
    } catch (e) { p.tentativa = 'falhou: ' + String(e.message).slice(0, 120); }
  }
  problemas.push(p);
}
if (!problemas.length) return [{ json: { ok: true, pedidos: pedidos.length, problemas: 0 } }];

// no maximo um aviso por pedido a cada 12h; pedido que o vigia acabou de emitir com sucesso tambem e avisado (uma vez)
const recentes = {};
(await sql("select pedido from nfe_vigia_alertas where alertado_em > now() - interval '12 hours' and pedido in (" + problemas.map((p) => E(p.pedido)).join(', ') + ')'))
  .forEach((x) => { recentes[x.pedido] = true; });
const novos = problemas.filter((p) => !recentes[p.pedido]);
if (avisar && novos.length) {
  const resolvidos = novos.filter((p) => /^(autorizado|processando_autorizacao|processando)$/.test(String(p.tentativa || '')));
  const pendentes = novos.filter((p) => resolvidos.indexOf(p) === -1);
  let t = '🧾 <b>Vigia da NF-e</b>: ' + novos.length + ' pedido' + (novos.length > 1 ? 's' : '') + ' pago' + (novos.length > 1 ? 's' : '') + ' há mais de 2h sem nota' + NL;
  if (resolvidos.length) t += NL + '✅ O robô não tinha visto e eu já pedi a nota:' + NL + resolvidos.map((p) => '• ' + h(p.pedido) + ' → ' + h(p.tentativa) + (p.enviado ? ' (já enviado)' : '')).join(NL) + NL;
  if (pendentes.length) t += NL + '⚠️ Precisa de alguém:' + NL + pendentes.map((p) => '• ' + h(p.pedido) + ' · ' + h(p.status) + (p.motivo ? ': ' + h(p.motivo) : '') + (p.tentativa ? ' · tentativa: ' + h(p.tentativa) : '') + (p.enviado ? ' (já enviado)' : '')).join(NL) + NL
    + 'Depois de corrigir o pedido, peça a nota de novo em /webhook/nfe-focus?pedido=AN-xxxxx&modo=on';
  try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 15000,
    body: { chat_id: TG_CHAT, parse_mode: 'HTML', disable_web_page_preview: true, text: t.slice(0, 4000) } }); } catch (e) {}
  await sql('insert into nfe_vigia_alertas (pedido, status, motivo) values ' + novos.map((p) => '(' + [E(p.pedido), E(p.status), E(String(p.motivo || p.tentativa || '').slice(0, 300))].join(', ') + ')').join(', '));
}
return [{ json: { ok: true, pedidos: pedidos.length, problemas: problemas, avisados: avisar ? novos.length : 0 } }];
