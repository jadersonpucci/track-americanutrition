// [Financeiro] Venda Manual · Pix na chave (API) — 10/11/2026
// POST /webhook/venda-manual-pix, chamado pela tela da Venda Manual (/webhook/venda-manual?pix=<token>&a=<agente>).
// Acoes (todas exigem k = chave da Venda Manual):
//   lista   {a}                -> Pix na chave ainda sem pedido (exige token de agente da serena_agentes)
//   get     {token}            -> o Pix + sugestao de cliente/endereco/itens pelo CPF (ultima venda manual ou checkout pago)
//   ignorar {token, motivo}    -> marca "nao_venda"
//   criar   {token, itens, cliente, endereco, frete, cupom, rep, tag, confirmar, agente}
//           -> cria o pedido JA PAGO na Shopify pelo mesmo caminho dos Pix do checkout (order.paid em /webhook/pagarme-pago,
//              gateway "Banco Inter", inter_e2e = endToEndId) e lanca o recebimento no financeiro (/webhook/inter-nibo-lancar,
//              chave pix:<e2e>, a mesma que a importacao do extrato usa: concilia sem duplicar). Ninguem paga QR Code.
//   status  {token}            -> status e numero do pedido na Shopify
// Valor: o total do pedido e sempre o valor do Pix. Produtos = Pix - frete; diferenca para a tabela vira desconto (ou acrescimo)
// rateado nos itens, e a tela pede confirmacao quando ha diferenca.
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'API', parameters: { httpMethod: 'POST', path: 'venda-manual-pix', responseMode: 'lastNode', responseData: 'firstEntryJson' } } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `
const K = 'VENDA_MANUAL_K'; // chave real so no n8n (a mesma da tela da Venda Manual)
const w = $input.first().json || {};
let b = w.body || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const fim = (resposta) => [{ json: { resposta, query: 'select 1 as x' } }];
if (b.k !== K) return fim({ ok: false, erro: 'nao autorizado' });
const action = String(b.action || '');
const tk = String(b.token || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 12);
const ag = String(b.a || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
const pixCols = 'e2e, token, valor, horario, pagador_nome, pagador_doc, info, status, motivo, order_id, pedido_nome, criado_por, erro, criado_em';

if (action === 'lista') {
  return [{ json: { action, b, query: "select (select nome from serena_agentes where token = " + lit(ag) + " and ativo limit 1) as agente, coalesce((select json_agg(x order by x.horario desc) from (select token, valor, horario, pagador_nome, pagador_doc, status from pix_chave_recebidos where status in ('novo','avisado','erro') and horario > now() - interval '30 days' order by horario desc limit 50) x), '[]'::json) as lista" } }];
}
if (!/^[a-f0-9]{12}$/.test(tk)) return fim({ ok: false, erro: 'token do Pix invalido' });
const pixQ = "(select row_to_json(p) from (select " + pixCols + " from pix_chave_recebidos where token = " + lit(tk) + ") p) as pix";
const pedidoQ = "(select po.shopify_order_name from pagarme_orders po join pix_chave_recebidos r on po.pagarme_order_id = r.order_id where r.token = " + lit(tk) + " and po.shopify_order_name is not null limit 1) as pedido_nome";

if (action === 'get' || action === 'status') {
  const doc = "(select pagador_doc from pix_chave_recebidos where token = " + lit(tk) + ")";
  const sug = action === 'status' ? '' :
    ", (select json_build_object('fonte', 'venda manual', 'data', v.criado_em, 'dados', v.dados) from vendas_manuais v where coalesce(" + doc + ", '') <> '' and v.cliente_cpf = " + doc + " and v.dados is not null order by v.criado_em desc limit 1) as vm" +
    ", (select json_build_object('fonte', 'checkout', 'data', c.criado_em, 'checkout', c.checkout) from checkout_pix_inter c where coalesce(" + doc + ", '') <> '' and regexp_replace(coalesce(c.documento, ''), '[^0-9]', '', 'g') = " + doc + " and c.status = 'CONCLUIDA' order by c.criado_em desc limit 1) as ck";
  return [{ json: { action, b, tk, query: 'select ' + pixQ + ', ' + pedidoQ + sug } }];
}
if (action === 'ignorar') return [{ json: { action, b, tk, query: 'select ' + pixQ } }];
if (action === 'criar') {
  const itens = Array.isArray(b.itens) ? b.itens.filter((i) => i && /^\\d+$/.test(String(i.variant_id))) : [];
  if (!itens.length) return fim({ ok: false, erro: 'Adicione ao menos 1 produto' });
  const ids = itens.map((i) => lit(String(i.variant_id))).join(', ');
  const rep = String(b.rep || '').trim();
  return [{ json: { action, b, tk, itens, query: 'select ' + pixQ +
    ", coalesce((select json_agg(json_build_object('id', variant_id::text, 'title', title, 'price', price::numeric)) from catalogo_precos where variant_id::text in (" + ids + ")), '[]'::json) as catalogo" +
    ", (select valor from checkout_config where chave = 'pix_admin_token') as admin_token" +
    (rep ? ", (select json_build_object('nome', nome, 'telefone', telefone, 'ref', coalesce(nullif(bixgrow_ref, ''), ref_code)) from afiliados where lower(nome) = lower(" + lit(rep) + ") limit 1) as rep" : ", null::json as rep") } }];
}
return fim({ ok: false, erro: 'acao desconhecida' });
` } } });

