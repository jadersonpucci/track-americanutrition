// Boleto hibrido (boleto + PIX) do Banco Inter, Cobranca v3. Entrada: payload do checkout (mesmo do Fluxo A).
// Saida (para o Fluxo A): via_inter=false => segue no Pagar.me (fail-open); via_inter=true => contrato do checkout
// (order_id 'interb_<codigoSolicitacao>', boleto_url, boleto_pdf, boleto_line, boleto_barcode, pix_qr_code).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Boleto: Requisição').first().json;
const b = Object.assign({}, root.body || root || {});
const falha = motivo => [{ json: { ok: false, gravar: '', resposta: { via_inter: false, motivo: String(motivo).slice(0, 200) } } }];
const admin = !!(cfg.pix_admin_token && String(b.k || '') === cfg.pix_admin_token);
const forcarInter = admin && b.forcar_inter === true;
delete b.k; delete b.forcar_inter;
if (String(b.payment_method || '') !== 'boleto') return falha('metodo nao e boleto');
if (String(cfg.boleto_provider || 'pagarme') !== 'inter' && !forcarInter) return falha('boleto_provider=pagarme');
if (!cfg.inter_client_id || !cfg.inter_client_secret || !cfg.pix_admin_token) return falha('credenciais Inter ausentes');
const d = s => String(s || '').replace(/[^0-9]/g, '');
const c = b.customer || {};
const doc = d(c.document);
if (!(doc.length === 11 || doc.length === 14)) return falha('documento invalido');
const nome = String(c.name || '').replace(/\s+/g, ' ').trim();
if (nome.length < 3) return falha('nome invalido');
const s = b.shipping || {};
const cep = d(s.zip);
if (!s.street || !s.city || !s.state || cep.length !== 8) return falha('endereco incompleto (boleto exige endereco)');
const items = (Array.isArray(b.items) ? b.items : []).map(it => ({ code: String(it.code), description: String(it.description || ''), quantity: parseInt(it.quantity || 1) || 1, amount: Math.round(Number(it.amount) || 0) }));
const fr = b.freight || {};
const freteCents = Number(fr.price_cents) > 0 ? Math.round(Number(fr.price_cents)) : 0;
if (freteCents > 0) items.push({ code: 'FRETE', description: 'Frete - ' + (fr.label || ''), quantity: 1, amount: freteCents });
const totalCents = items.reduce((a, it) => a + it.amount * it.quantity, 0);
if (totalCents < 250) return falha('valor minimo do boleto Inter e R$ 2,50');
const valor = Math.round(totalCents) / 100;
const fmt = dt => dt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dias = Math.min(60, Math.max(1, parseInt(cfg.inter_boleto_dias_vencimento || '3') || 3));
const venc = fmt(new Date(Date.now() + dias * 86400000));
const agenda = Math.min(60, Math.max(0, parseInt(cfg.inter_boleto_dias_agenda || '0') || 0));
const orderCode = String(b.order_ref || ('AN-' + Date.now())).slice(0, 40);
const seuNumero = ('B' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 15);
const pagador = {
  cpfCnpj: doc, tipoPessoa: doc.length === 14 ? 'JURIDICA' : 'FISICA', nome: nome.slice(0, 100),
  endereco: String(s.street || '').slice(0, 90), numero: String(s.number || 'S/N').slice(0, 10), complemento: String(s.complement || '').slice(0, 30),
  bairro: String(s.neighborhood || '').slice(0, 60), cidade: String(s.city || '').slice(0, 60), uf: String(s.state || '').toUpperCase().slice(0, 2), cep: cep
};
if (c.email) pagador.email = String(c.email).trim().slice(0, 50);
const ddd = d(c.ddd), tel = d(c.phone);
if (ddd.length === 2 && tel.length >= 8) { pagador.ddd = ddd; pagador.telefone = tel.slice(0, 9); }
const corpo = { seuNumero: seuNumero, valorNominal: valor, dataVencimento: venc, numDiasAgenda: agenda, pagador: pagador, formasRecebimento: ['BOLETO', 'PIX'] };
const msg = String(cfg.inter_boleto_mensagem || '').trim();
if (msg) corpo.mensagem = { linha1: msg.slice(0, 78) };
const api = async (method, path, body, query) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-api', json: true, timeout: 60000, body: { k: cfg.pix_admin_token, escopo: 'boleto', method: method, path: path, body: body || null, query: query || {} } });
  return r || { ok: false };
};
let cod = '';
try {
  const r = await api('POST', 'cobranca/v3/cobrancas', corpo);
  if (!r.ok || !r.body || !r.body.codigoSolicitacao) return falha('Inter POST ' + (r.statusCode || '') + ': ' + JSON.stringify(r.body || r.erro || '').slice(0, 200));
  cod = String(r.body.codigoSolicitacao);
} catch (e) { return falha('Inter: ' + String(e && e.message || e)); }
let det = null;
for (let i = 0; i < 6 && !det; i++) {
  await new Promise(r => setTimeout(r, i ? 1500 : 800));
  try { const g = await api('GET', 'cobranca/v3/cobrancas/' + cod); if (g.ok && g.body && g.body.boleto && g.body.boleto.linhaDigitavel) det = g.body; } catch (e) { }
}
if (!det) {
  try { await api('POST', 'cobranca/v3/cobrancas/' + cod + '/cancelar', { motivoCancelamento: 'Boleto nao ficou pronto a tempo' }); } catch (e) { }
  return falha('cobranca ' + cod + ' sem linha digitavel apos espera (cancelada)');
}
// boleto_url: mesma pagina personalizada usada com o Pagar.me (montada a partir da linha digitavel)
const brl = cents => (cents / 100).toFixed(2).replace('.', ',');
const limpa = x => String(x == null ? '' : x).replace(/[|=]/g, ' ').trim();
const itens = items.map(i => (i.quantity > 1 ? i.quantity + 'x ' : '') + limpa(i.description) + '=' + brl(i.amount * i.quantity));
const end = [[[s.street, s.number].filter(Boolean).join(', '), s.complement, s.neighborhood].filter(Boolean).join(', '), [s.city, s.state].filter(Boolean).join('/'), 'CEP ' + cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')].filter(Boolean).join(', ');
const linha = String(det.boleto.linhaDigitavel).replace(/\D/g, '');
const boletoUrl = BASE + '/webhook/boleto?l=' + linha + '&n=' + encodeURIComponent(nome.slice(0, 80)) + '&d=' + encodeURIComponent(doc) + '&p=' + encodeURIComponent(orderCode) + '&it=' + encodeURIComponent(itens.join('|').slice(0, 600)) + '&end=' + encodeURIComponent(end.slice(0, 200)) + '&pdf=1';
const pix = (det.pix && det.pix.pixCopiaECola) || '';
const resposta = {
  via_inter: true, order_id: 'interb_' + cod, status: 'pending', payment_method: 'boleto',
  pix_qr_code: pix || null, pix_qr_code_url: null,
  boleto_url: boletoUrl, boleto_pdf: BASE + '/webhook/inter-boleto-pdf?c=' + cod,
  boleto_line: det.boleto.linhaDigitavel, boleto_barcode: det.boleto.codigoBarras, boleto_due: venc,
  acquirer_message: null, acquirer_return_code: null, gateway_message: null, tx_status: (det.cobranca && det.cobranca.situacao) || 'A_RECEBER', gateway: 'Banco Inter'
};
return [{ json: {
  ok: true, gravar: cod, seu_numero: seuNumero, order_code: orderCode, valor: valor, nome: nome, documento: doc, email: String(c.email || ''),
  checkout: JSON.stringify(b), linha: det.boleto.linhaDigitavel, barras: det.boleto.codigoBarras, nosso_numero: det.boleto.nossoNumero || '',
  txid: (det.pix && det.pix.txid) || '', pix: pix, vencimento: venc, situacao: (det.cobranca && det.cobranca.situacao) || 'A_RECEBER', resposta: resposta
} }];
