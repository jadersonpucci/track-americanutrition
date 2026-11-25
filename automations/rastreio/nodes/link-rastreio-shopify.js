// No 'Corrigir links' do workflow AN - Link de rastreio na Shopify (a cada 5 min).
//
// 04/11/2026, pedido do Jaderson: o link de rastreio do pedido na Shopify tem de ser sempre o nosso
// (https://track.americanutrition.com/CODIGO), nunca correios.com.br, rastreio.frenet.com.br ou ups.com. Desde 26/10 a
// equipe tambem lanca o codigo com espacos ('AP 694 051 291 BR'), o que impedia o rastreio personalizado de achar o
// pedido (pagina sem os frascos).
// A cada 5 min, os pedidos atualizados nas ultimas 3 h: em cada envio, tira os espacos do codigo e troca o link pelo
// track.americanutrition.com, sem avisar a cliente (notifyCustomer false). Pedido ja certo nao e tocado.
// O e-mail de envio sai na hora em que a equipe marca o pedido como enviado, antes desta correcao: o link do e-mail
// vem do modelo "Confirmacao de envio" da Shopify (Configuracoes > Notificacoes), que tambem aponta para o nosso site.
const ADM = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const BASE = 'https://track.americanutrition.com/';
const self = this;
const ent = ($input.first() && $input.first().json) || {};
const horas = Number(ent.horas) > 0 ? Number(ent.horas) : 3;

async function gql(query, variables) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: ADM, json: true, timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const d = r && r.dados;
  if (!d || !d.data) throw new Error('Shopify: ' + JSON.stringify((d && d.errors) || r).slice(0, 300));
  return d.data;
}
const limpa = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const desde = new Date(Date.now() - horas * 3600000).toISOString();
const Q = 'query($q:String!,$a:String){ orders(first:100, after:$a, query:$q, sortKey:UPDATED_AT, reverse:true){ pageInfo{ hasNextPage endCursor }'
  + ' nodes{ name fulfillments{ id status trackingInfo{ company number url } } } } }';
const M = 'mutation($id:ID!,$t:FulfillmentTrackingInput!){ fulfillmentTrackingInfoUpdate(fulfillmentId:$id, trackingInfoInput:$t, notifyCustomer:false){'
  + ' userErrors{ field message } } }';

const saida = { desde: desde, vistos: 0, corrigidos: [], erros: [] };
let cursor = null;
for (let pg = 0; pg < 10; pg++) {
  const res = (await gql(Q, { q: "updated_at:>='" + desde + "' fulfillment_status:shipped", a: cursor })).orders;
  for (const o of res.nodes || []) {
    for (const f of o.fulfillments || []) {
      if (/CANCEL/i.test(String(f.status || ''))) continue;
      const ti = (f.trackingInfo || []).filter((t) => limpa(t.number));
      if (!ti.length) continue;
      saida.vistos++;
      const nums = ti.map((t) => limpa(t.number));
      const urls = nums.map((n) => BASE + n);
      const certo = ti.every((t, i) => String(t.number) === nums[i] && String(t.url || '') === urls[i]);
      if (certo) continue;
      const t = { company: ti[0].company || undefined };
      if (nums.length === 1) { t.number = nums[0]; t.url = urls[0]; } else { t.numbers = nums; t.urls = urls; }
      try {
        const r = await gql(M, { id: f.id, t: t });
        const ue = r.fulfillmentTrackingInfoUpdate.userErrors || [];
        if (ue.length) saida.erros.push({ pedido: o.name, erro: JSON.stringify(ue).slice(0, 200) });
        else saida.corrigidos.push({ pedido: o.name, codigo: nums.join(','), antes: ti.map((x) => x.url || '').join(',') });
      } catch (e) { saida.erros.push({ pedido: o.name, erro: String(e.message).slice(0, 200) }); }
    }
  }
  if (!res.pageInfo || !res.pageInfo.hasNextPage) break;
  cursor = res.pageInfo.endCursor;
}
return [{ json: saida }];