const q1 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Consulta', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `
const P = $('Preparar').first().json;
const R = $input.first().json || {};
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const fim = (resposta) => [{ json: { resposta, query: 'select 1 as x' } }];
if (P.resposta) return fim(P.resposta);
const d = (s) => String(s || '').replace(/[^0-9]/g, '');
const pix = R.pix || null;
const pub = (p) => p && ({ token: p.token, valor: Number(p.valor), horario: p.horario, nome: p.pagador_nome || '', doc: p.pagador_doc || '', info: p.info || '', status: p.status, motivo: p.motivo || '', pedido: R.pedido_nome || p.pedido_nome || '', erro: p.erro || '' });

if (P.action === 'lista') {
  if (!R.agente) return fim({ ok: false, erro: 'agente nao autorizado' });
  return fim({ ok: true, agente: R.agente, lista: (R.lista || []).map((x) => ({ token: x.token, valor: Number(x.valor), horario: x.horario, nome: x.pagador_nome || '', doc: x.pagador_doc ? String(x.pagador_doc).slice(0, 3) + '***' : '', status: x.status })) });
}
if (!pix) return fim({ ok: false, erro: 'Pix nao encontrado' });
if (P.action === 'status') return fim({ ok: true, pix: pub(pix) });
if (P.action === 'get') {
  let s = null;
  if (R.vm && R.vm.dados) {
    let dd = R.vm.dados; if (typeof dd === 'string') { try { dd = JSON.parse(dd); } catch (e) { dd = {}; } }
    s = { fonte: 'venda manual', data: R.vm.data, cliente: dd.cliente || {}, endereco: dd.endereco || {}, itens: (dd.itens || []).map((i) => ({ variant_id: String(i.variant_id), qtd: parseInt(i.qtd) || 1 })) };
  }
  if (!s && R.ck && R.ck.checkout) {
    let c = R.ck.checkout; if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
    const cu = c.customer || {}, sh = c.shipping || {};
    s = { fonte: 'compra no site', data: R.ck.data, cliente: { nome: cu.name || sh.name || '', cpf: d(cu.document), email: cu.email || '', fone: d(String(cu.ddd || '') + String(cu.phone || '')) },
      endereco: { cep: d(sh.zip), rua: sh.street || '', numero: sh.number || '', complemento: sh.complement || '', bairro: sh.neighborhood || '', cidade: sh.city || '', uf: String(sh.state || '').toUpperCase() },
      itens: (c.shopify_items || []).map((i) => ({ variant_id: String(i.variant_id), qtd: parseInt(i.quantity) || 1 })) };
  }
  return fim({ ok: true, pix: pub(pix), sugestao: s });
}
if (['novo', 'avisado', 'erro'].indexOf(pix.status) < 0) return fim({ ok: false, erro: pix.status === 'pedido' ? 'Este Pix ja virou pedido' + (R.pedido_nome ? ' (' + R.pedido_nome + ')' : '') : (pix.status === 'nao_venda' ? 'Este Pix foi marcado como nao e venda' : 'Este Pix esta sendo processado'), pix: pub(pix) });

