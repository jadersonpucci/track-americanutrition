// No 'Painel' do workflow AN · NF-e Focus (emitir e anexar) (s1JHMJosqDcEeWbr), depois do webhook 'Painel API'
// (POST /webhook/nfe-painel-api). Painel de NF-e da Central Administrativa (card "Notas Fiscais", assets/painel-nfe.html).
// 09/11/2026: o painel mora dentro do workflow do emissor para usar as chaves que ja estao aqui (Focus, token manual,
// banco), lidas em tempo de execucao do no 'Chaves NF-e (não apagar)'; nao ha copia de chave neste codigo nem credencial nova.
//
// Corpo: { k, acao: 'ver'|'emitir', pedido: '16477'|'AN-16477', documento?, ie? }
//  - ver: pedido na Shopify + situacao da NF-e (nfe_emissoes / Focus).
//  - emitir sem correcao: chama este mesmo emissor (/webhook/nfe-focus?pedido=...&modo=on).
//  - emitir com documento e/ou IE: pega o payload que o emissor ja montou (nfe_emissoes.payload), troca o destinatario e
//    reenvia para a Focus com a mesma ref; grava 'processando' e chama o emissor para acompanhar e anexar no pedido.
//    Caso de origem: AN-16477, CNPJ de empresa de SP, rejeicao 232 "IE do destinatario nao informada".
const CHAVE = '<NFE_PAINEL_CHAVE>';
const self = this;
const fonte = String((($('Chaves NF-e (não apagar)').params) || {}).jsCode || '');
const cfg = (k) => { const m = fonte.match(new RegExp('const ' + k + " = '([^']*)'")); return m ? m[1] : ''; };
const SK = cfg('SK'), SB = cfg('SB'), ADM = cfg('ADM'), FOCUS = cfg('FOCUS'), FOCUS_TOKEN = cfg('FOCUS_TOKEN'), TOKEN_MANUAL = cfg('TOKEN_MANUAL');
const responder = (o) => [{ json: o }];
if (!SK || !SB || !ADM || !FOCUS || !FOCUS_TOKEN || !TOKEN_MANUAL) return responder({ ok: false, erro: 'O painel não conseguiu ler a configuração do emissor.' });

// ---------- entrada ----------
const b = ($input.first().json.body) || {};
if (String(b.k || '') !== CHAVE) return responder({ ok: false, erro: 'Acesso negado. Abra o painel pela Central Administrativa.' });
let ped = String(b.pedido || '').toUpperCase().replace(/\s+/g, '').replace(/^#/, '');
if (/^\d+$/.test(ped)) ped = 'AN-' + ped;
if (!/^AN-\d{3,7}$/.test(ped)) return responder({ ok: false, erro: 'Número de pedido inválido. Use 16477 ou AN-16477.' });
const acao = /^(ver|emitir)$/.test(String(b.acao || '')) ? b.acao : 'ver';
const docNovo = String(b.documento || '').replace(/\D/g, '');
const ieNova = String(b.ie || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

// ---------- ajudantes ----------
const dig = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query, variables: variables || {} } } });
  const d = resp && resp.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || resp).slice(0, 300));
  return d.data;
}
async function focus(method, path, body) {
  const r = await self.helpers.httpRequest({ method, url: FOCUS + path, json: true, body, timeout: 60000, returnFullResponse: true, ignoreHttpStatusErrors: true,
    headers: { Authorization: 'Basic ' + Buffer.from(FOCUS_TOKEN + ':').toString('base64') } });
  return { status: r.statusCode, body: r.body || {} };
}
async function robo() {
  try {
    return await self.helpers.httpRequest({ method: 'GET', url: 'https://n8n.americanutrition.com/webhook/nfe-focus',
      qs: { t: TOKEN_MANUAL, pedido: ped, modo: 'on' }, json: true, timeout: 150000 });
  } catch (e) { return { ok: false, erro: String(e.message).slice(0, 200) }; }
}
const lerNota = async () => (await sql('select pedido, status, mensagem, numero, serie, chave, danfe_url, xml_url, payload from nfe_emissoes where pedido = ' + E(ped)))[0] || {};

// ---------- pedido na Shopify ----------
const d = await gql('query($q:String!){ orders(first:3, query:$q){ nodes{ id name createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt'
  + ' currentTotalPriceSet{ shopMoney{ amount } } shippingAddress{ name city provinceCode } customAttributes{ key value }'
  + ' localizationExtensions(first:5){ nodes{ purpose title value } } metafields(namespace:"nfe", first:10){ nodes{ key value } } } } }', { q: 'name:' + ped });
const o = ((d.orders || {}).nodes || []).find((x) => String(x.name).toUpperCase() === ped);
if (!o) return responder({ ok: false, erro: 'Pedido ' + ped + ' não encontrado na Shopify.' });
const mf = {}; (((o.metafields || {}).nodes) || []).forEach((m) => { mf[m.key] = m.value; });
const attr = (k) => { const a = (o.customAttributes || []).find((x) => String(x.key).toLowerCase() === k.toLowerCase()); return a ? a.value : ''; };
let doc = '';
for (const x of ((o.localizationExtensions || {}).nodes || [])) { if (/TAX|CPF|CNPJ/i.test(String(x.purpose) + String(x.title))) doc = dig(x.value); }
if (!doc) doc = dig(attr('CPF') || attr('CNPJ'));
const sa = o.shippingAddress || {};
const avisos = [];
let row = await lerNota();

