// Code node "Antecipacao: pular ciclo" do workflow AN - Assinatura Antecipacao (pular ciclo), cron 30 min.
//
// REGRA (27/10/2026, Jaderson): assinante que ANTECIPA a renovacao (PIX/boleto da Serena com cupom ASSINANTE)
// paga agora e a proxima cobranca da assinatura NAO acontece: pula direto para o ciclo seguinte.
// Antes nada ligava o pedido avulso a assinatura: o cartao cobrava de novo no ciclo (Carlos, AN-16238, ia
// ser cobrado 3 dias depois) e o PIX automatico ficava "aguardando", mandava lembrete e PAUSAVA quem ja
// tinha pago (Valdecir AN-16182, Marta AN-16193, Claudia AN-15444/AN-15738).
//
// Para cada pedido pago com a tag cupom:ASSINANTE dos ultimos dias, ainda nao ligado a uma cobranca:
//  1) acha a assinatura pelo telefone (8 ultimos digitos), CPF ou e-mail;
//  2) se o ciclo atual (proximo_ciclo) ja tem cobranca aberta (aguardando/falhou: PIX gerado e nao pago) o
//     pedido PAGA esse ciclo: cobranca vira 'pago' com o pedido; se a assinatura foi pausada por PIX nao
//     pago, volta a ficar ativa;
//  3) sem cobranca aberta e o ciclo vence em ate JANELA_DIAS: ANTECIPACAO, grava o ciclo como pago pelo pedido;
//  4) nos casos 2 e 3: proximo_ciclo += ciclo_dias, renovacoes + 1, tentativas = 0;
//  5) ciclo ainda longe (cliente acabou de renovar e comprou mais), cobranca de cartao em andamento ou
//     assinatura nao encontrada: nao mexe, avisa a equipe no Telegram para olhar.
// Modo em serena_config.assinatura_antecipacao: off | simulacao | on. Em simulacao nada e gravado.
// serena_config.assinatura_antecipacao_dias: quantos dias para tras olhar (padrao 3; maior so para repescagem).
const SUPA = 'https://supabase.americanutrition.com/pg/query';
const SK = 'SUPABASE_SERVICE_KEY';
const TG_BOT = '<TOKEN_ALERTAS>';
const TG_CHAT = '-1003766435449', TG_THREAD = 98;   // topico de assinaturas
const JANELA_DIAS = 25;                            // ate quantos dias antes do ciclo conta como antecipacao
const self = this;

const sql = async q => self.helpers.httpRequest({ method: 'POST', url: SUPA, json: true, timeout: 30000,
  headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
const esc = s => String(s == null ? '' : s).replace(/'/g, "''");
const gql = async (query, variables) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 40000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query, variables } } });
  return (r && r.dados && r.dados.data) || {};
};
const tg = async text => { try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 20000,
  body: { chat_id: TG_CHAT, message_thread_id: TG_THREAD, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e) {} };
const html = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dig = s => String(s || '').replace(/\D/g, '');
const fim8 = s => { const d = dig(s); return d.length >= 8 ? d.slice(-8) : ''; };
const br = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m; };
const addDias = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00Z') - new Date(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);

let modo = 'simulacao', diasAtras = 3;
try {
  const c = await sql("select chave, valor from serena_config where chave in ('assinatura_antecipacao','assinatura_antecipacao_dias')");
  for (const r of (c || [])) { if (r.chave === 'assinatura_antecipacao') modo = String(r.valor || 'simulacao').trim(); else diasAtras = Math.max(1, Math.min(60, Number(r.valor) || 3)); }
} catch (e) {}
if (modo === 'off') return [{ json: { modo, nada: true } }];

// 1) pedidos pagos com cupom ASSINANTE (Serena PIX/boleto) dos ultimos dias (serena_config.assinatura_antecipacao_dias, padrao 3)
const desde = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
const Q = 'query($q:String!){ orders(first:50, sortKey:CREATED_AT, reverse:true, query:$q){ nodes{ name legacyResourceId createdAt cancelledAt displayFinancialStatus email phone tags'
  + ' totalPriceSet{ shopMoney{ amount } } customer{ phone email } shippingAddress{ phone } localizationExtensions(first:3){ nodes{ key value } } } } }';
let pedidos = [];
try { const d = await gql(Q, { q: "tag:'cupom:ASSINANTE' created_at:>=" + desde }); pedidos = ((d.orders || {}).nodes) || []; } catch (e) { return [{ json: { erro: 'shopify', detalhe: String(e) } }]; }
pedidos = pedidos.filter(o => !o.cancelledAt && /^(PAID|PARTIALLY_REFUNDED)$/.test(String(o.displayFinancialStatus || '')));
if (!pedidos.length) return [{ json: { modo, pedidos: 0 } }];

// 2) pedidos ja ligados a alguma cobranca
const ids = pedidos.map(o => "'" + esc(o.legacyResourceId) + "'").join(',');
const ligados = new Set(((await sql('select pedido_shopify_id from assinatura_cobrancas where pedido_shopify_id in (' + ids + ')')) || []).map(r => String(r.pedido_shopify_id)));

