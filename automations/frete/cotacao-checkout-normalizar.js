// No "Normalizar Opcoes + Regra Gratis" do workflow "Envia.com — Cotacao de Frete" (lszlpy1Pl4dnHW2w),
// POST /webhook/frete-cotacao, usado pelo checkout (checkout.americanutrition.com).
//
// 04/11/2026, pedido do Jaderson: a cotacao do checkout passa a vir da FRENET (antes: Envia, com a Frenet so de
// reserva quando a Envia nao devolvia Correios), e todo valor de frete leva +2% (MARGEM).
//   - Frenet: POST api.frenet.com.br/shipping/quote, mesmo pacote de antes (16 x 11 x 6 cm, 0,25 kg por frasco,
//     minimo 0,3 kg), origem CD Santos 11060230. Ficam Correios (SEDEX e PAC) e J&T, como era na Envia.
//     Jadlog vem na resposta e fica de fora (TRANSPORTADORAS).
//   - Envia: continua sendo chamada pelo no anterior e so entra se a Frenet falhar ou nao devolver nada.
//   - +2% em toda opcao paga, Frenet ou Envia, arredondado no centavo. Frete Gratis continua R$ 0.
// Mantidos: sem SEDEX Hoje, sem J&T para o Para, Frete Gratis acima de R$ 250 (10 a 15 dias uteis), aviso de greve
// (desligado), ordenacao por prazo. O no seguinte ("Renomear JT") soma 2 dias ao prazo e renomeia o J&T.
const FRENET_TOKEN = '<FRENET_TOKEN>';
const MARGEM = 0.02;
const TRANSPORTADORAS = /correios|j\s*&\s*t|jt\b/i;

const responses = $input.all();
const mr = $('Montar Requisicao Envia').first().json;
const sub = mr.subtotal;
const mais = (p) => Math.round(Number(p) * (1 + MARGEM) * 100) / 100;

// ---- chave da greve dos Correios ----
// DESLIGADO em 18/09/2026 a pedido do Jaderson (greve encerrada). Para religar,
// voltar para true e ajustar a data. Desliga junto o aviso E a prioridade da
// transportadora (o no "Renomear JT" le a presenca do aviso).
const AVISO_CORREIOS_ATIVO = false;
const AVISO_CORREIOS_ATE   = '2026-10-15';   // AAAA-MM-DD
let greveAtiva = false;
try {
  greveAtiva = AVISO_CORREIOS_ATIVO && (new Date() <= new Date(AVISO_CORREIOS_ATE + 'T23:59:59-03:00'));
} catch (e) { greveAtiva = false; }
const ehCorreios = o => /correios|sedex|pac/i.test(String(o.carrier || '') + ' ' + String(o.service || ''));

function traduzEta(s){
  if (s == null) return '';
  let t = String(s);
  t = t.replace(/Próximo día/gi, '1 dia útil');
  t = t.replace(/Proximo dia/gi, '1 dia útil');
  t = t.replace(/O mesmo día/gi, 'no mesmo dia');
  t = t.replace(/O mesmo dia/gi, 'no mesmo dia');
  t = t.replace(/El mismo día/gi, 'no mesmo dia');
  t = t.replace(/días/gi, 'dias');
  t = t.replace(/día/gi, 'dia');
  t = t.replace(/dias hábiles/gi, 'dias úteis');
  t = t.replace(/hábiles/gi, 'úteis');
  t = t.replace(/(\d+)\s*-\s*(\d+)\s*dias?/gi, '$1 a $2 dias úteis');
  if (/dias$/i.test(t.trim())) t = t.trim() + ' úteis';
  return t.trim();
}

function etaDias(eta){
  const t = String(eta||'').toLowerCase();
  if (t.indexOf('mesmo dia') !== -1) return 0;
  const nums = (t.match(/\d+/g) || []).map(Number);
  if (!nums.length) return 999;
  return Math.max.apply(null, nums);
}

let options = [];

