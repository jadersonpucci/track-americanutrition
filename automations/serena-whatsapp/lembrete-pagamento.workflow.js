// [Serena WhatsApp] Lembrete de pagamento (2h e 24h) - 11/11/2026
// Substitui os dois follow-ups antigos ("Link nao aberto", oL5sdxV2bQWGzUeC, e "Link aberto sem pagamento",
// S9dhrGnafRbKMgOI), que juntos lembraram so 14 de 221 pessoas que receberam link e nao pagaram (out-nov/2026).
//
// O que muda em relacao aos antigos:
//   - cobre link de checkout E Pix gerado na conversa (serena_pix_links);
//   - cobre quem respondeu depois do link e nao fechou (antes saia da regua); so espera a conversa esfriar;
//   - dois toques: ~2h depois do link (toque 1) e ~24h depois (toque 2); quem o toque 1 pegou de noite recebe de manha;
//   - telefone: manda para o numero canonico (com 9) e, se o WhatsApp responder exists:false, tenta sem o 9.
//
// Fica de fora quem: comprou (mensagem transacional depois do link, Pix pago, Pix do checkout pago, pedido Pagar.me pelo
// e-mail, pedido na Shopify pelo telefone), comecou o checkout (regua de carrinho cuida), recebeu outra mensagem proativa
// depois do link, mandou a ultima mensagem (a Serena precisa responder, nao lembrar), disse que nao quer ou que ja pagou,
// recebeu lembrete de outro link nos ultimos 4 dias, esta na fila humana, pausado, bloqueado, com IA pausada, ou e da equipe.
//
// serena_config:
//   lembrete_pagamento       off | simulacao (grava o texto em serena_lembrete_pagamento, nao envia) | on
//   lembrete_pagamento_h1    horas de silencio depois do link para o toque 1 (2)
//   lembrete_pagamento_h2    horas entre o toque 1 e o toque 2 (22)
//   lembrete_pagamento_token token do disparo manual
// Cron a cada 15 min, so 9h-20h (Brasilia). Manual: GET /webhook/lembrete-pagamento?t=<token>&modo=ver|simulacao|on
// (ver = so lista candidatos e textos, nao grava nem envia).
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const agendado = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 15 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } } });
const manual = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Manual', parameters: { httpMethod: 'GET', path: 'lembrete-pagamento', responseMode: 'lastNode', options: {} } } });

