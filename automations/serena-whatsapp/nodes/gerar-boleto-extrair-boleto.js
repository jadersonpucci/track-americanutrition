// [Serena Tool] Gerar Boleto, no "Extrair boleto".
// Le a resposta do Pagar.me e extrai a linha digitavel, o PDF e o vencimento.
const resp = $input.first().json;
const dadosDraft = $('Extrair draft').first().json;

let charge = null;
try {
  if (resp && Array.isArray(resp.charges) && resp.charges.length) {
    charge = resp.charges[0];
  }
} catch (e) { charge = null; }

const tx = charge ? charge.last_transaction : null;

if (charge && charge.status === 'failed') {
  let motivo = '';
  try {
    motivo = (tx && tx.gateway_response && tx.gateway_response.errors && tx.gateway_response.errors[0])
      ? tx.gateway_response.errors[0].message : '';
  } catch (e) { motivo = ''; }
  return [{ json: {
    erro: true,
    mensagem: 'Consegui registrar seu pedido mas tive um problema ao emitir o boleto. Vou pedir ajuda da equipe.',
    motivo_tecnico: motivo,
    resposta_pagarme: resp
  }}];
}

if (!tx || (!tx.line && !tx.barcode)) {
  return [{ json: {
    erro: true,
    mensagem: 'Consegui registrar seu pedido mas tive um problema ao emitir o boleto. Vou pedir ajuda da equipe.',
    resposta_pagarme: resp
  }}];
}

const linhaDigitavel = tx.line || tx.barcode || '';
const pdfUrl = tx.pdf || tx.url || '';
const vencimento = tx.due_at || '';

return [{ json: {
  erro: false,
  draft_numero: dadosDraft.draft_numero,
  draft_id: dadosDraft.draft_id,
  itens_texto: dadosDraft.itens_texto || '',
  total_reais: dadosDraft.total_reais,
  cliente_nome: dadosDraft.ctx.cliente.nome,
  cliente_telefone: dadosDraft.ctx.cliente.telefone_full,
  linha_digitavel: linhaDigitavel,
  pdf_url: pdfUrl,
  vencimento: vencimento,
  pagarme_order_id: resp.id,
  pagarme_charge_id: charge ? charge.id : null
}}];
