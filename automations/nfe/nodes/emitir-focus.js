// No "Emitir e Anexar" do workflow AN · NF-e Focus (emitir e anexar). Tres entradas chegam aqui:
//   - Eventos (POST /webhook/nfe-focus-evento?t=TOKEN_EVENTO), na hora:
//       Shopify orders/create e orders/paid -> emite a nota daquele pedido se estiver pago e nao enviado;
//       Focus (gatilho "nfe" do CNPJ) -> nota autorizada/rejeitada: anexa no pedido ou avisa no Telegram.
//   - Rede de seguranca a cada 60 min: acompanha o que ficou processando e emite o que algum aviso perdeu.
//   - Manual: GET /webhook/nfe-focus?t=TOKEN[&pedido=AN-123][&modo=simulacao|on] (um pedido so, reprocessa erro/revisar).
// 30/10/2026: a America Nutrition passa a emitir NF-e pela Focus NFe (conta da Rodolog, plano Growth). Nota autorizada
// vai para o pedido da Shopify (arquivos + metafields nfe.numero/chave/danfe/xml/danfe_url; sem tag, a pedido do
// Jaderson). Pedidos considerados: pagos e ainda nao enviados desde serena_config.nfe_desde.
// Modo em serena_config.nfe_modo: off (parado), simulacao (monta e grava o payload, nao envia), on (emite).
//
// Tributacao (Lucro Presumido, CRT 3; produtos importados direto pela AN = origem 1):
//   ICMS CST 00: 18% dentro de SP (CFOP 5102); 4% interestadual para importado (Res. Senado 13/2012, CFOP 6108).
//   DIFAL (EC 87): consumidor final de outro estado, base unica, aliquota interna do destino - 4%, partilha 100%.
//   PIS 0,65% e COFINS 3% cumulativos (CST 01), com o ICMS fora da base (Tema 69 do STF).
//   IBS/CBS 2026 (ano-teste): CST 000, cClassTrib 000001, IBS UF 0,1%, CBS 0,9%.
//   NCM pelo produto (tabela NCM abaixo, a mesma classificacao do HS na Shopify): suplemento 2106.90.30,
//   ImunoPet 2309.90.90, Life Protein 2106.10.00. Unidade UN. GTIN: SEM GTIN.
//   Juros do parcelamento (linha "Juros de parcelamento") entram como outras despesas, rateados nos itens.
// Pedido que nao fecha (sem CPF, item sem preco, total diferente) fica "revisar" e vai para o Telegram.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const FOCUS = 'https://api.focusnfe.com.br';
const FOCUS_TOKEN = '<FOCUS_TOKEN_AN>';
const TG_BOT = '<TOKEN_ALERTAS>';
const TG_CHAT = '-1003766435449';
const TOKEN_MANUAL = '<NFE_TOKEN_MANUAL>';
const TOKEN_EVENTO = '<NFE_TOKEN_EVENTO>';
const CNPJ = '11298909000194';
const self = this;

const NCM = { '8010079666348': '23099090', '8414425350316': '21061000' };
const NCM_PADRAO = '21069030';
// Aliquota interna do destino e FCP (% ) para o DIFAL. Conferir com o contador a cada mudanca estadual.
const UF_INTERNA = { AC: [19, 0], AL: [19, 1], AM: [20, 0], AP: [18, 0], BA: [20.5, 0], CE: [20, 0], DF: [20, 0], ES: [17, 0],
  GO: [19, 0], MA: [23, 0], MG: [18, 0], MS: [17, 0], MT: [17, 0], PA: [19, 0], PB: [20, 0], PE: [20.5, 0], PI: [22.5, 0],
  PR: [19.5, 0], RJ: [20, 2], RN: [20, 0], RO: [19.5, 0], RR: [20, 0], RS: [17, 0], SC: [17, 0], SE: [19, 1], TO: [20, 0] };
