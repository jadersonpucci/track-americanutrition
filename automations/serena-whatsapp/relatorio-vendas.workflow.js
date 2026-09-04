// id zwchhPYGzK73hFPd
// n8n Workflow SDK — [Serena] Relatorio Diario de Vendas (Telegram, 20h BRT)
// Links de checkout gerados pela Serena no dia, contatos, cliques (AN Links), pedidos com tag WPP na Shopify (n, receita),
// conversao link -> pedido e comparacao com o mesmo dia da semana anterior. Envia no Telegram (topico 289).
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Todo dia 20h', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 20 * * *' }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Calcular e Enviar', parameters: { jsCode: `const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
const SB = 'https://supabase.americanutrition.com/pg/query';
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const TG = 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage';
const self = this;
async function sql(q) { return await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 }); }
async function shop(body) { return await self.helpers.httpRequest({ method: 'POST', url: SHOP, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: body, json: true, timeout: 60000 }); }

// dia de referencia: hoje (BRT); comparacao: mesmo dia da semana passada
const cfg = await sql("select coalesce((select valor from serena_config where chave='relatorio_vendas'),'on') as ativo, to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as hoje, to_char(((now() at time zone 'America/Sao_Paulo')::date - 7), 'YYYY-MM-DD') as semana");
const c = (Array.isArray(cfg) && cfg[0]) || {};
if (c.ativo !== 'on') return [{ json: { ok: true, pulado: 'relatorio_vendas=off' } }];
const HOJE = c.hoje, SEM = c.semana;

async function serenaDia(dia) {
  const q = "with base as (select m.id, m.contato_id, m.criado_em, (regexp_match(m.texto, 'seguro\\\\.americanutrition\\\\.com/([A-Za-z0-9]+)'))[1] as slug from serena_mensagens m where m.papel = 'serena' and m.texto ~ 'seguro\\\\.americanutrition\\\\.com/[A-Za-z0-9]+' and (m.criado_em at time zone 'America/Sao_Paulo')::date = '" + dia + "'::date) select count(distinct base.slug)::int as links, count(distinct base.contato_id)::int as contatos, (select count(distinct k.link_id) from anl_clicks k join anl_links l on l.id = k.link_id where l.slug in (select slug from base) and (k.ts at time zone 'America/Sao_Paulo')::date >= '" + dia + "'::date)::int as links_clicados, (select count(distinct m2.contato_id) from serena_mensagens m2 where m2.papel = 'cliente' and m2.canal = 'whatsapp' and (m2.criado_em at time zone 'America/Sao_Paulo')::date = '" + dia + "'::date)::int as conversas, (select count(*) from serena_link_followups f where (f.enviado_em at time zone 'America/Sao_Paulo')::date = '" + dia + "'::date and f.resultado = 'enviado')::int as followups from base";
  const r = await sql(q); return (Array.isArray(r) && r[0]) || {};
}
async function shopifyDia(dia) {
  const r = await shop({ acao: 'consultar', endpoint: 'orders.json', params: { status: 'any', limit: 250, created_at_min: dia + 'T00:00:00-03:00', created_at_max: dia + 'T23:59:59-03:00', fields: 'id,name,created_at,total_price,tags,cancelled_at,financial_status' } });
  const orders = ((r && r.dados && r.dados.orders) || []).filter(o => !o.cancelled_at);
  const tem = (o, t) => String(o.tags || '').toLowerCase().split(',').map(x => x.trim()).indexOf(t) !== -1;
  const wpp = orders.filter(o => tem(o, 'wpp'));
  const soma = a => a.reduce((s, o) => s + Number(o.total_price || 0), 0);
  return { pedidos: orders.length, receita: soma(orders), wpp: wpp.length, receita_wpp: soma(wpp), serena: orders.filter(o => tem(o, 'af: serena')).length };
}
let hoje, sem, sh, ss;
try { hoje = await serenaDia(HOJE); sem = await serenaDia(SEM); } catch (e) { return [{ json: { ok: false, etapa: 'sql', erro: String(e.message || e) } }]; }
try { sh = await shopifyDia(HOJE); ss = await shopifyDia(SEM); } catch (e) { return [{ json: { ok: false, etapa: 'shopify', erro: String(e.message || e) } }]; }

const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
const pct = (a, b) => (b > 0 ? Math.round(100 * a / b) + '%' : '-');
const delta = (a, b) => { a = Number(a || 0); b = Number(b || 0); if (!b) return a ? ' (novo)' : ''; const d = Math.round(100 * (a - b) / b); return ' (' + (d >= 0 ? '+' : '') + d + '% vs semana passada)'; };
const [y, mo, d] = HOJE.split('-');
const NL = String.fromCharCode(10);
let t = '📊 <b>Serena · vendas de ' + d + '/' + mo + '</b>' + NL + NL;
t += '💬 Conversas no WhatsApp: <b>' + (hoje.conversas || 0) + '</b>' + delta(hoje.conversas, sem.conversas) + NL;
t += '🔗 Links de pagamento gerados: <b>' + (hoje.links || 0) + '</b> para ' + (hoje.contatos || 0) + ' clientes' + delta(hoje.links, sem.links) + NL;
t += '👆 Links abertos: <b>' + (hoje.links_clicados || 0) + '</b> (' + pct(hoje.links_clicados, hoje.links) + ' dos gerados)' + NL;
t += '🔁 Follow-ups de link enviados: ' + (hoje.followups || 0) + NL + NL;
t += '🛒 Pedidos com tag WPP: <b>' + sh.wpp + '</b> · ' + brl(sh.receita_wpp) + delta(sh.wpp, ss.wpp) + NL;
t += '   ' + (sh.serena || 0) + ' com AF: Serena · conversão link→pedido: <b>' + pct(sh.wpp, hoje.links) + '</b>' + NL;
t += '🏪 Loja no dia: ' + sh.pedidos + ' pedidos · ' + brl(sh.receita) + ' (WhatsApp = ' + pct(sh.receita_wpp, sh.receita) + ' da receita)' + NL + NL;
t += '<i>Semana passada, mesmo dia: ' + (sem.links || 0) + ' links, ' + ss.wpp + ' pedidos WPP, ' + brl(ss.receita_wpp) + '</i>';
try {
  await self.helpers.httpRequest({ method: 'POST', url: TG, json: true, timeout: 20000, body: { chat_id: '-1003766435449', message_thread_id: 289, text: t, parse_mode: 'HTML', disable_web_page_preview: true } });
} catch (e) { return [{ json: { ok: false, etapa: 'telegram', erro: String(e.message || e), texto: t } }]; }
return [{ json: { ok: true, hoje: hoje, semana_passada: sem, shopify_hoje: sh, shopify_semana: ss, texto: t } }];` } }, output: [{ ok: true }] });

const nota = sticky('## Relatorio diario de vendas da Serena\n\nTodo dia as 20h (BRT): conversas, links de pagamento gerados, links abertos (cliques no AN Links), follow-ups, pedidos com tag WPP e receita (Shopify), conversao link->pedido, e comparacao com o mesmo dia da semana anterior. Vai para o Telegram, topico 289. Desligar: serena_config relatorio_vendas = off.', [cron, montar], { color: 4 });

export default workflow('serena-relatorio-vendas', '[Serena] Relatorio Diario de Vendas', { settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo' } })
  .add(cron).to(montar).add(nota);