const config = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config', credentials: PG, parameters: { operation: 'executeQuery', query: "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from serena_config where chave like 'lembrete_pagamento%'", options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `
const cfg = ($input.first().json || {}).cfg || {};
let q = {};
try { const w = $('Manual').first().json; q = (w && w.query) || {}; } catch (e) {}
const manual = Object.keys(q).length > 0;
if (manual && $execution.mode !== 'test' && String(q.t || '') !== String(cfg.lembrete_pagamento_token || '')) return [];
let modo = String(cfg.lembrete_pagamento || 'off');
if (manual && /^(simulacao|on|ver)$/.test(String(q.modo || ''))) modo = String(q.modo);
if (modo === 'off') return [];
const horaBR = (new Date().getUTCHours() + 21) % 24;
if (!manual && (horaBR < 9 || horaBR >= 20)) return [];
const h1 = Math.max(1, Math.min(8, Number(cfg.lembrete_pagamento_h1 || 2)));
const h2 = Math.max(12, Math.min(30, Number(cfg.lembrete_pagamento_h2 || 22)));
const on = modo === 'on';
// em simulacao o registro 'simulado' conta como enviado (para simular o toque 2); no modo on ele e ignorado
const vazio = (c) => on ? '(' + c + ' is null or ' + c + " = 'simulado')" : c + ' is null';
const feito = on ? "('enviado')" : "('enviado','simulado')";
const L = [];
// ultimo link de checkout mandado na conversa (Serena ou atendente), por contato, nas ultimas 46h
L.push("with ult as (select distinct on (m.contato_id) m.contato_id, m.id, m.criado_em as t, (regexp_match(m.texto, 'seguro[.]americanutrition[.]com/([A-Za-z0-9]+)'))[1] as slug");
L.push(" from serena_mensagens m where m.papel in ('serena','humano') and m.canal = 'whatsapp' and (m.autor is null or m.autor = 'reprocessado')");
L.push(" and m.texto ~ 'seguro[.]americanutrition[.]com/[A-Za-z0-9]+' and m.criado_em > now() - interval '46 hours' order by m.contato_id, m.criado_em desc),");
L.push("lk as (select 'msg:' || u.id as ref, u.contato_id, u.t, null::text as pix_token, null::timestamptz as pix_expira,");
L.push(" (select min(k.ts) from anl_clicks k where k.link_id = l.id and k.ts >= u.t - interval '1 minute' and anl_click_humano(k.ua)) as clique");
L.push(" from ult u join anl_links l on l.slug = u.slug and l.dominio = 'seguro.americanutrition.com' where l.destino ilike '%checkout.americanutrition.com%'),");
// Pix gerado na conversa e nao pago
L.push("px as (select 'pix:' || p.token as ref, c.id as contato_id, p.criado_em as t, p.token as pix_token, p.expira_em as pix_expira, null::timestamptz as clique");
L.push(" from serena_pix_links p join lateral (select c.id from serena_contatos c where serena_tel_canon(c.telefone) = serena_tel_canon(p.telefone) order by c.atualizado_em desc nulls last limit 1) c on true");
L.push(" where p.criado_em > now() - interval '46 hours' and not coalesce(p.pago, false)),");
L.push("ev as (select distinct on (contato_id) * from (select * from lk union all select * from px) z order by contato_id, t desc),");
L.push("x as (select ev.*, serena_tel_canon(c.telefone) as tel, coalesce(c.nome, '') as nome, nullif(lower(trim(c.email)), '') as email,");
L.push(" (select a.criado_em from serena_mensagens a where a.contato_id = ev.contato_id order by a.criado_em desc limit 1) as ult_em,");
L.push(" (select a.papel from serena_mensagens a where a.contato_id = ev.contato_id order by a.criado_em desc limit 1) as ult_papel,");
L.push(" (select string_agg(a.texto, ' | ' order by a.criado_em) from serena_mensagens a where a.contato_id = ev.contato_id and a.papel = 'cliente' and a.criado_em > ev.t) as falas,");
L.push(" (select left(string_agg(a.texto, ' | ' order by a.criado_em), 6000) from serena_mensagens a where a.contato_id = ev.contato_id and a.criado_em > ev.t - interval '2 hours') as conversa,");
L.push(" (select r.resultado from serena_lembrete_pagamento r where r.ref = ev.ref and r.etapa = 1) as r1,");
L.push(" (select r.criado_em from serena_lembrete_pagamento r where r.ref = ev.ref and r.etapa = 1) as r1_em,");
L.push(" (select r.resultado from serena_lembrete_pagamento r where r.ref = ev.ref and r.etapa = 2) as r2");
L.push(" from ev join serena_contatos c on c.id = ev.contato_id where not coalesce(c.bloqueado, false))");
L.push("select x.ref, x.contato_id, x.t, x.pix_token, x.pix_expira, x.clique, x.tel, x.nome, x.falas, x.conversa, x.r1,");
L.push(" case when length(x.tel) = 13 and x.tel like '55%' and substr(x.tel, 5, 1) = '9' then substr(x.tel, 1, 4) || substr(x.tel, 6) else null end as tel_alt,");
L.push(" case when x.t > now() - interval '20 hours' then 1 else 2 end as etapa");
L.push(" from x where coalesce(x.tel, '') <> '' and x.ult_papel is distinct from 'cliente' and (");
L.push(" (" + vazio('x.r1') + " and x.t > now() - interval '20 hours' and x.t <= now() - interval '" + h1 + " hours' and x.ult_em <= now() - interval '" + h1 + " hours')");
L.push(" or (" + vazio('x.r2') + " and x.t <= now() - interval '20 hours' and x.ult_em <= now() - interval '6 hours' and (" + vazio('x.r1') + " or (x.r1 in " + feito + " and x.r1_em <= now() - interval '" + h2 + " hours'))))");
// comprou ou outra regua ja falou com ele
L.push(" and not exists (select 1 from serena_mensagens a where a.contato_id = x.contato_id and a.criado_em > x.t - interval '30 minutes' and (a.autor like 'transacional:%' or (a.autor like 'proativo:%' and a.autor <> 'proativo:lembrete_pagamento' and a.criado_em > x.t)))");
L.push(" and not exists (select 1 from serena_pix_links p where p.pago and serena_tel_canon(p.telefone) = x.tel and p.pago_em > x.t - interval '1 hour')");
L.push(" and not exists (select 1 from checkout_pix_inter p where p.status = 'CONCLUIDA' and serena_tel_canon(p.telefone) = x.tel and p.criado_em > x.t - interval '1 hour')");
L.push(" and not (x.email is not null and exists (select 1 from pagarme_orders o where o.status in ('paid','pending') and lower(o.customer_email) = x.email and o.created_at > x.t - interval '1 hour'))");
L.push(" and not exists (select 1 from carrinhos_abandonados ca where serena_tel_canon(ca.whatsapp) = x.tel and ca.criado_em > x.t - interval '10 minutes')");
L.push(" and not exists (select 1 from serena_lembrete_pagamento r where r.contato_id = x.contato_id and r.ref <> x.ref and r.resultado in " + feito + " and r.criado_em > now() - interval '4 days')");
L.push(" and not exists (select 1 from serena_atribuicoes a where a.contato_id = x.contato_id and a.status = 'aberto')");
L.push(" and not exists (select 1 from serena_wpp_pausas p where p.telefone = x.tel and p.ate > now())");
L.push(" and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = x.tel)");
L.push(" and not exists (select 1 from serena_conversas v where v.contato_id = x.contato_id and v.ia_pausada = true and v.aberta_em > now() - interval '2 days')");
L.push(" order by x.t limit 25");
return [{ json: { modo: modo, horaBR: horaBR, query: L.join('') } }];
` } } });

const candidatos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Candidatos', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

// pedido na Shopify depois do link (pago ou aguardando PIX/boleto), pelo telefone com e sem o 9
const shopify = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Pedidos Shopify', credentials: SHOP, onError: 'continueRegularOutput', parameters: { method: 'POST', url: GQL, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ query: 'query($q:String){ customers(first:3, query:$q){ nodes{ orders(first:3, sortKey:CREATED_AT, reverse:true){ nodes{ createdAt cancelledAt } } } } }', variables: { q: 'phone:+' + $json.tel + ($json.tel_alt ? ' OR phone:+' + $json.tel_alt : '') } }) }}"),
  options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar e enviar', parameters: { jsCode: `
