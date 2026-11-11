// [Serena WhatsApp] Retomada de lead (3h e 24h) - 11/11/2026
// Pessoa nova (nunca comprou) que escreveu, recebeu resposta da Serena terminando em pergunta e sumiu antes de receber
// link. Em ~30 dias (out-nov/2026) foram 380 de 726 contatos novos, 323 deles parados numa pergunta da Serena.
// Toque 1 ~3h depois da ultima mensagem da Serena, toque 2 ~24h depois. Mesma tabela de registro do lembrete de pagamento
// (serena_lembrete_pagamento, ref 'lead:<id da mensagem>'), entao os dois nao se atropelam (4 dias entre lembretes).
//
// Fica de fora quem: ja comprou alguma vez (mensagem transacional ou pedido na Shopify), recebeu link ou Pix nos ultimos
// 7 dias (vai para o lembrete de pagamento), comecou o checkout, recusou, combinou data, conversa delicada, fila humana,
// pausa, bloqueio, IA pausada, equipe.
//
// serena_config: retomada_lead (off | simulacao | on), retomada_lead_h1 (3), retomada_lead_h2 (22), retomada_lead_token.
// Cron a cada 15 min, 9h-20h. Manual: GET /webhook/retomada-lead?t=<token>&modo=ver|simulacao|on
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const SHOP = { httpHeaderAuth: { id: 'PfA2Ma8qJgHpsO2e', name: 'Shopify API Token' } };
const GQL = 'https://39c4f8-2.myshopify.com/admin/api/2026-04/graphql.json';

const agendado = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 15 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } } });
const manual = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Manual', parameters: { httpMethod: 'GET', path: 'retomada-lead', responseMode: 'lastNode', options: {} } } });