const ICMS_SP = 18, ICMS_INTER_IMPORTADO = 4, ORIGEM = 1;

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const dig = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const limpa = (s) => String(s == null ? '' : s).replace(/[⁠​‌‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const E = (v) => (v === null || v === undefined) ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const J = (o) => E(JSON.stringify(o)) + '::jsonb';

async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 30000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error('SQL: ' + String(r.error).slice(0, 300));
  return Array.isArray(r) ? r : [];
}
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const d = resp && resp.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || resp).slice(0, 300));
  return d.data;
}
async function focus(method, path, body) {
  const r = await self.helpers.httpRequest({ method: method, url: FOCUS + path, json: true, body: body, timeout: 60000, returnFullResponse: true, ignoreHttpStatusErrors: true,
    headers: { Authorization: 'Basic ' + Buffer.from(FOCUS_TOKEN + ':').toString('base64') } });
  return { status: r.statusCode, body: r.body || {} };
}
async function alerta(texto) {
  try { await self.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 10000,
    body: { chat_id: TG_CHAT, parse_mode: 'HTML', disable_web_page_preview: true, text: texto } }); } catch (e) {}
}
const html = (s) => String(s == null ? '' : s).replace(/[<>&]/g, ' ');
async function gravar(pedido, campos) {
  const cols = Object.keys(campos);
  const vals = cols.map((c) => (c === 'payload' || c === 'resposta') ? J(campos[c]) : E(campos[c]));
  await sql('insert into nfe_emissoes (pedido, ' + cols.join(', ') + ') values (' + E(pedido) + ', ' + vals.join(', ') + ') on conflict (pedido) do update set '
    + cols.map((c) => c + ' = excluded.' + c).join(', ') + ', atualizado_em = now()');
}

// ---------- montar a nota a partir do pedido ----------
async function viacep(cep) {
  try { const r = await self.helpers.httpRequest({ method: 'GET', url: 'https://viacep.com.br/ws/' + cep + '/json/', json: true, timeout: 8000 }); return (r && !r.erro) ? r : null; } catch (e) { return null; }
}
function attr(o, k) { const a = (o.customAttributes || []).find((x) => String(x.key).toLowerCase() === k.toLowerCase()); return a ? a.value : ''; }

