// No "Site: Preparar Upload" do workflow AN - Reviews Enviar p/ Grupos (PQpcMivb7NabvzrO), depois do Agendar Broadcast.
// 30/10/2026: o botao mandava o card do depoimento so para o grupo de WhatsApp e o Telegram. A pagina
// americanutrition.com/pages/depoimentos le os metaobjects "depoimento" da Shopify, entao nada do que saia pelo
// botao aparecia no site. Agora o mesmo card (PNG 1080x1920) sobe para os Arquivos da Shopify e vira um
// metaobject depoimento (tipo imagem, ativo), em tres passos:
//   Site: Preparar Upload (este) -> Site: Subir PNG (HTTP PUT do binario) -> Site: Criar Depoimento.
// O PUT fica num node HTTP porque um Buffer mandado de dentro do Code node chega na Shopify como
// application/octet-stream e o arquivo falha (UNSUPPORTED_IMAGE_FILE_TYPE).
// Modo so-site: POST /webhook/reviews-grupos {k, id, site:true} publica no site sem mandar nos grupos. A Entrada
// trata esse modo como preview (o Montar Card gera o PNG e o Agendar Broadcast nao grava nada), entao a senha do
// painel (r.auth) e conferida aqui. O id do metaobject fica em reviews.site_metaobject_id, para nao duplicar.
const m = $('Montar Card').first().json;
const e = $('Entrada').first().json;
const r = $('Buscar Review').first().json || {};
const ag = $input.first().json || {};
const out = Object.assign({}, ag, { site: null, subir: false });

if (e.site && m.acao === 'preview' && !r.auth) {
  out.site = { ok: false, erro: 'Acesso negado' };
  return [{ json: out }];
}
const publicar = (m.acao === 'agendar' && ag.bid) || (e.site && m.acao === 'preview');
if (!publicar) return [{ json: out }];
if (r.site_metaobject_id && !e.force) {
  out.site = { ok: true, ja: true, id: r.site_metaobject_id };
  return [{ json: out }];
}

try {
  const buf = Buffer.from(m.b64, 'base64');
  const resp = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: {
      query: 'mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl } userErrors{ field message } } }',
      variables: { input: [{ resource: 'IMAGE', filename: m.arquivo, mimeType: 'image/png', httpMethod: 'PUT', fileSize: String(buf.length) }] } } } });
  const st = resp && resp.dados && resp.dados.data && resp.dados.data.stagedUploadsCreate;
  const alvo = st && st.stagedTargets && st.stagedTargets[0];
  if (!alvo) throw new Error('staged: ' + JSON.stringify((st && st.userErrors) || resp).slice(0, 300));
  out.subir = true;
  out.upload_url = alvo.url;
  out.resource_url = alvo.resourceUrl;
  return [{ json: out, binary: { data: await this.helpers.prepareBinaryData(buf, m.arquivo, 'image/png') } }];
} catch (err) {
  out.site = { ok: false, erro: String(err.message || err).slice(0, 300) };
  return [{ json: out }];
}
