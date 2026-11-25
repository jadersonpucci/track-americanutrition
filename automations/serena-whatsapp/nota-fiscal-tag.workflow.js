// n8n Workflow SDK — [Serena] Nota Fiscal no Pedido
// Cron a cada 10 min: cliente pediu nota fiscal na conversa -> tag NOTA FISCAL no pedido da Shopify.
//
// POR QUE EXISTE (14/10/2026, pedido do Jaderson): a Serena ja passa o pedido de nota para a equipe, mas a
// equipe precisava achar o pedido certo na Shopify. Com a tag, basta filtrar os pedidos por NOTA FISCAL.
// Nao mexe no Core: le as mensagens de cliente gravadas em serena_mensagens, como o Avise-me Quando Voltar.
//
// Regras do pedido escolhido e da deteccao: nodes/nota-fiscal-marcar.js (fonte do no 'Marcar Pedido').
// Controle: serena_nf_solicitacoes (uma linha por mensagem; status marcado / aguardando_pedido / ignorado / expirado).
// Kill switch: serena_config nf_tag = off. Nome da tag: serena_config nf_tag_nome (padrao NOTA FISCAL).
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 10 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

// novos = mensagens de cliente (3 dias) que citam nota/NF/DANFE e ainda nao foram vistas; pendentes = pediu nota antes de comprar (7 dias)
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar Pedidos de Nota', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'nf_tag'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'nf_tag_nome'), 'NOTA FISCAL') as tag), novos as (select m.id as msg_id, m.contato_id::text as contato_id, regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as telefone, c.shopify_customer_id::text as customer_id, m.texto, m.criado_em from serena_mensagens m join serena_contatos c on c.id = m.contato_id where m.papel = 'cliente' and m.criado_em > now() - interval '3 days' and lower(m.texto) ~ '(nota|\\mnfs?-?e?\\M|danfe|fiscal)' and not exists (select 1 from serena_nf_solicitacoes s where s.msg_id = m.id) and regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') not in ('5513981885555', '16464270203', '13472225493', '18583083916', '5511959275555') order by m.id limit 30), pendentes as (select s.id, s.msg_id, s.contato_id::text as contato_id, s.telefone, c.shopify_customer_id::text as customer_id, s.texto, s.criado_em, s.tentativas from serena_nf_solicitacoes s left join serena_contatos c on c.id = s.contato_id where s.status = 'aguardando_pedido' and s.criado_em > now() - interval '7 days' order by s.id limit 30) select (select row_to_json(cfg) from cfg) as cfg, coalesce((select json_agg(n) from novos n), '[]') as novos, coalesce((select json_agg(p) from pendentes p), '[]') as pendentes",
  options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ cfg: { ativo: 'on', tag: 'NOTA FISCAL' }, novos: [], pendentes: [] }] });

