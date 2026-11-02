// No "Montar e Enviar" do workflow [Serena] Relatorio Semanal (Telegram). Segunda 8h41 BRT, fechando a semana anterior
// (segunda a domingo), e GET /webhook/serena-relatorio-semanal?t=<RELATORIO_TOKEN_MANUAL>[&enviar=0] para rodar na mao.
// 02/11/2026, pedido do Jaderson: um resumo por semana da Serena no Telegram (topico 289), com a comparacao com a
// semana anterior:
//   - conversas, links de pagamento, links abertos por gente (sem o clique do robo de previa, anl_click_humano);
//   - pedidos e receita do WhatsApp (tag WPP e AF: Serena na Shopify) e conversao link -> pedido;
//   - follow-ups de link (nao aberto e aberto sem pagamento), handoffs para a equipe;
//   - lacunas novas, abertas e a proposta da base que espera aprovacao;
//   - satisfacao (pesquisa de 1 a 5): enviadas, respondidas, media e os comentarios de nota baixa;
//   - as 3 piores conversas da semana (nota baixa na pesquisa ou na auditoria diaria), com o link do WhatsApp.
// serena_config.relatorio_semanal: on | off.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const TG_BOT = '<TOKEN_ALERTAS>';
const TOKEN_MANUAL = '<RELATORIO_TOKEN_MANUAL>';
const self = this;
const NL = String.fromCharCode(10);
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 60000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
const um = async (q) => (await sql(q))[0] || {};
const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ent = $input.first().json || {};
const qy = ent.query || {};
const manual = Object.prototype.hasOwnProperty.call(ent, 'query');
if (manual && qy.t !== TOKEN_MANUAL) return [{ json: { ok: false, erro: 'acesso negado' } }];
const cfg = await um("select coalesce((select valor from serena_config where chave = 'relatorio_semanal'), 'on') as ativo, "
  + "to_char(date_trunc('week', now() at time zone 'America/Sao_Paulo') - interval '7 days', 'YYYY-MM-DD') as ini, "
  + "to_char(date_trunc('week', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as fim, "
  + "to_char(date_trunc('week', now() at time zone 'America/Sao_Paulo') - interval '14 days', 'YYYY-MM-DD') as ini_ant");
if (cfg.ativo !== 'on' && !manual) return [{ json: { ok: true, pulado: 'relatorio_semanal=off' } }];
const enviar = !(manual && String(qy.enviar) === '0');

// [ini, fim) em horario de Brasilia
const P = (ini, fim) => ({ a: "('" + ini + "'::timestamp at time zone 'America/Sao_Paulo')", b: "('" + fim + "'::timestamp at time zone 'America/Sao_Paulo')" });
async function serena(ini, fim) {
  const p = P(ini, fim);
  const ent = (col) => col + ' >= ' + p.a + ' and ' + col + ' < ' + p.b;
  return um(
    "with lk as (select distinct (regexp_match(m.texto, 'seguro\\.americanutrition\\.com/([A-Za-z0-9]+)'))[1] as slug, m.criado_em from serena_mensagens m " +
    "where m.papel = 'serena' and (m.autor is null or m.autor = 'reprocessado') and m.texto ~ 'seguro\\.americanutrition\\.com/[A-Za-z0-9]+' and " + ent('m.criado_em') + "), " +
    "lc as (select lk.slug, exists (select 1 from anl_links l join anl_clicks k on k.link_id = l.id where l.slug = lk.slug and k.ts >= lk.criado_em - interval '1 minute' and anl_click_humano(k.ua)) as aberto " +
    "from lk join anl_links l2 on l2.slug = lk.slug where l2.destino ilike '%checkout.americanutrition.com%') " +
    "select (select count(distinct contato_id) from serena_mensagens where papel = 'cliente' and canal = 'whatsapp' and " + ent('criado_em') + ")::int as conversas, " +
    "(select count(*) from serena_mensagens where papel = 'cliente' and canal = 'whatsapp' and " + ent('criado_em') + ")::int as msgs, " +
    "(select count(distinct slug) from lc)::int as links, (select count(distinct slug) from lc where aberto)::int as abertos, " +
    "(select count(*) from serena_link_followups where resultado = 'enviado' and " + ent('enviado_em') + ")::int as fu_nao_aberto, " +
    "(select count(*) from serena_link_aberto_followups where resultado = 'enviado' and " + ent('enviado_em') + ")::int as fu_aberto, " +
    "(select count(*) from serena_atribuicoes where " + ent('atribuido_em') + ")::int as handoffs, " +
    "(select count(*) from serena_lacunas where " + ent('criado_em') + ")::int as lacunas_novas, " +
    "(select count(*) from serena_satisfacao where status = 'enviado' and " + ent('enviado_em') + ")::int as pesq_enviadas, " +
    "(select count(*) from serena_satisfacao where status = 'enviado' and nota is not null and " + ent('enviado_em') + ")::int as pesq_respostas, " +
    "(select round(avg(nota)::numeric, 2) from serena_satisfacao where status = 'enviado' and nota is not null and " + ent('enviado_em') + ")::text as pesq_media, " +
    "(select count(*) from serena_satisfacao where status = 'enviado' and nota >= 4 and " + ent('enviado_em') + ")::int as pesq_boas, " +
    "(select round(avg(nota)::numeric, 1) from serena_auditorias where dia >= '" + ini + "'::date and dia < '" + fim + "'::date)::text as aud_media, " +
    "(select count(*) from serena_auditorias where dia >= '" + ini + "'::date and dia < '" + fim + "'::date)::int as aud_n"
  );
}
async function loja(ini, fim) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'consultar', endpoint: 'orders.json', params: { status: 'any', limit: 250, created_at_min: ini + 'T00:00:00-03:00', created_at_max: fim + 'T00:00:00-03:00', fields: 'id,name,created_at,total_price,tags,cancelled_at' } } });
  const orders = ((r && r.dados && r.dados.orders) || []).filter((o) => !o.cancelled_at && new Date(o.created_at) < new Date(fim + 'T00:00:00-03:00'));
  const tem = (o, t) => String(o.tags || '').toLowerCase().split(',').map((x) => x.trim()).indexOf(t) !== -1;
  const soma = (a) => a.reduce((s, o) => s + Number(o.total_price || 0), 0);
  const wpp = orders.filter((o) => tem(o, 'wpp') || tem(o, 'af: serena'));
  return { pedidos: orders.length, receita: soma(orders), wpp: wpp.length, receita_wpp: soma(wpp), cheio: orders.length >= 250 };
}

