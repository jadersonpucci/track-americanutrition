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
  // CPF/CNPJ recusado pela Shopify (19/09/2026): nao e instabilidade, e dado errado. A Serena precisa pedir o CPF de novo.
  if (/cpf|cnpj/i.test(motivo)) {
    const cf = String((ctx && ctx.cliente && ctx.cliente.cpf_formatado) || '');
    return [{ json: {
      erro: true,
      motivo: 'cpf_invalido',
      mensagem: 'A Shopify recusou o CPF ' + cf + ' ("' + motivo + '"). NAO fale em instabilidade: diga ao cliente que o CPF parece ter um numero trocado e peca para ele conferir e mandar de novo. Quando vier o CPF correto, chame gerar_boleto outra vez com os mesmos dados.',
      motivo_tecnico: motivo,
      resposta_shopify: resp
    }}];
  }
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
// BOLETO PERSONALIZADO (13/09/2026): itens com valor para a pagina com a identidade da marca (AN - Boleto Personalizado).
let itensLista = [];
try {
  const eds = (draftNode.lineItems && draftNode.lineItems.edges) || [];
  itensLista = eds.map(e => {
    const n = e.node || {};
    const titulo = String(n.title || '').trim();
    const extra = String(n.variantTitle || '').split('/').map(x => x.trim()).filter(x => x && !GENERICO.test(x) && titulo.toLowerCase().indexOf(x.toLowerCase()) < 0).join(' ');
    const tot = (n.discountedTotalSet && n.discountedTotalSet.shopMoney && n.discountedTotalSet.shopMoney.amount) || (n.originalTotalSet && n.originalTotalSet.shopMoney && n.originalTotalSet.shopMoney.amount) || '';
    return { qtd: n.quantity || 1, nome: (titulo + (extra ? ' ' + extra : '')).trim(), valor: tot === '' ? null : Number(tot) };
  }).filter(i => i.nome);
} catch (e) { itensLista = []; }

return [{ json: {
  erro: false,
  draft_gid: gid,
  draft_id: draftIdNum,
  draft_numero: draftNode.name,
  invoice_url: draftNode.invoiceUrl || '',
  itens_texto: itensTxt,
  itens_lista: itensLista,
  total_reais: totalReais,
  total_cents: totalCents,
  frete: (ctx.frete && typeof ctx.frete === 'object') ? ctx.frete : { valor: 0, titulo: '', origem: '', prazo: '' },
  subtotal_reais: Math.round((totalReais - Number((ctx.frete && ctx.frete.valor) || 0)) * 100) / 100,
  ctx: ctx
}}];
