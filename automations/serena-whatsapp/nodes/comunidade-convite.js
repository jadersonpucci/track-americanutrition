// No "Convidar" do workflow [Serena] Comunidade: Convites. Cron 30 min (so 9h-20h BRT) e GET /webhook/comunidade-convite.
// 02/11/2026, pedido do Jaderson: a Serena convida para os grupos da comunidade quem conversa com ela e ainda nao esta
// em nenhum grupo. Compradores primeiro, depois quem nunca comprou mas se mostrou engajado; quem contou a propria
// experiencia recebe um convite que valoriza o relato. Nada de disparo em massa (o numero do Samuel ja foi banido uma
// vez): so conversas das ultimas 6h que terminaram com resposta da Serena, um convite por pessoa, teto diario.
//   1. candidatos: falou nas ultimas 6h (ha mais de 20 min), a Serena respondeu por ultimo, sem humano no comando,
//      fora de grupos (grupos_membros por telefone e por LID), nao bloqueado, nao e da equipe, nunca convidado;
//   2. a Shopify diz se ja comprou (cliente pelo telefone; a clientes_tel parou em 15/08);
//   3. a IA le a conversa e decide se convida e com qual perfil. Nao convida em reclamacao, troca, reembolso, problema
//      de entrega ou pagamento, irritacao, luto, spam, conversa vazia ou pedido para nao receber mensagens;
//   4. grupo: o de menos gente (snapshot + convites dos ultimos 7 dias ainda sem entrada) entre os gerais, ou entre
//      os de diabetes quando o interesse e diabetes; abaixo de 950 membros;
//   5. envia pelo Samuel, registra em serena_mensagens (autor proativo:comunidade) e em serena_comunidade_convites.
// Quem entra num grupo depois do convite ganha entrou_em (pelo grupos_membros, atualizado todo dia).
// serena_config.comunidade_convite: off | simulacao (monta e grava o texto, nao envia) | on.
// serena_config.comunidade_convite_dia: teto de convites por dia (20).
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const EVO = 'https://evolution.americanutrition.com';
const EVO_KEY = 'EVO_API_KEY';
const TG_BOT = '<TOKEN_ALERTAS>';
const TG_CHAT = '-1003766435449';
const TG_TOPICO = 289;
const TOKEN_MANUAL = '<COMUNIDADE_TOKEN_MANUAL>';
const self = this;

const GERAIS = {
  '120363407686844370@g.us': '#3 ImunoFosfo - Fosfoetanolamina',
  '120363423321725793@g.us': 'Fosfoetanolamina (ImunoFosfo) #2',
  '120363307265095030@g.us': '#2 ImunoFosfo - Fosfoetanolamina',
  '120363353982971871@g.us': 'ImunoFosfo Connect - Tratamentos/Terapias Oncologicas',
  '120363246659395526@g.us': '#1 ImunoFosfo - Fosfoetanolamina'
};
const DIABETES = {
  '120363404254700593@g.us': 'ImunoFosfo Diabetes - Comunidade Oficial',
  '120363407289053552@g.us': '#1 ImunoFosfo Diabetes'
};
const LIMITE_GRUPO = 950;
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];

const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const NL = String.fromCharCode(10);
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
async function gql(query) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query } } });
  return (resp && resp.dados && resp.dados.data) || {};
}
async function telegram(texto) {
  try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 10000,
    body: { chat_id: TG_CHAT, message_thread_id: TG_TOPICO, parse_mode: 'HTML', disable_web_page_preview: true, text: texto } }); } catch (e) {}
}
const html = (s) => String(s == null ? '' : s).replace(/[<>&]/g, ' ');

// ---------- entrada ----------
const ent = $input.first().json || {};
const q = ent.query || {};
const manual = Object.prototype.hasOwnProperty.call(ent, 'query');
if (manual && q.t !== TOKEN_MANUAL) return [{ json: { ok: false, erro: 'acesso negado' } }];

