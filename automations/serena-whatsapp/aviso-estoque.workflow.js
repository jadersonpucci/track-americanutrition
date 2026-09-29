// id XfrzsyTwdMdhbwwZ
// n8n Workflow SDK — [Serena] Avise-me Quando Voltar (cron 30 min)
// Registra quem pediu para ser avisado quando um produto voltar ao estoque e avisa quando volta.
// Antes disso a Serena prometia ("assim que voltar, voce e avisada por aqui") e ninguem cumpria:
// nao existia fila nenhuma. Caso real: 29/09, +55 33 9950-9132, D3 with K2, A and E 50.000 UI.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 30 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// novos = mensagens de cliente pedindo aviso de volta ao estoque (3 dias, ainda nao registradas)
// pendentes = fila esperando o produto voltar
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Fila', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'aviso_estoque'), 'on') as ativo, extract(hour from now() at time zone 'America/Sao_Paulo')::int as hora), novos as (select m.id as msg_id, m.contato_id::text as contato_id, regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as telefone, split_part(coalesce(c.nome, ''), ' ', 1) as nome, m.texto || ' | ' || coalesce((select x.texto from serena_mensagens x where x.contato_id = m.contato_id and x.papel in ('serena', 'humano') and x.criado_em < m.criado_em order by x.criado_em desc limit 1), '') as texto, m.criado_em from serena_mensagens m join serena_contatos c on c.id = m.contato_id where m.papel = 'cliente' and m.criado_em > now() - interval '3 days' and m.texto ~* '(avis[ae]|avisar|avisado|avisada|avisem|aviso)' and m.texto ~* '(volt|cheg|repo|dispon|estoque)' and not exists (select 1 from serena_avisos_estoque a where a.msg_id = m.id) and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g')) order by m.criado_em desc limit 20), pendentes as (select a.id, a.telefone, a.nome, a.contato_id::text as contato_id, a.variant_id, a.produto, a.criado_em from serena_avisos_estoque a where a.status = 'pendente' and nullif(a.variant_id, '') is not null and not exists (select 1 from serena_wpp_bloqueados b where b.telefone = a.telefone) order by a.criado_em limit 30), prods as (select variant_id, nome, sku from produtos where ativo and nullif(variant_id, '') is not null) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(row_to_json(novos)) from novos), '[]'::jsonb) as novos, coalesce((select jsonb_agg(row_to_json(pendentes)) from pendentes), '[]'::jsonb) as pendentes, coalesce((select jsonb_agg(row_to_json(prods)) from prods), '[]'::jsonb) as produtos",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', hora: 10 }, novos: [], pendentes: [], produtos: [] }] });

const processar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Registrar e Avisar', parameters: { jsCode: `// 1) Pedido novo: descobre de qual produto o cliente falou e, se ele estiver FORA de estoque, entra na fila.
//    Produto em estoque = nao ha o que esperar (e filtra "me avisa quando meu pedido chegar", que nao cita produto).
// 2) Fila: consulta o estoque real na Shopify; voltou, a Serena escreve o aviso (Core proativo) e o Samuel envia.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const novos = Array.isArray(d.novos) ? d.novos : [];
const pendentes = Array.isArray(d.pendentes) ? d.pendentes : [];
const produtos = Array.isArray(d.produtos) ? d.produtos : [];
const SHOPIFY = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const ENVIAR = 'https://n8n.americanutrition.com/webhook/serena-samuel-enviar';
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const TOKEN = 'an-serena-9Kx4Lm2Q';
const NL = String.fromCharCode(10);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
if (String(cfg.ativo || 'on') !== 'on') { return [{ json: { payload: '[]', desligado: true } }]; }

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['de','da','do','com','and','the','with','ui','mg','e','a','o','para','em','capsulas','capsula','caps','un','ml','gotas','vitamin','vitamina']);
// O nome no banco esta em portugues ("D3 com K2, A e E - 50.000 UI") e o botao do site manda em ingles
// ("D3 with K2, A and E - 50.000 UI"): por isso o casamento e por tokens fortes, inclusive curtos como
// d3, k2 e 180 (com w.length > 2 nao sobrava nada desse nome e nenhum cliente era registrado).
// bate() aceita plural/genero (vegano~veganas, liquido~liquida). Token raro (em ate 2 produtos) vale sozinho,
// para "avisa quando chegar o omega 3" funcionar; "imunofosfo" sozinho e ambiguo e de proposito nao casa nada.
const tokens = nome => norm(nome).split(' ').filter(w => w.length >= 2 && !STOP.has(w));
const freq = {};
for (const p of produtos) { for (const w of new Set(tokens(p.nome))) { freq[w] = (freq[w] || 0) + 1; } }
const bate = (t, w) => t.indexOf(' ' + w + ' ') >= 0 || (w.length >= 5 && t.indexOf(' ' + w.slice(0, -1)) >= 0);
function acharProduto(texto) {
  const t = ' ' + norm(texto) + ' ';
  let melhor = null, melhorScore = 0;
  for (const p of produtos) {
    const palavras = tokens(p.nome);
    if (!palavras.length) continue;
    const casados = palavras.filter(w => bate(t, w));
    const nota = casados.length;
    if (!nota) continue;
    const cobertura = nota / palavras.length;
    const score = nota + cobertura;
    const raro = casados.some(w => w.length >= 4 && (freq[w] || 9) <= 2);
    const aceita = (nota >= 2 && cobertura >= 0.5) || raro;
    if (aceita && score > melhorScore) { melhorScore = score; melhor = p; }
  }
  return melhor;
}

