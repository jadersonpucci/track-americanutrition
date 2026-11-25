// No "Perguntar" do workflow [Serena] Pesquisa de Satisfacao. Cron 30 min (so 9h-20h BRT) e
// GET /webhook/serena-satisfacao?t=<SATISFACAO_TOKEN_MANUAL>&modo=simulacao|on.
// 02/11/2026, pedido do Jaderson: depois de uma conversa resolvida, a Serena pergunta "de 1 a 5, como foi?". Serve para
// medir a satisfacao e achar as conversas ruins. A resposta (o numero) e tratada na Entrada, no "Chamar Serena Core"
// (entrada-chamar-serena-core.js): grava a nota, agradece e, com nota ate 3, pergunta o que faltou e avisa no Telegram.
//
// Quem recebe: conversa de hoje com pelo menos 3 mensagens do cliente, a ultima fala e da Serena (na conversa, nao de robo)
// ha mais de 2h, sem link de pagamento em aberto, sem fila humana, pausa, bloqueio ou IA pausada, sem outra mensagem
// proativa nas ultimas 12h e sem pesquisa nos ultimos 30 dias. A IA le a conversa e so pergunta quando ela terminou
// sem pendencia (nada esperando resposta do cliente, nenhum problema em aberto); quem ela pula pode voltar no dia seguinte.
// serena_config.satisfacao: off | simulacao (grava, nao envia) | on. serena_config.satisfacao_dia: teto diario (15).
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const TOKEN_MANUAL = '<SATISFACAO_TOKEN_MANUAL>';
const EQUIPE = ['5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555'];
const self = this;
const NL = String.fromCharCode(10);
const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}

const ent = $input.first().json || {};
const q = ent.query || {};
const manual = Object.prototype.hasOwnProperty.call(ent, 'query');
if (manual && q.t !== TOKEN_MANUAL) return [{ json: { ok: false, erro: 'acesso negado' } }];
const cfg = {};
(await sql("select chave, valor from serena_config where chave like 'satisfacao%'")).forEach((x) => { cfg[x.chave] = x.valor; });
let modo = String(cfg.satisfacao || 'off');
if (manual && /^(simulacao|on)$/.test(String(q.modo || ''))) modo = q.modo;
if (modo === 'off') return [{ json: { ok: true, modo: modo, nada: true } }];
const horaBR = (new Date().getUTCHours() + 21) % 24;
if (!manual && (horaBR < 9 || horaBR >= 20)) return [{ json: { ok: true, modo: modo, fora_do_horario: horaBR } }];

const teto = Number(cfg.satisfacao_dia || 15);
const conta = modo === 'on' ? "('enviado')" : "('enviado', 'simulado')";
const hoje = Number(((await sql("select count(*)::int n from serena_satisfacao where status in " + conta + " and enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'"))[0] || {}).n || 0);
let vagas = teto - hoje;
if (vagas <= 0) return [{ json: { ok: true, modo: modo, teto: teto, hoje: hoje } }];

const jaPerguntado = modo === 'on' ? "s.status = 'enviado'" : "s.status in ('enviado', 'simulado')";
const cands = await sql(
  "with hoje as (select m.contato_id, count(*) filter (where m.papel = 'cliente') as cli, max(m.criado_em) as ult, " +
  "(array_agg(m.papel order by m.criado_em desc))[1] as ult_papel, (array_agg(coalesce(m.autor, '') order by m.criado_em desc))[1] as ult_autor " +
  "from serena_mensagens m where m.canal = 'whatsapp' and m.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' group by 1) " +
  "select h.contato_id, regexp_replace(c.telefone, '\\D', '', 'g') as tel, coalesce(c.nome, '') as nome, h.cli from hoje h join serena_contatos c on c.id = h.contato_id " +
  "where h.cli >= 3 and h.ult_papel = 'serena' and h.ult_autor in ('', 'reprocessado') and h.ult < now() - interval '2 hours' " +
  "and coalesce(c.bloqueado, false) = false and c.telefone ~ '^\\+?55' " +
  "and not exists (select 1 from serena_satisfacao s where s.contato_id = h.contato_id and ((" + jaPerguntado + " and s.enviado_em > now() - interval '30 days') or (s.status = 'pulado_ia' and s.enviado_em > now() - interval '20 hours'))) " +
  "and not exists (select 1 from serena_mensagens p where p.contato_id = h.contato_id and p.papel = 'serena' and (p.autor like 'proativo:%' or p.autor like 'transacional:%' or p.autor like 'pos_entrega:%') and p.criado_em > now() - interval '12 hours') " +
  "and not exists (select 1 from serena_mensagens k where k.contato_id = h.contato_id and k.papel = 'serena' and k.texto ~ 'seguro\\.americanutrition\\.com/[A-Za-z0-9]+' and k.criado_em > now() - interval '24 hours' " +
  "  and not exists (select 1 from serena_mensagens z where z.contato_id = h.contato_id and z.autor = 'transacional:pedido_pago_confirmado' and z.criado_em > k.criado_em)) " +
  "and not exists (select 1 from serena_atribuicoes a where a.contato_id = h.contato_id and a.status = 'aberto') " +
  "and not exists (select 1 from serena_wpp_pausas p where p.telefone = serena_tel_canon(c.telefone) and p.ate > now()) " +
  "and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = serena_tel_canon(c.telefone)) " +
  "and not exists (select 1 from serena_conversas v where v.contato_id = h.contato_id and v.ia_pausada = true and v.aberta_em > now() - interval '2 days') " +
  "order by h.cli desc limit " + Math.min(10, vagas * 2)
);
if (!cands.length) return [{ json: { ok: true, modo: modo, candidatos: 0 } }];