async function montar(o) {
  const probs = [];
  const sa = o.shippingAddress || {};
  const uf = String(sa.provinceCode || '').toUpperCase();
  const interna = uf === 'SP';
  if (!interna && !UF_INTERNA[uf]) probs.push('UF de entrega desconhecida: ' + uf);

  let doc = '';
  for (const x of ((o.localizationExtensions || {}).nodes || [])) { if (/TAX|CPF|CNPJ/i.test(String(x.purpose) + String(x.title))) doc = dig(x.value); }
  if (!doc) doc = dig(attr(o, 'CPF') || attr(o, 'CNPJ'));
  if (!(doc.length === 11 || doc.length === 14)) probs.push('CPF/CNPJ ausente ou invalido');

  // Endereco do checkout: address1 = "Rua X, 123"; address2 = "[complemento, ]bairro".
  const a1 = limpa(sa.address1);
  let logradouro = a1, numero = 'S/N';
  const mv = a1.match(/^(.*),\s*([^,]+)$/);
  if (mv && /\d|s\/?n/i.test(mv[2])) { logradouro = mv[1].trim(); numero = mv[2].trim(); }
  else { const mn = a1.match(/^(.*?)\s+(\d+[A-Za-z]?)$/); if (mn) { logradouro = mn[1].trim(); numero = mn[2]; } }
  const partes = limpa(sa.address2).split(',').map((s) => s.trim()).filter(Boolean);
  let bairro = partes.length ? partes[partes.length - 1] : '';
  const complemento = partes.slice(0, -1).join(', ');
  const cep = dig(sa.zip);
  const vc = cep.length === 8 ? await viacep(cep) : null;
  if (!bairro && vc && vc.bairro) bairro = vc.bairro;
  if (!bairro) bairro = 'Centro';
  if (cep.length !== 8) probs.push('CEP invalido');
  if (vc && vc.uf && vc.uf !== uf) probs.push('CEP de ' + vc.uf + ' com estado ' + uf);

  // Itens, frete e juros
  const linhas = (o.lineItems || {}).nodes || [];
  const prods = [], juros = [];
  for (const li of linhas) {
    const qtd = Number(li.quantity || 0);
    if (!qtd) continue;
    if (!li.variant) {
      if (/juros/i.test(li.title)) { juros.push(Number(li.discountedTotalSet.shopMoney.amount)); continue; }
      probs.push('item sem produto: ' + li.title); continue;
    }
    const unit = Number(li.originalUnitPriceSet.shopMoney.amount);
    const liq = r2(qtd * Number(li.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount));
    if (!(unit > 0) || !(liq > 0)) { probs.push('item sem valor (brinde?): ' + li.title); continue; }
    prods.push({ li: li, qtd: qtd, unit: unit, bruto: r2(unit * qtd), liq: liq });
  }
  if (!prods.length) probs.push('pedido sem produto com valor');
  const total = r2(Number(o.currentTotalPriceSet.shopMoney.amount));
  const frete = r2((((o.shippingLines || {}).nodes) || []).reduce((s, x) => s + Number(x.discountedPriceSet.shopMoney.amount), 0));
  const outras = r2(juros.reduce((s, v) => s + v, 0));
  const somaLiq = r2(prods.reduce((s, p) => s + p.liq, 0));
  const dif = r2(total - (somaLiq + frete + outras));
  if (prods.length && Math.abs(dif) > 0.05) probs.push('total do pedido (' + total + ') nao fecha com itens + frete + juros (' + r2(somaLiq + frete + outras) + ')');
  else if (prods.length && dif !== 0) prods[0].liq = r2(prods[0].liq + dif);

  // Rateio de frete e juros pelos itens; o ultimo leva a sobra do arredondamento
  let fr = frete, ou = outras;
  const somaRateio = prods.reduce((s, p) => s + p.liq, 0) || 1;
  prods.forEach((p, i) => {
    if (i === prods.length - 1) { p.frete = r2(fr); p.outras = r2(ou); }
    else { p.frete = r2(frete * p.liq / somaRateio); p.outras = r2(outras * p.liq / somaRateio); fr -= p.frete; ou -= p.outras; }
    p.desc = r2(p.bruto - p.liq);
    if (p.desc < 0) { p.outras = r2(p.outras - p.desc); p.desc = 0; }
  });

  // Lei 12.741/2012 (valor aproximado dos tributos): a Focus nao preencheu vTotTrib sozinha, entao vai a soma real
  // dos tributos de cada item: ICMS + DIFAL + FCP (estaduais) e PIS + COFINS (federais). IBS/CBS de 2026 fica de fora.
  let totIcms = 0, totDifal = 0, totFcp = 0, totFed = 0;
  const [pDest, pFcp] = UF_INTERNA[uf] || [0, 0];
  const items = prods.map((p, i) => {
    const li = p.li;
    const base = r2(p.bruto - p.desc + p.frete + p.outras);
    const aliq = interna ? ICMS_SP : ICMS_INTER_IMPORTADO;
    const icms = r2(base * aliq / 100);
    const bPis = r2(base - icms);
    const vPis = r2(bPis * 0.0065), vCofins = r2(bPis * 0.03);
    let estaduais = icms;
    const desc = limpa(li.title + (li.variantTitle && li.variantTitle !== 'Default Title' ? ' - ' + li.variantTitle : ''));
    const it = {
      numero_item: i + 1,
      codigo_produto: dig(li.variant.id),
      descricao: desc.slice(0, 120),
      cfop: interna ? '5102' : '6108',
      codigo_ncm: NCM[dig(li.product && li.product.id)] || NCM_PADRAO,
      codigo_barras_comercial: 'SEM GTIN', codigo_barras_tributavel: 'SEM GTIN',
      unidade_comercial: 'UN', quantidade_comercial: p.qtd, valor_unitario_comercial: p.unit, valor_bruto: p.bruto,
      unidade_tributavel: 'UN', quantidade_tributavel: p.qtd, valor_unitario_tributavel: p.unit,
      inclui_no_total: 1,
      icms_origem: ORIGEM, icms_situacao_tributaria: '00', icms_modalidade_base_calculo: 3,
      icms_base_calculo: base, icms_aliquota: aliq, icms_valor: icms,
      pis_situacao_tributaria: '01', pis_base_calculo: bPis, pis_aliquota_porcentual: 0.65, pis_valor: vPis,
      cofins_situacao_tributaria: '01', cofins_base_calculo: bPis, cofins_aliquota_porcentual: 3, cofins_valor: vCofins,
      ibs_cbs_situacao_tributaria: '000', ibs_cbs_classificacao_tributaria: '000001', ibs_cbs_base_calculo: base,
      ibs_uf_aliquota: 0.1, ibs_uf_valor: r2(base * 0.001), ibs_mun_aliquota: 0, ibs_mun_valor: 0,
      cbs_aliquota: 0.9, cbs_valor: r2(base * 0.009)
    };
    if (p.desc > 0) it.valor_desconto = p.desc;
    if (p.frete > 0) it.valor_frete = p.frete;
    if (p.outras > 0) it.valor_outras_despesas = p.outras;
    totIcms += icms;
    if (!interna) {
      const vDest = r2(base * (pDest - ICMS_INTER_IMPORTADO) / 100);
      const vFcp = r2(base * pFcp / 100);
      Object.assign(it, { icms_base_calculo_uf_destino: base, icms_aliquota_interna_uf_destino: pDest, icms_aliquota_interestadual: ICMS_INTER_IMPORTADO,
        icms_percentual_partilha: 100, icms_valor_uf_destino: vDest, icms_valor_uf_remetente: 0 });
      if (pFcp > 0) Object.assign(it, { fcp_base_calculo_uf_destino: base, fcp_percentual_uf_destino: pFcp, fcp_valor_uf_destino: vFcp });
      totDifal += vDest; totFcp += vFcp;
      estaduais += vDest + vFcp;
    }
    it.valor_total_tributos = r2(estaduais + vPis + vCofins);
    totFed += vPis + vCofins;
    return it;
  });

  const pag = limpa(attr(o, 'Pagamento')).toLowerCase();
  const parcelas = Number(dig(attr(o, 'Parcelas')) || 1);
  let fp = { indicador_pagamento: 0, forma_pagamento: '17', valor_pagamento: total };
  if (/cart/.test(pag) && /d[eé]bito/.test(pag)) fp = { indicador_pagamento: 0, forma_pagamento: '04', valor_pagamento: total, tipo_integracao: 2 };
  else if (/cart/.test(pag)) fp = { indicador_pagamento: parcelas > 1 ? 1 : 0, forma_pagamento: '03', valor_pagamento: total, tipo_integracao: 2 };
  else if (/boleto/.test(pag)) fp = { indicador_pagamento: 0, forma_pagamento: '15', valor_pagamento: total };
  else if (!/pix/.test(pag)) probs.push('forma de pagamento nao reconhecida: ' + (pag || 'vazia'));

  const info = ['Pedido ' + o.name + '.'];
  const brl = (v) => r2(v).toFixed(2).replace('.', ',');
  if (!interna) info.push('ICMS DIFAL para a UF de destino (' + uf + '): R$ ' + brl(totDifal) + (totFcp > 0 ? ' + FCP R$ ' + brl(totFcp) : '') + '.');
  const totEst = totIcms + totDifal + totFcp;
  info.push('Valor aproximado dos tributos: R$ ' + brl(totEst + totFed) + ' (federais R$ ' + brl(totFed) + ', estaduais R$ ' + brl(totEst) + '). Lei 12.741/2012.');
  const tel = dig(sa.phone || o.phone).replace(/^55(?=\d{10,11}$)/, '');
  const nf = {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19) + '-03:00',
    tipo_documento: 1, finalidade_emissao: 1, local_destino: interna ? 1 : 2,
    consumidor_final: 1, presenca_comprador: 2, indicador_intermediario: 0,
    cnpj_emitente: CNPJ,
    nome_destinatario: limpa(sa.name || [sa.firstName, sa.lastName].join(' ')).slice(0, 60),
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: logradouro.slice(0, 60), numero_destinatario: numero.slice(0, 60),
    bairro_destinatario: bairro.slice(0, 60),
    municipio_destinatario: (vc && vc.localidade) || limpa(sa.city), uf_destinatario: uf, cep_destinatario: cep,
    modalidade_frete: 0,
    informacoes_adicionais_contribuinte: info.join(' '),
    formas_pagamento: [fp],
    items: items
  };
  if (doc.length === 14) nf.cnpj_destinatario = doc; else nf.cpf_destinatario = doc;
  if (complemento) nf.complemento_destinatario = complemento.slice(0, 60);
  if (vc && vc.ibge) nf.codigo_municipio_destinatario = vc.ibge;
  if (tel.length >= 10) nf.telefone_destinatario = tel;
  if (o.email) nf.email_destinatario = o.email;
  return { nf: nf, probs: probs, uf: uf, total: total, icms: r2(totIcms), difal: r2(totDifal + totFcp) };
}

