// id d8xacawAcoWtppWh
// n8n Workflow SDK — [Serena] Pagina do Pix
// Pagina publica para o cliente pagar o Pix gerado pela Serena: botao de copiar o codigo, QR Code, passo a passo,
// contagem do prazo e confirmacao automatica do pagamento. O link curto (seguro.americanutrition.com) vai na
// mensagem do WhatsApp junto com o codigo, para quem nao conseguir copiar o codigo no proprio chat.
//   GET /webhook/pix?t=TOKEN         -> pagina HTML
//   GET /webhook/pix-status?t=TOKEN  -> {pago:true|false} (a pagina consulta a cada 10s)
// Dados em serena_pix_links, gravados pelo [Serena Tool] Gerar PIX.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const entradaPagina = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Abrir Pagina', parameters: { httpMethod: 'GET', path: 'pix', responseMode: 'responseNode', options: {} } }, output: [{ query: { t: 'abc' } }] });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar Pagina', parameters: { jsCode: `const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const LOGO = 'https://cdn.shopify.com/s/files/1/0643/9000/4908/files/LOGOTIPO_BRANCO_FUNDO_TRANSPARENTE.png?v=1739472401&width=400';
// Imagem do preview no WhatsApp (1200x630, feita para o link): sem ela o WhatsApp recorta o logo transparente.
const OG_IMG = 'https://supabase.americanutrition.com/storage/v1/object/public/imagens/pagamento/og-pix-america.png';
let ogTitulo = 'Pague com Pix - America Nutrition';
let ogDesc = 'Copie o codigo com um toque ou escaneie o QR Code. Seu pedido ja esta reservado.';
const self = this;
async function sql(q) { const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); return r; }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Identidade America Nutrition: azul #07388E, verde #108474, vermelho #AD0404, fonte Barlow.
const CSS = '*{box-sizing:border-box}'
  + 'body{margin:0;background:#07388E;background:linear-gradient(180deg,#07388E 0%,#052A6B 55%,#03204F 100%);min-height:100vh;color:#16233a;font-family:Barlow,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}'
  + '.wrap{max-width:440px;margin:0 auto;padding:26px 16px 44px}'
  + '.marca{text-align:center;margin-bottom:20px}'
  + '.marca img{height:38px;width:auto}'
  + '.card{background:#fff;border-radius:20px;padding:24px 20px;box-shadow:0 18px 40px rgba(2,15,45,.35)}'
  + 'h1{font-size:23px;line-height:1.2;margin:0 0 6px;color:#07388E;font-weight:700}'
  + '.sub{color:#5b6b85;font-size:14.5px;margin:0 0 18px}'
  + '.linha{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #eaeff7;font-size:15px}'
  + '.linha span{color:#7a8aa3;white-space:nowrap;padding-right:14px}.linha b{color:#16233a;font-weight:600}'
  + '.linha.item{align-items:flex-start}.linha.item b{text-align:right;line-height:1.3}'
  + '.valor b{font-size:24px;color:#07388E;font-weight:700}'
  + '.prazo{margin:16px 0 18px;padding:9px;border-radius:10px;background:#fff6e8;color:#8a5300;font-size:14px;text-align:center;font-weight:500}'
  + '.btn{display:block;width:100%;border:0;border-radius:13px;padding:17px;font-size:17px;font-weight:700;cursor:pointer;background:#108474;color:#fff;font-family:inherit;box-shadow:0 6px 16px rgba(16,132,116,.32)}'
  + '.btn:active{transform:scale(.99)}'
  + '.btn.copiado{background:#0b6357}'
  + '.aviso{background:#f3f7fd;border-radius:12px;padding:13px 15px;margin-top:16px;font-size:14.5px;color:#3c4a63}'
  + '.aviso b{color:#07388E}'
  + '.aviso ol{margin:8px 0 0;padding-left:19px}.aviso li{margin:5px 0}'
  + '.qr{text-align:center;margin-top:22px;padding-top:20px;border-top:1px solid #eaeff7}'
  + '.qr p{color:#7a8aa3;font-size:13.5px;margin:0 0 12px}'
  + '.qr #qrbox{display:inline-block;line-height:0;padding:10px;border:1px solid #eaeff7;border-radius:14px}'
  + '.qr img,.qr canvas{width:196px;height:196px;display:block}'
  + 'details{margin-top:18px}summary{color:#7a8aa3;font-size:13px;cursor:pointer}'
  + 'textarea{width:100%;margin-top:10px;background:#f7f9fc;color:#4a5a75;border:1px solid #e2e9f3;border-radius:10px;padding:10px;font-size:11px;font-family:ui-monospace,Menlo,monospace;height:104px;resize:none}'
  + '.pago{background:#108474;color:#fff;border-radius:14px;padding:20px;text-align:center;margin-top:18px}'
  + '.pago b{display:block;font-size:19px;margin-bottom:5px}'
  + '.expirado{background:#fdeceb;color:#AD0404;border-radius:12px;padding:16px;text-align:center;margin-top:16px;font-size:15px;font-weight:500}'
  + '.rodape{text-align:center;color:#a9c1e8;font-size:12.5px;margin-top:20px;line-height:1.45}';