const cfg = {};
(await sql("select chave, valor from serena_config where chave like 'comunidade_convite%'")).forEach((x) => { cfg[x.chave] = x.valor; });
let modo = String(cfg.comunidade_convite || 'off');
if (manual && /^(simulacao|on)$/.test(String(q.modo || ''))) modo = q.modo;
if (modo === 'off') return [{ json: { ok: true, modo: modo, nada: true } }];
const horaBR = (new Date().getUTCHours() + 21) % 24;
if (!manual && (horaBR < 9 || horaBR >= 20)) return [{ json: { ok: true, modo: modo, fora_do_horario: horaBR } }];

// quem entrou depois do convite
await sql("update serena_comunidade_convites x set entrou_em = now() where x.status = 'enviado' and x.entrou_em is null and exists (select 1 from grupos_membros g where g.tel_norm = left(right(x.telefone, 11), 2) || right(x.telefone, 8) and g.primeiro_visto > x.enviado_em)");

const teto = Number(cfg.comunidade_convite_dia || 20);
const statusConta = modo === 'on' ? "('enviado')" : "('enviado', 'simulado')";
const hoje = Number(((await sql("select count(*)::int n from serena_comunidade_convites where status in " + statusConta + " and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'"))[0] || {}).n || 0);
let vagas = teto - hoje;
if (vagas <= 0) return [{ json: { ok: true, modo: modo, teto_do_dia: teto, hoje: hoje } }];

// ---------- candidatos ----------
const jaConvidado = modo === 'on' ? "x.status = 'enviado'" : "x.status in ('enviado', 'simulado')";
const cands = await sql("with ult as (select m.contato_id, max(m.criado_em) filter (where m.papel = 'cliente') as ult_cli, (array_agg(m.papel order by m.criado_em desc))[1] as ultimo_papel, count(*) filter (where m.papel = 'cliente') as msgs60"
  + " from serena_mensagens m where m.canal = 'whatsapp' and m.criado_em > now() - interval '60 days' group by 1),"
  + " c as (select c.id as contato_id, c.nome, regexp_replace(c.telefone, '\\D', '', 'g') as tel, left(right(regexp_replace(c.telefone, '\\D', '', 'g'), 11), 2) || right(regexp_replace(c.telefone, '\\D', '', 'g'), 8) as tnorm, u.msgs60"
  + " from serena_contatos c join ult u on u.contato_id = c.id where c.telefone ~ '^\\+?55' and coalesce(c.bloqueado, false) = false"
  + " and u.ult_cli between now() - interval '6 hours' and now() - interval '20 minutes' and u.ultimo_papel = 'serena')"
  + " select c.contato_id, c.nome, c.tel, c.msgs60 from c"
  + " where not exists (select 1 from serena_comunidade_convites x where x.contato_id = c.contato_id and (" + jaConvidado + " or (x.status = 'recusado_ia' and x.criado_em > now() - interval '14 days')))"
  + " and not exists (select 1 from serena_wpp_bloqueados b where regexp_replace(b.telefone, '\\D', '', 'g') = c.tel)"
  + " and not exists (select 1 from grupos_membros g where g.tel_norm = c.tnorm and g.ultimo_visto > now() - interval '14 days')"
  + " and not exists (select 1 from wa_identidades w join grupos_membros g on g.lid = w.lid where regexp_replace(coalesce(w.telefone, ''), '\\D', '', 'g') = c.tel and g.ultimo_visto > now() - interval '14 days')"
  + " and not exists (select 1 from serena_conversas sc where sc.contato_id = c.contato_id and sc.ia_pausada = true)"
  + " and c.tel not in (" + EQUIPE.map(E).join(', ') + ")"
  + " order by c.msgs60 desc limit " + Math.min(10, vagas * 2));
if (!cands.length) return [{ json: { ok: true, modo: modo, candidatos: 0 } }];

