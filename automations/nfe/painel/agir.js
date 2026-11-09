// Painel de NF-e, no 'Agir'. Le o pedido na Shopify (pela ponte shopify-admin) e decide a rota:
//  - 'robo': emitir sem correcao -> chama o robo AN · NF-e Focus (/webhook/nfe-focus?pedido=...&modo=on);
//  - 'corrigir': com CPF/CNPJ e/ou IE -> pega o payload que o robo ja montou (nfe_emissoes.payload), troca o
//    destinatario e reenvia para a Focus com a mesma ref. Caso AN-16477 (09/11/2026): CNPJ de empresa contribuinte
//    em SP, rejeicao 232 "IE do destinatario nao informada";
//  - 'nada': so consulta, ou nao da para emitir (avisos explicam).
// Sem chave nenhuma aqui: Focus e robo sao chamados por nos HTTP com credenciais do n8n.
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
const P = $('Preparar').first().json;
const row = $('Ler NF-e').first().json || {};
if (!P.ok) return [{ json: { ok: false, rota: 'nada', erro: P.erro, pedido: P.pedido, avisos: [] } }];

const dig = (s) => String(s == null ? '' : s).replace(/\D/g, '');
async function gql(query, variables) {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query, variables: variables || {} } } });
  const d = resp && resp.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || resp).slice(0, 300));
  return d.data;
}

const d = await gql('query($q:String!){ orders(first:3, query:$q){ nodes{ id name createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt'
  + ' currentTotalPriceSet{ shopMoney{ amount } } shippingAddress{ name city provinceCode } customAttributes{ key value }'
  + ' localizationExtensions(first:5){ nodes{ purpose title value } } metafields(namespace:"nfe", first:10){ nodes{ key value } } } } }', { q: 'name:' + P.pedido });
const o = ((d.orders || {}).nodes || []).find((x) => String(x.name).toUpperCase() === P.pedido);
if (!o) return [{ json: { ok: false, rota: 'nada', erro: 'Pedido ' + P.pedido + ' não encontrado na Shopify.', pedido: P.pedido, avisos: [] } }];
const mf = {}; (((o.metafields || {}).nodes) || []).forEach((m) => { mf[m.key] = m.value; });
const attr = (k) => { const a = (o.customAttributes || []).find((x) => String(x.key).toLowerCase() === k.toLowerCase()); return a ? a.value : ''; };
let doc = '';
for (const x of ((o.localizationExtensions || {}).nodes || [])) { if (/TAX|CPF|CNPJ/i.test(String(x.purpose) + String(x.title))) doc = dig(x.value); }
if (!doc) doc = dig(attr('CPF') || attr('CNPJ'));
const sa = o.shippingAddress || {};

const out = { ok: true, rota: 'nada', pedido: o.name, acao: P.acao, avisos: [],
  shopify: { id: o.id, cliente: sa.name || '', cidade: [sa.city, sa.provinceCode].filter(Boolean).join(' / '), total: Number(o.currentTotalPriceSet.shopMoney.amount),
    pagamento: o.displayFinancialStatus, envio: o.displayFulfillmentStatus, cancelado: !!o.cancelledAt, criado: o.createdAt, documento: doc },
  mf: { numero: mf.numero || '', chave: mf.chave || '', danfe: mf.danfe_url || '' } };

if (P.acao === 'emitir') {
  if (mf.danfe_url || row.status === 'autorizado') out.avisos.push('Este pedido já tem NF-e autorizada.');
  else if (o.cancelledAt || !/PAID/i.test(o.displayFinancialStatus)) out.avisos.push('Pedido cancelado ou não pago: a NF-e não é emitida.');
  else if (!P.documento && !P.ie) out.rota = 'robo';
  else if (!row.payload) { out.rota = 'robo'; out.avisos.push('O pedido ainda não tinha passado pelo emissor. Rodei o emissor normal; se a SEFAZ recusar, mande a correção de novo.'); }
  else if (!/^(erro|revisar|simulado)$/.test(String(row.status))) out.avisos.push('A NF-e está em "' + row.status + '". A correção só vale para nota recusada ou em revisão.');
  else if (row.status === 'revisar' && !String(row.mensagem || '').split('; ').every((m) => /CPF\/CNPJ/.test(m))) {
    out.avisos.push('O pedido tem outros problemas além do documento: ' + row.mensagem + '. Corrija o pedido na Shopify e toque em Gerar NF-e sem correção.');
  } else {
    const nf = typeof row.payload === 'string' ? JSON.parse(row.payload) : JSON.parse(JSON.stringify(row.payload));
    const novoDoc = P.documento || dig(nf.cpf_destinatario || nf.cnpj_destinatario);
    if (!(novoDoc.length === 11 || novoDoc.length === 14)) out.avisos.push('CPF/CNPJ inválido: use 11 dígitos (CPF) ou 14 (CNPJ).');
    else {
      delete nf.cpf_destinatario; delete nf.cnpj_destinatario; delete nf.inscricao_estadual_destinatario;
      nf.indicador_inscricao_estadual_destinatario = 9;
      if (novoDoc.length === 14) nf.cnpj_destinatario = novoDoc; else nf.cpf_destinatario = novoDoc;
      const desc = ['documento ' + (novoDoc.length === 14 ? 'CNPJ' : 'CPF')];
      if (novoDoc.length === 14 && P.ie) {
        if (/^ISENT/.test(P.ie)) { nf.indicador_inscricao_estadual_destinatario = 2; desc.push('IE isento'); }
        else if (dig(P.ie)) {
          nf.indicador_inscricao_estadual_destinatario = 1;
          nf.inscricao_estadual_destinatario = dig(P.ie);
          desc.push('IE ' + dig(P.ie));
          // Contribuinte de outro estado nao leva a partilha do DIFAL (EC 87 e para nao contribuinte).
          if (Number(nf.local_destino) === 2) (nf.items || []).forEach((it) => { Object.keys(it).forEach((k) => {
            if (/_uf_destino$|_uf_remetente$|^icms_aliquota_interestadual$|^icms_percentual_partilha$/.test(k)) delete it[k]; }); });
        }
      }
      nf.data_emissao = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19) + '-03:00';
      out.rota = 'corrigir';
      out.nf = nf;
      out.correcao = desc.join(', ');
    }
  }
}
return [{ json: out }];