const gql = async (query, variables) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: SHOPIFY, json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables } } });
  const dd = r && r.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 200));
  return dd.data;
};
// estoque real de varias variantes de uma vez
async function estoqueDe(ids) {
  const unicos = Array.from(new Set(ids.filter(Boolean).map(String)));
  const mapa = {};
  for (let i = 0; i < unicos.length; i += 40) {
    const lote = unicos.slice(i, i + 40).map(v => 'gid://shopify/ProductVariant/' + v);
    let res = null;
    try { res = await gql('query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id availableForSale inventoryQuantity } } }', { ids: lote }); } catch (e) { res = null; }
    const nodes = ((res || {}).nodes) || [];
    for (const n of nodes) {
      if (!n || !n.id) continue;
      const vid = String(n.id).split('/').pop();
      mapa[vid] = { disponivel: !!n.availableForSale, qtd: Number(n.inventoryQuantity || 0) };
    }
  }
  return mapa;
}

const rows = [];
const avisados = [];
const registrados = [];
const semProduto = [];

// --- 1) pedidos novos ---
if (novos.length) {
  const casados = [];
  for (const n of novos) {
    const p = acharProduto(n.texto);
    if (!p) { semProduto.push({ nome: n.nome, telefone: n.telefone, texto: String(n.texto || '').split(' | ')[0].slice(0, 120) }); continue; }
    casados.push({ n: n, p: p });
  }
  if (casados.length) {
    const est = await estoqueDe(casados.map(c => c.p.variant_id));
    for (const c of casados) {
      const e = est[String(c.p.variant_id)];
      if (!e) continue;                       // sem resposta da Shopify: tenta na proxima rodada
      if (e.disponivel && e.qtd > 0) continue; // produto tem estoque: nada a esperar
      rows.push({ acao: 'registrar', telefone: c.n.telefone, nome: c.n.nome || '', contato_id: c.n.contato_id || null,
        variant_id: String(c.p.variant_id), produto: c.p.nome, msg_id: c.n.msg_id, origem: 'whatsapp' });
      registrados.push({ nome: c.n.nome, produto: c.p.nome, telefone: c.n.telefone });
    }
  }
}

// --- 2) fila esperando ---
const hora = Number(cfg.hora);
const podeEnviar = hora >= 8 && hora <= 20;
if (pendentes.length && podeEnviar) {
  const est = await estoqueDe(pendentes.map(p => p.variant_id));
  for (const it of pendentes) {
    const e = est[String(it.variant_id)];
    if (!e || !e.disponivel || e.qtd <= 0) continue;
    const instr = 'O produto ' + it.produto + ' VOLTOU AO ESTOQUE. Este cliente pediu para ser avisado quando voltasse, em ' +
      String(it.criado_em || '').slice(0, 10).split('-').reverse().join('/') + '. Escreva uma mensagem curta (ate 4 linhas) avisando que voltou, ' +
      'lembrando que foi ele quem pediu o aviso, e ofereca mandar o link do pedido. Nao invente prazo, desconto nem quantidade em estoque.';
    let texto = '';
    try {
      const c = await this.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 150000,
        body: { canal: 'whatsapp', telefone: it.telefone, nome: it.nome || '', modo: 'proativo', tipo_proativo: 'estoque_voltou', instrucao: instr } });
      texto = (c && c.ok && !c.pausada && c.resposta) ? String(c.resposta).trim() : '';
    } catch (e2) { texto = ''; }
    if (!texto || texto.length < 25 || texto.length > 1200) {
      texto = 'Oi' + (it.nome ? ', ' + it.nome : '') + '! \\u{1F499} O *' + it.produto + '* voltou ao estoque, como voce pediu pra ser avisado.' + NL + NL + 'Quer que eu te mande o link pra garantir o seu? \\u{1F9EC}';
    }
    let ok = false;
    try { const s = await this.helpers.httpRequest({ method: 'POST', url: ENVIAR, json: true, timeout: 60000, body: { number: it.telefone, text: texto, delay: 2500 } }); ok = !!(s && s.ok); } catch (e3) { ok = false; }
    if (!ok) continue;
    rows.push({ acao: 'avisado', id: it.id });
    avisados.push({ nome: it.nome, produto: it.produto, telefone: it.telefone, contato_id: it.contato_id });
    if (it.contato_id) {
      try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000,
        body: { t: TOKEN, acao: 'nota', contato_id: it.contato_id, chave: 'aviso de estoque', texto: 'Pediu aviso de volta ao estoque do ' + it.produto + '. Produto voltou e a Serena avisou em ' + new Date().toISOString().slice(0, 10) + '.', autor: 'serena' } }); } catch (e4) {}
    }
    await new Promise(res => setTimeout(res, 12000 + Math.floor(Math.random() * 8000)));
  }
}

