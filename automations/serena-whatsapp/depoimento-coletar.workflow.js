// n8n Workflow SDK — [Serena] Depoimento: Coletar (cron 30 min)
// A Serena pede autorizacao DENTRO da resposta que ela ja ia mandar (adendo de 09/10, frase "posso publicar").
// Este workflow so LE a conversa: nao manda nenhuma mensagem para cliente, entao nao pesa no limite do numero.
// Quando o cliente autoriza, o relato dele entra em reviews com status 'pendente' (a API do site so serve
// 'aprovado'/'destaque', entao nada vai ao ar sem alguem aprovar).
// Nasceu em 09/10/2026: 1.328 entregas em 90 dias renderam 42 avaliacoes organicas (3,2%), enquanto 59 clientes
// elogiaram no WhatsApp depois da entrega e nenhum virou depoimento.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 30 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Autorizacoes', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'depoimento_auto'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'depoimento_janela_min'), '180')::int as janela_min, coalesce((select valor from serena_config where chave = 'depoimento_cooldown_dias'), '180')::int as cooldown_d, coalesce((select valor from serena_config where chave = 'modelo'), 'claude-sonnet-5-5') as modelo), pedidos as (select distinct on (m.contato_id) m.id as pedido_id, m.contato_id, m.criado_em as pedido_em, c.nome as cliente_nome, serena_tel_canon(coalesce(c.telefone, '')) as telefone, c.email from serena_mensagens m join serena_contatos c on c.id = m.contato_id, cfg where cfg.ativo = 'on' and m.papel = 'serena' and m.texto ~* 'posso publicar' and m.criado_em > now() - (cfg.janela_min * interval '1 minute') order by m.contato_id, m.criado_em desc), validos as (select p.* from pedidos p, cfg where exists (select 1 from serena_mensagens r where r.contato_id = p.contato_id and r.papel = 'cliente' and r.criado_em > p.pedido_em) and not exists (select 1 from serena_fatos f where f.contato_id = p.contato_id and f.chave = 'depoimento' and f.atualizado_em > p.pedido_em) and not exists (select 1 from serena_wpp_bloqueados b where serena_tel_canon(b.telefone) = p.telefone) and not exists (select 1 from reviews rv where regexp_replace(coalesce(rv.cliente_whatsapp, ''), '\\D', '', 'g') = p.telefone and rv.criado_em > now() - (cfg.cooldown_d * interval '1 day')) limit 10) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(jsonb_build_object('pedido_id', v.pedido_id, 'contato_id', v.contato_id::text, 'cliente_nome', v.cliente_nome, 'telefone', v.telefone, 'email', v.email, 'produto_entregue', coalesce((select (s.template_params::jsonb -> 'custom_fields' ->> 'produto_entregue') from scheduled_messages s where regexp_replace(coalesce(s.phone, ''), '\\D', '', 'g') = v.telefone and s.template_name = 'pedido_entregue' and s.status = 'enviada' order by s.enviada_em desc limit 1), ''), 'conversa', coalesce((select jsonb_agg(jsonb_build_object('papel', h.papel, 'texto', left(h.texto, 400)) order by h.criado_em) from (select papel, texto, criado_em from serena_mensagens hh where hh.contato_id = v.contato_id and hh.criado_em >= v.pedido_em - interval '2 hours' order by hh.criado_em limit 12) h), '[]'::jsonb))) from validos v), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', janela_min: 180, cooldown_d: 180, modelo: 'claude-sonnet-5-5' }, lista: [] }] });

const confirmar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Confirmar e Montar', parameters: { jsCode: `// Le a conversa e decide se houve autorizacao. Nao manda nada para o cliente: so monta a linha de review
// (status pendente) e deixa a nota no contato, para nao perguntar de novo.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
const NL = String.fromCharCode(10);
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const TOKEN = 'an-serena-9Kx4Lm2Q';
const self = this;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const corta = (s, n) => { const t = String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '...' : t; };
if (String(cfg.ativo || 'on') !== 'on' || !lista.length) { return [{ json: { payload: '[]', coletados: 0 } }]; }

