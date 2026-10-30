// No "Site: Criar Depoimento" do workflow AN - Reviews Enviar p/ Grupos (PQpcMivb7NabvzrO), depois do Site: Subir PNG.
// Registra o PNG ja enviado como arquivo da Shopify, espera ficar pronto e cria o metaobject depoimento que a
// pagina de depoimentos do site le. Grava o id em reviews.site_metaobject_id. SUPABASE_SERVICE_KEY fica so no n8n.
const prep = $('Site: Preparar Upload').first().json;
const m = $('Montar Card').first().json;
const r = $('Buscar Review').first().json || {};
const put = $input.first().json || {};
const out = Object.assign({}, prep);
delete out.upload_url; delete out.resource_url; delete out.subir;

const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const self = this;
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables } } });
  const d = resp && resp.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || resp).slice(0, 300));
  return d.data;
}

try {
  if (put.statusCode && Number(put.statusCode) >= 300) throw new Error('upload do PNG: HTTP ' + put.statusCode);
  if (put.error) throw new Error('upload do PNG: ' + JSON.stringify(put.error).slice(0, 200));

  const fc = await gql('mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id } userErrors{ field message } } }',
    { files: [{ originalSource: prep.resource_url, contentType: 'IMAGE', alt: m.nome }] });
  const arq = (fc.fileCreate.files || [])[0];
  if (!arq) throw new Error('fileCreate: ' + JSON.stringify(fc.fileCreate.userErrors));

  // A Shopify processa a imagem em poucos segundos. Se falhar (formato), nao cria um card quebrado no site.
  let status = '', detalhe = '';
  for (let i = 0; i < 8; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const f = await gql('query($id:ID!){ node(id:$id){ ... on MediaImage{ fileStatus fileErrors{ details } } } }', { id: arq.id });
    status = (f.node && f.node.fileStatus) || '';
    if (status === 'READY' || status === 'FAILED') { detalhe = JSON.stringify((f.node && f.node.fileErrors) || []); break; }
  }
  if (status === 'FAILED') throw new Error('arquivo recusado pela Shopify: ' + detalhe.slice(0, 200));

  const campos = [
    { key: 'midia', value: arq.id },
    { key: 'tipo', value: 'imagem' },
    { key: 'tom', value: 'recomendacao' },
    { key: 'confianca', value: '1.0' }
  ];
  if (r.product_id) campos.push({ key: 'produto', value: 'gid://shopify/Product/' + r.product_id });
  const mo = await gql('mutation($m:MetaobjectCreateInput!){ metaobjectCreate(metaobject:$m){ metaobject{ id handle } userErrors{ field message code } } }',
    { m: { type: 'depoimento', handle: 'review-' + String(r.id).slice(0, 8), fields: campos, capabilities: { publishable: { status: 'ACTIVE' } } } });
  const obj = mo.metaobjectCreate.metaobject;
  if (!obj) throw new Error('metaobject: ' + JSON.stringify(mo.metaobjectCreate.userErrors));

  await this.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 15000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' },
    body: { query: "update reviews set site_metaobject_id = '" + obj.id + "', site_em = now(), status = (case when status = 'pendente' then 'aprovado' else status end), atualizado_em = now() where id = '" + String(r.id).replace(/[^0-9a-f-]/g, '') + "'::uuid" } });
  out.site = { ok: true, id: obj.id, handle: obj.handle };
} catch (err) {
  out.site = { ok: false, erro: String(err.message || err).slice(0, 300) };
}
return [{ json: out }];
