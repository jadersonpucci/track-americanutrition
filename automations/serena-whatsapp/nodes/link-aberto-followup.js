// No "Selecionar e Enviar" do workflow [Serena WhatsApp] Follow-up de Link aberto sem pagamento.
// Cron 15 min (so 9h-20h BRT) e GET /webhook/link-aberto-followup?t=<LINK_ABERTO_TOKEN_MANUAL>&modo=simulacao|on.
// 02/11/2026, pedido do Jaderson: quem ABRIU o link de pagamento da Serena e nao pagou recebe UMA mensagem ~3h depois,
// perguntando se ficou duvida e lembrando o parcelamento (ate 3x sem juros) e o PIX/boleto pela conversa.
//
// Clique de verdade: o AN Links grava tambem a visita do nosso proprio servidor (ua "node", Boston), que abre o link
// segundos depois do envio para montar a previa. Ela nao conta: so vale clique com anl_click_humano(ua).
//
// So link mandado pela Serena na conversa (autor nulo ou reprocessado). Link da regua de carrinho (proativo:carrinho)
// e de outros robos tem follow-up proprio.
//
// Fica de fora quem:
//   - falou depois do clique (a conversa esta viva, a Serena cuida) ou recebeu outra mensagem da Serena depois do link
//     (novo link, carrinho abandonado, recusa, pedido pago...);
//   - comecou o checkout (linha em carrinhos_abandonados com o telefone): a regua de carrinho ja cuida;
//   - tem pedido na Shopify criado depois do link (pago ou aguardando PIX/boleto);
//   - ja recebeu follow-up de link (aberto ou nao aberto) nos ultimos 7 dias;
//   - esta na fila humana, pausado, bloqueado, com IA pausada, ou e da equipe.
// serena_config.link_aberto_followup: off | simulacao (grava o texto, nao envia) | on.
// serena_config.link_aberto_followup_horas: horas depois do clique (3).
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const TOKEN_MANUAL = '<LINK_ABERTO_TOKEN_MANUAL>';
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];
const POR_RODADA = 10;
const self = this;

const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
async function gql(query) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query } } });
  return (resp && resp.dados && resp.dados.data) || null;
}

// ---------- entrada ----------
const ent = $input.first().json || {};
const q = ent.query || {};
const manual = Object.prototype.hasOwnProperty.call(ent, 'query');
if (manual && q.t !== TOKEN_MANUAL) return [{ json: { ok: false, erro: 'acesso negado' } }];

const cfg = {};
(await sql("select chave, valor from serena_config where chave like 'link_aberto_followup%'")).forEach((x) => { cfg[x.chave] = x.valor; });
let modo = String(cfg.link_aberto_followup || 'off');
if (manual && /^(simulacao|on)$/.test(String(q.modo || ''))) modo = q.modo;
if (modo === 'off') return [{ json: { ok: true, modo: modo, nada: true } }];
const horaBR = (new Date().getUTCHours() + 21) % 24;
if (!manual && (horaBR < 9 || horaBR >= 20)) return [{ json: { ok: true, modo: modo, fora_do_horario: horaBR } }];
const horas = Math.max(1, Math.min(12, Number(cfg.link_aberto_followup_horas || 3)));

// ---------- candidatos ----------
// ultimo link de checkout da Serena por contato nas ultimas 30h, com clique humano entre `horas` e 22h atras
const cands = await sql(
  "with m as (select distinct on (m.contato_id) m.id, m.contato_id, m.criado_em, c.telefone, c.nome, " +
  "(regexp_match(m.texto, 'seguro\\.americanutrition\\.com/([A-Za-z0-9]+)'))[1] as slug " +
  "from serena_mensagens m join serena_contatos c on c.id = m.contato_id " +
  "where m.papel = 'serena' and m.canal = 'whatsapp' and m.texto ~ 'seguro\\.americanutrition\\.com/[A-Za-z0-9]+' " +
  "and (m.autor is null or m.autor = 'reprocessado') and m.criado_em > now() - interval '30 hours' order by m.contato_id, m.criado_em desc), " +
  "x as (select m.*, (select min(k.ts) from anl_clicks k where k.link_id = l.id and k.ts >= m.criado_em - interval '1 minute' and anl_click_humano(k.ua)) as clique " +
  "from m join anl_links l on l.slug = m.slug where l.destino ilike '%checkout.americanutrition.com%') " +
  "select x.id as msg_id, x.contato_id, regexp_replace(x.telefone, '\\D', '', 'g') as telefone, coalesce(x.nome, '') as nome, x.slug, " +
  "x.criado_em as link_em, x.clique from x " +
  "where x.clique is not null and x.clique <= now() - interval '" + horas + " hours' and x.clique > now() - interval '22 hours' " +
  "and not exists (select 1 from serena_link_aberto_followups f where f.msg_id = x.id) " +
  "and not exists (select 1 from serena_link_aberto_followups f where f.contato_id = x.contato_id and f.resultado = 'enviado' and f.enviado_em > now() - interval '7 days') " +
  "and not exists (select 1 from serena_link_followups f where f.contato_id = x.contato_id and f.resultado = 'enviado' and f.enviado_em > now() - interval '7 days') " +
  "and not exists (select 1 from serena_mensagens a where a.contato_id = x.contato_id and a.criado_em > x.criado_em and ((a.papel = 'cliente' and a.criado_em > x.clique) or (a.papel = 'serena' and a.id <> x.id))) " +
  "and not exists (select 1 from carrinhos_abandonados ca where serena_tel_canon(ca.whatsapp) = serena_tel_canon(x.telefone) and ca.criado_em > x.criado_em - interval '10 minutes') " +
  "and not exists (select 1 from serena_atribuicoes a where a.contato_id = x.contato_id and a.status = 'aberto') " +
  "and not exists (select 1 from serena_wpp_pausas p where p.telefone = serena_tel_canon(x.telefone) and p.ate > now()) " +
  "and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = serena_tel_canon(x.telefone)) " +
  "and not exists (select 1 from serena_conversas v where v.contato_id = x.contato_id and v.ia_pausada = true and v.aberta_em > now() - interval '2 days') " +
  "order by x.clique limit 30"
);