// handle do produto: o texto solto do Claude cai num destes; sem match, vai para o ImunoFosfo em capsulas
const HANDLES = [
  ['kids', 'imunofosfo-kids-fosfoetanolamina'], ['liquid', 'imunofosfo-liquid'], ['liquido', 'imunofosfo-liquid'],
  ['diabet', 'imunofosfo-diabetes'], ['healing', 'imunofosfo-healing'], ['pet', 'imunopet'],
  ['omega', 'omega-3-meg3'], ['50.000', 'vitamina-d3-50000-ui-k2-a-e'], ['50000', 'vitamina-d3-50000-ui-k2-a-e'],
  ['d3', 'd3-vitamin-with-k2-and-a'], ['vitamina d', 'd3-vitamin-with-k2-and-a'],
  ['verde', 'green-propolis-premium-propolis-verde'], ['green', 'green-propolis-premium-propolis-verde'],
  ['propolis', 'propolis-extract'], ['creatina', 'creatine-ultra-micronized'], ['gummy', 'life-gummy-creatina-em-gomas'],
  ['hair', 'life-hair'], ['protein', 'life-protein-proteina-vegetal'], ['multivit', 'vitamins-minerals-premium'],
  ['vitamins', 'vitamins-minerals-premium']
];
const achaHandle = txt => {
  const t = String(txt || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  for (const [k, h] of HANDLES) { if (t.indexOf(k) >= 0) return h; }
  return 'imunofosfo-fosfoetanolamina-phospho';
};

const rows = [];
const linhas = [];
let coletados = 0, recusados = 0;
for (const it of lista) {
  const conversa = (Array.isArray(it.conversa) ? it.conversa : []).map(h => (h.papel === 'cliente' ? 'CLIENTE: ' : 'SERENA: ') + h.texto).join(NL);
  const pergunta = 'Conversa de WhatsApp da America Nutrition (suplementos). A Serena pediu autorizacao para publicar o relato do cliente como depoimento no site.' + NL + NL +
    conversa + NL + NL +
    'Responda SO com JSON: {"autorizou": true/false, "texto": "", "produto": "", "alegacao_saude": true/false, "nota": 5}.' + NL +
    'autorizou = true somente se, DEPOIS do pedido da Serena, o cliente respondeu claramente que sim (pode publicar, autorizo, claro, pode sim). Silencio, duvida ou mudanca de assunto = false.' + NL +
    'texto = o relato do PROPRIO cliente sobre o resultado, nas palavras dele, juntando as frases dele se precisar. Corrija so acentos e pontuacao. NAO invente, NAO elogie no lugar dele, NAO escreva nada que ele nao disse. Se ele nao contou um resultado concreto, devolva texto vazio.' + NL +
    'produto = o produto de que ele fala, se der para saber pela conversa (senao vazio).' + NL +
    'alegacao_saude = true se o relato afirma cura, tratamento de doenca, substituicao de remedio ou promessa medica.' + NL +
    'nota = 5 se o relato e positivo; 4 se e positivo com ressalva.';
  let j = null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 60000,
      body: { model: cfg.modelo || 'claude-sonnet-5-5', max_tokens: 700, output_config: { effort: 'low' }, messages: [{ role: 'user', content: pergunta }] } });
    const txt = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ');
    const m = txt.match(/\\{[\\s\\S]*\\}/);
    if (m) j = JSON.parse(m[0]);
  } catch (e) { j = null; }

  const autorizou = !!(j && j.autorizou === true);
  const texto = String((j && j.texto) || '').trim();
  const nota = autorizou && texto.length >= 40
    ? 'Autorizou a publicacao do relato em ' + new Date(Date.now() - 10800000).toISOString().slice(0, 16).replace('T', ' ') + '. Entrou em reviews como pendente, aguardando aprovacao.'
    : (autorizou ? 'Autorizou a publicacao, mas o relato ficou curto demais para virar depoimento. Nao perguntar de novo.' : 'Nao autorizou a publicacao do relato (ou nao respondeu com clareza). Nao perguntar de novo.');
  try { await self.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000,
    body: { t: TOKEN, acao: 'nota', contato_id: it.contato_id, chave: 'depoimento', texto: nota, autor: 'serena' } }); } catch (e) {}

  if (!autorizou || texto.length < 40) { recusados++; continue; }
  const handle = achaHandle((j && j.produto) || it.produto_entregue);
  rows.push({ nome: it.cliente_nome || '', telefone: it.telefone, email: it.email || '', handle: handle,
    rating: (j && Number(j.nota) === 4) ? 4 : 5, texto: texto.slice(0, 1500),
    flags: JSON.stringify({ fonte: 'serena_whatsapp', pedido_msg_id: it.pedido_id, alegacao_saude: !!(j && j.alegacao_saude) }) });
  coletados++;
  linhas.push('\\u2022 <b>' + esc(it.cliente_nome || 'Cliente') + '</b> (+' + esc(it.telefone) + ')' + (j && j.alegacao_saude ? ' \\u26A0\\uFE0F <b>fala em cura/tratamento</b>' : '') + NL + '   "' + esc(corta(texto, 220)) + '"');
}