const config = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config', credentials: PG, parameters: { operation: 'executeQuery', query: "select coalesce(json_object_agg(chave, valor), '{}'::json) as cfg from serena_config where chave like 'retomada_lead%'", options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `
const cfg = ($input.first().json || {}).cfg || {};
let q = {};
try { const w = $('Manual').first().json; q = (w && w.query) || {}; } catch (e) {}
const manual = Object.keys(q).length > 0;
if (manual && $execution.mode !== 'test' && String(q.t || '') !== String(cfg.retomada_lead_token || '')) return [];
let modo = String(cfg.retomada_lead || 'off');
if (manual && /^(simulacao|on|ver)$/.test(String(q.modo || ''))) modo = String(q.modo);
if (modo === 'off') return [];
const horaBR = (new Date().getUTCHours() + 21) % 24;
if (!manual && (horaBR < 9 || horaBR >= 20)) return [];
const h1 = Math.max(1, Math.min(8, Number(cfg.retomada_lead_h1 || 3)));
const h2 = Math.max(12, Math.min(30, Number(cfg.retomada_lead_h2 || 22)));
const on = modo === 'on';
// em simulacao o registro 'simulado' conta como enviado (para simular o toque 2); no modo on ele e ignorado
const vazio = (c) => on ? '(' + c + ' is null or ' + c + " = 'simulado')" : c + ' is null';
const feito = on ? "('enviado')" : "('enviado','simulado')";
const L = [];
// ultima mensagem de cada contato ativo nas ultimas 46h (sem contar o proprio toque de retomada)
L.push("with ult as (select distinct on (m.contato_id) m.contato_id, m.id, m.criado_em as t, m.texto, m.papel, m.autor from serena_mensagens m");
L.push(" where m.canal = 'whatsapp' and m.criado_em > now() - interval '46 hours' and m.autor is distinct from 'proativo:retomada_lead' order by m.contato_id, m.criado_em desc),");
L.push("x as (select 'lead:' || u.id as ref, u.contato_id, u.t, u.texto as ult_texto, null::text as pix_token, null::timestamptz as pix_expira, null::timestamptz as clique,");
L.push(" serena_tel_canon(c.telefone) as tel, coalesce(c.nome, '') as nome,");
L.push(" (select string_agg(a.texto, ' | ' order by a.criado_em) from serena_mensagens a where a.contato_id = u.contato_id and a.papel = 'cliente' and a.criado_em > now() - interval '4 days') as falas,");
L.push(" (select left(string_agg(a.texto, ' | ' order by a.criado_em), 6000) from serena_mensagens a where a.contato_id = u.contato_id and a.criado_em > now() - interval '4 days') as conversa,");
L.push(" (select max(r.criado_em) from serena_mensagens r where r.contato_id = u.contato_id and r.autor = 'proativo:retomada_lead') as ult_toque,");
L.push(" (select r.resultado from serena_lembrete_pagamento r where r.ref = 'lead:' || u.id and r.etapa = 1) as r1,");
L.push(" (select r.criado_em from serena_lembrete_pagamento r where r.ref = 'lead:' || u.id and r.etapa = 1) as r1_em,");
L.push(" (select r.resultado from serena_lembrete_pagamento r where r.ref = 'lead:' || u.id and r.etapa = 2) as r2");
L.push(" from ult u join serena_contatos c on c.id = u.contato_id where u.papel = 'serena' and u.autor is null and u.texto like '%?%' and not coalesce(c.bloqueado, false))");
L.push("select x.ref, x.contato_id, x.t, x.pix_token, x.pix_expira, x.clique, x.tel, x.nome, x.falas, x.conversa, x.ult_texto, x.r1,");
L.push(" case when length(x.tel) = 13 and x.tel like '55%' and substr(x.tel, 5, 1) = '9' then substr(x.tel, 1, 4) || substr(x.tel, 6) else null end as tel_alt,");
L.push(" case when x.t > now() - interval '20 hours' then 1 else 2 end as etapa");
L.push(" from x where coalesce(x.tel, '') <> '' and x.falas is not null and (");
L.push(" (" + vazio('x.r1') + " and x.t > now() - interval '20 hours' and x.t <= now() - interval '" + h1 + " hours')");
L.push(" or (" + vazio('x.r2') + " and x.t <= now() - interval '20 hours' and (" + vazio('x.r1') + " or (x.r1 in " + feito + " and x.r1_em <= now() - interval '" + h2 + " hours'))))");
// so lead: nunca comprou, sem link/Pix recente, sem checkout iniciado
L.push(" and not exists (select 1 from serena_mensagens a where a.contato_id = x.contato_id and a.autor like 'transacional:%')");
L.push(" and not exists (select 1 from serena_mensagens a where a.contato_id = x.contato_id and a.criado_em > now() - interval '7 days' and a.texto ~ 'seguro[.]americanutrition[.]com/')");
L.push(" and not exists (select 1 from serena_mensagens a where a.contato_id = x.contato_id and a.criado_em > x.t and a.autor like 'proativo:%' and a.autor <> 'proativo:retomada_lead')");
L.push(" and not exists (select 1 from serena_pix_links p where serena_tel_canon(p.telefone) = x.tel and p.criado_em > now() - interval '7 days')");
L.push(" and not exists (select 1 from carrinhos_abandonados ca where serena_tel_canon(ca.whatsapp) = x.tel and ca.criado_em > now() - interval '7 days')");
L.push(" and not exists (select 1 from serena_lembrete_pagamento r where r.contato_id = x.contato_id and r.ref <> x.ref and r.resultado in " + feito + " and r.criado_em > now() - interval '4 days')");
L.push(" and not exists (select 1 from serena_atribuicoes a where a.contato_id = x.contato_id and a.status = 'aberto')");
L.push(" and not exists (select 1 from serena_wpp_pausas p where p.telefone = x.tel and p.ate > now())");
L.push(" and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = x.tel)");
L.push(" and not exists (select 1 from serena_conversas v where v.contato_id = x.contato_id and v.ia_pausada = true and v.aberta_em > now() - interval '2 days')");
L.push(" order by x.t limit 25");
return [{ json: { modo: modo, horaBR: horaBR, query: L.join('') } }];
` } } });

const candidatos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Candidatos', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

// pedido na Shopify pelo telefone com e sem o 9 (qualquer pedido = ja e cliente)
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
// recusa clara ou assunto de suporte (devolucao, reembolso): nao retoma
const NAO = /(n[aã]o (quero|tenho interesse|vou querer|vou comprar|preciso mais)|sem interesse|desist|cancel|devolv|reembols|estorn|reclama|pare de|parar de|n[aã]o me mand|me tir[ae] d|j[aá] (comprei|paguei|fiz o pagamento|fiz o pix|transferi)|\\bpaguei\\b|comprei (em|na|no|pela|pelo) )/i;
// combinou uma data (dia 26, mes que vem, quando receber): nao cobra antes, a Serena ja combinou com ele
const DATA_FUTURA = /(at[eé] (o )?dia \\d|no dia \\d|dia \\d{1,2}\\b|m[eê]s que vem|pr[oó]ximo m[eê]s|semana que vem|pr[oó]xima semana|quando (eu )?receber|quando cair|sal[aá]rio|aposentadoria|benef[ií]cio)/i;
// "amanha", "a noite", "mais tarde": pula o toque de 3h e deixa para o de 24h
const MAIS_TARDE = /(amanh[aã]|[aà] noite|de noite|mais tarde|depois|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|fim de semana)/i;
// momento delicado na conversa: mensagem de venda soa mal, fica com a equipe
const SENSIVEL = /(internad|interna[cç][aã]o|\\buti\\b|faleceu|falecimento|[oó]bito|\\bluto\\b|piorou|estado grave|paliativ)/i;
function primeiroNome(n) {
  const p = String(n || '').trim().split(/\\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ]{3,14}$/.test(p) || /^(eng|dr|dra|sr|sra|prof|pastor|pra|irm[aã])$/i.test(p)) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}
const saud = dec.horaBR < 12 ? 'Bom dia' : (dec.horaBR < 18 ? 'Boa tarde' : 'Boa noite');
// a Serena perguntou para quem/para que e o produto: retoma pela mesma pergunta, curta
const PERFIL = /(preventiv|condi[c\\u00e7][a\\u00e3]o|caso espec|situa[c\\u00e7][a\\u00e3]o espec|para voc[e\\u00ea] ou|pra voc[e\\u00ea] ou|para quem)/i;
// cadastro no Esquenta Black Friday: lembra o desconto que ja esta liberado (vale ate 26/11 23h59 de Brasilia)
const ESQUENTA_ATE = Date.parse('2026-11-27T02:59:59Z');
function texto(c, tipo, n) {
  const v = n ? ', ' + n : '';
  if (tipo === 'lead_esquenta') {
    if (Number(c.etapa) === 1) return 'Oi' + v + '! Conseguiu escolher? 🙂 Seu desconto do Esquenta já está liberado: 10% OFF levando 1 unidade e 15% OFF a partir de 2. Me diz o que você quer levar que eu monto o pedido em um minuto.';
    return saud + v + '! Passando para lembrar que o seu desconto do Esquenta Black Friday vale até 26/11 🔥 Se quiser, eu monto o seu pedido agora por aqui. Qual produto você quer levar?';
  }
  if (Number(c.etapa) === 1) {
    if (tipo === 'lead_perfil') return 'Oi' + v + '! Passando para continuar nossa conversa 🙂 O ImunoFosfo seria para você ou para alguém da família? Me conta em poucas palavras que eu te indico a opção e a forma de uso certinhas.';
    return 'Oi' + v + '! Conseguiu ver minha mensagem? 🙂 Se ficou alguma dúvida, é só me falar por aqui que eu te ajudo a escolher a melhor opção.';
  }
  return saud + v + '! Vou deixar nossa conversa aberta por aqui 🙂 Quando quiser tirar uma dúvida sobre o ImunoFosfo ou montar o seu pedido, é só me chamar que eu te ajudo na hora.';
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
  const tipo = (ESQUENTA_ATE > Date.now() && /esquenta/i.test(c.conversa || '')) ? 'lead_esquenta' : (PERFIL.test(c.ult_texto || '') ? 'lead_perfil' : 'lead_geral');
  // Shopify: sem resposta valida nao arrisca (tenta de novo na proxima rodada)
  const d = shop[i] && shop[i].data;
  if (!d || !d.customers) { ver.push({ ref: c.ref, resultado: 'pulado: shopify indisponivel' }); continue; }
  // qualquer pedido na Shopify: ja e cliente, nao e lead
  const comprou = (d.customers.nodes || []).some((cu) => ((cu.orders || {}).nodes || []).length > 0);
  if (comprou) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'ja_e_cliente', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'ja_e_cliente' }); continue; }
  if (c.falas && NAO.test(c.falas)) { if (modo !== 'ver') out.push({ json: { sql: registro(c, tipo, 'pulado: nao_quer', null, null) } }); ver.push({ ref: c.ref, etapa: c.etapa, resultado: 'nao_quer', falas: String(c.falas).slice(0, 200) }); continue; }
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
    out.push({ json: { sql: 'with a as (' + registro(c, tipo, 'enviado', msg, para) + " returning 1) insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) select " + E(c.contato_id) + "::uuid, 'serena', " + E(msg) + ", 'whatsapp', 'proativo:retomada_lead', true, now() from a" } });
    await new Promise((ok) => setTimeout(ok, 4000));
  } else {
    out.push({ json: { sql: registro(c, tipo, 'falha: ' + r.det, msg, para) } });
  }
}
if (modo === 'ver') return [{ json: { sql: 'select ' + E(JSON.stringify({ modo: modo, candidatos: cands.length, itens: ver })) + '::jsonb as ver' } }];
return out;
` } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', credentials: PG, parameters: { operation: 'executeQuery', query: '={{ $json.sql }}', options: {} } } });


export default workflow('retomada-lead', '[Serena WhatsApp] Retomada de lead (3h e 24h)')
  .add(agendado).to(config)
  .add(manual).to(config)
  .add(config).to(decidir).to(candidatos).to(shopify).to(montar).to(registrar);