if (avisados.length || registrados.length || semProduto.length) {
  const partes = [];
  if (avisados.length) partes.push('\\u{1F514} <b>Voltou ao estoque: ' + avisados.length + ' cliente(s) avisado(s)</b>' + NL + avisados.map(a => '\\u2022 ' + esc(a.nome || 'Cliente') + ' - ' + esc(a.produto)).join(NL));
  if (registrados.length) partes.push('\\u{1F4DD} <b>Novos pedidos de aviso: ' + registrados.length + '</b>' + NL + registrados.map(a => '\\u2022 ' + esc(a.nome || 'Cliente') + ' - ' + esc(a.produto)).join(NL));
  if (semProduto.length) partes.push('\\u2753 <b>Pediu aviso e nao identifiquei o produto: ' + semProduto.length + '</b>' + NL + semProduto.map(a => '\\u2022 ' + esc(a.nome || 'Cliente') + ' (+' + esc(a.telefone) + '): "' + esc(a.texto) + '"').join(NL) + NL + '<i>Registrar na mao ou responder pelo Inbox.</i>');
  try { await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage', json: true, timeout: 20000,
    body: { chat_id: '-1003766435449', message_thread_id: 289, text: partes.join(NL + NL), parse_mode: 'HTML', disable_web_page_preview: true } }); } catch (e5) {}
}
return [{ json: { payload: JSON.stringify(rows), registrados: registrados.length, avisados: avisados.length, sem_produto: semProduto.length, fila: pendentes.length } }];` } },
  output: [{ payload: '[]', registrados: 0, avisados: 0, fila: 0 }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Fila', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), ins as (insert into serena_avisos_estoque (telefone, nome, contato_id, variant_id, produto, msg_id, origem) select x->>'telefone', nullif(x->>'nome', ''), nullif(x->>'contato_id', '')::uuid, x->>'variant_id', x->>'produto', (x->>'msg_id')::bigint, coalesce(x->>'origem', 'whatsapp') from p, jsonb_array_elements(p.j) x where x->>'acao' = 'registrar' on conflict do nothing returning id), upd as (update serena_avisos_estoque a set status = 'avisado', avisado_em = now() from p, jsonb_array_elements(p.j) x where x->>'acao' = 'avisado' and a.id = (x->>'id')::bigint and a.status = 'pendente' returning a.id) select (select count(*) from ins) as registrados, (select count(*) from upd) as avisados",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ registrados: 0, avisados: 0 }] });

const nota = sticky('## Avise-me quando voltar\n\nA cada 30 min:\n1. Le as mensagens de cliente dos ultimos 3 dias pedindo aviso de volta ao estoque, descobre o produto pelo nome e, se ele estiver FORA de estoque na Shopify, entra na fila (serena_avisos_estoque).\n2. Para a fila pendente, consulta o estoque real: voltou, a Serena escreve o aviso (Core proativo, tipo estoque_voltou) e o Samuel envia, entre 8h e 20h BRT.\n\nPula bloqueados. Produto em estoque no momento do pedido nao entra na fila (nao ha o que esperar). Resumo no Telegram (topico 289). Kill switch: serena_config aviso_estoque = off.', { color: 4, width: 420, height: 260 });

export default workflow('serena-aviso-estoque', '[Serena] Avise-me Quando Voltar', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(processar).to(gravar).add(nota);