if (linhas.length) {
  const txt = '\\u2B50 <b>' + linhas.length + ' depoimento(s) autorizado(s) pelo cliente</b>' + NL +
    '<i>Entraram como PENDENTES; so aparecem no site depois de aprovar.</i>' + NL + NL + linhas.join(NL + NL) +
    (recusados ? NL + NL + '<i>' + recusados + ' pedido(s) sem autorizacao clara, marcados para nao perguntar de novo.</i>' : '');
  try {
    await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage', json: true, timeout: 20000,
      body: { chat_id: '-1003766435449', message_thread_id: 289, text: txt.slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true } });
  } catch (e) {}
}
return [{ json: { payload: JSON.stringify(rows), coletados: coletados, recusados: recusados } }];` } },
  output: [{ payload: '[]', coletados: 0, recusados: 0 }] });

// product_id e product_title saem de uma review existente do mesmo handle, para a linha nascer completa
const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Depoimentos', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into reviews (product_id, product_handle, product_title, cliente_nome, cliente_email, cliente_whatsapp, rating, texto, status, verified, origem, ia_flags, criado_em) select (select r2.product_id from reviews r2 where r2.product_handle = x->>'handle' and r2.product_id is not null limit 1), x->>'handle', (select r3.product_title from reviews r3 where r3.product_handle = x->>'handle' and coalesce(r3.product_title,'') <> '' limit 1), nullif(x->>'nome',''), nullif(x->>'email',''), nullif(x->>'telefone',''), (x->>'rating')::int, x->>'texto', 'pendente', true, 'whatsapp', (x->>'flags')::jsonb, now() from p, jsonb_array_elements(p.j) x returning id",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ id: 'x' }] });

const nota = sticky('## Depoimento: coletar\n\nA Serena pede autorizacao DENTRO da resposta que ela ja ia mandar (adendo de 09/10, frase "posso publicar"). Este workflow nao manda mensagem nenhuma para cliente: so le a conversa a cada 30 min.\n\nQuando o cliente autoriza, o Claude extrai o relato NAS PALAVRAS DELE e grava em reviews com status pendente. A API do site serve so aprovado/destaque, entao nada vai ao ar sem alguem aprovar. Relato que fala em cura/tratamento vem marcado no aviso do Telegram.\n\nFica uma nota no contato (chave depoimento), inclusive quando o cliente nao autoriza, para nao perguntar de novo. Um pedido por cliente a cada depoimento_cooldown_dias (180).\n\nKill switch: serena_config depoimento_auto = off.\n\nNasceu em 09/10/2026: 1.328 entregas em 90 dias renderam 42 avaliacoes organicas (3,2%), e dos 59 clientes que elogiaram no WhatsApp depois da entrega, nenhum virou depoimento.', { color: 4, width: 460, height: 340 });

export default workflow('serena-depoimento-coletar', '[Serena] Depoimento: Coletar', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(confirmar).to(gravar).add(nota);