const self = this;
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];
const POR_RODADA = 10;
const dec = $('Decidir').first().json;
const modo = dec.modo;
const cands = $('Candidatos').all().map((i) => i.json);
const shop = $input.all().map((i) => i.json || {});
const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
// recusa clara ou "ja paguei": nao lembra (quem disse "vou pensar" continua, e para ele que o lembrete existe)
const NAO = /(n[aã]o (quero|tenho interesse|vou querer|vou comprar|preciso mais)|sem interesse|desist|cancel|pare de|parar de|n[aã]o me mand|me tir[ae] d|j[aá] (comprei|paguei|fiz o pagamento|fiz o pix|transferi)|\\bpaguei\\b|comprei (em|na|no|pela|pelo) )/i;
// combinou uma data (dia 26, mes que vem, quando receber): nao cobra antes, a Serena ja combinou com ele
const DATA_FUTURA = /(at[eé] (o )?dia \\d|no dia \\d|dia \\d{1,2}\\b|m[eê]s que vem|pr[oó]ximo m[eê]s|semana que vem|pr[oó]xima semana|quando (eu )?receber|quando cair|sal[aá]rio|aposentadoria|benef[ií]cio)/i;
// "amanha", "a noite", "mais tarde": pula o toque de 2h e deixa para o de 24h
const MAIS_TARDE = /(amanh[aã]|[aà] noite|de noite|mais tarde|depois|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|fim de semana)/i;
// momento delicado na conversa: lembrete de pagamento soa mal, fica com a equipe
const SENSIVEL = /(internad|interna[cç][aã]o|\\buti\\b|faleceu|falecimento|[oó]bito|\\bluto\\b|piorou|estado grave|paliativ)/i;
function primeiroNome(n) {
  const p = String(n || '').trim().split(/\\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ]{3,14}$/.test(p)) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}
const saud = dec.horaBR < 12 ? 'Bom dia' : (dec.horaBR < 18 ? 'Boa tarde' : 'Boa noite');
function texto(c, tipo, n) {
  const v = n ? ', ' + n : '';
  if (Number(c.etapa) === 1) {
    if (tipo === 'pix') return 'Oi' + v + '! O PIX do seu pedido ainda não apareceu como pago por aqui 🙂 Conseguiu pagar? Se deu algum problema com o código, me avisa que eu gero outro na hora.';
    if (tipo === 'link_aberto') return 'Oi' + v + '! Tudo certo com o seu pedido? 🙂 Ficou alguma dúvida sobre o produto, o frete ou o pagamento? No cartão dá para dividir em até 3x sem juros, e se preferir eu gero o PIX ou o boleto por aqui.';
    if (tipo === 'conversou') return 'Oi' + v + '! Ficou mais alguma dúvida que eu possa tirar? O link que te mandei continua valendo, e se preferir eu gero o PIX aqui mesmo 🙂';
    return 'Oi' + v + '! Te mandei o link do pedido mais cedo, conseguiu abrir? 🙂 Se for mais fácil, eu gero o PIX aqui mesmo na conversa. Quer que eu gere?';
  }
  if (tipo === 'pix') {
    if (c.pix_expira && new Date(c.pix_expira).getTime() < Date.now()) return saud + v + '! O código PIX que te mandei já venceu, mas eu gero um novo na hora se você ainda quiser o pedido 🙂 Quer que eu gere?';
    return saud + v + '! Seu PIX ainda está esperando o pagamento 🙂 Se preferir, eu gero um código novo ou te mando o link para pagar no cartão. Posso ajudar?';
  }
  return saud + v + '! Passando para o seu pedido não ficar esquecido 🙂 O link continua valendo, e se preferir pagar no PIX ou no boleto é só me responder aqui que eu gero na hora. Posso te ajudar com alguma dúvida?';
}
async function enviar(numero, msg) {
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: numero, text: msg, delay: 1200 } });
    return { ok: !!(r && r.ok), det: (r && r.ok) ? null : JSON.stringify(r).slice(0, 300) };
  } catch (e) { return { ok: false, det: String(e.message || e).slice(0, 300) }; }
}
const registro = (c, tipo, resultado, msg, para) => 'insert into serena_lembrete_pagamento (contato_id, ref, etapa, tipo, telefone, enviado_para, evento_em, resultado, texto) values (' +
  [E(c.contato_id) + '::uuid', E(c.ref), Number(c.etapa), E(tipo), E(c.tel), E(para || null), E(c.t) + '::timestamptz', E(resultado), E(msg || null)].join(', ') +
  ') on conflict (ref, etapa) do update set tipo = excluded.tipo, enviado_para = excluded.enviado_para, resultado = excluded.resultado, texto = excluded.texto, criado_em = now() where serena_lembrete_pagamento.resultado = ' + E('simulado');

