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
const self = this;
const NL = String.fromCharCode(10);
async function sql(q) { const r = await self.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); if (r && r.error) throw new Error(String(r.error).slice(0, 300)); return r; }
const E = v => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = 'body{margin:0;background:#0b1220;color:#e8edf7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}'
  + '.wrap{max-width:460px;margin:0 auto;padding:24px 16px 48px}'
  + '.marca{text-align:center;letter-spacing:.18em;font-size:12px;font-weight:700;color:#7f9cc9;margin-bottom:18px}'
  + '.card{background:#111c31;border:1px solid #1f2f4d;border-radius:18px;padding:22px 20px}'
  + 'h1{font-size:21px;margin:0 0 4px}'
  + '.sub{color:#93a7c6;font-size:14px;margin:0 0 18px}'
  + '.linha{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid #1c2b47;font-size:15px}'
  + '.linha span{color:#93a7c6}.linha b{font-size:16px}'
  + '.valor b{font-size:22px;color:#fff}'
  + '.prazo{margin:14px 0 18px;font-size:14px;color:#ffd08a;text-align:center}'
  + '.btn{display:block;width:100%;border:0;border-radius:14px;padding:17px;font-size:17px;font-weight:700;cursor:pointer;background:#22c55e;color:#06210f;font-family:inherit}'
  + '.btn:active{transform:scale(.99)}'
  + '.btn.copiado{background:#0f7a3d;color:#dcfce7}'
  + '.aviso{background:#152744;border-radius:12px;padding:12px 14px;margin-top:16px;font-size:14px;color:#c8d6ee}'
  + '.aviso ol{margin:8px 0 0;padding-left:20px}.aviso li{margin:4px 0}'
  + '.qr{text-align:center;margin-top:22px}'
  + '.qr p{color:#93a7c6;font-size:13px;margin:0 0 12px}'
  + '.qr #qrbox{background:#fff;padding:14px;border-radius:14px;display:inline-block;line-height:0}'
  + '.qr img,.qr canvas{width:200px;height:200px;display:block}'
  + 'details{margin-top:18px}summary{color:#93a7c6;font-size:13px;cursor:pointer}'
  + 'textarea{width:100%;box-sizing:border-box;margin-top:10px;background:#0b1220;color:#a9bdda;border:1px solid #26375a;border-radius:10px;padding:10px;font-size:11px;font-family:ui-monospace,Menlo,monospace;height:110px;resize:none}'
  + '.pago{background:#0f7a3d;color:#eaffef;border-radius:16px;padding:20px;text-align:center;margin-top:18px}'
  + '.pago b{display:block;font-size:19px;margin-bottom:4px}'
  + '.expirado{background:#4a1d20;color:#ffd9dc;border-radius:14px;padding:16px;text-align:center;margin-top:16px;font-size:15px}'
  + '.rodape{text-align:center;color:#6d82a6;font-size:12px;margin-top:22px}';

function pagina(titulo, corpo, extra) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body><div class="wrap">'
    + '<div class="marca">AMERICA NUTRITION</div>' + corpo
    + '<div class="rodape">Pagamento processado com seguran&ccedil;a. D&uacute;vidas? &Eacute; s&oacute; responder na conversa do WhatsApp.</div>'
    + '</div>' + (extra || '') + '</body></html>';
}

const q = $input.first().json.query || {};
const token = String(q.t || '').trim();
if (!token) return [{ json: { html: pagina('Pix', '<div class="card"><h1>Link inv&aacute;lido</h1><p class="sub">Volte na conversa do WhatsApp e pe&ccedil;a outro Pix.</p></div>') } }];

const rows = await sql('select token, draft_numero, total_reais, qr_code, qr_code_url, expira_em, pago, extract(epoch from (expira_em - now())) as faltam from serena_pix_links where token = ' + E(token));
const p = rows && rows[0];
if (!p) return [{ json: { html: pagina('Pix', '<div class="card"><h1>Link n&atilde;o encontrado</h1><p class="sub">Esse Pix pode ter sido cancelado. Volte na conversa do WhatsApp e pe&ccedil;a outro.</p></div>') } }];
try { await sql('update serena_pix_links set aberturas = coalesce(aberturas, 0) + 1 where token = ' + E(token)); } catch (e) {}

const total = 'R$ ' + Number(p.total_reais || 0).toFixed(2).replace('.', ',');
const faltam = Math.floor(Number(p.faltam || 0));
const expirado = !p.pago && faltam <= 0;

let corpo = '<div class="card">';
corpo += '<h1>Pague com Pix</h1><p class="sub">Seu pedido j&aacute; est&aacute; reservado. Falta s&oacute; o pagamento.</p>';
corpo += '<div class="linha"><span>Pedido</span><b>' + esc(p.draft_numero || '') + '</b></div>';
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
    + 'if(!ok){var t=document.getElementById("cod");t.style.position="fixed";t.style.opacity="0";t.select();t.setSelectionRange(0,99999);try{ok=document.execCommand("copy");}catch(e){}t.style.position="";t.style.opacity="";}'
    + 'if(ok){b.textContent="C\\u00f3digo copiado! Cole no app do banco";b.className="btn copiado";}else{b.textContent="Toque no c\\u00f3digo abaixo e copie";document.querySelector("details").open=true;}}'
    + 'b.addEventListener("click",copiar);'
    + 'function tick(){var s=Math.floor((FIM-Date.now())/1000);var el=document.getElementById("cd");if(s<=0){el.textContent="expirado";location.reload();return;}'
    + 'var m=Math.floor(s/60);var r=s%60;el.textContent=m+":"+(r<10?"0":"")+r;}'
    + 'tick();setInterval(tick,1000);'
    + 'var box=document.getElementById("qrbox");'
    + 'function desenhaQR(){if(window.QRCode){box.innerHTML="";new QRCode(box,{text:CODIGO,width:200,height:200,correctLevel:QRCode.CorrectLevel.M});}}'
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