const marcar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Marcar Pedido', parameters: { jsCode: `// No 'Marcar Pedido' do workflow [Serena] Nota Fiscal no Pedido (cron 10 min).
// Cliente pediu nota fiscal na conversa -> tag NOTA FISCAL no pedido da Shopify, para a equipe filtrar
// os pedidos que precisam de nota sem ler conversa por conversa.
//
// Qual pedido recebe a tag:
//   1. o numero que o cliente citou (AN-15902, #15902);
//   2. senao, o pedido mais recente dele, nao cancelado, feito nos ultimos 30 dias;
//   3. senao (cliente pediu nota ANTES de comprar: "preciso de nota com CNPJ"), fica aguardando_pedido
//      por 7 dias e marca o primeiro pedido que ele fizer depois do pedido de nota.
// A descricao que a Entrada escreve para foto/PDF ("[Cliente enviou uma imagem: ... nao e nota fiscal ...]")
// nao e o cliente falando: so conta a legenda. Audio transcrito conta.
const d = $input.first().json || {};
const cfg = d.cfg || {};
const novos = Array.isArray(d.novos) ? d.novos : [];
const pendentes = Array.isArray(d.pendentes) ? d.pendentes : [];
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const BUSCAR_TEL = 'https://n8n.americanutrition.com/webhook/buscar-pedidos-telefone';
const TAG = String(cfg.tag || 'NOTA FISCAL').trim();
const JANELA_DIAS = 30;
const self = this;
const saida = [];
if (String(cfg.ativo || 'on') !== 'on') return [{ json: { payload: '[]', desligado: true } }];

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function falaDoCliente(texto) {
  let t = String(texto || '');
  if (/^\\s*\\[\\s*(cliente|contato)\\s+enviou/i.test(t)) {
    const i = t.toLowerCase().lastIndexOf('legenda do cliente:');
    t = i >= 0 ? t.slice(i + 'legenda do cliente:'.length) : '';
  }
  return t.replace(/^\\s*\\[audio do cliente[^\\]]*\\]\\s*:?/i, '').trim();
}
function pedeNota(texto) {
  const t = norm(falaDoCliente(texto));
  if (!t) return false;
  if (/nota fiscal|cupom fiscal|\\bdanfe\\b|\\bnfs?-?e?\\b/.test(t)) return true;
  return /\\bnota\\b.{0,25}\\b(da compra|do pedido|do produto|para reembolso|pra reembolso|reembolso|imposto|cnpj|cpf|empresa)\\b/.test(t);
}
function pedidoCitado(texto) {
  const t = falaDoCliente(texto);
  const m = t.match(/\\bAN[-\\s]?(\\d{4,6})(-BR)?\\b/i) || t.match(/#\\s?(\\d{4,6})\\b/);
  return m ? ('AN-' + m[1] + (m[2] ? '-BR' : '')) : null;
}

const gql = async (query, variables) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const dd = r && r.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 200));
  return dd.data;
};
const CAMPOS = 'id name createdAt cancelledAt tags';
async function customerDe(it) {
  if (it.customer_id) return String(it.customer_id);
  if (!it.telefone) return null;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: BUSCAR_TEL, json: true, timeout: 20000, body: { telefone: it.telefone } });
    return (r && r.encontrado && r.customer_id) ? String(r.customer_id) : null;
  } catch (e) { return null; }
}
async function escolherPedido(it, soDepoisDoPedido) {
  const citado = pedidoCitado(it.texto);
  if (citado) {
    const o = await gql('query($q:String!){ orders(first:1, query:$q){ nodes { ' + CAMPOS + ' } } }', { q: 'name:' + citado });
    const n = o && o.orders && o.orders.nodes && o.orders.nodes[0];
    if (n) return { pedido: n, como: 'citado' };
  }
  const cid = await customerDe(it);
  if (!cid) return { pedido: null, como: 'sem_cliente' };
  const o = await gql('query($q:String!){ orders(first:10, sortKey:CREATED_AT, reverse:true, query:$q){ nodes { ' + CAMPOS + ' } } }', { q: 'customer_id:' + cid });
  const lista = ((o && o.orders && o.orders.nodes) || []).filter(n => !n.cancelledAt);
  const pedidoEm = new Date(it.criado_em).getTime();
  // margem de 1h: quem paga e logo pede a nota tem o pedido criado minutos antes da mensagem
  const desde = soDepoisDoPedido ? pedidoEm - 3600000 : pedidoEm - JANELA_DIAS * 86400000;
  const recente = lista.find(n => new Date(n.createdAt).getTime() >= desde);
  return recente ? { pedido: recente, como: soDepoisDoPedido ? 'pedido_novo' : 'mais_recente' } : { pedido: null, como: 'sem_pedido_recente' };
}
async function marcar(p) {
  if ((p.tags || []).indexOf(TAG) >= 0) return 'ja_tinha';
  const r = await gql('mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors { message } } }', { id: p.id, tags: [TAG] });
  const ue = r && r.tagsAdd && r.tagsAdd.userErrors;
  if (ue && ue.length) throw new Error('tagsAdd: ' + ue.map(e => e.message).join('; '));
  return 'marcado';
}