// ---------- anexar no pedido da Shopify ----------
async function anexar(pedido, orderId, r) {
  const danfe = FOCUS + r.caminho_danfe, xml = FOCUS + r.caminho_xml_nota_fiscal;
  const fc = await gql('mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id } userErrors{ field message } } }',
    { f: [{ originalSource: danfe, contentType: 'FILE', filename: 'NFe-' + r.numero + '-' + pedido + '.pdf', alt: 'DANFE ' + pedido },
          { originalSource: xml, contentType: 'FILE', filename: 'NFe-' + r.numero + '-' + pedido + '.xml', alt: 'XML NF-e ' + pedido }] });
  const fs = fc.fileCreate.files || [];
  const mf = [
    { ownerId: orderId, namespace: 'nfe', key: 'numero', type: 'single_line_text_field', value: String(r.numero) + ' / serie ' + r.serie },
    { ownerId: orderId, namespace: 'nfe', key: 'chave', type: 'single_line_text_field', value: String(r.chave_nfe || '').replace(/^NFe/, '') },
    { ownerId: orderId, namespace: 'nfe', key: 'danfe_url', type: 'url', value: danfe }
  ];
  if (fs[0]) mf.push({ ownerId: orderId, namespace: 'nfe', key: 'danfe', type: 'file_reference', value: fs[0].id });
  if (fs[1]) mf.push({ ownerId: orderId, namespace: 'nfe', key: 'xml', type: 'file_reference', value: fs[1].id });
  const ms = await gql('mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ metafields{ key } userErrors{ field message } } }', { m: mf });
  const erros = [].concat(fc.fileCreate.userErrors || [], ms.metafieldsSet.userErrors || []);
  await gravar(pedido, { status: 'autorizado', shopify_danfe_id: fs[0] ? fs[0].id : null, shopify_xml_id: fs[1] ? fs[1].id : null,
    anexado_em: new Date().toISOString(), mensagem: erros.length ? ('anexo: ' + JSON.stringify(erros)).slice(0, 500) : 'Autorizada e anexada' });
}