const b = P.b || {};
const agente = String(b.agente || '').slice(0, 40);
if (P.action === 'ignorar') {
  return [{ json: { plano: 'ignorar', pix: pub(pix), query: "update pix_chave_recebidos set status = 'nao_venda', motivo = " + lit(String(b.motivo || 'nao e venda').slice(0, 200)) + ", criado_por = " + lit(agente) + ", atualizado_em = now() where token = " + lit(pix.token) + " and status in ('novo','avisado','erro') returning e2e" } }];
}

// ---------- criar ----------
const ALIAS = { '44436756234412': 'ImunoFosfo 90 caps', '44511284920492': 'ImunoFosfo 60 caps', '44436756267180': 'ImunoFosfo Vegano 90 caps', '45198538277036': 'ImunoFosfo 42 caps', '46173112041644': 'ImunoFosfo Plus 180 caps', '45211644461228': 'ImunoPet Capsulas', '45211644625068': 'ImunoPet Liquido', '46382792933548': 'ImunoFosfo USA', '44513798127788': 'ImunoFosfo Phase One 42 caps + eBook' };
const cat = {}; (R.catalogo || []).forEach((c) => { cat[String(c.id)] = { title: ALIAS[String(c.id)] || c.title, price: Number(c.price) }; });
const itens = P.itens || [];
for (const i of itens) if (!cat[String(i.variant_id)] || !(cat[String(i.variant_id)].price > 0)) return fim({ ok: false, erro: 'Produto ' + i.variant_id + ' fora do catalogo' });
let cli = b.cliente || {}; const end = b.endereco || {};
const cpf = d(cli.cpf);
if (!String(cli.nome || '').trim()) return fim({ ok: false, erro: 'Informe o nome do cliente' });
if (cpf.length !== 11 && cpf.length !== 14) return fim({ ok: false, erro: 'CPF/CNPJ invalido' });
if (d(end.cep).length !== 8 || !String(end.rua || '').trim()) return fim({ ok: false, erro: 'Endereco incompleto (CEP e rua)' });
const pixCents = Math.round(Number(pix.valor) * 100);
const freteCents = Math.max(0, Math.round(Number(b.frete || 0) * 100));
const valorCents = pixCents - freteCents;
if (!(valorCents > 0)) return fim({ ok: false, erro: 'O frete nao pode ser maior que o valor do Pix' });
const fullCents = itens.reduce((a, i) => a + Math.round(cat[String(i.variant_id)].price * 100) * (parseInt(i.qtd) || 1), 0);
const dif = valorCents - fullCents;
// 10/11: SEMPRE exige confirmar=true (a tela mostra o resumo antes). Sem isso nada e criado.
if (b.confirmar !== true) {
  const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
  const linhas = itens.map((i) => (parseInt(i.qtd) || 1) + 'x ' + cat[String(i.variant_id)].title);
  const nota = Math.abs(dif) <= 1 ? 'Valor bate com a tabela.' : (dif < 0 ? 'Desconto de ' + brl(-dif) + ' sobre a tabela.' : 'Pix ' + brl(dif) + ' acima da tabela + frete.');
  return fim({ ok: false, precisa_confirmar: true, tabela: fullCents / 100, frete: freteCents / 100, pix: pixCents / 100, diferenca: dif / 100,
    mensagem: 'Criar o pedido JA PAGO para ' + String(cli.nome || '').trim() + '?\\n' + linhas.join('\\n') + '\\nFrete: ' + brl(freteCents) + '\\nTotal = Pix: ' + brl(pixCents) + '\\n' + nota });
}
const avisos = [];
let email = String(cli.email || '').trim().toLowerCase();
let fone = d(cli.fone); if (fone.length > 11 && fone.slice(0, 2) === '55') fone = fone.slice(2);
const rep = R.rep || null; const repRef = rep ? String(rep.ref || '').trim() : '';
if (b.rep && !rep) avisos.push('Representante "' + b.rep + '" nao encontrado - pedido sem atribuicao.');
if (!email) { email = 'cpf' + cpf + '@clientes.americanutrition.com'; avisos.push('Cliente sem e-mail - usado ' + email); }
if (!fone) { let rt = rep ? d(rep.telefone) : ''; if (rt.length > 11 && rt.slice(0, 2) === '55') rt = rt.slice(2); fone = rt || '13981885555'; avisos.push('Cliente sem WhatsApp - usado ' + (rt ? 'o do representante' : 'o telefone padrao da operacao') + '.'); }
const nome = String(cli.nome).trim();
const factor = valorCents / fullCents;
const pItems = [], sItems = []; let acum = 0, sobra = 0;
itens.forEach((i, idx) => {
  const q = parseInt(i.qtd) || 1; const c = cat[String(i.variant_id)]; const fullUnit = Math.round(c.price * 100);
  sItems.push({ variant_id: String(i.variant_id), quantity: q, price: c.price });
  let unit;
  if (idx < itens.length - 1) { unit = Math.round(fullUnit * factor); acum += unit * q; }
  else { const rest = valorCents - acum; unit = Math.floor(rest / q); sobra = rest - unit * q; }
  pItems.push({ amount: unit, description: c.title, quantity: q, code: String(i.variant_id) });
});
if (sobra > 0) pItems.push({ amount: sobra, description: 'Ajuste de arredondamento', quantity: 1, code: 'AJUSTE' });
const vmToken = 'PX' + pix.token.slice(0, 8).toUpperCase();
const partes = nome.split(/\\s+/); const firstName = partes.shift() || 'Cliente'; const lastName = partes.join(' ') || '.';
const tag = String(b.tag || '').trim();
const shipping = { first_name: firstName, last_name: lastName, name: nome, street: String(end.rua || '').trim(), number: String(end.numero || '').trim(), complement: String(end.complemento || '').trim(),
  neighborhood: String(end.bairro || '').trim(), city: String(end.cidade || '').trim(), state: String(end.uf || '').toUpperCase(), zip: d(end.cep),
  coupon: String(b.cupom || '').toUpperCase() || undefined, bg_ref: repRef || undefined, tag_extra: (tag ? tag + ', ' : '') + 'pix-chave', origem: 'venda_manual', vm_token: vmToken, marketing_wpp: true };