const fimD = new Date(cfg.fim + 'T12:00:00Z'); fimD.setUTCDate(fimD.getUTCDate() - 1);
const dm = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const rotulo = dm(cfg.ini) + ' a ' + dm(fimD.toISOString().slice(0, 10));
let s1, s0, l1, l0;
try { s1 = await serena(cfg.ini, cfg.fim); s0 = await serena(cfg.ini_ant, cfg.ini); } catch (e) { return [{ json: { ok: false, etapa: 'sql', erro: String(e.message || e) } }]; }
try { l1 = await loja(cfg.ini, cfg.fim); l0 = await loja(cfg.ini_ant, cfg.ini); } catch (e) { return [{ json: { ok: false, etapa: 'shopify', erro: String(e.message || e) } }]; }

const estado = await um("select (select count(*) from serena_lacunas where status = 'aberta')::int as lacunas_abertas, "
  + "(select id from serena_base_propostas where status in ('pendente', 'parcial') order by id desc limit 1) as proposta, "
  + "(select token from serena_base_propostas where status in ('pendente', 'parcial') order by id desc limit 1) as token");
const P1 = P(cfg.ini, cfg.fim);
const comentarios = await sql("select coalesce(nullif(split_part(nome, ' ', 1), ''), telefone) as nome, telefone, nota, left(comentario, 200) as comentario from serena_satisfacao "
  + "where status = 'enviado' and nota <= 3 and enviado_em >= " + P1.a + " and enviado_em < " + P1.b + " order by nota, enviado_em limit 5");
// piores: nota baixa na pesquisa (peso maior, e o cliente falando) e as menores notas da auditoria
const piores = await sql("select * from ("
  + " select 'pesquisa' as fonte, s.nota * 2 as nota10, coalesce(nullif(split_part(c.nome, ' ', 1), ''), s.telefone) as nome, regexp_replace(c.telefone, '\\D', '', 'g') as tel, "
  + "   coalesce('Nota ' || s.nota || ' na pesquisa' || coalesce(': ' || left(s.comentario, 160), ''), '') as resumo from serena_satisfacao s join serena_contatos c on c.id = s.contato_id "
  + "   where s.status = 'enviado' and s.nota <= 3 and s.enviado_em >= " + P1.a + " and s.enviado_em < " + P1.b
  + " union all select 'auditoria', a.nota, coalesce(nullif(split_part(c.nome, ' ', 1), ''), c.telefone), regexp_replace(c.telefone, '\\D', '', 'g'), left(a.resumo, 220) "
  + "   from serena_auditorias a join serena_contatos c on c.id = a.contato_id where a.dia >= '" + cfg.ini + "'::date and a.dia < '" + cfg.fim + "'::date and a.nota <= 7"
  + ") x order by nota10, fonte desc limit 3");