async function consultar(pedido, orderId) {
  const c = await focus('GET', '/v2/nfe/' + encodeURIComponent(pedido));
  const r = c.body || {};
  if (r.status === 'autorizado') {
    await gravar(pedido, { status: 'autorizado_sem_anexo', numero: String(r.numero), serie: String(r.serie), chave: String(r.chave_nfe || '').replace(/^NFe/, ''),
      danfe_url: FOCUS + r.caminho_danfe, xml_url: FOCUS + r.caminho_xml_nota_fiscal, mensagem: r.mensagem_sefaz || null, resposta: r });
    await anexar(pedido, orderId, r);
    return 'autorizado';
  }
  if (r.status === 'erro_autorizacao' || r.status === 'denegado') {
    const msg = (r.status_sefaz || '') + ' ' + (r.mensagem_sefaz || JSON.stringify(r.erros || r).slice(0, 300));
    await gravar(pedido, { status: 'erro', mensagem: msg.slice(0, 500), resposta: r });
    await alerta('\u{1F9FE} <b>NF-e rejeitada</b> ' + html(pedido) + String.fromCharCode(10) + html(msg).slice(0, 400) + String.fromCharCode(10) + 'Depois de corrigir: /webhook/nfe-focus?pedido=' + html(pedido) + '&modo=on');
    return 'erro';
  }
  if (r.status === 'cancelado') { await gravar(pedido, { status: 'cancelado', resposta: r }); return 'cancelado'; }
  return r.status || ('http ' + c.status);
}

