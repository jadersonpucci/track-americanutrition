// [Serena Tool] Gerar Boleto, no "Formatar resposta".
// Monta a mensagem final do boleto para o cliente e o aviso para o Telegram.
// Le os dados do boleto via $('Extrair boleto') e o resultado do encurtador via $input.
const d = $('Extrair boleto').first().json;
const respDub = $input.first().json;

let pdf_final = d.pdf_url;
let pdf_curto_id = null;
let usou_dub = false;
if (respDub && respDub.shortLink && !respDub.error) {
  pdf_final = respDub.shortLink;
  pdf_curto_id = respDub.id;
  usou_dub = true;
}

const total = (d.total_reais || 0).toFixed(2).replace('.', ',');
const itens = String(d.itens_texto || '').trim();

let venc = '';
try {
  if (d.vencimento) {
    const dt = new Date(d.vencimento);
    venc = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
} catch (e) { venc = ''; }

// Mensagem para o cliente (WhatsApp).
// Mostra o PRODUTO, nao o numero do rascunho: o numero do pedido (AN-xxxxx) so existe depois do pagamento.
// A linha digitavel fica em uma linha sozinha: a Entrada (Fatiar Resposta) envia essa linha em uma mensagem
// separada, senao o cliente nao consegue copiar so o codigo no WhatsApp (a copia leva a mensagem inteira).
let msg = '📄 *Seu boleto foi gerado!*\n\n';
if (itens) msg += '📦 ' + itens + '\n';
msg += '💰 Valor: R$ ' + total + '\n';
if (venc) msg += '📅 Vence em: ' + venc + '\n';
msg += '\nSeu pedido já está registrado, falta só o pagamento. Copie o código de barras abaixo e cole no app do seu banco, na opção de pagar boleto:\n';
msg += d.linha_digitavel + '\n';
if (pdf_final) {
  msg += '\n📎 Se preferir, o boleto em PDF:\n' + pdf_final + '\n';
}
msg += '\n_Assim que o pagamento for confirmado, seu pedido entra em separação. O boleto pode levar até 1 dia útil para compensar._';

function escapeHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
let tel = '';
const telDigits = (d.cliente_telefone || '').replace(/\D/g, '');
if (telDigits.length >= 12 && telDigits.length <= 13) {
  tel = 'https://wa.me/' + telDigits;
}

// No Telegram a equipe continua vendo o rascunho: e o que ela usa pra achar o pedido na Shopify.
let msgTelegram = '🧾 <b>BOLETO GERADO</b>\n\n';
msgTelegram += '👤 Cliente: ' + escapeHtml(d.cliente_nome) + '\n';
if (itens) msgTelegram += '📦 ' + escapeHtml(itens) + '\n';
msgTelegram += '📝 Rascunho: <code>' + escapeHtml(d.draft_numero) + '</code>\n';
msgTelegram += '💰 Valor: R$ ' + escapeHtml(total) + '\n';
if (venc) msgTelegram += '📅 Vence em: ' + escapeHtml(venc) + '\n';
if (tel) msgTelegram += '\n<a href="' + tel + '">💬 Conversa do cliente</a>\n';
msgTelegram += '\n<i>Aguardando pagamento. O pedido sera confirmado automaticamente quando o boleto compensar.</i>';

return [{ json: {
  sucesso: true,
  draft_numero: d.draft_numero,
  draft_id: d.draft_id,
  itens_texto: itens,
  nota_serena: 'Nao cite o numero do rascunho (' + String(d.draft_numero || '') + ') para o cliente: e interno e nao e o numero do pedido, que so sai depois do pagamento. Fale o produto e o valor. Repita a linha digitavel exatamente como veio, em uma linha sozinha, e depois o link do PDF.',
  pagarme_order_id: d.pagarme_order_id,
  pagarme_charge_id: d.pagarme_charge_id,
  linha_digitavel: d.linha_digitavel,
  pdf_url: pdf_final,
  pdf_url_original: d.pdf_url,
  pdf_curto_usado: usou_dub,
  pdf_curto_id: pdf_curto_id,
  vencimento: d.vencimento,
  total_reais: d.total_reais,
  resultado: msg,
  msg_telegram: msgTelegram
}}];