const fr = { price_cents: freteCents, label: freteCents > 0 ? 'Frete' : 'Frete Gratis' };
const orderId = 'pixchave_' + pix.e2e;
const items = pItems.map((x) => Object.assign({}, x));
if (freteCents > 0) items.push({ code: 'FRETE', description: 'Frete - ' + fr.label, quantity: 1, amount: freteCents });
const payload = { type: 'order.paid', data: {
  id: orderId, code: 'VM-' + vmToken, status: 'paid', amount: pixCents, currency: 'BRL',
  customer: { name: nome, email, document: cpf, document_type: cpf.length === 14 ? 'cnpj' : 'cpf', type: cpf.length === 14 ? 'company' : 'individual', phones: { mobile_phone: { country_code: '55', area_code: fone.slice(0, 2), number: fone.slice(2) } } },
  items,
  charges: [{ id: orderId, amount: pixCents, status: 'paid', payment_method: 'pix', paid_at: pix.horario || new Date().toISOString(), last_transaction: { transaction_type: 'pix', status: 'paid', end_to_end_id: pix.e2e } }],
  metadata: { shipping: JSON.stringify(shipping), freight: JSON.stringify(fr), shopify_items: JSON.stringify(sItems), customer_name: nome, customer_email: email, juros_cents: '0', installments: '1', card_brand: '', ref: 'manual',
    payment_method: 'pix', gateway: 'Banco Inter', inter_txid: '', inter_e2e: pix.e2e, pix_chave: 'sim' } } };
if (cpf.length === 14) payload.data.metadata.pessoa_juridica = 'sim';
const dados = { itens: itens.map((i) => ({ variant_id: String(i.variant_id), qtd: parseInt(i.qtd) || 1, title: cat[String(i.variant_id)].title })), cliente: { nome, cpf, email, fone }, endereco: end, cupom: b.cupom || null, rep: rep ? rep.nome : null, tag: tag || null, valor: valorCents / 100, frete: freteCents / 100, pix_e2e: pix.e2e };
return [{ json: { plano: 'criar', pix: pub(pix), e2e: pix.e2e, orderId, vmToken, payload, dados, avisos, agente, adminToken: R.admin_token || '', cli: { nome, cpf, email, fone }, rep: rep ? rep.nome : null, repRef, cupom: String(b.cupom || '').toUpperCase(), tag, valor: pixCents / 100, frete: freteCents / 100,
  query: "update pix_chave_recebidos set status = 'processando', criado_por = " + lit(agente) + ", atualizado_em = now() where token = " + lit(pix.token) + " and status in ('novo','avisado','erro') returning e2e" } }];