// ---------- rodada ----------
const ent = $input.first().json || {};
const q = ent.query || {};
const corpo = (ent.body && typeof ent.body === 'object') ? ent.body : {};
// Aviso da Focus traz ref + status + cnpj_emitente; aviso da Shopify traz o pedido inteiro (name + admin_graphql_api_id).
const evFocus = !!(corpo.ref && corpo.status && corpo.cnpj_emitente);
const evShopify = !evFocus && !!(corpo.admin_graphql_api_id && corpo.name);
const evento = evFocus || evShopify;
const manual = !evento && Object.prototype.hasOwnProperty.call(ent, 'query');
if (evento && String(q.t || '') !== TOKEN_EVENTO) return [{ json: { ok: false, erro: 'acesso negado' } }];
if (manual && q.t !== TOKEN_MANUAL) return [{ json: { ok: false, erro: 'acesso negado' } }];

const cfg = {};
(await sql("select chave, valor from serena_config where chave like 'nfe_%'")).forEach((x) => { cfg[x.chave] = x.valor; });
let modo = String(cfg.nfe_modo || 'off');
if (manual && /^(simulacao|on)$/.test(String(q.modo || ''))) modo = q.modo;
if (modo === 'off') return [{ json: { ok: true, modo: modo, nada: true } }];
const desde = cfg.nfe_desde || new Date().toISOString();

// Aviso da Focus: so a nota daquele pedido (autorizada -> anexa; rejeitada -> Telegram).
if (evFocus) {
  const ref = String(corpo.ref);
  const row = (await sql('select shopify_order_id, status from nfe_emissoes where pedido = ' + E(ref)))[0];
  if (!row) return [{ json: { ok: true, evento: 'focus', pedido: ref, ignorado: 'ref fora da nfe_emissoes' } }];
  if (row.status === 'autorizado' || row.status === 'cancelado') return [{ json: { ok: true, evento: 'focus', pedido: ref, ja: row.status } }];
  return [{ json: { ok: true, evento: 'focus', pedido: ref, status: await consultar(ref, row.shopify_order_id) } }];
}
const pedidoUnico = evShopify ? String(corpo.name).trim().toUpperCase() : (manual && q.pedido ? String(q.pedido).trim().toUpperCase() : '');

const saida = { ok: true, modo: modo, acompanhadas: [], novas: [] };

// 1) acompanhar
if (modo === 'on') {
  const abertas = await sql("select pedido, shopify_order_id, status from nfe_emissoes where status in ('processando', 'autorizado_sem_anexo')" + (pedidoUnico ? ' and pedido = ' + E(pedidoUnico) : '') + ' order by criado_em limit 40');
  for (const a of abertas) {
    try { saida.acompanhadas.push({ pedido: a.pedido, status: await consultar(a.pedido, a.shopify_order_id) }); }
    catch (e) { saida.acompanhadas.push({ pedido: a.pedido, erro: String(e.message).slice(0, 200) }); }
  }
}

// 2) novos pedidos
const filtro = pedidoUnico ? ('name:' + pedidoUnico) : ("created_at:>='" + desde + "' financial_status:paid fulfillment_status:unfulfilled -status:cancelled");
const QO = 'query($q:String!){ orders(first:40, query:$q, sortKey:CREATED_AT){ nodes{ id name createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt email phone customAttributes{ key value }'
  + ' localizationExtensions(first:5){ nodes{ purpose title value } } currentTotalPriceSet{ shopMoney{ amount } }'
  + ' shippingAddress{ name firstName lastName address1 address2 city provinceCode zip phone }'
  + ' shippingLines(first:3){ nodes{ title discountedPriceSet{ shopMoney{ amount } } } }'
  + ' lineItems(first:40){ nodes{ title variantTitle quantity variant{ id } product{ id } originalUnitPriceSet{ shopMoney{ amount } } discountedUnitPriceAfterAllDiscountsSet{ shopMoney{ amount } } discountedTotalSet{ shopMoney{ amount } } } } } } }';
