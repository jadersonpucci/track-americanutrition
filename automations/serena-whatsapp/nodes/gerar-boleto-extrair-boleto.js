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

// BOLETO PERSONALIZADO (13/09/2026): o cliente recebe o PDF de uma folha com a identidade da marca (logo, itens,
// endereco, ficha FEBRABAN, codigo de barras grande e codigo de conferencia), gerado pelo workflow
// "AN - Boleto Personalizado" a partir da propria linha digitavel. O PDF cru da Pagar.me fica so como reserva (pdf_url_original). O link e encurtado no no seguinte.
let paginaUrl = '';
try {
  const brl2 = v => Number(v || 0).toFixed(2).replace('.', ',');
  const cli = (dadosDraft.ctx && dadosDraft.ctx.cliente) || {};
  const en = (dadosDraft.ctx && dadosDraft.ctx.endereco) || {};
  const fr = dadosDraft.frete || {};
  const lista = Array.isArray(dadosDraft.itens_lista) ? dadosDraft.itens_lista : [];
  const itens = lista.map(i => (i.qtd > 1 ? i.qtd + 'x ' : '') + String(i.nome).replace(/[|=]/g, ' ') + (i.valor != null ? '=' + brl2(i.valor) : ''));
  if (Number(fr.valor || 0) > 0) itens.push('Frete ' + String(fr.titulo || '').replace(/[|=]/g, ' ').trim() + '=' + brl2(fr.valor));
  else if (fr.origem === 'gratis') itens.push('Frete gratis=0,00');
  const endTxt = [[en.rua, en.numero && en.numero !== 'S/N' ? en.numero : ''].filter(Boolean).join(', '), en.complemento, en.bairro, [en.cidade, en.estado].filter(Boolean).join('/'), en.cep ? 'CEP ' + String(en.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''].filter(Boolean).join(', ');
  if (linhaDigitavel.replace(/\D/g, '').length === 47) {
    paginaUrl = 'https://n8n.americanutrition.com/webhook/boleto?l=' + linhaDigitavel.replace(/\D/g, '')
      + '&n=' + encodeURIComponent(String(cli.nome || '').slice(0, 80))
      + '&d=' + encodeURIComponent(String(cli.cpf || ''))
      + '&p=' + encodeURIComponent(String(dadosDraft.draft_numero || ''))
      + '&it=' + encodeURIComponent(itens.join('|').slice(0, 600))
      + '&end=' + encodeURIComponent(endTxt.slice(0, 200))
      + '&pdf=1';   // PDF de verdade, uma folha A4 (node "Gerar PDF" do AN - Boleto Personalizado)
  }
} catch (e) { paginaUrl = ''; }

return [{ json: {
  erro: false,
  draft_numero: dadosDraft.draft_numero,
  draft_id: dadosDraft.draft_id,
  itens_texto: dadosDraft.itens_texto || '',
  total_reais: dadosDraft.total_reais,
  frete: dadosDraft.frete || { valor: 0, titulo: '', origem: '', prazo: '' },
  subtotal_reais: Number(dadosDraft.subtotal_reais != null ? dadosDraft.subtotal_reais : dadosDraft.total_reais),
  cliente_nome: dadosDraft.ctx.cliente.nome,
  cliente_telefone: dadosDraft.ctx.cliente.telefone_full,
  linha_digitavel: linhaDigitavel,
  pdf_url: pdfUrl,
  pagina_url: paginaUrl,
  vencimento: vencimento,
  pagarme_order_id: resp.id,
  pagarme_charge_id: charge ? charge.id : null
}}];
