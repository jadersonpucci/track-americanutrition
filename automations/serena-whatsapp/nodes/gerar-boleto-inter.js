// Node "Boleto Inter" do workflow "[Serena Tool] Gerar Boleto" (n8n gBgvM4y3bYzbnrE5). 21/09/2026.
// Com checkout_config.boleto_provider = 'inter', o boleto da Serena sai pelo Banco Inter (boleto hibrido, aceita
// boleto e Pix), pelo mesmo fluxo do checkout do site (POST /webhook/checkout-boleto-inter-criar). Nesse caminho
// NAO se cria rascunho na Shopify: quando o Inter confirma o pagamento, o proprio fluxo cria o pedido (via
// /webhook/pagarme-pago) com ref=serena, que vira as tags AF: Serena + WPP. Qualquer falha cai no Pagar.me
// como antes (via_inter=false -> Montar draft).
const ctx = $input.first().json;
const SK = 'SUPABASE_SERVICE_KEY';
const PG = 'https://supabase.americanutrition.com/pg/query';
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const sql = async q => { const r = await self.helpers.httpRequest({ method: 'POST', url: PG, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 15000 }); return Array.isArray(r) ? r : []; };
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const passa = motivo => [{ json: Object.assign({}, ctx, { via_inter: false, inter_motivo: String(motivo || '').slice(0, 200) }) }];
if (!ctx || ctx.erro || !Array.isArray(ctx.itens) || !ctx.itens.length) return passa('ctx invalido');

let prov = 'pagarme';
try { const c = await sql("select coalesce((select valor from checkout_config where chave = 'boleto_provider'), 'pagarme') as prov"); prov = String((c[0] || {}).prov || 'pagarme'); } catch (e) { return passa('config indisponivel'); }
if (prov !== 'inter') return passa('boleto_provider=' + prov);

// canal da conversa -> ref (a Confirmacao de Pagamento transforma em AF: Serena + WPP / SERENA-IG / SERENA-MSG)
let canal = 'whatsapp';
try { const wb = $('Webhook').first().json; const b = wb.body || wb; const c = String(b.canal || '').toLowerCase().trim(); if (c) canal = c; } catch (e) { canal = 'whatsapp'; }
const REF = { whatsapp: 'serena', instagram: 'serena-ig', messenger: 'serena-msg' };
const NOME_CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' };