function pagina(titulo, corpo, extra) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(titulo) + '</title>'
    + '<meta name="description" content="' + esc(ogDesc) + '">'
    + '<meta name="theme-color" content="#07388E">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="America Nutrition">'
    + '<meta property="og:title" content="' + esc(ogTitulo) + '">'
    + '<meta property="og:description" content="' + esc(ogDesc) + '">'
    + '<meta property="og:image" content="' + OG_IMG + '"><meta property="og:image:type" content="image/png">'
    + '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
    + '<meta property="og:image:alt" content="Pague com Pix na America Nutrition">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="' + esc(ogTitulo) + '"><meta name="twitter:description" content="' + esc(ogDesc) + '">'
    + '<meta name="twitter:image" content="' + OG_IMG + '">'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<style>' + CSS + '</style></head><body><div class="wrap">'
    + '<div class="marca"><img src="' + LOGO + '" alt="America Nutrition"></div>' + corpo
    + '<div class="rodape">Pagamento processado com seguran&ccedil;a.<br>D&uacute;vidas? &Eacute; s&oacute; responder na conversa do WhatsApp.</div>'
    + '</div>' + (extra || '') + '</body></html>';
}

const q = $input.first().json.query || {};
const token = String(q.t || '').trim();
if (!token) return [{ json: { html: pagina('Pix', '<div class="card"><h1>Link inv&aacute;lido</h1><p class="sub">Volte na conversa do WhatsApp e pe&ccedil;a outro Pix.</p></div>') } }];

const rows = await sql('select token, draft_numero, itens, total_reais, qr_code, qr_code_url, expira_em, pago, extract(epoch from (expira_em - now())) as faltam from serena_pix_links where token = ' + E(token));
const p = rows && rows[0];
if (!p) return [{ json: { html: pagina('Pix', '<div class="card"><h1>Link n&atilde;o encontrado</h1><p class="sub">Esse Pix pode ter sido cancelado. Volte na conversa do WhatsApp e pe&ccedil;a outro.</p></div>') } }];
try { await sql('update serena_pix_links set aberturas = coalesce(aberturas, 0) + 1 where token = ' + E(token)); } catch (e) {}

const total = 'R$ ' + Number(p.total_reais || 0).toFixed(2).replace('.', ',');
const faltam = Math.floor(Number(p.faltam || 0));
const expirado = !p.pago && faltam <= 0;

// Preview do link no WhatsApp: titulo e descricao seguem o estado do Pix
// O numero do rascunho e interno: o cliente ve o PRODUTO (o numero do pedido so sai depois do pagamento)
const itens = String(p.itens || '').trim();
if (p.pago) {
  ogTitulo = 'Pagamento confirmado - America Nutrition';
  ogDesc = 'Seu Pix foi confirmado' + (itens ? ' (' + itens + ')' : '') + ' e o pedido entrou em separacao.';
} else if (expirado) {
  ogTitulo = 'Pix expirado - America Nutrition';
  ogDesc = 'Este Pix passou do prazo. Volte na conversa do WhatsApp e peca outro, leva alguns segundos.';
} else {
  ogTitulo = 'Pague ' + total + ' com Pix';
  ogDesc = (itens ? itens + ': c' : 'C') + 'opie o codigo com um toque ou escaneie o QR Code. Seu pedido ja esta reservado.';
}

let corpo = '<div class="card">';
corpo += '<h1>Pague com Pix</h1><p class="sub">Seu pedido j&aacute; est&aacute; reservado. Falta s&oacute; o pagamento.</p>';
if (itens) corpo += '<div class="linha item"><span>Produto</span><b>' + esc(itens) + '</b></div>';
corpo += '<div class="linha valor"><span>Valor</span><b>' + total + '</b></div>';

if (p.pago) {
  corpo += '<div class="pago"><b>Pagamento confirmado!</b>Seu pedido j&aacute; entrou em separa&ccedil;&atilde;o. Voc&ecirc; recebe o c&oacute;digo de rastreio pelo WhatsApp.</div></div>';
} else if (expirado) {
  corpo += '<div class="expirado">Este Pix expirou.<br>Volte na conversa do WhatsApp e pe&ccedil;a outro, leva alguns segundos.</div></div>';
} else {
  corpo += '<div class="prazo">Expira em <b id="cd">--:--</b></div>';
  corpo += '<button class="btn" id="copiar">Copiar c&oacute;digo Pix</button>';
  corpo += '<div class="aviso"><b>Como pagar:</b><ol><li>Toque em <b>Copiar c&oacute;digo Pix</b></li><li>Abra o app do seu banco</li><li>Escolha <b>Pix &gt; Pix Copia e Cola</b></li><li>Cole o c&oacute;digo e confirme</li></ol></div>';
  corpo += '<div class="qr"><p>Ou escaneie o QR Code com o celular</p><div id="qrbox">' + (p.qr_code_url ? '<img alt="QR Code Pix" src="' + esc(p.qr_code_url) + '">' : '') + '</div></div>';
  corpo += '<details><summary>Ver o c&oacute;digo em texto</summary><textarea readonly id="cod" onclick="this.select()">' + esc(p.qr_code) + '</textarea></details>';
  corpo += '</div>';
}

