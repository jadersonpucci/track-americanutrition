// No "Gate Idempotencia" do workflow AN Checkout Gate (idempotencia) (htUp2uQx0LpaCwCk), POST /webhook/checkout-gate.
// Recebe o checkout, barra a blocklist, repete a resposta de um envio duplicado (mesma idempotency_key + metodo)
// por ate 30 min e repassa o resto ao Fluxo A (checkout-criar-pedido) ou a assinatura-criar.
// A chave da Supabase fica so no n8n (SUPABASE_SERVICE_KEY aqui).
const item = $input.first().json;
const b = (item && item.body) || item || {};
try {
  const h = (item && item.headers) || {};
  const cip = String(h['cf-connecting-ip'] || h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim();
  if (cip) { b._client_ip = cip; }
} catch (e) {}

const SB = 'https://supabase.americanutrition.com';
const SK = 'SUPABASE_SERVICE_KEY';
const onlyD = (s) => String(s == null ? '' : s).replace(/[^0-9]/g, '');

try {
  const email = String(b.email || b.customer_email || (b.customer && b.customer.email) || '').trim().toLowerCase();
  let tel = onlyD(b.whatsapp || b.telefone || b.phone || (b.customer && b.customer.phone) || '');
  if (tel.length >= 10 && tel.indexOf('55') !== 0) { tel = '55' + tel; }
  const cpf = onlyD(b.cpf || b.documento || b.document || (b.customer && b.customer.document) || '');
  const alvos = [];
  if (email) { alvos.push({ t: 'email', v: email }); }
  if (tel) { alvos.push({ t: 'telefone', v: tel }); }
  if (cpf) { alvos.push({ t: 'cpf', v: cpf }); }
  if (alvos.length) {
    const ors = alvos.map(function (a) { return 'and(tipo.eq.' + a.t + ',valor.eq.' + encodeURIComponent(a.v) + ')'; }).join(',');
    const url = SB + '/rest/v1/cliente_blocklist?ativo=eq.true&select=tipo,valor&or=(' + ors + ')';
    const hit = await this.helpers.httpRequest({ method: 'GET', url: url, json: true, timeout: 6000, headers: { apikey: SK, Authorization: 'Bearer ' + SK } });
    if (Array.isArray(hit) && hit.length) {
      return [{ json: { status: 'blocked', error: true, message: 'Nao foi possivel concluir este pedido. Entre em contato com o suporte.', _blocked_by: hit.map(function (x) { return x.tipo; }).join(',') } }];
    }
  }
} catch (eBL) { }

const CREATE_URL = (b && b.assinatura === true) ? 'https://n8n.americanutrition.com/webhook/assinatura-criar' : 'https://n8n.americanutrition.com/webhook/checkout-criar-pedido';
const criar = async () => { return await this.helpers.httpRequest({ method: 'POST', url: CREATE_URL, body: b, json: true, timeout: 60000 }); };
let key = '';
let store = null;
let replay = null;
const metodo = String((b && b.payment_method) || '').toLowerCase();
try {
  const kBase = (b && b.idempotency_key) ? String(b.idempotency_key) : '';
  key = kBase ? (kBase + '|' + (metodo || 'na')) : '';
  if (key) {
    const sd = $getWorkflowStaticData('global');
    if (!sd.intents) { sd.intents = {}; }
    store = sd.intents;
    const rec = store[key];
    // 30/10/2026: so repete a resposta por 30 min (clique duplo, recarregar a pagina). Antes repetia por ate 14 dias:
    // a chave do carrinho fica salva no celular para sempre, e a Rosana voltou com o mesmo carrinho 7 dias depois e
    // recebeu o PIX de 23/10, ja vencido (Inter responde 404 e o banco diz que o codigo e invalido). Quem recomprava o
    // mesmo carrinho em ate 14 dias tambem recebia a resposta da compra anterior em vez de um pedido novo.
    const JANELA_REPLAY = 30 * 60000;
    if (rec && rec.response && rec.ts && (Date.now() - rec.ts) < JANELA_REPLAY) {
      const st = String(rec.response.status || '').toLowerCase();
      const FAIL = ['failed','not_authorized','refused','canceled','voided','error','with_error'];
      const mResp = String(rec.response.payment_method || '').toLowerCase();
      const mesmoMetodo = (!mResp || !metodo) ? true : (mResp === metodo);
      if (FAIL.indexOf(st) < 0 && mesmoMetodo) { replay = rec.response; }
    }
  }
} catch (e) { key=''; store=null; replay=null; }
if (replay) { const out = Object.assign({}, replay, { duplicate: true }); return [{ json: out }]; }
const res = await criar();

try {
  const src = b.an_src || null;
  const oid = String((res && (res.order_id || res.id || res.pagarme_order || res.order)) || '');
  if (oid) {
    const PAGOS = ['google_ads','meta_ads','outro_pago'];
    const canal = src && src.canal ? String(src.canal) : 'nenhum';
    const cupons = [];
    try {
      if (b.coupon) { cupons.push(String(b.coupon)); }
      if (b.cupom) { cupons.push(String(b.cupom)); }
      if (Array.isArray(b.discount_codes)) { b.discount_codes.forEach(function(c){ cupons.push(String(c)); }); }
    } catch (eC) {}
    let temAff = false;
    try {
      if (cupons.length) {
        const uAff = SB + '/rest/v1/afiliados?select=cupom_code&cupom_code=in.(' + encodeURIComponent(cupons.join(',')) + ')';
        const rAff = await this.helpers.httpRequest({ method: 'GET', url: uAff, json: true, timeout: 5000, headers: { apikey: SK, Authorization: 'Bearer ' + SK } });
        if (Array.isArray(rAff) && rAff.length) { temAff = true; }
      }
    } catch (eA) {}
    const refAff = String(b.ref || '').trim();
    if (refAff) { temAff = true; }
    const ehPago = PAGOS.indexOf(canal) >= 0;
    let dias = null, dentroJanela = true;
    try {
      if (src && src.ultimo) {
        dias = (Date.now() - new Date(src.ultimo).getTime()) / 86400000;
        dentroJanela = dias <= 30;
      }
    } catch (eD) {}
    const eleg = ehPago && !temAff && dentroJanela;
    let motivo = 'ok';
    if (!ehPago) { motivo = 'nao veio de trafego pago'; }
    else if (temAff) { motivo = 'venda com cupom/ref de afiliado'; }
    else if (!dentroJanela) { motivo = 'fora da janela de 30 dias'; }
    const row = {
      order_id: oid,
      canal: canal,
      fonte: src && src.fonte ? String(src.fonte) : null,
      gclid: src && src.gclid ? String(src.gclid).slice(0,300) : null,
      fbclid: src && src.fbclid ? String(src.fbclid).slice(0,300) : null,
      utm_source: src && src.utm_source ? String(src.utm_source).slice(0,120) : null,
      utm_medium: src && src.utm_medium ? String(src.utm_medium).slice(0,120) : null,
      utm_campaign: src && src.utm_campaign ? String(src.utm_campaign).slice(0,200) : null,
      utm_content: src && src.utm_content ? String(src.utm_content).slice(0,200) : null,
      utm_term: src && src.utm_term ? String(src.utm_term).slice(0,200) : null,
      referrer: src && src.referrer ? String(src.referrer).slice(0,300) : null,
      primeiro_clique: src && src.primeiro ? src.primeiro : null,
      ultimo_clique: src && src.ultimo ? src.ultimo : null,
      dias_ate_compra: (dias === null ? null : Math.round(dias * 100) / 100),
      order_value: Number(b.amount_total || 0) / 100,
      cupons: cupons,
      tem_cupom_afiliado: temAff,
      elegivel_paulo: eleg,
      motivo: motivo
    };
    await this.helpers.httpRequest({
      method: 'POST', url: SB + '/rest/v1/trafego_atribuicao', json: true, timeout: 6000,
      headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
      body: row
    });
  }
} catch (eTR) { }

try {
  if (store && key) {
    store[key] = { response: res, ts: Date.now() };
    const now = Date.now(); const MAXAGE = 14*86400000;
    const allk = Object.keys(store);
    for (let i=0;i<allk.length;i++){ const k=allk[i]; if (store[k] && store[k].ts && (now - store[k].ts) > MAXAGE) { delete store[k]; } }
    const ks = Object.keys(store);
    if (ks.length > 3000) { ks.sort((a,c)=>(store[a].ts||0)-(store[c].ts||0)); const drop=ks.length-3000; for (let i=0;i<drop;i++){ delete store[ks[i]]; } }
  }
} catch (e) {}
return [{ json: res }];