const SYS = 'Voce decide se a Serena (atendente de WhatsApp da America Nutrition, suplementos ImunoFosfo) pode mandar agora uma pesquisa curta de satisfacao ("de 1 a 5, como foi o atendimento?") para este cliente.'
  + ' Responda SOMENTE um JSON: {"perguntar":true|false,"motivo":"ate 100 caracteres"}.'
  + ' PERGUNTE quando a conversa de hoje terminou: a duvida foi respondida, o pedido foi feito ou o assunto foi encerrado, e a ultima mensagem da Serena nao espera resposta nem acao do cliente.'
  + ' NAO PERGUNTE quando: a Serena fez uma pergunta ou pediu um dado que o cliente ainda nao respondeu; a Serena mandou link de pagamento, PIX ou boleto e o pagamento ainda nao foi confirmado; ha um problema em aberto (pedido atrasado ou extraviado sem solucao, troca, reembolso, cobranca, produto com defeito); o cliente esta irritado; morte de alguem ou internacao/urgencia na conversa; a conversa e so saudacao ou spam; o cliente pediu para nao receber mensagens.'
  + ' IMPORTANTE: ter doenca grave (cancer, metastase, sindrome rara) NAO impede a pesquisa: quase todos os clientes estao nessa situacao. Mensagens longas aparecem cortadas com (...): isso nao e pergunta pendente.';
async function decidir(c) {
  const msgs = await sql("select papel, case when length(texto) > 600 then left(texto, 600) || ' (...)' else texto end as texto from serena_mensagens where contato_id = " + E(c.contato_id) + " and criado_em > now() - interval '2 days' order by criado_em desc limit 24");
  const conversa = msgs.reverse().map((m) => (m.papel === 'cliente' ? 'CLIENTE: ' : (m.papel === 'humano' ? 'EQUIPE: ' : 'SERENA: ')) + String(m.texto || '').replace(/\s+/g, ' ')).join(NL);
  const r = await self.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 45000,
    body: { model: 'claude-haiku-4-5-20251001', max_tokens: 120, system: SYS, messages: [{ role: 'user', content: 'CONVERSA (mais antiga primeiro):' + NL + conversa.slice(-8000) }] } });
  const t = ((r && r.content) || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('IA sem JSON: ' + t.slice(0, 120));
  const j = JSON.parse(m[0]);
  return { perguntar: j.perguntar === true, motivo: String(j.motivo || '').slice(0, 200) };
}
function primeiroNome(n) {
  const p = String(n || '').trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ]{3,14}$/.test(p)) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}
const texto = (nome) => 'Oi' + (nome ? ', ' + nome : '') + '! Posso te pedir um favor rápido? 💙 De 1 a 5, como foi o seu atendimento comigo hoje? É só responder com o número (5 é ótimo).';

const saida = { ok: true, modo: modo, hoje: hoje, itens: [] };
for (const c of cands) {
  if (vagas <= 0) break;
  if (EQUIPE.indexOf(c.tel) !== -1) continue;
  try {
    const d = await decidir(c);
    if (!d.perguntar) {
      await sql('insert into serena_satisfacao (contato_id, telefone, nome, status, motivo) values (' + [E(c.contato_id), E(c.tel), E(c.nome), "'pulado_ia'", E(d.motivo)].join(', ') + ')');
      saida.itens.push({ nome: c.nome, status: 'pulado_ia', motivo: d.motivo });
      continue;
    }
    const msg = texto(primeiroNome(c.nome));
    let status = 'simulado', msgId = null;
    if (modo === 'on') {
      const r = await self.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: c.tel, text: msg, delay: 1200 } });
      status = (r && r.ok === true) ? 'enviado' : 'erro';
      if (status === 'enviado') {
        const ins = await sql("insert into serena_mensagens (contato_id, papel, texto, autor, entregue, canal) values (" + E(c.contato_id) + ", 'serena', " + E(msg) + ", 'proativo:satisfacao', true, 'whatsapp') returning id");
        msgId = ins[0] ? ins[0].id : null;
      }
    }
    await sql('insert into serena_satisfacao (contato_id, telefone, nome, status, motivo, texto, msg_id) values (' + [E(c.contato_id), E(c.tel), E(c.nome), E(status), E(d.motivo), E(msg), msgId || 'null'].join(', ') + ')');
    if (status !== 'erro') vagas -= 1;
    saida.itens.push({ nome: c.nome, status: status, motivo: d.motivo });
    if (modo === 'on') await new Promise((ok) => setTimeout(ok, 4000));
  } catch (e) {
    saida.itens.push({ nome: c.nome, erro: String(e.message).slice(0, 200) });
  }
}
return [{ json: saida }];
