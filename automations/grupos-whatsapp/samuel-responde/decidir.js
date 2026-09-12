// Node "Decidir" do workflow "Grupos | Samuel Responde" (n8n 0OwXSCNKh3zpvyFG).
// Chaves reais so no n8n.
//
// Le a classificacao da IA e aplica as travas ANTES de esperar. Tudo que nao passa sai com
// agir=false e um motivo, e o "Registrar Silencio" grava em grupo_bot_log. O que passa vai
// esperar 3 minutos e ser reconferido no "Reconferir e Responder".
const ctx = $('Pre-filtro').first().json;
const SK = 'SUPABASE_SERVICE_KEY';
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const sql = async (q) => { const r = await req({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); return Array.isArray(r) ? r : []; };
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 900) + "'");

// TRAVAS. Sao o que separa "responde quando faz sentido" de "fala sozinha no grupo".
const CONF_MIN = 85;
const INTENCOES = ['link_compra', 'preco_promocao', 'como_tomar', 'versao_produto', 'depoimentos', 'pedido_nao_chegou'];
const TETO_GRUPO_HORA = 2;
const TETO_GRUPO_DIA = 8;
const TETO_GERAL_DIA = 20;
const MESMA_PESSOA_H = 12;
const MESMA_DUVIDA_H = 6;

// resposta da IA (o no Classificar segue mesmo com erro: sem conteudo = silencio)
let cat = 'nenhuma', produto = 'nenhum', dirigida = false, conf = -1, motivoIa = '';
try {
  const blocos = Array.isArray($json.content) ? $json.content : [];
  let bruto = blocos.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
  bruto = bruto.replace(/```json/g, '').replace(/```/g, '').trim();
  const j = JSON.parse(bruto);
  cat = String(j.intencao || 'nenhuma');
  produto = String(j.produto || 'nenhum');
  dirigida = (j.dirigida_ao_grupo === true || j.dirigida_ao_grupo === 'true');
  let c = Number(j.confianca); if (!isFinite(c)) c = -1; else if (c > 0 && c <= 1) c = Math.round(c * 100); else c = Math.round(c);
  conf = c;
  motivoIa = String(j.motivo || '').slice(0, 100);
} catch (e) { cat = 'nenhuma'; }

const base = { agir: false, registrar: false, modo: null, acao: null, motivo: null, intencao: cat, produto: produto, confianca: conf, motivo_ia: motivoIa, ctx: ctx };
const calar = (acao, motivo, registrar) => [{ json: Object.assign({}, base, { acao: acao, motivo: motivo, registrar: registrar !== false }) }];

// silencio sem registro: nao e assunto nosso (e a maioria das mensagens, nao vale poluir o log)
if (cat === 'nenhuma' || INTENCOES.indexOf(cat) === -1) return calar('sem_intencao', motivoIa, false);
// com registro: era assunto nosso mas nao passou
if (!dirigida) return calar('ignorada', 'nao dirigida ao grupo');
if (conf < CONF_MIN) return calar('ignorada', 'confianca ' + conf + ' abaixo de ' + CONF_MIN);

const autor = ctx.telefone || String(ctx.participant || '').split('@')[0];
const r = await sql(
  "select " +
  "(select count(*) from grupo_bot_log where grupo_jid = " + E(ctx.jid) + " and acao in ('respondida','reagida') and criado_em > now() - interval '1 hour')::int as grupo_hora, " +
  "(select count(*) from grupo_bot_log where grupo_jid = " + E(ctx.jid) + " and acao in ('respondida','reagida') and criado_em > now() - interval '24 hours')::int as grupo_dia, " +
  "(select count(*) from grupo_bot_log where acao in ('respondida','reagida') and criado_em > now() - interval '24 hours')::int as geral_dia, " +
  "(select count(*) from grupo_bot_log where autor = " + E(autor) + " and intencao = " + E(cat) + " and acao in ('respondida','reagida') and criado_em > now() - interval '" + MESMA_PESSOA_H + " hours')::int as mesma_pessoa, " +
  "(select count(*) from grupo_bot_log where grupo_jid = " + E(ctx.jid) + " and intencao = " + E(cat) + " and acao = 'respondida' and criado_em > now() - interval '" + MESMA_DUVIDA_H + " hours')::int as mesma_duvida"
);
const q = (r && r[0]) || {};
if (Number(q.mesma_pessoa || 0) >= 1) return calar('bloqueada', 'mesma pessoa e intencao nas ultimas ' + MESMA_PESSOA_H + 'h');
if (Number(q.geral_dia || 0) >= TETO_GERAL_DIA) return calar('bloqueada', 'teto geral do dia (' + TETO_GERAL_DIA + ')');
if (Number(q.grupo_dia || 0) >= TETO_GRUPO_DIA) return calar('bloqueada', 'teto do grupo no dia (' + TETO_GRUPO_DIA + ')');
if (Number(q.grupo_hora || 0) >= TETO_GRUPO_HORA) return calar('bloqueada', 'teto do grupo na hora (' + TETO_GRUPO_HORA + ')');

// mesma duvida ja respondida ha pouco no mesmo grupo: em vez de repetir o texto, reage com joinha
// (a resposta esta logo acima na conversa; repetir e o que faz bot parecer bot)
const modo = (Number(q.mesma_duvida || 0) >= 1 && cat !== 'pedido_nao_chegou') ? 'reagir' : 'responder';
return [{ json: Object.assign({}, base, { agir: true, modo: modo, autor: autor }) }];