// ---------- ocupacao dos grupos ----------
const ocup = {};
(await sql("select grupo_jid, membros from grupos_snapshot where dia = (select max(dia) from grupos_snapshot)")).forEach((x) => { ocup[x.grupo_jid] = Number(x.membros || 0); });
(await sql("select grupo_jid, count(*)::int n from serena_comunidade_convites where status = 'enviado' and entrou_em is null and enviado_em > now() - interval '7 days' group by 1")).forEach((x) => { ocup[x.grupo_jid] = (ocup[x.grupo_jid] || 0) + Number(x.n || 0); });
function escolherGrupo(diabetes) {
  const pool = diabetes ? DIABETES : GERAIS;
  let melhor = null;
  for (const jid of Object.keys(pool)) {
    const n = ocup[jid] == null ? 0 : ocup[jid];
    if (n >= LIMITE_GRUPO) continue;
    if (!melhor || n < melhor.n) melhor = { jid: jid, nome: pool[jid], n: n };
  }
  if (!melhor && diabetes) return escolherGrupo(false);
  return melhor;
}
const links = {};
async function linkConvite(jid) {
  if (links[jid]) return links[jid];
  const r = await self.helpers.httpRequest({ method: 'GET', url: EVO + '/group/inviteCode/Samuel?groupJid=' + encodeURIComponent(jid), headers: { apikey: EVO_KEY }, json: true, timeout: 20000 });
  if (!r || !r.inviteUrl) throw new Error('sem link de convite para ' + jid);
  links[jid] = r.inviteUrl;
  return r.inviteUrl;
}

// ---------- decidir com a conversa ----------
const SYS = 'Voce decide se a America Nutrition (marca do suplemento ImunoFosfo) deve convidar este contato do WhatsApp para a comunidade de clientes: grupos onde quem usa o ImunoFosfo troca experiencias, tira duvidas e recebe conteudos da equipe. Muitos tem cancer, diabetes ou cuidam de alguem doente.'
  + ' Responda SOMENTE um JSON: {"convidar":true|false,"perfil":"comprador|engajado|conteudo","diabetes":true|false,"motivo":"ate 100 caracteres"}.'
  + ' CONVIDE quando a conversa terminou em clima bom (duvida resolvida, compra feita, agradecimento, conversa amigavel) e a pessoa mostra interesse real no produto, no tratamento ou em trocar experiencias.'
  + ' perfil: conteudo se a pessoa contou resultado, melhora ou a propria historia (ou de um familiar) com o ImunoFosfo; comprador se JA_COMPROU e sim; senao engajado.'
  + ' diabetes: true se o interesse principal e diabetes ou glicemia.'
  + ' NAO CONVIDE: reclamacao, atraso ou problema de entrega, troca, reembolso, cancelamento, cobranca ou pagamento com problema, pessoa irritada ou desconfiada, luto ou morte recente na familia, pediu para nao receber mensagens, vendedor, empresa, golpe ou spam, conversa vazia (so oi, so um audio sem conteudo), ou quando a ultima mensagem da Serena pede uma resposta ou acao da pessoa que ainda nao veio (para nao atravessar a conversa).';

async function decidir(cand, pedidos) {
  const msgs = await sql("select papel, left(texto, 400) as texto from serena_mensagens where contato_id = " + E(cand.contato_id) + " and criado_em > now() - interval '30 days' order by criado_em desc limit 30");
  const conversa = msgs.reverse().map((m) => (m.papel === 'cliente' ? 'CLIENTE: ' : (m.papel === 'humano' ? 'EQUIPE: ' : 'SERENA: ')) + String(m.texto || '').replace(/\s+/g, ' ')).join(NL);
  const user = 'JA_COMPROU: ' + (pedidos > 0 ? 'sim (' + pedidos + ' pedido' + (pedidos > 1 ? 's' : '') + ')' : 'nao') + NL + 'CONVERSA (mais antiga primeiro):' + NL + conversa.slice(-9000);
  const r = await self.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 45000,
    body: { model: 'claude-haiku-4-5-20251001', max_tokens: 150, system: SYS, messages: [{ role: 'user', content: user }] } });
  const t = ((r && r.content) || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('IA sem JSON: ' + t.slice(0, 120));
  const j = JSON.parse(m[0]);
  let perfil = String(j.perfil || 'engajado');
  if (!/^(comprador|engajado|conteudo)$/.test(perfil)) perfil = 'engajado';
  if (perfil === 'engajado' && pedidos > 0) perfil = 'comprador';
  return { convidar: j.convidar === true, perfil: perfil, diabetes: j.diabetes === true, motivo: String(j.motivo || '').slice(0, 200) };
}

