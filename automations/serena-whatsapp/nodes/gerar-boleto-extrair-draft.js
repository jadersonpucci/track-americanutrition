// [Serena Tool] Gerar Boleto, no "Extrair draft".
// Le a resposta GraphQL do draftOrderCreate, valida e extrai numero, total e os itens.
const resp = $input.first().json;
const ctx = $('Montar draft').first().json.ctx;

let draftNode = null;
let userErrors = [];
try {
  const d = resp && resp.data && resp.data.draftOrderCreate;
  if (d) {
    draftNode = d.draftOrder || null;
    userErrors = d.userErrors || [];
  }
} catch (e) { draftNode = null; }

let topErrors = [];
try { topErrors = resp.errors || []; } catch (e) { topErrors = []; }

if (!draftNode || !draftNode.id) {
  let motivo = '';
  if (userErrors.length) motivo = userErrors.map(e => e.message).join('; ');
  else if (topErrors.length) motivo = topErrors.map(e => e.message).join('; ');
  return [{ json: {
    erro: true,
    mensagem: 'Tive um problema pra registrar seu pedido agora. Vou pedir ajuda da equipe.',
    motivo_tecnico: motivo,
    resposta_shopify: resp
  }}];
}

const gid = draftNode.id.toString();
const draftIdNum = gid.split('/').pop();

const totalReais = parseFloat(draftNode.totalPrice || '0');
const totalCents = Math.round(totalReais * 100);

// Texto dos itens para o cliente ("2x ImunoFosfo 90 Caps"), usado na mensagem do boleto.
// A variante vem como "Tradicionais / 90 Caps": os pedacos genericos saem, o que identifica fica ("Vegano", "90 Caps").
const GENERICO = /^(default title|tradicionais?|padr[aã]o|[uú]nico|unica|única)$/i;
let itensTxt = '';
try {
  const eds = (draftNode.lineItems && draftNode.lineItems.edges) || [];
  itensTxt = eds.map(e => {
    const n = e.node || {};
    const titulo = String(n.title || '').trim();
    const extra = String(n.variantTitle || '').split('/').map(x => x.trim()).filter(x => x && !GENERICO.test(x) && titulo.toLowerCase().indexOf(x.toLowerCase()) < 0).join(' ');
    return (n.quantity || 1) + 'x ' + (titulo + (extra ? ' ' + extra : '')).trim();
  }).filter(Boolean).join(', ').slice(0, 200);
} catch (e) { itensTxt = ''; }

return [{ json: {
  erro: false,
  draft_gid: gid,
  draft_id: draftIdNum,
  draft_numero: draftNode.name,
  invoice_url: draftNode.invoiceUrl || '',
  itens_texto: itensTxt,
  total_reais: totalReais,
  total_cents: totalCents,
  ctx: ctx
}}];
