// Node "Extrair PIX" do workflow "[Serena Tool] Gerar PIX" (n8n SkETGTmcqtlTR0Lp).
// Le a resposta do Pagar.me e extrai o QR code copia-e-cola e a imagem.
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
    mensagem: 'Consegui registrar seu pedido mas tive um problema ao gerar o PIX. Vou pedir ajuda da equipe.',
    motivo_tecnico: motivo,
    resposta_pagarme: resp
  }}];
}

const qrCode = tx ? (tx.qr_code || '') : '';
const qrCodeUrl = tx ? (tx.qr_code_url || '') : '';
const expiraEm = tx ? (tx.expires_at || '') : '';

if (!qrCode) {
  return [{ json: {
    erro: true,
    mensagem: 'Consegui registrar seu pedido mas tive um problema ao gerar o PIX. Vou pedir ajuda da equipe.',
    resposta_pagarme: resp
  }}];
}

return [{ json: {
  erro: false,
  draft_numero: dadosDraft.draft_numero,
  draft_id: dadosDraft.draft_id,
  itens_texto: dadosDraft.itens_texto || '',
  total_reais: dadosDraft.total_reais,
  frete: dadosDraft.frete || { valor: 0, titulo: '', origem: '', prazo: '' },
  subtotal_reais: Number(dadosDraft.subtotal_reais != null ? dadosDraft.subtotal_reais : dadosDraft.total_reais),
  cupom: dadosDraft.cupom || '',
  desconto_pct: Number(dadosDraft.desconto_pct || 0),
  desconto_pedido_pct: Number(dadosDraft.desconto_pedido_pct || 0),
  desconto_titulo: dadosDraft.desconto_titulo || '',
  cliente_nome: dadosDraft.ctx.cliente.nome,
  cliente_telefone: dadosDraft.ctx.cliente.telefone_full,
  qr_code: qrCode,
  qr_code_url: qrCodeUrl,
  expira_em: expiraEm,
  pagarme_order_id: resp.id,
  pagarme_charge_id: charge ? charge.id : null
}}];
