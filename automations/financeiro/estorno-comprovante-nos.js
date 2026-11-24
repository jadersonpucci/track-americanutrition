// Workflow "[Financeiro] Estorno Pix -> comprovante no pedido" (cron 10 min).
// 24/11/2026, pedido do Jaderson. O reembolso feito na Shopify vira devolucao Pix na hora pelo
// "AN - Estorno Automatico (Shopify)" (iRJFQgEn3xPpEkre), que grava estornos_log (rota pix_inter, detalhe com o rtrId).
// Este robo pega essas devolucoes, acha o lancamento no extrato completo do Inter (detalhes.endToEndId = rtrId), gera o
// PDF do comprovante (estorno-comprovante-pdf.js), sobe nos arquivos da Shopify e prende no pedido no campo
// "Comprovante de estorno" (metafield an_financeiro.comprovante_estorno, list.file_reference, fixado no pedido), mais a
// tag estornado-pix. Devolucao que ainda nao apareceu no extrato fica para a proxima rodada.
//
// Cron/Manual -> Pendentes e config (Postgres) -> Preparar -> Token (extrato) -> Montar consulta -> Extrato completo
//   -> Montar comprovantes (PDF + stagedUploadsCreate) -> Enviar PDF (PUT binario) -> Anexar no pedido -> Marcar (Postgres)

// ===================== PREPARAR =====================
const r = $input.first().json || {};
const cfg = r.cfg || {};
const pend = Array.isArray(r.pend) ? r.pend : [];
if (!pend.length) return [];
if (!cfg.inter_ext_client_id || !cfg.inter_ext_client_secret) throw new Error('inter_ext_client_id/secret nao configurados');
const base = String(cfg.inter_ambiente || 'producao') === 'sandbox' ? 'https://cdpj-sandbox.partners.uatinter.co' : 'https://cdpj.partners.bancointer.com.br';
const brt = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const ini = pend.map((p) => brt(p.criado_em)).sort()[0];
return [{ json: { base, client_id: String(cfg.inter_ext_client_id).trim(), client_secret: String(cfg.inter_ext_client_secret).trim(),
  conta: String(cfg.inter_ext_conta_corrente || cfg.inter_conta_corrente || '').trim(), dataInicio: ini, dataFim: brt(new Date().toISOString()), pend } }];

// ===================== MONTAR CONSULTA =====================
const t = $input.first().json || {}; const p = $('Preparar').first().json;
const st = Number(t.statusCode || 0); const b = t.body || {};
if (!(st >= 200 && st < 300) || !b.access_token) throw new Error('Inter nao autorizou o extrato (HTTP ' + st + ')');
const headers = { Authorization: 'Bearer ' + b.access_token, 'Content-Type': 'application/json' };
if (p.conta) headers['x-conta-corrente'] = p.conta;
return [{ json: { headers: JSON.stringify(headers), url: p.base + '/banking/v2/extrato/completo?dataInicio=' + p.dataInicio + '&dataFim=' + p.dataFim + '&pagina=0&tamanhoPagina=1000' } }];

// ===================== MONTAR COMPROVANTES =====================
// (+ as funcoes comprovantePdf e camposDoExtrato de estorno-comprovante-pdf.js, coladas no topo do no)
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
const ex = $input.first().json || {};
if (Number(ex.statusCode || 0) >= 300) throw new Error('extrato Inter HTTP ' + ex.statusCode);
const trans = ((ex.body || {}).transacoes) || [];
const pend = $('Preparar').first().json.pend;
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 40000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const d = resp && resp.dados;
  if (!d || (d.errors && d.errors.length)) throw new Error('shopify: ' + JSON.stringify((d || {}).errors || 'sem resposta').slice(0, 300));
  return d.data;
}
const out = [];
for (const p of pend) {
  const m = String(p.detalhe || '').match(/rtrId\s+(\S+)/);
  if (!m) continue;
  const tx = trans.find((x) => x && x.detalhes && x.detalhes.endToEndId === m[1]);
  if (!tx) continue;                      // ainda nao apareceu no extrato: proxima rodada
  const pdf = comprovantePdf(camposDoExtrato(tx, p.pedido_shopify));
  const nome = 'comprovante-estorno-' + (p.pedido_shopify || p.shopify_order_id) + '-' + p.id + '.pdf';
  const su = await gql('mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }',
    { i: [{ resource: 'FILE', filename: nome, mimeType: 'application/pdf', httpMethod: 'PUT', fileSize: String(pdf.length) }] });
  const sc = su.stagedUploadsCreate;
  if (sc.userErrors && sc.userErrors.length) throw new Error('stagedUploadsCreate: ' + sc.userErrors.map((e) => e.message).join('; '));
  const alvo = sc.stagedTargets[0];
  const hd = {};
  for (const pr of (alvo.parameters || [])) {
    if (pr.name === 'content_type') hd['Content-Type'] = pr.value;
    else if (pr.name === 'acl') continue;   // x-goog-acl nao vai assinado na URL: o Google recusa (24/11)
    else hd[pr.name] = pr.value;
  }
  if (!hd['Content-Type']) hd['Content-Type'] = 'application/pdf';
  const bin = await self.helpers.prepareBinaryData(pdf, nome, 'application/pdf');
  out.push({ json: { id: p.id, pedido: p.pedido_shopify, order_id: p.shopify_order_id, nome: nome, url: alvo.url, resourceUrl: alvo.resourceUrl, headers: JSON.stringify(hd), e2e: m[1] },
    binary: { pdf: bin } });
}
return out;

// ===================== ANEXAR NO PEDIDO =====================
// (mesma funcao gql do no anterior)
const itens = $('Montar comprovantes').all();
const res = [];
for (let i = 0; i < itens.length; i++) {
  const d = itens[i].json;
  try {
    const fc = await gql('mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files { id } userErrors { message } } }',
      { f: [{ originalSource: d.resourceUrl, contentType: 'FILE', filename: d.nome, alt: 'Comprovante de estorno Pix ' + (d.pedido || '') }] });
    const fe = fc.fileCreate.userErrors;
    if (fe && fe.length) throw new Error('fileCreate: ' + fe.map((e) => e.message).join('; '));
    const fileId = fc.fileCreate.files[0].id;
    const gid = 'gid://shopify/Order/' + d.order_id;
    const q = await gql('query($id:ID!){ order(id:$id){ metafield(namespace:"an_financeiro", key:"comprovante_estorno"){ value } } }', { id: gid });
    let lista = [];
    try { lista = JSON.parse((q.order && q.order.metafield && q.order.metafield.value) || '[]'); } catch (e) { lista = []; }
    if (lista.indexOf(fileId) < 0) lista.push(fileId);
    const ms = await gql('mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors { field message } } }',
      { m: [{ ownerId: gid, namespace: 'an_financeiro', key: 'comprovante_estorno', type: 'list.file_reference', value: JSON.stringify(lista) }] });
    const me = ms.metafieldsSet.userErrors;
    if (me && me.length) throw new Error('metafieldsSet: ' + me.map((e) => e.message).join('; '));
    await gql('mutation($id:ID!,$t:[String!]!){ tagsAdd(id:$id, tags:$t){ userErrors { message } } }', { id: gid, t: ['estornado-pix'] });
    res.push({ json: { payload: JSON.stringify({ id: d.id, file: fileId, erro: null }) } });
  } catch (e) {
    res.push({ json: { payload: JSON.stringify({ id: d.id, file: null, erro: String(e.message).slice(0, 400) }) } });
  }
}
return res;