const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pct = (a, b) => (Number(b) > 0 ? Math.round(100 * Number(a) / Number(b)) + '%' : '-');
const var_ = (a, b) => { a = Number(a || 0); b = Number(b || 0); if (!b) return ''; const d = Math.round(100 * (a - b) / b); return ' <i>(' + (d >= 0 ? '+' : '') + d + '%)</i>'; };

let t = '📊 <b>Serena · semana ' + rotulo + '</b>' + NL + '<i>(entre parênteses, a variação contra a semana anterior)</i>' + NL + NL;
t += '💬 Conversas: <b>' + s1.conversas + '</b>' + var_(s1.conversas, s0.conversas) + ' · ' + s1.msgs + ' mensagens de clientes' + NL;
t += '🔗 Links de pagamento: <b>' + s1.links + '</b>' + var_(s1.links, s0.links) + ' · abertos: ' + s1.abertos + ' (' + pct(s1.abertos, s1.links) + ')' + NL;
t += '🛒 Pedidos do WhatsApp: <b>' + l1.wpp + '</b>' + var_(l1.wpp, l0.wpp) + ' · ' + brl(l1.receita_wpp) + var_(l1.receita_wpp, l0.receita_wpp) + NL;
t += '   conversão link → pedido: <b>' + pct(l1.wpp, s1.links) + '</b> · ' + pct(l1.receita_wpp, l1.receita) + ' da receita da loja (' + brl(l1.receita) + ')' + (l1.cheio ? ' ⚠️ 250+ pedidos, conta parcial' : '') + NL;
t += '🔁 Follow-ups de link: ' + s1.fu_nao_aberto + ' não abertos · ' + s1.fu_aberto + ' abertos sem pagamento' + NL;
t += '🙋 Passou para a equipe: ' + s1.handoffs + NL + NL;

t += '⭐ <b>Satisfação</b>: ';
if (Number(s1.pesq_enviadas) > 0) {
  t += s1.pesq_respostas + ' de ' + s1.pesq_enviadas + ' responderam (' + pct(s1.pesq_respostas, s1.pesq_enviadas) + ')';
  if (Number(s1.pesq_respostas) > 0) t += ' · média <b>' + String(s1.pesq_media).replace('.', ',') + '</b> · ' + pct(s1.pesq_boas, s1.pesq_respostas) + ' deram 4 ou 5';
  t += NL;
  for (const c of comentarios) t += '   • ' + h(c.nome) + ' (' + c.nota + '): ' + (c.comentario ? '“' + h(c.comentario) + '”' : '<i>sem comentário</i>') + NL;
} else t += 'nenhuma pesquisa enviada na semana' + NL;
if (Number(s1.aud_n) > 0) t += '🔎 Auditoria diária: média ' + String(s1.aud_media).replace('.', ',') + ' em ' + s1.aud_n + ' conversas' + NL;
t += NL;

t += '📚 <b>Base</b>: ' + s1.lacunas_novas + ' lacunas novas' + var_(s1.lacunas_novas, s0.lacunas_novas) + ' · ' + estado.lacunas_abertas + ' abertas';
if (estado.proposta) t += NL + '   ⏳ Proposta ' + estado.proposta + ' esperando aprovação: <a href="https://n8n.americanutrition.com/webhook/serena-base-proposta?t=' + encodeURIComponent(estado.token) + '&id=' + estado.proposta + '&acao=ver">ver e aprovar</a>';
t += NL + NL;

t += '👎 <b>Piores conversas da semana</b>' + NL;
if (!piores.length) t += '   nenhuma com nota baixa 🎉' + NL;
piores.forEach((p, i) => { t += (i + 1) + '. ' + h(p.nome) + ' (' + (p.fonte === 'pesquisa' ? 'pesquisa' : 'auditoria ' + p.nota10 + '/10') + ')' + (p.tel ? ' · <a href="https://wa.me/' + p.tel + '">WhatsApp</a>' : ' · Instagram/site') + NL + '   ' + h(p.resumo) + NL; });

if (enviar) {
  try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 20000,
    body: { chat_id: '-1003766435449', message_thread_id: 289, text: t.slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: true } }); }
  catch (e) { return [{ json: { ok: false, etapa: 'telegram', erro: String(e.message || e), texto: t } }]; }
}
return [{ json: { ok: true, enviado: enviar, semana: rotulo, serena: s1, anterior: s0, loja: l1, loja_anterior: l0, texto: t } }];