// ====================== FRENET (principal) ======================
try {
  const pkg = (mr.enviaBody && mr.enviaBody.packages && mr.enviaBody.packages[0]) || {};
  const dim = pkg.dimensions || { length: 16, width: 11, height: 6 };
  const cepDest = (mr.enviaBody && mr.enviaBody.destination && mr.enviaBody.destination.postalCode) || '';
  const fr = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.frenet.com.br/shipping/quote',
    headers: { token: FRENET_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: {
      SellerCEP: '11060230',
      RecipientCEP: cepDest,
      ShipmentInvoiceValue: Number(sub || 0),
      RecipientCountry: 'BR',
      ShippingItemArray: [{ Height: Number(dim.height||6), Length: Number(dim.length||16), Width: Number(dim.width||11), Weight: Number(pkg.weight||0.3), Quantity: 1, SKU: 'IMUNOFOSFO', Category: 'Suplementos' }]
    },
    json: true,
    timeout: 12000
  });
  ((fr && fr.ShippingSevicesArray) || []).forEach(function(s){
    if (!s || s.Error === true) return;
    const transp = String(s.Carrier || '');
    if (!TRANSPORTADORAS.test(transp)) return;
    if (/sedex\s*hoje/i.test(String(s.ServiceDescription || ''))) return;
    const preco = Number(s.ShippingPrice);
    if (!preco || preco <= 0) return;
    const dias = parseInt(s.DeliveryTime, 10);
    const jt = /j\s*&\s*t|jt\b/i.test(transp);
    const svc = jt ? 'J&T Express' : (String(s.ServiceDescription||'').split('-').pop().trim() || 'Correios');
    const etaTxt = isNaN(dias) ? '' : ((dias === 1) ? '1 dia útil' : (dias + ' dias úteis'));
    options.push({
      id: 'frenet-' + (jt ? 'jtexpress' : 'correios') + '-' + String(s.ServiceCode || svc).toLowerCase(),
      carrier: jt ? 'jtexpress' : 'correios',
      service: svc,
      price: mais(preco),
      eta: etaTxt,
      eta_dias: isNaN(dias) ? 999 : dias,
      eta_aprox: true,
      fonte: 'frenet'
    });
  });
} catch (e) { options = []; }

// ====================== ENVIA (reserva) ======================
if (!options.length) {
  for (const it of responses) {
    const r = (it && it.json) ? it.json : {};
    const arr = (r.data || r.rates || []);
    if (Array.isArray(arr)) {
      arr.forEach(function(x){
        if (!x || x.totalPrice == null) return;
        const svcId = String(x.service || '').toLowerCase();
        if (svcId.indexOf('sedex_hoje') !== -1 || /sedex\s*hoje/i.test(x.serviceDescription || '')) return;
        const eta = traduzEta(x.deliveryEstimate || x.deliveryDate || '');
        options.push({
          id: (x.carrier||'') + '-' + (x.service||''),
          carrier: x.carrier || '',
          service: x.serviceDescription || x.service || 'Transportadora',
          price: mais(x.totalPrice),
          eta: eta,
          eta_dias: etaDias(eta),
          eta_aprox: true,
          fonte: 'envia'
        });
      });
    }
  }
}
const seen = {};
options = options.filter(function(o){ const k = o.service + '|' + o.price; if (seen[k]) return false; seen[k] = 1; return true; });

// ================= BLOQUEIO J&T PARA O PARA (PA) =================
let destinoPA = false;
try {
  const dest = (mr.enviaBody || {}).destination || {};
  const uf = String(dest.state || '').trim().toUpperCase();
  const cepNum = parseInt(String(dest.postalCode || '').replace(/[^0-9]/g, ''), 10);
  const cepPA = !isNaN(cepNum) && cepNum >= 66000000 && cepNum <= 68899999;
  destinoPA = (uf === 'PA' || uf === 'PARA' || uf === 'PARÁ' || cepPA);
} catch (e) { destinoPA = false; }
if (destinoPA) {
  options = options.filter(function(o){
    const alvo = String(o.carrier || '') + ' ' + String(o.service || '') + ' ' + String(o.id || '');
    return !/j\s*&?\s*t|jtexpress|jt_/i.test(alvo);
  });
}

// Frete Gratis entra na lista para ser ordenado junto (prazo fixo 10 a 15 dias uteis)
if (sub >= 250) {
  options.push({ id: 'gratis', carrier: 'America Nutrition', service: 'Frete Grátis', price: 0, eta: '10 a 15 dias úteis', eta_dias: 15, eta_aprox: false });
}

// ====================== ORDENACAO ======================
if (greveAtiva) {
  options.sort(function(a,b){
    const pa = ehCorreios(a) ? 1 : 0;
    const pb = ehCorreios(b) ? 1 : 0;
    return (pa - pb) || (a.eta_dias - b.eta_dias) || (a.price - b.price);
  });
} else {
  options.sort(function(a,b){ return (a.eta_dias - b.eta_dias) || (a.price - b.price); });
}

// ============ AVISO DE GREVE DOS CORREIOS ============
let aviso = null;
try {
  const temCorreiosNaLista = options.some(function(o){ return /correios/i.test(o.carrier); });
  const temAlternativa = options.some(function(o){ return !ehCorreios(o) && o.price > 0; });
  if (greveAtiva && temCorreiosNaLista) {
    aviso = {
      tipo: 'greve_correios',
      titulo: 'Correios em greve',
      texto: temAlternativa
        ? 'As entregas pelos Correios podem atrasar enquanto durar a paralisação. Deixamos a transportadora no topo da lista — por ela, o prazo segue normal.'
        : 'As entregas pelos Correios podem atrasar enquanto durar a paralisação. Seu pedido é postado normalmente, mas o prazo pode variar.'
    };
  }
} catch (e) { aviso = null; }

return [{ json: { options: options, free_shipping: sub >= 250, eta_obs: 'Prazo estipulado pela transportadora', aviso: aviso } }];