function primeiroNome(nome) {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ]{2,}$/.test(n)) return '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
function texto(perfil, nome, link) {
  const oi = nome ? nome + ', ' : '';
  const fim = NL + link + NL + NL + 'Sem compromisso, e você pode sair quando quiser.';
  if (perfil === 'conteudo') return (nome ? nome + ', obrigada' : 'Obrigada') + ' por compartilhar sua experiência com a gente 💙 Temos uma comunidade no WhatsApp com quem usa o ImunoFosfo, e relatos como o seu ajudam muito quem está começando. Se quiser participar, é só entrar pelo link:' + fim;
  if (perfil === 'comprador') return oi + (nome ? 'posso' : 'Posso') + ' te fazer um convite? 💙 Temos uma comunidade no WhatsApp com quem usa o ImunoFosfo: o pessoal troca experiências, tira dúvidas e a equipe compartilha conteúdos e novidades. Se quiser participar, é só entrar pelo link:' + fim;
  return oi + (nome ? 'quer' : 'Quer') + ' participar da nossa comunidade no WhatsApp? 💙 Lá tem muita gente que usa o ImunoFosfo trocando experiências e tirando dúvidas, e a equipe compartilha conteúdos e novidades. É só entrar pelo link:' + fim;
}

// ---------- rodada ----------
const saida = { ok: true, modo: modo, hoje: hoje, convites: [] };
for (const c of cands) {
  if (vagas <= 0) break;
  try {
    const sh = await gql('{ customers(first:1, query:"phone:+' + c.tel + '"){ nodes{ numberOfOrders } } }');
    const pedidos = Number((((sh.customers || {}).nodes || [])[0] || {}).numberOfOrders || 0);
    const d = await decidir(c, pedidos);
    if (!d.convidar) {
      await sql('insert into serena_comunidade_convites (contato_id, telefone, nome, perfil, status, motivo, pedidos) values (' + [E(c.contato_id), E(c.tel), E(c.nome), E(d.perfil), "'recusado_ia'", E(d.motivo), pedidos].join(', ') + ')');
      saida.convites.push({ nome: c.nome, status: 'recusado_ia', motivo: d.motivo });
      continue;
    }
    const g = escolherGrupo(d.diabetes);
    if (!g) { saida.convites.push({ nome: c.nome, status: 'sem_vaga' }); continue; }
    const link = await linkConvite(g.jid);
    const msg = texto(d.perfil, primeiroNome(c.nome), link);
    let status = 'simulado';
    if (modo === 'on') {
      const r = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: c.tel, text: msg, delay: 1500 } });
      status = (r && r.ok === true) ? 'enviado' : 'erro';
      if (status === 'enviado') await sql('insert into serena_mensagens (contato_id, papel, texto, autor, entregue, canal) values (' + E(c.contato_id) + ", 'serena', " + E(msg) + ", 'proativo:comunidade', true, 'whatsapp')");
    }
    await sql('insert into serena_comunidade_convites (contato_id, telefone, nome, perfil, grupo_jid, grupo_nome, status, motivo, texto, pedidos, enviado_em) values ('
      + [E(c.contato_id), E(c.tel), E(c.nome), E(d.perfil), E(g.jid), E(g.nome), E(status), E(d.motivo), E(msg), pedidos, status === 'enviado' ? 'now()' : 'null'].join(', ') + ')');
    if (status !== 'erro') { vagas -= 1; ocup[g.jid] = (ocup[g.jid] || 0) + 1; }
    saida.convites.push({ nome: c.nome, status: status, perfil: d.perfil, grupo: g.nome, motivo: d.motivo });
  } catch (e) {
    saida.convites.push({ nome: c.nome, erro: String(e.message).slice(0, 200) });
  }
}

const enviados = saida.convites.filter((x) => x.status === 'enviado');
if (enviados.length) await telegram('\u{1F465} <b>Convites para a comunidade</b> (' + (hoje + enviados.length) + '/' + teto + ' hoje)' + NL
  + enviados.map((x) => '• ' + html(x.nome) + ' (' + x.perfil + ') → ' + html(x.grupo)).join(NL));
return [{ json: saida }];