// primeiro nome apresentavel ("TORQUATO" -> "Torquato"); numero, sigla ou apelido estranho fica sem nome
function primeiroNome(n) {
  const p = String(n || '').trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ]{3,14}$/.test(p)) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}
const TEXTOS = [
  (n) => 'Oi' + (n ? ', ' + n : '') + '! Tudo bem? Passando para saber se deu tudo certo com o seu pedido 🙂 Ficou alguma dúvida sobre o produto, o frete ou o pagamento? No cartão dá para dividir em até 3x sem juros, e se preferir eu gero o PIX ou o boleto aqui mesmo. É só me falar 💙',
  (n) => 'Oi' + (n ? ', ' + n : '') + '! Seu pedido ainda está esperando o pagamento 🙂 Ficou alguma dúvida que eu possa tirar? Se ajudar, no cartão dá para dividir em até 3x sem juros, e também posso gerar o PIX ou o boleto por aqui 💙'
];

const out = [];
let enviados = 0;
for (const c of cands) {
  if (out.length >= POR_RODADA) break;
  const tel = String(c.telefone || '');
  if (!tel || EQUIPE.indexOf(tel) !== -1) continue;
  const registrar = async (resultado, texto) => {
    await sql('insert into serena_link_aberto_followups (msg_id, contato_id, telefone, slug, clique_em, resultado, texto) values (' +
      [Number(c.msg_id), E(c.contato_id) + '::uuid', E(tel), E(c.slug), E(c.clique), E(resultado), E(texto || null)].join(', ') + ') on conflict (msg_id) do nothing');
  };

  // pedido na Shopify depois do link (pago ou aguardando): nao cobra
  let comprou = false, shopifyOk = true;
  try {
    const d = await gql('{ customers(first:1, query:"phone:+' + tel + '"){ nodes{ orders(first:3, sortKey:CREATED_AT, reverse:true){ nodes{ name createdAt cancelledAt } } } } }');
    if (!d) shopifyOk = false;
    const ords = ((((d || {}).customers || {}).nodes || [])[0] || {}).orders;
    const desde = new Date(c.link_em).getTime() - 10 * 60000;
    comprou = !!(ords && (ords.nodes || []).some((o) => !o.cancelledAt && new Date(o.createdAt).getTime() >= desde));
  } catch (e) { shopifyOk = false; }
  if (!shopifyOk) { out.push({ telefone: tel, resultado: 'pulado: shopify indisponivel' }); continue; }
  if (comprou) { await registrar('ja_comprou', null); out.push({ telefone: tel, resultado: 'ja_comprou' }); continue; }

  const texto = TEXTOS[Number(c.msg_id) % TEXTOS.length](primeiroNome(c.nome));
  if (modo !== 'on') { await registrar('simulado', texto); out.push({ telefone: tel, resultado: 'simulado', texto: texto }); continue; }

  let ok = false, det = null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: tel, text: texto, delay: 1200 } });
    ok = !!(r && r.ok); det = ok ? null : JSON.stringify(r).slice(0, 200);
  } catch (e) { det = String(e.message || e).slice(0, 200); }
  await registrar(ok ? 'enviado' : ('falha: ' + det), texto);
  if (ok) {
    enviados++;
    await sql("insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) values (" + E(c.contato_id) + "::uuid, 'serena', " + E(texto) + ", 'whatsapp', 'proativo:link_aberto', true, now())");
  }
  out.push({ telefone: tel, resultado: ok ? 'enviado' : 'falha', erro: det });
  await new Promise((r) => setTimeout(r, 4000));
}
return [{ json: { ok: true, modo: modo, candidatos: cands.length, enviados: enviados, itens: out } }];