let extra = '';
if (!p.pago && !expirado) {
  const js = 'var CODIGO=document.getElementById("cod").value;'
    + 'var FIM=Date.now()+' + (faltam * 1000) + ';'
    + 'var b=document.getElementById("copiar");'
    + 'function copiar(){var ok=false;try{if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(CODIGO);ok=true;}}catch(e){}'
    + 'if(!ok){var t=document.getElementById("cod");document.querySelector("details").open=true;t.select();t.setSelectionRange(0,99999);try{ok=document.execCommand("copy");}catch(e){}}'
    + 'if(ok){b.textContent="C\\u00f3digo copiado! Cole no app do banco";b.className="btn copiado";}else{b.textContent="Toque no c\\u00f3digo abaixo e copie";document.querySelector("details").open=true;}}'
    + 'b.addEventListener("click",copiar);'
    + 'function tick(){var s=Math.floor((FIM-Date.now())/1000);var el=document.getElementById("cd");if(s<=0){el.textContent="expirado";location.reload();return;}'
    + 'var m=Math.floor(s/60);var r=s%60;el.textContent=m+":"+(r<10?"0":"")+r;}'
    + 'tick();setInterval(tick,1000);'
    + 'var box=document.getElementById("qrbox");'
    + 'function desenhaQR(){if(window.QRCode){box.innerHTML="";new QRCode(box,{text:CODIGO,width:196,height:196,correctLevel:QRCode.CorrectLevel.M});}}'
    + 'var s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";s.onload=desenhaQR;document.body.appendChild(s);'
    + 'function status(){fetch("/webhook/pix-status?t=' + encodeURIComponent(token) + '").then(function(r){return r.json();}).then(function(j){if(j&&j.pago){location.reload();}}).catch(function(){});}'
    + 'setInterval(status,10000);';
  extra = '<script>' + js + '</script>';
}

return [{ json: { html: pagina('Pague com Pix - America Nutrition', corpo, extra) } }];` } }, output: [{ html: '<html></html>' }] });

const responderPagina = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder HTML', parameters: { respondWith: 'text', responseBody: '={{ $json.html }}', options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] } } } } });

const entradaStatus = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Status do Pix', parameters: { httpMethod: 'GET', path: 'pix-status', responseMode: 'responseNode', options: {} } }, output: [{ query: { t: 'abc' } }] });

const checar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Checar Pagamento', parameters: { jsCode: `const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const SHOPIFY = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
async function sql(q) { const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); return r; }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";

const q = $input.first().json.query || {};
const token = String(q.t || '').trim();
if (!token) return [{ json: { pago: false, erro: 'sem token' } }];

const rows = await sql('select token, draft_id, pago, extract(epoch from (expira_em - now())) as faltam from serena_pix_links where token = ' + E(token));
const p = rows && rows[0];
if (!p) return [{ json: { pago: false, erro: 'nao encontrado' } }];
if (p.pago) return [{ json: { pago: true } }];

// O draft order da Shopify vira "completed" quando a Confirmacao de Pagamento fecha o pedido pago.
let pago = false;
if (p.draft_id) {
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: SHOPIFY, json: true, timeout: 20000, body: { acao: 'consultar', endpoint: 'draft_orders/' + p.draft_id + '.json' } });
    const d = r && r.ok && r.dados && r.dados.draft_order;
    if (d && (String(d.status || '') === 'completed' || d.order_id)) pago = true;
  } catch (e) { pago = false; }
}
if (pago) { try { await sql('update serena_pix_links set pago = true, pago_em = now() where token = ' + E(token)); } catch (e) {} }
return [{ json: { pago: pago, expirado: Number(p.faltam || 0) <= 0 } }];` } }, output: [{ pago: false }] });

const responderStatus = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder JSON', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const nota = sticky('## Pagina do Pix\n\nGET /webhook/pix?t=TOKEN mostra a pagina de pagamento (botao copiar, QR Code, passo a passo, contagem do prazo). GET /webhook/pix-status?t=TOKEN devolve se ja foi pago, consultando o draft order na Shopify (vira completed quando a Confirmacao de Pagamento fecha o pedido); a pagina consulta a cada 10s e mostra o aviso de pago.\n\nOs dados vem de serena_pix_links, gravado pelo [Serena Tool] Gerar PIX, que tambem encurta este link (seguro.americanutrition.com) e manda junto com o codigo no WhatsApp.', [entradaPagina, montar, entradaStatus, checar], { color: 4 });

export default workflow('serena-pagina-pix', '[Serena] Pagina do Pix', { settings: { executionOrder: 'v1' } })
  .add(entradaPagina).to(montar).to(responderPagina)
  .add(entradaStatus).to(checar).to(responderStatus)
  .add(nota);