// pedidos novos de nota
for (const it of novos) {
  if (!pedeNota(it.texto)) { saida.push({ acao: 'registrar', msg_id: it.msg_id, contato_id: it.contato_id, telefone: it.telefone, texto: String(it.texto || '').slice(0, 300), status: 'ignorado', detalhe: 'nao pede nota' }); continue; }
  const reg = { acao: 'registrar', msg_id: it.msg_id, contato_id: it.contato_id, telefone: it.telefone, texto: falaDoCliente(it.texto).slice(0, 300) };
  try {
    const e = await escolherPedido(it, false);
    if (e.pedido) {
      const r = await marcar(e.pedido);
      Object.assign(reg, { status: 'marcado', pedido: e.pedido.name, pedido_gid: e.pedido.id, detalhe: e.como + (r === 'ja_tinha' ? ', tag ja existia' : '') });
    } else {
      Object.assign(reg, { status: 'aguardando_pedido', detalhe: e.como });
    }
  } catch (err) {
    // erro de Shopify: fica aguardando e o proximo ciclo tenta de novo
    Object.assign(reg, { status: 'aguardando_pedido', detalhe: 'erro: ' + String(err.message || err).slice(0, 200) });
  }
  saida.push(reg);
}

// pediu nota antes de comprar: marca o primeiro pedido feito depois
for (const it of pendentes) {
  const upd = { acao: 'atualizar', id: it.id };
  try {
    const e = await escolherPedido(it, true);
    if (e.pedido) {
      const r = await marcar(e.pedido);
      Object.assign(upd, { status: 'marcado', pedido: e.pedido.name, pedido_gid: e.pedido.id, detalhe: e.como + (r === 'ja_tinha' ? ', tag ja existia' : '') });
    } else {
      Object.assign(upd, { status: 'aguardando_pedido', detalhe: e.como });
    }
  } catch (err) {
    Object.assign(upd, { status: 'aguardando_pedido', detalhe: 'erro: ' + String(err.message || err).slice(0, 200) });
  }
  saida.push(upd);
}

return [{ json: {
  payload: JSON.stringify(saida),
  marcados: saida.filter(s => s.status === 'marcado').map(s => s.pedido),
  aguardando: saida.filter(s => s.status === 'aguardando_pedido').length,
  ignorados: saida.filter(s => s.status === 'ignorado').length
} }];
` } },
  output: [{ payload: '[]', marcados: [], aguardando: 0, ignorados: 0 }] });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j), ins as (insert into serena_nf_solicitacoes (msg_id, contato_id, telefone, texto, status, pedido, pedido_gid, detalhe, marcado_em) select (x->>'msg_id')::bigint, nullif(x->>'contato_id', '')::uuid, x->>'telefone', x->>'texto', x->>'status', nullif(x->>'pedido', ''), nullif(x->>'pedido_gid', ''), x->>'detalhe', case when x->>'status' = 'marcado' then now() end from p, jsonb_array_elements(p.j) x where x->>'acao' = 'registrar' on conflict (msg_id) do nothing returning id), upd as (update serena_nf_solicitacoes s set status = x->>'status', pedido = nullif(x->>'pedido', ''), pedido_gid = nullif(x->>'pedido_gid', ''), detalhe = x->>'detalhe', tentativas = s.tentativas + 1, atualizado_em = now(), marcado_em = case when x->>'status' = 'marcado' then now() else s.marcado_em end from p, jsonb_array_elements(p.j) x where x->>'acao' = 'atualizar' and s.id = (x->>'id')::bigint returning s.id), exp as (update serena_nf_solicitacoes set status = 'expirado', atualizado_em = now() where status = 'aguardando_pedido' and criado_em < now() - interval '7 days' returning id) select (select count(*) from ins) as registrados, (select count(*) from upd) as atualizados, (select count(*) from exp) as expirados",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG },
  output: [{ registrados: 0, atualizados: 0, expirados: 0 }] });

const nota = sticky('## Nota fiscal no pedido\n\nA cada 10 min le as mensagens de cliente que pedem nota fiscal (nota fiscal, NF, NF-e, DANFE, cupom fiscal, nota da compra) e poe a tag NOTA FISCAL no pedido da Shopify:\n1. o pedido que o cliente citou (AN-15902);\n2. senao, o mais recente dele nos ultimos 30 dias;\n3. senao (pediu nota antes de comprar), o primeiro pedido que ele fizer nos 7 dias seguintes.\n\nDescricao de foto/PDF nao conta, so a legenda. Controle em serena_nf_solicitacoes. Kill switch: serena_config nf_tag = off.', { color: 4, width: 420, height: 260 });

export default workflow('serena-nota-fiscal-tag', '[Serena] Nota Fiscal no Pedido', { settings: { executionOrder: 'v1' } })
  .add(cron).to(buscar).to(marcar).to(gravar).add(nota);
