// =============================================================================
// BOLETO PERSONALIZADO — America Nutrition
// Emitir  : GET /webhook/boleto?l=<linha>&n=<nome>&d=<cpf>&p=<pedido>&it=<itens>&end=<end>
// Conferir: GET /webhook/boleto?c=<codigo de verificacao>
//
// Os dados saem da PROPRIA linha digitavel (codigo de barras, vencimento, valor,
// nosso numero) — sem API e sem credencial. Ao emitir, o boleto e registrado no
// banco; a pagina de conferencia le DE LA, sendo fonte independente do papel.
// A SITUACAO (aguardando/pago) e consultada ao vivo em pagarme_orders.
//
// MODO INTER (boleto hibrido "bolepix", banco 077): o boleto e emitido pela Cobranca v3 do Banco Inter e a pagina
// sai com o MESMO visual da America Nutrition, trocando so o banco (logo/beneficiario Inter) e somando o bloco PIX
// (QR Code + copia e cola). Nosso numero, PIX e situacao vem de checkout_boleto_inter (pela linha digitavel);
// a situacao ao vivo e confirmada em /webhook/boleto-inter-status. Parametro opcional &b=inter (fallbacks &nn= e &pix=).
// =============================================================================
const q = ($input.first().json.query) || {};

const so = s => String(s == null ? '' : s);
const dig = s => so(s).replace(/[^0-9]/g, '');
const esc = s => so(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => Number(v).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const esq = s => so(s).replace(/'/g, "''");

const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
const PG = 'https://supabase.americanutrition.com/pg/query';
const sql = async function(texto){
  try {
    const r = await this.helpers.httpRequest({ method:'POST', url:PG, headers:{apikey:SK, Authorization:'Bearer '+SK, 'Content-Type':'application/json'}, body:{query:texto}, json:true, timeout:8000 });
    return Array.isArray(r) ? r : [];
  } catch(e) { return []; }
}.bind(this);

const situacaoPag = async function(doc, valor){
  try {
    if (!doc) return null;
    const cents = Math.round(Number(valor) * 100);
    const r = await sql("SELECT status, to_char(paid_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS pago_em FROM pagarme_orders WHERE payment_method='boleto' AND customer_document='" + esq(doc) + "' AND amount_total=" + cents + " ORDER BY created_at DESC LIMIT 1;");
    const x = (r && r[0]) ? r[0] : null;
    if (!x) return null;
    return { pago: String(x.status) === 'paid', pagoEm: x.pago_em || '' };
  } catch(e) { return null; }
};
function selo(sit){
  if (sit && sit.pago) { return '<span class="st ok">\u2705 Pago' + (sit.pagoEm ? ' em ' + sit.pagoEm : '') + '</span>'; }
  return '<span class="st">\u23f3 Aguardando pagamento</span>';
}

function codigoDe(linha){
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i=0;i<linha.length;i++){
    h1 = ((h1 ^ linha.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + linha.charCodeAt(i) * (i+7)) * 2654435761) >>> 0;
  }
  const AB = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '', n1 = h1, n2 = h2;
  for (let i=0;i<4;i++){ out += AB[n1 % 32]; n1 = Math.floor(n1/32); }
  for (let i=0;i<4;i++){ out += AB[n2 % 32]; n2 = Math.floor(n2/32); }
  return out;
}

const LOGO = 'https://cdn.shopify.com/s/files/1/0643/9000/4908/t/26/assets/logo-america-nutrition.png';
const LOGO_BANCO = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/banco-stone-197.png';
const LOGO_INTER = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/logos/20260919-96m6vu56.png';
const BASE = 'https://n8n.americanutrition.com/webhook/boleto';
const BASE_N8N = 'https://n8n.americanutrition.com';
const DV_BANCO = { '077': '9', '197': '1', '341': '7', '001': '9', '237': '2', '033': '7', '104': '0' };

// Boleto hibrido do Inter: registro em checkout_boleto_inter pela linha digitavel (nosso numero, PIX, situacao)
const interPorLinha = async function(l){
  l = dig(l);
  if (!l || l.slice(0,3) !== '077') return null;
  const r = await sql("SELECT codigo_solicitacao, nosso_numero, pix_copia_cola, status, pedido_shopify, (confirmado_em IS NOT NULL) AS pago, to_char(coalesce(pago_em, confirmado_em) AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS pago_em FROM checkout_boleto_inter WHERE linha_digitavel='" + esq(l) + "' ORDER BY criado_em DESC LIMIT 1;");
  return (r && r[0]) ? r[0] : null;
};
// Situacao do boleto Inter: pago se ja confirmado; senao pergunta ao vivo (o status consulta o Inter e confirma se pagou)
const situacaoInter = async function(reg){
  if (!reg) return null;
  if (reg.pago) return { pago: true, pagoEm: reg.pago_em || '' };
  try {
    const r = await this.helpers.httpRequest({ method:'GET', url: BASE_N8N + '/webhook/boleto-inter-status?order_id=interb_' + encodeURIComponent(reg.codigo_solicitacao), json:true, timeout:12000 });
    if (r && r.paid) return { pago: true, pagoEm: '' };
  } catch(e) {}
  return { pago: false, pagoEm: '' };
}.bind(this);

const CSS_BASE = `
:root{--az:#07388E;--vm:#AD0404;--tinta:#0B1220;--cinza:#6B7686;--linha:#D9DFEA;--verde:#0E7A4A}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Barlow',Arial,sans-serif;background:#EEF2F8;color:var(--tinta);padding:22px 12px 60px;-webkit-font-smoothing:antialiased}
.folha{max-width:860px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 8px 34px rgba(11,18,32,.10);overflow:hidden}
.st{display:inline-flex;align-items:center;gap:6px;background:#FFF8E8;border:1px solid #F2D999;color:#7A5A12;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;letter-spacing:0}
.st.ok{background:#F1FAF6;border-color:#BFE6D4;color:var(--verde)}
`;

// ===================== MODO CONFERENCIA =====================
const codConsulta = so(q.c || q.codigo).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
if (codConsulta && !dig(q.l || q.linha)) {
  let reg = null;
  if (/^[A-Z0-9]{6,10}$/.test(codConsulta)) {
    const r = await sql("SELECT codigo, linha, pedido, nome, documento, valor, to_char(vencimento,'DD/MM/YYYY') AS venc, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS emitido FROM boletos_emitidos WHERE codigo='" + esq(codConsulta) + "' LIMIT 1;");
    reg = (r && r[0]) ? r[0] : null;
    if (reg) { await sql("UPDATE boletos_emitidos SET acessos = acessos + 1 WHERE codigo='" + esq(codConsulta) + "';"); }
  }
  const regInterC = reg ? await interPorLinha(so(reg.linha)) : null;
  const sitC = regInterC ? await situacaoInter(regInterC) : (reg ? await situacaoPag(so(reg.documento), reg.valor) : null);
  const lin = reg ? so(reg.linha) : '';
  const linFmt = lin.length === 47
    ? lin.slice(0,5)+'.'+lin.slice(5,10)+' '+lin.slice(10,15)+'.'+lin.slice(15,21)+' '+lin.slice(21,26)+'.'+lin.slice(26,32)+' '+lin.slice(32,33)+' '+lin.slice(33)
    : '';
  const primeiroNome = reg ? esc(so(reg.nome).split(' ')[0]) : '';

  const htmlConf = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conferência de boleto · America Nutrition</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS_BASE}
.topo{display:flex;align-items:center;gap:16px;padding:20px 26px;position:relative}
.topo:after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--az) 0 58%,var(--vm) 58% 100%)}
.topo img{height:36px}
.topo h1{font-family:'Barlow Condensed',sans-serif;font-size:19px;line-height:1.1}
.topo p{font-size:12px;color:var(--cinza)}
.cont{padding:24px 26px 30px}
.selo{display:flex;align-items:center;gap:12px;background:#F1FAF6;border:1px solid #BFE6D4;border-radius:12px;padding:14px 16px;margin-bottom:18px}
.selo.ruim{background:#FDECEC;border-color:#F1BDBD}
.selo b{font-size:15px}
.selo p{font-size:13px;color:var(--cinza);margin-top:2px}
.dado{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px dashed var(--linha);font-size:14.5px}
.dado:last-of-type{border-bottom:0}
.dado span{color:var(--cinza)}
.dado b{text-align:right;word-break:break-all}
.grande{color:var(--verde);font-size:19px;font-family:'Barlow Condensed',sans-serif}
.alerta{margin-top:20px;background:#FFF8E8;border:1px solid #F2D999;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:#7A5A12}
.busca{display:flex;gap:8px;margin-top:16px}
.busca input{flex:1;border:1.5px solid var(--linha);border-radius:10px;padding:12px;font-family:inherit;font-size:15px;text-transform:uppercase}
.busca button{border:0;background:var(--az);color:#fff;border-radius:10px;padding:0 20px;font-weight:700;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="folha">
  <div class="topo">
    <img src="${LOGO}" alt="America Nutrition">
    <div><h1>AMERICA NUTRITION</h1><p>Conferência de boleto</p></div>
  </div>
  <div class="cont">
  ${reg ? `
    <div class="selo">
      <span style="font-size:26px">✅</span>
      <div><b>Boleto legítimo, emitido por nós</b><p>Código ${esc(codConsulta)} · gerado em ${esc(reg.emitido)}</p></div>
    </div>
    <div class="dado"><span>Pedido</span><b>${esc(reg.pedido || '—')}</b></div>
    <div class="dado"><span>Pagador</span><b>${primeiroNome}</b></div>
    <div class="dado"><span>Vencimento</span><b>${esc(reg.venc || '—')}</b></div>
    <div class="dado"><span>Valor</span><b class="grande">R$ ${brl(reg.valor || 0)}</b></div>
    <div class="dado"><span>Situação</span><b>${selo(sitC)}</b></div>
    ${regInterC ? '<div class="dado"><span>Banco</span><b>Banco Inter (077) · boleto com PIX</b></div>' : ''}
    <div class="dado"><span>Linha digitável</span><b>${esc(linFmt)}</b></div>
    <div class="alerta">
      <b>Compare com o seu boleto.</b> Se o valor, o vencimento ou qualquer número da linha digitável estiver diferente do que aparece aqui, <b>não pague</b> e fale com a gente no WhatsApp.<br><br>
      A America Nutrition <b>nunca</b> altera dados bancários por e-mail ou WhatsApp.
    </div>
  ` : `
    <div class="selo ruim">
      <span style="font-size:26px">⚠️</span>
      <div><b>Não encontramos esse código</b><p>Confira se digitou certo. Se veio de um boleto em mãos, não pague antes de falar com a gente.</p></div>
    </div>
    <div class="busca">
      <input id="cod" placeholder="CÓDIGO DO BOLETO" value="${esc(codConsulta)}">
      <button onclick="location.href='${BASE}?c='+encodeURIComponent(document.getElementById('cod').value.trim())">Conferir</button>
    </div>
  `}
  </div>
</div>
</body></html>`;
  return [{ json: { html: htmlConf } }];
}

// ===================== MODO EMISSAO =====================
const linha = dig(q.l || q.linha);
if (linha.length !== 47) { return [{ json: { erro: 'linha digitavel invalida' } }]; }

const banco = linha.slice(0,3);
const c1 = linha.slice(4,9), c2 = linha.slice(10,20), c3 = linha.slice(21,31);
const dvGeral = linha[32], fator = linha.slice(33,37), valorRaw = linha.slice(37,47);
const barras = banco + linha[3] + dvGeral + fator + valorRaw + c1 + c2 + c3;
const nossoNumeroLinha = (c1 + c2 + c3).slice(-20);

function dataDoFator(f) {
  const n = parseInt(f, 10), dia = 86400000;
  const antiga = new Date(Date.UTC(1997,9,7) + n*dia);
  const nova   = new Date(Date.UTC(2025,1,22) + (n-1000)*dia);
  return (antiga < new Date(Date.now() - 60*dia)) ? nova : antiga;
}
const dVenc = dataDoFator(fator);
const iso = dVenc.toISOString().slice(0,10);
const vencimento = iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const valorNum = parseInt(valorRaw,10)/100;
const linhaFmt = linha.slice(0,5)+'.'+linha.slice(5,10)+' '+linha.slice(10,15)+'.'+linha.slice(15,21)+' '+linha.slice(21,26)+'.'+linha.slice(26,32)+' '+linha.slice(32,33)+' '+linha.slice(33);

function barcodeSVG(codigo) {
  const P = ['nnwwn','wnnnw','nwnnw','wwnnn','nnwnw','wnwnn','nwwnn','nnnww','wnnwn','nwnwn'];
  const N = 1, W = 3;
  let x = 0, out = '';
  const add = (l, cheio) => { if (cheio) out += '<rect x="'+x+'" y="0" width="'+l+'" height="50" fill="#000"/>'; x += l; };
  add(N,1); add(N,0); add(N,1); add(N,0);
  const c = codigo.length % 2 ? '0'+codigo : codigo;
  for (let i=0;i<c.length;i+=2){
    const a = P[+c[i]], b = P[+c[i+1]];
    for (let k=0;k<5;k++){ add(a[k]==='w'?W:N,1); add(b[k]==='w'?W:N,0); }
  }
  add(W,1); add(N,0); add(N,1);
  return '<svg class="barcode" viewBox="0 0 '+x+' 50" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'+out+'</svg>';
}

const nome = esc(q.n || q.nome || 'Pagador');
const docCli = dig(q.d || q.doc);
const docFmt = docCli.length === 11 ? docCli.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')
  : (docCli.length === 14 ? docCli.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5') : docCli);
const pedido = esc(q.p || q.pedido || '');
const endereco = esc(q.end || '');
const itensTxt = so(q.it || q.itens || '');
const listaItens = itensTxt.split('|').map(function(t){
  const partes = t.split('=');
  return { nome: esc(so(partes[0]).trim()), valor: esc(so(partes[1] || '').trim()) };
}).filter(function(x){ return x.nome; });
const resumoItens = listaItens.length ? (listaItens.length > 1 ? listaItens.length + ' itens' : listaItens[0].nome) : '';

const COD = codigoDe(linha);
const URL_CONF = BASE + '?c=' + COD;
// Link curto de conferencia (AN Links / seguro.americanutrition.com), com cache por codigo no staticData
let URL_CONF_CURTA = URL_CONF;
try {
  const sdc = $getWorkflowStaticData('global'); sdc.curtos = sdc.curtos || {};
  if (sdc.curtos[COD]) { URL_CONF_CURTA = sdc.curtos[COD]; }
  else {
    const enc = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/encurtar-url', json: true, timeout: 8000, body: { url: URL_CONF } });
    if (enc && enc.shortLink && /^https?:\/\//.test(String(enc.shortLink))) { URL_CONF_CURTA = String(enc.shortLink); sdc.curtos[COD] = URL_CONF_CURTA; }
  }
} catch (e) {}
const URL_CONF_TXT = URL_CONF_CURTA.replace(/^https?:\/\//, '');

// ---- modo Inter (bolepix)
const regInter = await interPorLinha(linha);
const inter = !!regInter || String(q.b || '') === 'inter' || banco === '077';
const nossoNumero = inter ? (so((regInter && regInter.nosso_numero) || q.nn || '').trim() || nossoNumeroLinha) : nossoNumeroLinha;
const pixCopia = inter ? so((regInter && regInter.pix_copia_cola) || q.pix || '').replace(/[<>"'\\]/g, '').trim() : '';
const pixJs = JSON.stringify(pixCopia);
const sit = inter ? await situacaoInter(regInter) : await situacaoPag(docCli, valorNum);
const pago = !!(sit && sit.pago);

try {
  await sql("INSERT INTO boletos_emitidos (codigo, linha, pedido, nome, documento, valor, vencimento, itens) VALUES ('"+esq(COD)+"','"+esq(linha)+"','"+esq(so(q.p||''))+"','"+esq(so(q.n||''))+"','"+esq(docCli)+"',"+valorNum+",'"+iso+"','"+esq(itensTxt)+"') ON CONFLICT (codigo) DO NOTHING;");
} catch(e) {}

const BEN_NOME = inter ? 'AMERICA NUTRITION COMERCIAL LTDA' : 'Pagar.me Pagamentos S/A';
const BEN_CNPJ = inter ? '11.298.909/0001-94' : '18.727.053/0001-74';
const BEN_AG   = inter ? '00019 / 305653768' : '0001 / 1617898';
const LOGO_BCO = inter ? LOGO_INTER : LOGO_BANCO;
const bancoDV  = DV_BANCO[banco] || dvGeral;

const blocoPix = pixCopia
  ? '<div class="pixbox"><div class="pix-qr" id="pixqr"></div><div class="pix-txt">'
    + '<div class="rot">Pague na hora com PIX</div>'
    + '<p>Abra o app do seu banco, escolha <b>Pix &rsaquo; Ler QR Code</b> e aponte para o c\u00f3digo, ou copie o c\u00f3digo abaixo e use o <b>Pix Copia e Cola</b>. A aprova\u00e7\u00e3o \u00e9 imediata e o valor \u00e9 o mesmo do boleto.</p>'
    + '<div class="pix-cod">' + esc(pixCopia) + '</div>'
    + '<button class="bt-copiar" onclick="copiarPix(this)">COPIAR C\u00d3DIGO PIX</button>'
    + '</div></div>'
  : '';

const blocoItens = listaItens.length
  ? '<div class="itens"><div class="rot">Itens do pedido</div><table>' +
    listaItens.map(function(i){ return '<tr><td>'+i.nome+'</td><td class="v">'+(i.valor ? 'R$ '+i.valor : '')+'</td></tr>'; }).join('') +
    '<tr class="tot"><td>Total do documento</td><td class="v">R$ '+brl(valorNum)+'</td></tr></table></div>'
  : '';

const faixaPago = pago
  ? '<div class="pago-faixa">\u2705 <b>Este boleto j\u00e1 foi pago' + (sit.pagoEm ? ' em ' + sit.pagoEm : '') + '.</b> N\u00e3o pague novamente. Seu pedido j\u00e1 est\u00e1 em separa\u00e7\u00e3o \u2014 o rastreio chega no WhatsApp.</div>'
  : '';

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boleto ${pedido} · America Nutrition</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS_BASE}
.acoes{max-width:860px;margin:0 auto 14px;display:flex;gap:10px;flex-wrap:wrap}
.bt{flex:1;min-width:150px;border:0;border-radius:11px;padding:14px;font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700;letter-spacing:.04em;cursor:pointer;text-align:center}
.bt-1{background:var(--az);color:#fff}
.bt-2{background:#fff;color:var(--az);border:1.5px solid var(--linha)}
.pago-faixa{background:#F1FAF6;border-bottom:1px solid #BFE6D4;color:#0B5A38;padding:12px 26px;font-size:13.5px;line-height:1.5}
.topo{display:grid;grid-template-columns:auto 1fr auto;align-items:stretch;gap:20px;padding:18px 26px 20px;position:relative}
.topo:after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--az) 0 58%,var(--vm) 58% 100%)}
.marca{display:flex;flex-direction:column;justify-content:center;gap:7px;padding-right:20px;border-right:1px solid var(--linha)}
.marca img{height:34px;width:auto}
.marca .sub{font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:.16em;color:var(--cinza);text-transform:uppercase}
.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;align-content:center}
.meta div{min-width:0}
.meta small{display:block;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--cinza);margin-bottom:2px}
.meta b{font-family:'Barlow Condensed',sans-serif;font-size:20px;line-height:1.05;color:var(--tinta);display:block}
.meta b.az{color:var(--az)}
.selo-seg{text-align:center;border-left:1px solid var(--linha);padding-left:20px;display:flex;flex-direction:column;justify-content:center;min-width:132px}
.selo-seg .qr{width:86px;height:86px;margin:0 auto}
.selo-seg small{display:block;font-size:9px;line-height:1.35;color:var(--cinza);margin-top:6px}
.selo-seg b{display:block;font-family:'Barlow Condensed',sans-serif;font-size:17px;letter-spacing:.16em;margin-top:2px}
.caixas{display:grid;grid-template-columns:1fr 190px 210px;gap:12px;padding:20px 26px}
.cx{border:1px solid var(--linha);border-radius:11px;padding:13px 15px}
.cx .rot{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cinza);margin-bottom:5px}
.cx .val{font-weight:700;font-size:15px;line-height:1.35}
.cx.destaque{border-color:var(--verde);background:#F1FAF6}
.cx.destaque .val{font-family:'Barlow Condensed',sans-serif;font-size:27px;color:var(--verde);line-height:1}
.cx small{display:block;font-size:12px;color:var(--cinza);font-weight:500;margin-top:3px;line-height:1.4}
.itens{margin:0 26px 20px;border:1px solid var(--linha);border-radius:12px;padding:14px 16px}
.itens .rot{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cinza);margin-bottom:8px}
.itens table{width:100%;border-collapse:collapse}
.itens td{padding:7px 0;border-bottom:1px dashed var(--linha);font-size:14px}
.itens td.v{text-align:right;font-weight:600;white-space:nowrap;padding-left:14px}
.itens tr.tot td{border-top:1.5px solid var(--tinta);border-bottom:0;padding-top:10px;font-weight:700;font-size:15px}
.copiar{margin:4px 26px 20px;border:1px solid var(--linha);border-radius:12px;padding:15px}
.copiar .rot{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cinza);margin-bottom:8px}
.codigo{font-family:'Barlow Condensed',monospace;font-size:19px;font-weight:600;word-break:break-all;line-height:1.35}
.bt-copiar{margin-top:11px;border:0;background:var(--az);color:#fff;border-radius:9px;padding:11px 20px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
.pixbox{margin:0 26px 20px;border:1.5px solid #32BCAD;background:#F2FBFA;border-radius:12px;padding:15px;display:flex;gap:16px;align-items:flex-start}
.pixbox .pix-qr{width:132px;height:132px;flex:none;background:#fff;border:1px solid var(--linha);border-radius:8px;padding:6px}
.pixbox .pix-qr svg{width:100%;height:100%;display:block}
.pixbox .pix-txt{min-width:0;flex:1}
.pixbox .rot{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#1B7F74;margin-bottom:6px;font-weight:700}
.pixbox p{font-size:13px;line-height:1.5;color:var(--tinta)}
.pix-cod{font-family:'Courier New',monospace;font-size:10.5px;word-break:break-all;line-height:1.35;margin-top:8px;color:#333;max-height:58px;overflow:hidden}
.pixbox .bt-copiar{background:#1B7F74}
.seguranca{margin:0 26px 20px;background:#F4F8FE;border:1px solid #C9DAF5;border-radius:12px;padding:14px 16px;font-size:12.5px;line-height:1.6;color:#123A78}
.seguranca b{color:#0A2A5C}
.aviso{margin:0 26px 20px;background:#FFF8E8;border:1px solid #F2D999;border-radius:11px;padding:13px 15px;font-size:12.5px;line-height:1.55;color:#7A5A12}
.aviso b{color:#5C4209}
.corte{margin:0 26px;border-top:1px dashed #B9C3D4;text-align:right;font-size:10.5px;color:var(--cinza);padding-top:4px}
.ficha{margin:14px 26px 26px;font-family:Arial,Helvetica,sans-serif;font-size:11px}
.ficha table{width:100%;border-collapse:collapse}
.ficha td{border:1px solid #222;padding:14px 6px 4px;position:relative;vertical-align:bottom;height:34px}
.ficha .t{position:absolute;top:2px;left:5px;font-size:8px;color:#333;font-weight:400}
.ficha .v{font-size:11.5px;font-weight:600}
.ficha .r{text-align:right}
.cabeca{display:flex;align-items:center;border-bottom:2px solid #000;padding-bottom:4px;gap:10px}
.cabeca .logo-bco{height:26px;width:auto;display:block}
.cabeca .bco{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:700;padding:0 10px;border-left:2px solid #000;border-right:2px solid #000;line-height:1}
.cabeca .ld{font-family:Arial;font-size:15px;font-weight:700;letter-spacing:.4px;margin-left:auto}
.barcode{width:100%;height:52px;display:block}
.barra-area{margin-top:12px}
.rodape-f{display:flex;justify-content:space-between;font-size:9px;color:#444;margin-top:4px}
.dica-rolar{display:none;margin:0 14px 6px;font-size:11px;color:var(--cinza)}
@media(max-width:720px){
  .topo{grid-template-columns:1fr;gap:14px;padding:16px}
  .marca{border-right:0;border-bottom:1px solid var(--linha);padding:0 0 12px;flex-direction:row;align-items:center;gap:12px}
  .marca .sub{margin-left:auto}
  .selo-seg{border-left:0;border-top:1px solid var(--linha);padding:12px 0 0;flex-direction:row;align-items:center;gap:14px;text-align:left}
  .selo-seg .qr{margin:0;flex:none}
  .caixas{grid-template-columns:1fr;gap:10px;padding-left:16px;padding-right:16px}
  .copiar,.aviso,.corte,.itens,.seguranca,.pixbox{margin-left:14px;margin-right:14px}
  .pixbox{flex-direction:column;align-items:center;text-align:center}
  .pago-faixa{padding:12px 16px}
  .ficha{margin:14px 14px 20px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px}
  .ficha-in{min-width:660px}
  .dica-rolar{display:block !important}
}
@media print{
  /* impressao em UMA folha: some o que e de tela e o documento fica compacto.
     A caixa "copiar codigo" sai — a linha digitavel ja aparece na ficha. */
  body{background:#fff;padding:0}
  .acoes,.dica-rolar,.bt-copiar,.copiar{display:none !important}
  .folha{box-shadow:none;border-radius:0;max-width:100%}
  .topo{padding:10px 16px 12px}
  .marca img{height:28px}
  .meta b{font-size:17px}
  .selo-seg .qr{width:74px;height:74px}
  .caixas{padding:12px 16px;gap:8px}
  .cx{padding:9px 11px}
  .cx.destaque .val{font-size:23px}
  .itens{margin:0 16px 10px;padding:10px 12px}
  .itens td{padding:5px 0;font-size:12px}
  .seguranca,.aviso{margin:0 16px 10px;padding:9px 11px;font-size:10.5px;background:#fff;line-height:1.45}
  .pixbox{margin:0 16px 8px;padding:6px 10px;background:#fff;gap:12px;align-items:center}
  .pixbox .pix-qr{width:66px;height:66px;padding:3px}
  .pixbox .rot{margin-bottom:3px}
  .pixbox p{font-size:10px;line-height:1.35}
  .pix-cod{display:none}
  .topo{padding:8px 16px 10px}
  .caixas{padding:10px 16px;gap:8px}
  .itens{margin-bottom:8px}
  .seguranca,.aviso{margin-bottom:8px;padding:7px 10px;font-size:10px}
  .corte{margin:0 16px;padding-top:2px}
  .ficha{overflow:visible;margin:8px 16px 0;page-break-inside:avoid;break-inside:avoid}
  .ficha-in{min-width:0}
  .ficha td{height:26px;padding:12px 5px 3px}
  .barcode{height:44px}
  @page{margin:8mm}
}
</style></head>
<body>

<div class="acoes">
  <button class="bt bt-1" onclick="window.print()">IMPRIMIR / SALVAR PDF</button>
  <button class="bt bt-2" onclick="copiarLinha(this)">COPIAR CÓDIGO DE BARRAS</button>
  ${pixCopia ? '<button class="bt bt-2" style="color:#1B7F74;border-color:#32BCAD" onclick="copiarPix(this)">COPIAR CÓDIGO PIX</button>' : ''}
</div>

<div class="folha">
  ${faixaPago}
  <div class="topo">
    <div class="marca">
      <img src="${LOGO}" alt="America Nutrition">
      <span class="sub">Documento de cobrança</span>
    </div>
    <div class="meta">
      <div><small>Pedido</small><b class="az">${pedido || '—'}</b></div>
      <div><small>Vencimento</small><b>${vencimento}</b></div>
      <div><small>Emissão</small><b id="emitidoEm">—</b></div>
      <div><small>Situação</small>${selo(sit)}</div>
    </div>
    <div class="selo-seg">
      <div class="qr" id="qr"></div>
      <div>
        <small>Confira se este boleto<br>é mesmo nosso</small>
        <b>${COD}</b>
      </div>
    </div>
  </div>

  <div class="caixas">
    <div class="cx">
      <div class="rot">Pagador</div>
      <div class="val">${nome}</div>
      <small>${docFmt ? 'CPF/CNPJ ' + docFmt : ''}${endereco ? '<br>' + endereco : ''}</small>
    </div>
    <div class="cx">
      <div class="rot">Vencimento</div>
      <div class="val" style="font-size:19px">${vencimento}</div>
      <small>pague até esta data</small>
    </div>
    <div class="cx destaque">
      <div class="rot">Valor do documento</div>
      <div class="val">R$ ${brl(valorNum)}</div>
      ${resumoItens ? '<small>'+resumoItens+'</small>' : ''}
    </div>
  </div>

  ${blocoItens}

  ${blocoPix}

  <div class="copiar">
    <div class="rot">Código de barras para pagar no app do banco</div>
    <div class="codigo">${linhaFmt}</div>
    <button class="bt-copiar" onclick="copiarLinha(this)">COPIAR CÓDIGO</button>
  </div>

  <div class="seguranca">
    <b>Antes de pagar, confira.</b> Leia o QR no alto desta página ou acesse <a href="${URL_CONF_CURTA}" style="color:var(--az);font-weight:700">${URL_CONF_TXT}</a>
    e informe o código <b>${COD}</b>. Ela mostra o valor, o vencimento, a situação e a linha digitável que emitimos.
    Se algum número estiver diferente do que está no seu boleto, <b>não pague</b> e fale conosco.
    Nunca alteramos dados bancários por e-mail ou WhatsApp.
  </div>

  <div class="aviso">
    <b>Como funciona:</b> pague em qualquer banco, app ou lotérica até o vencimento.
    A compensação leva até <b>2 dias úteis</b> e, assim que cai, seu pedido é separado
    e você recebe o código de rastreio no WhatsApp e no e-mail.
    <br><br>
    ${pixCopia ? '<b>Prefere receber antes?</b> Pague pelo PIX acima: a aprovação é na hora e o pedido já vai para a separação.' : '<b>Prefere receber antes?</b> O Pix é aprovado na hora. Fale com a gente no WhatsApp que trocamos sua forma de pagamento.'}
  </div>

  <div class="corte">corte aqui ✂</div>

  <p class="dica-rolar">deslize para o lado para ver a ficha completa &rarr;</p>
  <div class="ficha"><div class="ficha-in">
    <div class="cabeca">
      <img class="logo-bco" src="${LOGO_BCO}" alt="Banco liquidante">
      <span class="bco">${banco}-${bancoDV}</span>
      <span class="ld">${linhaFmt}</span>
    </div>
    <table>
      <tr>
        <td colspan="4"><span class="t">Local de pagamento</span><span class="v">Pagável em qualquer banco, aplicativo ou casa lotérica${pixCopia ? ' · ou por PIX (QR Code acima)' : ''}</span></td>
        <td class="r"><span class="t">Vencimento</span><span class="v">${vencimento}</span></td>
      </tr>
      <tr>
        <td colspan="4"><span class="t">Beneficiário</span><span class="v">${BEN_NOME} · CNPJ ${BEN_CNPJ}</span></td>
        <td class="r"><span class="t">Agência / Código do beneficiário</span><span class="v">${BEN_AG}</span></td>
      </tr>
      <tr>
        <td><span class="t">Data do documento</span><span class="v">${vencimento}</span></td>
        <td><span class="t">Nº do documento</span><span class="v">${pedido || nossoNumero.slice(-8)}</span></td>
        <td><span class="t">Espécie doc.</span><span class="v">DM</span></td>
        <td><span class="t">Aceite</span><span class="v">N</span></td>
        <td class="r"><span class="t">Nosso número</span><span class="v">${nossoNumero}</span></td>
      </tr>
      <tr>
        <td><span class="t">Uso do banco</span><span class="v">${COD}</span></td>
        <td><span class="t">Carteira</span><span class="v">1</span></td>
        <td><span class="t">Espécie</span><span class="v">R$</span></td>
        <td><span class="t">Quantidade</span><span class="v">&nbsp;</span></td>
        <td class="r"><span class="t">(=) Valor do documento</span><span class="v">${brl(valorNum)}</span></td>
      </tr>
      <tr>
        <td colspan="4" rowspan="2" style="height:70px;vertical-align:top;padding-top:14px">
          <span class="t">Instruções (texto de responsabilidade do beneficiário)</span>
          <span class="v" style="font-weight:400;line-height:1.6">
            Pedido ${pedido} · America Nutrition${listaItens.length ? ' · ' + resumoItens : ''}<br>
            Confira este documento com o código ${COD}.<br>
            ${pixCopia ? 'Aceita também pagamento por PIX (QR Code neste documento).<br>' : ''}Não receber após o vencimento.
          </span>
        </td>
        <td class="r"><span class="t">(-) Descontos / Abatimentos</span><span class="v">&nbsp;</span></td>
      </tr>
      <tr><td class="r"><span class="t">(+) Juros / Multa</span><span class="v">&nbsp;</span></td></tr>
      <tr>
        <td colspan="4"><span class="t">Pagador</span><span class="v">${nome} · ${docFmt}</span></td>
        <td class="r"><span class="t">(=) Valor cobrado</span><span class="v">&nbsp;</span></td>
      </tr>
      ${endereco ? '<tr><td colspan="5"><span class="t">Endereço do pagador</span><span class="v" style="font-weight:400">'+endereco+'</span></td></tr>' : ''}
    </table>

    <div class="barra-area">${barcodeSVG(barras)}</div>
    <div class="rodape-f">
      <span>Autenticação mecânica · conferível pelo código ${COD}</span>
      <span><b>FICHA DE COMPENSAÇÃO</b></span>
    </div>
  </div></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"><\/script>
<script>
var PIX = ${pixJs};
(function(){
  var d = new Date(), p = function(n){ return String(n).padStart(2,'0'); };
  var e = document.getElementById('emitidoEm');
  if (e) e.textContent = p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear();
  try {
    var qr = qrcode(0, 'M');
    qr.addData('${URL_CONF_CURTA}');
    qr.make();
    document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    var svg = document.querySelector('#qr svg');
    if (svg) { svg.setAttribute('width','86'); svg.setAttribute('height','86'); }
  } catch(err) {
    var box = document.getElementById('qr');
    if (box) box.style.display = 'none';
  }
  var pixBox = document.getElementById('pixqr');
  if (pixBox && PIX) {
    try { var qp = qrcode(0, 'M'); qp.addData(PIX, 'Byte'); qp.make(); pixBox.innerHTML = qp.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); }
    catch(err2) { pixBox.style.display = 'none'; }
  }
})();
function copiarTexto(btn, t, msg){
  var ok = function(){ var o = btn.textContent; btn.textContent = msg; setTimeout(function(){ btn.textContent = o; }, 2000); };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(ok, function(){ fallback(t, ok); }); }
  else { fallback(t, ok); }
}
function copiarLinha(btn){ copiarTexto(btn, '${linha}', 'CÓDIGO COPIADO!'); }
function copiarPix(btn){ copiarTexto(btn, PIX, 'PIX COPIADO!'); }
function fallback(t, ok){
  var i = document.createElement('textarea');
  i.value = t; i.style.position='fixed'; i.style.opacity='0';
  document.body.appendChild(i); i.select();
  try { document.execCommand('copy'); ok(); } catch(e) {}
  document.body.removeChild(i);
}
<\/script>
</body></html>`;

return [{ json: { html: html } }];