// preco e nome de cada item (catalogo sincronizado da Shopify; produtos como reserva)
const ids = ctx.itens.map(i => String(i.variant_id));
let rows = [];
try {
  rows = await sql("select v.variant_id, coalesce(c.price, p.preco) as preco, coalesce(nullif(p.nome, ''), c.title) as nome from unnest(array[" + ids.map(E).join(',') + "]) as v(variant_id) left join catalogo_precos c on c.variant_id = v.variant_id left join lateral (select nome, preco from produtos where variant_id = v.variant_id limit 1) p on true");
} catch (e) { rows = []; }
const mapa = {}; rows.forEach(r => { mapa[String(r.variant_id)] = r; });
const items = [], shopifyItems = [];
for (const it of ctx.itens) {
  const r = mapa[String(it.variant_id)] || {};
  const preco = Number(r.preco);
  if (!(preco > 0)) return passa('preco nao encontrado para ' + it.variant_id);
  const qtd = parseInt(it.quantity || 1) || 1;
  items.push({ code: String(it.variant_id), description: String(r.nome || 'Produto').slice(0, 100), quantity: qtd, amount: Math.round(preco * 100) });
  shopifyItems.push({ variant_id: String(it.variant_id), quantity: qtd, price: preco });
}
const fr = (ctx.frete && typeof ctx.frete === 'object') ? ctx.frete : { valor: 0, titulo: '', origem: '' };
const freteValor = Math.round(Number(fr.valor || 0) * 100) / 100;
const freteGratis = freteValor <= 0 && fr.origem === 'gratis';
const cli = ctx.cliente || {}, en = ctx.endereco || {};
const orderRef = 'AN-' + Date.now();
const body = {
  payment_method: 'boleto',
  order_ref: orderRef,
  customer: { name: cli.nome, email: cli.email, document: cli.cpf, ddd: cli.ddd, phone: cli.numero_telefone },
  shipping: { street: en.rua, number: en.numero, complement: en.complemento || '', neighborhood: en.bairro, city: en.cidade, state: en.estado, zip: en.cep },
  items: items,
  freight: { price_cents: Math.round(freteValor * 100), label: fr.titulo || (freteGratis ? 'Frete grátis' : 'Frete') },
  shopify_items: shopifyItems,
  ref: REF[canal] || 'serena',
  origem: 'serena', canal: canal
};
let r = null;
try { r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/checkout-boleto-inter-criar', json: true, timeout: 90000, headers: { 'Content-Type': 'application/json' }, body: body }); }
catch (e) { return passa('inter: ' + String(e && e.message || e)); }
if (!(r && r.via_inter === true && r.boleto_line)) return passa((r && r.motivo) || 'resposta incompleta do Inter');

const totalCents = items.reduce((a, it) => a + it.amount * it.quantity, 0) + Math.round(freteValor * 100);
const totalReais = Math.round(totalCents) / 100;
const subtotal = Math.round((totalReais - freteValor) * 100) / 100;
const brl = n => Number(n || 0).toFixed(2).replace('.', ',');
const itensTxt = items.map(it => (it.quantity > 1 ? it.quantity + 'x ' : '1x ') + it.description).join(', ').slice(0, 200);
let venc = '';
try { const m = String(r.boleto_due || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) venc = m[3] + '/' + m[2] + '/' + m[1]; } catch (e) { venc = ''; }
const cod = String(r.order_id || '').replace(/^interb_/, '');
const linha = String(r.boleto_line || '');
const pix = String(r.pix_qr_code || '');
const linkCurto = String(r.boleto_url || r.boleto_pdf || '');
const pdfPagina = String(r.boleto_pdf || '');

// Mensagem para o cliente: mesmo formato do boleto Pagar.me. A linha digitavel fica sozinha na linha
// (a Entrada manda em mensagem separada para copiar). O Pix do mesmo boleto vai por ultimo, tambem sozinho.
let msg = '📄 *Seu boleto foi gerado!*\n\n';
msg += '📦 ' + itensTxt + '\n';
if (freteValor > 0) msg += '🚚 Frete: ' + (fr.titulo || 'Frete') + ' — R$ ' + brl(freteValor) + '\n';
else if (freteGratis) msg += '🚚 Frete grátis\n';
msg += '💰 Valor: *R$ ' + brl(totalReais) + '*' + (freteValor > 0 ? ' (produto R$ ' + brl(subtotal) + ' + frete R$ ' + brl(freteValor) + ')' : '') + '\n';
if (venc) msg += '📅 Vence em: ' + venc + '\n';
msg += '\nSeu pedido já está registrado, falta só o pagamento. Copie o código de barras abaixo e cole no app do seu banco, na opção de pagar boleto:\n';
msg += linha + '\n';
if (linkCurto) msg += '\n📎 Seu boleto em PDF (uma folha, para abrir ou imprimir):\n' + linkCurto + '\n';
if (pix) msg += '\n⚡ Se preferir pagar na hora, este mesmo boleto aceita Pix. Copie o código abaixo e cole em Pix > Pix Copia e Cola no app do banco:\n' + pix + '\n';
msg += '\n_Assim que o pagamento for confirmado, seu pedido entra em separação. Pelo Pix a confirmação é na hora; pelo boleto pode levar até 1 dia útil._';

const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const telDigits = String(cli.telefone_full || '').replace(/\D/g, '');
let msgTelegram = '🧾 <b>BOLETO GERADO</b> · Banco Inter (boleto + Pix)\n\n';
msgTelegram += '👤 Cliente: ' + esc(cli.nome) + '\n📦 ' + esc(itensTxt) + '\n📝 Código: <code>' + esc(orderRef) + '</code>\n';
if (freteValor > 0) msgTelegram += '🚚 Frete: ' + esc(fr.titulo || 'Frete') + ' R$ ' + esc(brl(freteValor)) + '\n'; else if (freteGratis) msgTelegram += '🚚 Frete grátis\n';
msgTelegram += '💰 Valor: R$ ' + esc(brl(totalReais)) + '\n' + (venc ? '📅 Vence em: ' + esc(venc) + '\n' : '');
if (telDigits.length >= 12 && telDigits.length <= 13) msgTelegram += '\n<a href="https://wa.me/' + telDigits + '">💬 Conversa do cliente</a>\n';
msgTelegram += '\n<i>Aguardando pagamento. O pedido na Shopify e criado automaticamente quando o Inter confirmar (canal ' + esc(NOME_CANAL[canal] || canal) + ').</i>';

return [{ json: {
  sucesso: true,
  via_inter: true,
  gateway: 'Banco Inter',
  draft_numero: null,
  draft_id: null,
  inter_order_id: r.order_id,
  inter_codigo: cod,
  order_ref: orderRef,
  itens_texto: itensTxt,
  nota_serena: 'Boleto emitido pelo Banco Inter: aceita pagamento pela linha digitavel OU pelo Pix copia e cola (confirmacao na hora). Fale o produto e o valor. Repita a linha digitavel exatamente como veio, em uma linha sozinha, depois o link do PDF e, por fim, o codigo Pix tambem sozinho em uma linha. Nao cite codigo interno. O numero do pedido so existe depois do pagamento.' + (freteValor > 0 ? ' O valor de R$ ' + brl(totalReais) + ' JA INCLUI o frete: produto R$ ' + brl(subtotal) + ' + frete ' + (fr.titulo || '') + ' R$ ' + brl(freteValor) + '. Diga isso ao cliente.' : (freteGratis ? ' Este pedido saiu com frete gratis (acima de R$ 250).' : '')),
  frete_valor: freteValor,
  frete_titulo: fr.titulo || (freteGratis ? 'Frete grátis' : ''),
  frete_origem: fr.origem || '',
  subtotal_reais: subtotal,
  pagarme_order_id: null,
  pagarme_charge_id: null,
  linha_digitavel: linha,
  codigo_barras: r.boleto_barcode || '',
  pix_copia_cola: pix || null,
  pdf_url: linkCurto,
  pdf_url_original: r.boleto_pdf_inter || '',
  pagina_boleto: pdfPagina,
  arquivo: pdfPagina ? { url: pdfPagina, tipo: 'document', nome: 'Boleto-America-Nutrition-' + orderRef.replace(/[^A-Za-z0-9-]/g, '') + '.pdf' } : null,
  pdf_curto_usado: !!r.boleto_url,
  vencimento: r.boleto_due || '',
  total_reais: totalReais,
  resultado: msg,
  msg_telegram: msgTelegram
} }];