const out = [], ver = [];
let enviados = 0;
for (let i = 0; i < cands.length; i++) {
  if (enviados >= POR_RODADA) break;
  const c = cands[i];
  if (EQUIPE.indexOf(c.tel) !== -1 || (c.tel_alt && EQUIPE.indexOf(c.tel_alt) !== -1)) continue;
  const tipo = c.pix_token ? 'pix' : (c.clique ? 'link_aberto' : (c.falas ? 'conversou' : 'link_nao_aberto'));
  // Shopify: sem resposta valida nao arrisca (tenta de novo na proxima rodada)
  const d = shop[i] && shop[i].data;
  if (!d || !d.customers) { ver.push({ ref: c.ref, resultado: 'pulado: shopify indisponivel' }); continue; }
  const desde = new Date(c.t).getTime() - 10 * 60000;
  const comprou = (d.customers.nodes || []).some((cu) => ((cu.orders || {}).nodes || []).some((o) => !o.cancelledAt && new Date(o.createdAt).getTime() >= desde));
  if (comprou) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'ja_comprou', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'ja_comprou' }); continue; }
  if (c.falas && NAO.test(c.falas)) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'pulado: nao_quer_ou_ja_pagou', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'nao_quer_ou_ja_pagou', falas: String(c.falas).slice(0, 200) }); continue; }
  if (c.falas && DATA_FUTURA.test(c.falas)) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'pulado: combinou_data', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'combinou_data' }); continue; }
  if (c.conversa && SENSIVEL.test(c.conversa)) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'pulado: contexto_sensivel', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'contexto_sensivel' }); continue; }
  if (Number(c.etapa) === 1 && c.falas && MAIS_TARDE.test(c.falas)) { ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'espera o toque de 24h' }); continue; }
  const msg = texto(c, tipo, primeiroNome(c.nome));
  if (modo === 'ver') { ver.push({ ref: c.ref, etapa: c.etapa, tipo: tipo, tel: String(c.tel).slice(0, 6) + '...', texto: msg }); continue; }
  if (modo !== 'on') { out.push({ json: { sql: registro(c, tipo, 'simulado', msg, null) } }); continue; }
  let para = c.tel, r = await enviar(c.tel, msg);
  if (!r.ok && c.tel_alt && /exists[^a-z]{1,6}false/i.test(r.det || '')) { para = c.tel_alt; r = await enviar(c.tel_alt, msg); }
  if (r.ok) {
    enviados++;
    out.push({ json: { sql: 'with a as (' + registro(c, tipo, 'enviado', msg, para) + " returning 1) insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) select " + E(c.contato_id) + "::uuid, 'serena', " + E(msg) + ", 'whatsapp', 'proativo:lembrete_pagamento', true, now() from a" } });
    await new Promise((ok) => setTimeout(ok, 4000));
  } else {
    out.push({ json: { sql: registro(c, tipo, 'falha: ' + r.det, msg, para) } });
  }
}
if (modo === 'ver') return [{ json: { sql: 'select ' + E(JSON.stringify({ modo: modo, candidatos: cands.length, itens: ver })) + '::jsonb as ver' } }];
return out;
` } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.sql }}', options: {} } } });


export default workflow('lembrete-pagamento', '[Serena WhatsApp] Lembrete de pagamento (2h e 24h)')
  .add(agendado).to(config)
  .add(manual).to(config)
  .add(config).to(decidir).to(candidatos).to(shopify).to(montar).to(registrar);