// 3) assinaturas candidatas (com a cobranca do ciclo atual)
const subs = (await sql("select a.id, a.nome, a.whatsapp, a.email, a.cpf, a.metodo, a.status, a.ciclo_dias, to_char(a.proximo_ciclo,'YYYY-MM-DD') as proximo_ciclo, a.valor_centavos, coalesce(a.renovacoes,0) as renovacoes, coalesce(a.cancelar_no_fim,false) as cancelar_no_fim,"
  + " c.id as cob_id, c.status as cob_status, c.erro as cob_erro"
  + " from assinaturas a left join assinatura_cobrancas c on c.assinatura_id = a.id and c.ciclo_ref = to_char(a.proximo_ciclo,'YYYY-MM-DD')"
  + " where a.status in ('ativa','inadimplente','pausada')")) || [];

const feitos = [], revisar = [];
for (const o of pedidos) {
  const oid = String(o.legacyResourceId);
  if (ligados.has(oid)) continue;
  const tels = [o.phone, (o.customer || {}).phone, (o.shippingAddress || {}).phone].map(fim8).filter(Boolean);
  const cpf = dig(((o.localizationExtensions || {}).nodes || []).map(x => x.value).join(''));
  const mail = String(o.email || (o.customer || {}).email || '').toLowerCase().trim();
  const achadas = subs.filter(s => (fim8(s.whatsapp) && tels.includes(fim8(s.whatsapp))) || (cpf.length === 11 && dig(s.cpf) === cpf) || (mail && String(s.email || '').toLowerCase().trim() === mail));
  const valor = Number(((o.totalPriceSet || {}).shopMoney || {}).amount || 0);
  const ped = { pedido: o.name, id: oid, valor, data: o.createdAt.slice(0, 10) };
  if (achadas.length !== 1) { revisar.push(Object.assign(ped, { motivo: achadas.length ? 'mais de uma assinatura para este cliente' : 'cupom ASSINANTE sem assinatura encontrada' })); continue; }
  const s = achadas[0];
  const pc = s.proximo_ciclo, ciclo = Number(s.ciclo_dias || 30);
  const aberta = s.cob_id && /^(aguardando|falhou|expirado)$/.test(String(s.cob_status));
  let tipo = null;
  if (s.cob_status === 'processando') { revisar.push(Object.assign(ped, { nome: s.nome, motivo: 'cobranca de cartao em andamento no ciclo ' + br(pc) })); continue; }
  if (aberta) tipo = 'pagou_ciclo';
  else if (!s.cob_id && diasEntre(ped.data, pc) <= JANELA_DIAS) tipo = 'antecipou';
  else { revisar.push(Object.assign(ped, { nome: s.nome, motivo: 'proxima renovacao so em ' + br(pc) + ' (' + diasEntre(ped.data, pc) + ' dias): parece compra extra, nao pulei' })); continue; }
  const novo = addDias(pc, ciclo);
  const reativar = s.status === 'pausada' && tipo === 'pagou_ciclo' && !s.cancelar_no_fim;
  const nota = (tipo === 'antecipou' ? 'antecipado: pago pelo pedido ' : 'pago pelo pedido ') + o.name + ' (' + br(ped.data) + ')';
  if (modo === 'on') {
    await sql('begin;'
      + (tipo === 'pagou_ciclo'
        ? "update assinatura_cobrancas set status='pago', pedido_shopify_id='" + esc(oid) + "', erro='" + esc(nota) + "', atualizado_em=now() where id='" + esc(s.cob_id) + "'::uuid;"
        : "insert into assinatura_cobrancas (assinatura_id, ciclo_ref, status, tentativa, valor_centavos, pedido_shopify_id, erro) values ('" + esc(s.id) + "'::uuid, '" + pc + "', 'pago', 1, " + Math.round(valor * 100) + ", '" + esc(oid) + "', '" + esc(nota) + "') on conflict (assinatura_id, ciclo_ref) do nothing;")
      + "update assinaturas set proximo_ciclo='" + novo + "', renovacoes=coalesce(renovacoes,0)+1, tentativas=0"
      + (reativar || s.status === 'inadimplente' ? ", status='ativa'" : '')
      + ", atualizado_em=now() where id='" + esc(s.id) + "'::uuid and to_char(proximo_ciclo,'YYYY-MM-DD')='" + pc + "';"
      + 'commit;');
  }
  feitos.push(Object.assign(ped, { nome: s.nome, metodo: s.metodo, tipo, ciclo_pulado: pc, proximo: novo, reativada: reativar }));
}

if (feitos.length || revisar.length) {
  const cab = modo === 'on' ? '🔁 <b>Assinatura: pedido avulso de assinante</b>' : '🧪 <b>Assinatura: antecipação (simulação, nada gravado)</b>';
  const l1 = feitos.map(f => '• ' + html(f.nome) + ' · ' + html(f.pedido) + ' (' + f.metodo + ')' + '\n   ' + (f.tipo === 'antecipou' ? 'Antecipou: o ciclo de ' + br(f.ciclo_pulado) + ' não será cobrado' : 'Pagou a renovação de ' + br(f.ciclo_pulado) + ' pelo PIX avulso') + '. Próxima: <b>' + br(f.proximo) + '</b>' + (f.reativada ? ' · assinatura reativada' : ''));
  const l2 = revisar.map(r => '⚠️ ' + html(r.nome || 'Cliente') + ' · ' + html(r.pedido) + ': ' + html(r.motivo));
  await tg([cab].concat(l1, l2).join('\n'));
}
return [{ json: { modo, pedidos: pedidos.length, feitos, revisar } }];