const pedidos = (await gql(QO, { q: filtro })).orders.nodes;
const nomes = pedidos.map((o) => o.name);
const ja = {};
if (nomes.length) (await sql('select pedido, status from nfe_emissoes where pedido in (' + nomes.map(E).join(', ') + ')')).forEach((x) => { ja[x.pedido] = x.status; });

for (const o of pedidos) {
  const st = ja[o.name];
  // Ja emitida ou em andamento nao volta. Simulado pode virar emissao; erro/revisar so com pedido unico (manual).
  if (st && !(st === 'simulado' && modo === 'on') && !(manual && pedidoUnico && /^(erro|revisar|simulado)$/.test(st))) continue;
  if (o.cancelledAt || !/PAID/i.test(o.displayFinancialStatus)) continue;
  // Aviso da Shopify chega tambem para pedido antigo editado/pago depois: so vale o que ainda nao foi enviado e e de nfe_desde em diante.
  if (evShopify && (o.displayFulfillmentStatus === 'FULFILLED' || o.createdAt < new Date(desde).toISOString())) continue;
  try {
    const m = await montar(o);
    const base = { shopify_order_id: o.id, uf: m.uf, valor: m.total, icms: m.icms, difal: m.difal, payload: m.nf };
    if (m.probs.length) {
      await gravar(o.name, Object.assign(base, { status: 'revisar', mensagem: m.probs.join('; ').slice(0, 500) }));
      if (st !== 'revisar') await alerta('\u{1F9FE} <b>NF-e precisa de revisao</b> ' + html(o.name) + String.fromCharCode(10) + html(m.probs.join('; ')) + String.fromCharCode(10) + 'Depois de corrigir o pedido: /webhook/nfe-focus?pedido=' + html(o.name) + '&modo=on');
      saida.novas.push({ pedido: o.name, status: 'revisar', probs: m.probs });
      continue;
    }
    if (modo === 'simulacao') {
      await gravar(o.name, Object.assign(base, { status: 'simulado', mensagem: 'payload montado, nao enviado' }));
      saida.novas.push({ pedido: o.name, status: 'simulado', uf: m.uf, total: m.total, icms: m.icms, difal: m.difal });
      continue;
    }
    const env = await focus('POST', '/v2/nfe?ref=' + encodeURIComponent(o.name), m.nf);
    const b = env.body || {};
    if (env.status === 201 || env.status === 202 || b.status === 'processando_autorizacao' || b.status === 'autorizado' || b.codigo === 'already_processed' || b.codigo === 'pending_operation') {
      await gravar(o.name, Object.assign(base, { status: 'processando', mensagem: b.mensagem || b.status || null, resposta: b, tentativas: 1 }));
      await new Promise((ok) => setTimeout(ok, 4000));
      saida.novas.push({ pedido: o.name, status: await consultar(o.name, o.id) });
    } else {
      const msg = (b.mensagem || '') + ' ' + JSON.stringify(b.erros || '').slice(0, 300);
      await gravar(o.name, Object.assign(base, { status: 'erro', mensagem: ('HTTP ' + env.status + ' ' + msg).slice(0, 500), resposta: b }));
      await alerta('\u{1F9FE} <b>NF-e recusada pela Focus</b> ' + html(o.name) + String.fromCharCode(10) + html(msg).slice(0, 400));
      saida.novas.push({ pedido: o.name, status: 'erro', http: env.status, msg: msg.slice(0, 300) });
    }
  } catch (e) {
    saida.novas.push({ pedido: o.name, erro: String(e.message).slice(0, 300) });
  }
}
return [{ json: saida }];