// ---------- emitir ----------
if (acao === 'emitir') {
  if (mf.danfe_url || row.status === 'autorizado') avisos.push('Este pedido já tem NF-e autorizada.');
  else if (o.cancelledAt || !/PAID/i.test(o.displayFinancialStatus)) avisos.push('Pedido cancelado ou não pago: a NF-e não é emitida.');
  else if (!docNovo && !ieNova) { const r = await robo(); if (r && r.ok === false) avisos.push('Emissor: ' + (r.erro || 'falhou')); }
  else if (!row.payload) {
    const r = await robo(); if (r && r.ok === false) avisos.push('Emissor: ' + (r.erro || 'falhou'));
    avisos.push('O pedido ainda não tinha passado pelo emissor. Rodei o emissor normal; se a SEFAZ recusar, mande a correção de novo.');
  } else if (!/^(erro|revisar|simulado)$/.test(String(row.status))) {
    avisos.push('A NF-e está em "' + row.status + '". A correção só vale para nota recusada ou em revisão.');
  } else if (row.status === 'revisar' && !String(row.mensagem || '').split('; ').every((m) => /CPF\/CNPJ/.test(m))) {
    avisos.push('O pedido tem outros problemas além do documento: ' + row.mensagem + '. Corrija o pedido na Shopify e toque em Gerar NF-e sem correção.');
  } else {
    const nf = typeof row.payload === 'string' ? JSON.parse(row.payload) : JSON.parse(JSON.stringify(row.payload));
    const novoDoc = docNovo || dig(nf.cpf_destinatario || nf.cnpj_destinatario);
    if (!(novoDoc.length === 11 || novoDoc.length === 14)) avisos.push('CPF/CNPJ inválido: use 11 dígitos (CPF) ou 14 (CNPJ).');
    else {
      delete nf.cpf_destinatario; delete nf.cnpj_destinatario; delete nf.inscricao_estadual_destinatario;
      nf.indicador_inscricao_estadual_destinatario = 9;
      if (novoDoc.length === 14) nf.cnpj_destinatario = novoDoc; else nf.cpf_destinatario = novoDoc;
      const desc = ['documento ' + (novoDoc.length === 14 ? 'CNPJ' : 'CPF')];
      if (novoDoc.length === 14 && ieNova) {
        if (/^ISENT/.test(ieNova)) { nf.indicador_inscricao_estadual_destinatario = 2; desc.push('IE isento'); }
        else if (dig(ieNova)) {
          nf.indicador_inscricao_estadual_destinatario = 1;
          nf.inscricao_estadual_destinatario = dig(ieNova);
          desc.push('IE ' + dig(ieNova));
          // Contribuinte de outro estado nao leva a partilha do DIFAL (EC 87 e para nao contribuinte).
          if (Number(nf.local_destino) === 2) (nf.items || []).forEach((it) => { Object.keys(it).forEach((k) => {
            if (/_uf_destino$|_uf_remetente$|^icms_aliquota_interestadual$|^icms_percentual_partilha$/.test(k)) delete it[k]; }); });
        }
      }
      nf.data_emissao = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19) + '-03:00';
      const env = await focus('POST', '/v2/nfe?ref=' + encodeURIComponent(o.name), nf);
      const bd = env.body || {};
      const aceito = env.status === 201 || env.status === 202 || /processando|autorizado/.test(String(bd.status || '')) || /already_processed|pending_operation/.test(String(bd.codigo || ''));
      const msg = aceito ? 'reenviada pelo painel (' + desc.join(', ') + ')'
        : ('painel: Focus recusou (' + desc.join(', ') + ') HTTP ' + env.status + ' ' + (bd.mensagem || '') + ' ' + JSON.stringify(bd.erros || '')).slice(0, 500);
      await sql("update nfe_emissoes set status = case when status in ('autorizado', 'autorizado_sem_anexo') then status else " + E(aceito ? 'processando' : 'erro') + ' end, payload = '
        + E(JSON.stringify(nf)) + '::jsonb, mensagem = ' + E(msg) + ', atualizado_em = now() where pedido = ' + E(o.name));
      if (aceito) {
        await new Promise((ok) => setTimeout(ok, 6000));
        const r = await robo(); if (r && r.ok === false) avisos.push('Emissor: ' + (r.erro || 'falhou'));
      } else avisos.push('A Focus recusou o reenvio: ' + (bd.mensagem || ('HTTP ' + env.status)));
    }
  }
  row = await lerNota();
}

// ---------- resposta ----------
const out = { ok: true, pedido: o.name, acao, avisos,
  shopify: { cliente: sa.name || '', cidade: [sa.city, sa.provinceCode].filter(Boolean).join(' / '), total: Number(o.currentTotalPriceSet.shopMoney.amount),
    pagamento: o.displayFinancialStatus, envio: o.displayFulfillmentStatus, cancelado: !!o.cancelledAt, criado: o.createdAt, documento: doc },
  nfe: { status: row.status || 'sem registro', mensagem: row.mensagem || '',
    numero: mf.numero || (row.numero ? row.numero + ' / serie ' + row.serie : ''), chave: mf.chave || row.chave || '',
    danfe: mf.danfe_url || row.danfe_url || '', xml: row.xml_url || '' } };
// Nota que ainda nao fechou: situacao na Focus (motivo da recusa da SEFAZ, ou DANFE se acabou de autorizar).
if (!out.nfe.danfe && row.status && row.status !== 'ignorado') {
  const c = await focus('GET', '/v2/nfe/' + encodeURIComponent(o.name));
  const r = c.body || {};
  if (c.status !== 404) out.focus = { status: r.status || ('http ' + c.status), sefaz: r.status_sefaz || '', mensagem: r.mensagem_sefaz || r.mensagem || '' };
  if (r.status === 'autorizado' && r.caminho_danfe) { out.nfe.danfe = FOCUS + r.caminho_danfe; out.nfe.xml = FOCUS + r.caminho_xml_nota_fiscal; out.nfe.numero = r.numero + ' / serie ' + r.serie; }
}
return responder(out);