` } } });

const q2 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Reservar', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

const executar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Executar', parameters: { jsCode: `
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const D = $('Decidir').first().json;
const lit = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const fim = (resposta) => [{ json: { resposta, query: 'select 1 as x' } }];
if (D.resposta) return fim(D.resposta);
const reservou = $input.all().some((i) => i.json && i.json.e2e);
if (D.plano === 'ignorar') return fim(reservou ? { ok: true, ignorado: true } : { ok: false, erro: 'Este Pix ja foi tratado' });
if (!reservou) return fim({ ok: false, erro: 'Este Pix ja esta virando pedido (outra pessoa clicou antes?)' });

let erro = '';
try { await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pagarme-pago', json: true, timeout: 45000, body: D.payload }); }
catch (e) { erro = String(e && e.message || e).slice(0, 300); }
if (erro) {
  return [{ json: { resposta: { ok: false, erro: 'Falha ao criar o pedido na Shopify: ' + erro + '. Tente de novo em instantes.' },
    query: "update pix_chave_recebidos set status = 'erro', erro = " + lit(erro) + ", atualizado_em = now() where e2e = " + lit(D.e2e) } }];
}
let fin = '';
if (D.adminToken) {
  try {
    const l = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-nibo-lancar', json: true, timeout: 45000, body: {
      k: D.adminToken, chave: 'pix:' + D.e2e, origem: 'pix_chave', tipo: 'PIX', valor: D.valor, data: D.pix.horario || '', nome: D.cli.nome, documento: D.cli.cpf,
      descricao: 'Pix na chave · pedido VM-' + D.vmToken, referencia: D.e2e, txid: '', end_to_end_id: D.e2e, detalhes: { order_code: 'VM-' + D.vmToken } } });
    fin = (l && (l.lancado ? 'lancado' : l.duplicado ? 'duplicado' : l.ignorado ? 'ignorado' : ('erro: ' + (l.erro || '')))) || 'sem resposta';
  } catch (e) { fin = 'erro: ' + String(e && e.message || e).slice(0, 150); }
}
const c = D.cli;
const query = "update pix_chave_recebidos set status = 'pedido', order_id = " + lit(D.orderId) + ", vm_token = " + lit(D.vmToken) + ", erro = null, atualizado_em = now() where e2e = " + lit(D.e2e) + "; " +
  "insert into vendas_manuais (token, status, raw_texto, dados, cliente_nome, cliente_cpf, cliente_email, cliente_fone, cupom, tag_extra, rep_nome, rep_ref, valor_total, frete, pagamento, pagarme_order_id, pago_em) values (" +
  [lit(D.vmToken), "'pago'", lit('Pix na chave de ' + (D.pix.nome || '') + ' (' + D.e2e + ')'), lit(JSON.stringify(D.dados)) + '::jsonb', lit(c.nome), lit(c.cpf), lit(c.email), lit(c.fone), D.cupom ? lit(D.cupom) : 'null', lit((D.tag ? D.tag + ', ' : '') + 'pix-chave'), D.rep ? lit(D.rep) : 'null', D.repRef ? lit(D.repRef) : 'null', D.valor, D.frete, "'pix_chave'", lit(D.orderId), D.pix.horario ? lit(D.pix.horario) + '::timestamptz' : 'now()'].join(', ') +
  ") on conflict do nothing; select 1 as x";
return [{ json: { resposta: { ok: true, criado: true, order_id: D.orderId, codigo: 'VM-' + D.vmToken, financeiro: fin, avisos: D.avisos || [] }, query } }];
` } } });

const q3 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery', query: '={{ $json.query }}', options: {} } } });

const responder = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Responder', parameters: { jsCode: `
return [{ json: $('Executar').first().json.resposta || { ok: false, erro: 'sem resposta' } }];
` } } });

export default workflow('venda-manual-pix', '[Financeiro] Venda Manual · Pix na chave (API)')
  .add(entrada).to(preparar).to(q1).to(decidir).to(q2).to(executar).to(q3).to(responder);
