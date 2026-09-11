// Node "Formatar resposta" do workflow "[Serena Tool] Gerar PIX" (n8n SkETGTmcqtlTR0Lp).
// Chaves reais so no n8n.
//
// Monta a mensagem final do PIX para o cliente e o aviso para o Telegram.
// Tambem cria a pagina de pagamento (serena_pix_links + [Serena] Pagina do Pix) e manda o link curto junto:
// quem nao consegue copiar o codigo no WhatsApp abre a pagina, copia com um toque ou paga pelo QR Code.
const d = $input.first().json;
const self = this;
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const PAGINA = 'https://n8n.americanutrition.com/webhook/pix?t=';
const ENCURTAR = 'https://n8n.americanutrition.com/webhook/encurtar-url';
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";

const brl = n => Number(n || 0).toFixed(2).replace('.', ',');
const total = brl(d.total_reais);
const itens = String(d.itens_texto || '').trim();

// DESCONTO. pct e o que a Shopify confirmou ter aplicado no rascunho. O valor "de" e derivado do
// proprio total, sem depender de outra consulta: total = cheio * (1 - pct/100).
const pct = Number(d.desconto_pct || 0);
const pctPedido = Number(d.desconto_pedido_pct || 0);
const cupom = String(d.cupom || '').trim();
const temDesconto = pct > 0;
const cheio = temDesconto ? (Number(d.total_reais || 0) / (1 - pct / 100)) : 0;
const pctTxt = Number.isInteger(pct) ? String(pct) : brl(pct);
// pediram desconto e a Shopify nao aplicou, ou veio cupom sem porcentagem: a Serena precisa saber
// para NAO inventar explicacao ao cliente (foi o que aconteceu em 11/09 com o Alexandre).
const descontoFalhou = (pctPedido > 0 && pct <= 0);
const cupomSemPct = (!!cupom && pctPedido <= 0);

let expira = '';
try {
  if (d.expira_em) {
    const dt = new Date(d.expira_em);
    expira = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  }
} catch (e) { expira = ''; }

// Pagina de pagamento: token proprio, sem dado do cliente na URL
let link = '';
let token = '';
try {
  token = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const sql = 'insert into serena_pix_links (token, draft_id, draft_numero, itens, total_reais, qr_code, qr_code_url, expira_em, pagarme_order_id, pagarme_charge_id, cliente_nome, telefone) values ('
    + E(token) + ', ' + E(d.draft_id) + ', ' + E(d.draft_numero) + ', ' + E(itens) + ', ' + Number(d.total_reais || 0) + ', ' + E(d.qr_code) + ', ' + E(d.qr_code_url || '') + ', '
    + (d.expira_em ? E(d.expira_em) + '::timestamptz' : "now() + interval '30 minutes'") + ', ' + E(d.pagarme_order_id || '') + ', ' + E(d.pagarme_charge_id || '') + ', ' + E(d.cliente_nome || '') + ', ' + E(d.cliente_telefone || '') + ')';
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: sql }, json: true, timeout: 15000 });
  if (r && r.error) throw new Error(String(r.error).slice(0, 200));
  link = PAGINA + token;
  try {
    const s = await self.helpers.httpRequest({ method: 'POST', url: ENCURTAR, json: true, timeout: 12000, body: { url: link } });
    if (s && s.shortLink && !s.error) link = s.shortLink;
  } catch (e) { /* fica o link longo */ }
} catch (e) { link = ''; token = ''; }

// Mensagem para o cliente (WhatsApp).
// Mostra o PRODUTO, nao o numero do rascunho: o numero do pedido (AN-xxxxx) so existe depois do pagamento.
// O codigo copia e cola fica em uma linha sozinha: a Entrada (Fatiar Resposta) envia essa linha em uma mensagem
// separada, senao o cliente nao consegue copiar so o codigo no WhatsApp (a copia leva a mensagem inteira).
let msg = '\u{1F4A0} *Seu PIX foi gerado!*\n\n';
if (itens) msg += '\u{1F4E6} ' + itens + '\n';
if (temDesconto) {
  msg += '\u{1F3F7}\u{FE0F} De R$ ' + brl(cheio) + ' por *R$ ' + total + '*\n';
  msg += '\u{2705} ' + pctTxt + '% de desconto' + (cupom ? ' (cupom ' + cupom + ')' : '') + ' já aplicado\n';
} else {
  msg += '\u{1F4B0} Valor: R$ ' + total + '\n';
}
if (expira) msg += '\u{23F0} Validade: pague até ' + expira + ' (30 minutos)\n';
msg += '\nSeu pedido já está registrado e reservado, falta só o pagamento. Copie o código abaixo e cole no app do seu banco, em *Pix > Pix Copia e Cola* (não é um link, não precisa clicar):\n';
msg += d.qr_code + '\n';
if (link) msg += '\nSe preferir, abra esta página para copiar o código com um toque ou pagar pelo QR Code:\n' + link + '\n';
msg += '\n_Assim que o pagamento for confirmado, em segundos, seu pedido entra em separação. O PIX expira em 30 minutos, se passar do prazo é só pedir outro._';

// Mensagem para o Telegram (equipe)
function escapeHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
let tel = '';
const telDigits = (d.cliente_telefone || '').replace(/\D/g, '');
if (telDigits.length >= 12 && telDigits.length <= 13) {
  tel = 'https://wa.me/' + telDigits;
}

let msgTelegram = '\u{1F4A0} <b>PIX GERADO</b>\n\n';
msgTelegram += '\u{1F464} Cliente: ' + escapeHtml(d.cliente_nome) + '\n';
if (itens) msgTelegram += '\u{1F4E6} ' + escapeHtml(itens) + '\n';
msgTelegram += '\u{1F4DD} Rascunho: <code>' + escapeHtml(d.draft_numero) + '</code>\n';
if (temDesconto) msgTelegram += '\u{1F4B0} Valor: R$ ' + escapeHtml(total) + ' <i>(de R$ ' + escapeHtml(brl(cheio)) + ', -' + escapeHtml(pctTxt) + '%' + (cupom ? ' ' + escapeHtml(cupom) : '') + ')</i>\n';
else msgTelegram += '\u{1F4B0} Valor: R$ ' + escapeHtml(total) + '\n';
if (descontoFalhou) msgTelegram += '\u{26A0} <b>Desconto de ' + escapeHtml(String(pctPedido)) + '% foi pedido e a Shopify NAO aplicou.</b>\n';
if (cupomSemPct) msgTelegram += '\u{26A0} <b>Cupom ' + escapeHtml(cupom) + ' veio sem porcentagem e nao foi aplicado.</b>\n';
if (expira) msgTelegram += '\u{23F0} Expira: ' + escapeHtml(expira) + '\n';
if (link) msgTelegram += '\u{1F517} <a href="' + escapeHtml(link) + '">Página de pagamento</a>\n';
if (tel) msgTelegram += '\n<a href="' + tel + '">\u{1F4AC} Conversa do cliente</a>\n';
msgTelegram += '\n<i>Aguardando pagamento. O pedido sera confirmado automaticamente quando o PIX cair.</i>';

// Instrucao para a Serena. O trecho do cupom existe porque em 11/09 ela disse a um cliente que o
// cupom "ja tinha sido usado" quando na verdade o gerador nunca aplicava cupom nenhum.
let nota = 'Nao cite o numero do rascunho (' + String(d.draft_numero || '') + ') para o cliente: e interno e nao e o numero do pedido, que so sai depois do pagamento. Fale o produto e o valor. Repita o codigo do Pix exatamente como veio, em uma linha sozinha, e depois o link de pagina_pix.';
if (temDesconto) nota += ' O desconto de ' + pctTxt + '%' + (cupom ? ' (cupom ' + cupom + ')' : '') + ' JA esta aplicado neste valor: diga o valor com desconto, nao o cheio.';
if (descontoFalhou || cupomSemPct) nota += ' ATENCAO: o desconto NAO foi aplicado neste Pix. NUNCA diga ao cliente que o cupom ja foi usado nem invente motivo: diga que vai confirmar com a equipe e escale. Voce nao tem como saber se ele usou o cupom.';

return [{ json: {
  sucesso: true,
  draft_numero: d.draft_numero,
  draft_id: d.draft_id,
  itens_texto: itens,
  nota_serena: nota,
  cupom: cupom,
  desconto_pct: pct,
  desconto_aplicado: temDesconto,
  total_sem_desconto: temDesconto ? Number(cheio.toFixed(2)) : Number(d.total_reais || 0),
  aviso: (descontoFalhou || cupomSemPct) ? 'desconto nao aplicado' : null,
  pagarme_order_id: d.pagarme_order_id,
  pagarme_charge_id: d.pagarme_charge_id,
  qr_code: d.qr_code,
  qr_code_url: d.qr_code_url,
  pagina_pix: link,
  pix_token: token,
  expira_em: d.expira_em,
  total_reais: d.total_reais,
  resultado: msg,
  msg_telegram: msgTelegram
}}];
