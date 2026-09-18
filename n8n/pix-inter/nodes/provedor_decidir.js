// Painel de 1 clique: GET /webhook/pix-provedor?t=TOKEN[&set=inter|pagarme]
const BASE = 'https://n8n.americanutrition.com';
const cfg = ($input.first().json || {}).cfg || {};
const q = $('Provedor: Requisição').first().json.query || {};
const t = String(q.t || '').trim();
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CSS = '*{box-sizing:border-box}body{margin:0;background:#F3F6FB;font-family:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#0A1B3D;-webkit-font-smoothing:antialiased}'
  + '.wrap{max-width:460px;margin:0 auto;padding:28px 18px 40px}h1{font-size:24px;margin:0 0 6px;color:#07388E}.sub{color:#5B667E;font-size:14.5px;margin:0 0 18px}'
  + '.card{background:#fff;border:1px solid #E3E9F2;border-radius:22px;padding:20px;margin-bottom:14px}.atual{display:flex;align-items:center;gap:10px;font-size:15px}'
  + '.pill{display:inline-block;padding:6px 12px;border-radius:99px;font-weight:700;font-size:13px}.inter{background:#FFF3DC;color:#B26A00}.pagarme{background:#E6F4EE;color:#17924A}'
  + '.btn{display:block;text-align:center;text-decoration:none;border-radius:99px;padding:16px;font-size:16px;font-weight:700;margin-top:12px;color:#fff;background:#07388E}.btn.red{background:#AD0404}.btn.off{background:#CDD6E4;color:#fff;pointer-events:none}'
  + '.ok{color:#17924A}.no{color:#AD0404}ul{padding-left:18px;margin:8px 0 0;font-size:14px;line-height:1.6}small{color:#8A94A8;font-size:12.5px;display:block;margin-top:10px;word-break:break-all}';
const pagina = (titulo, corpo) => '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body><div class="wrap">' + corpo + '</div></body></html>';

if (!cfg.pix_admin_token || t !== cfg.pix_admin_token) {
  return [{ json: { html: pagina('Acesso negado', '<div class="card"><h1>Acesso negado</h1><p class="sub">Link invalido. Pegue o link em checkout_config (pix_admin_token).</p></div>'), mudar: '', novo: '', atual: '', aviso: '', chat: '', thread: '' } }];
}
const atual = String(cfg.pix_provider || 'pagarme') === 'inter' ? 'inter' : 'pagarme';
const set = String(q.set || '').toLowerCase();
const mudar = ((set === 'inter' || set === 'pagarme') && set !== atual) ? set : '';
const novo = mudar || atual;
const link = (p) => BASE + '/webhook/pix-provedor?t=' + encodeURIComponent(t) + '&set=' + p;
const temCred = !!(cfg.inter_client_id && cfg.inter_client_secret);
const temChave = !!cfg.inter_chave_pix;
const nome = p => p === 'inter' ? 'Banco Inter' : 'Pagar.me';

let corpo = '<h1>PIX do checkout</h1><p class="sub">Escolha quem gera a cobranca PIX do checkout. A troca vale na hora, sem publicar nada.</p>';
if (mudar) corpo += '<div class="card"><b>Feito:</b> o PIX do checkout agora sai pelo <b>' + nome(novo) + '</b>.</div>';
corpo += '<div class="card"><div class="atual">Provedor atual: <span class="pill ' + novo + '">' + nome(novo) + '</span></div>'
  + (novo === 'inter'
    ? '<a class="btn red" href="' + esc(link('pagarme')) + '">Voltar ao Pagar.me (1 clique)</a>'
    : '<a class="btn' + ((temCred && temChave) ? '' : ' off') + '" href="' + esc(link('inter')) + '">Usar Banco Inter</a>')
  + '</div>';
corpo += '<div class="card"><b>Banco Inter</b><ul>'
  + '<li>Client ID/Secret: <b class="' + (temCred ? 'ok">ok' : 'no">faltando') + '</b></li>'
  + '<li>Chave PIX: <b class="' + (temChave ? 'ok">' + esc(cfg.inter_chave_pix) : 'no">faltando') + '</b></li>'
  + '<li>Ambiente: <b>' + esc(cfg.inter_ambiente || 'producao') + '</b> | validade do PIX: <b>' + esc(cfg.inter_pix_expiracao_seg || '86400') + 's</b></li>'
  + '<li>Certificado mTLS: credencial "Banco Inter mTLS" no n8n</li></ul>'
  + '<a class="btn" style="background:#2F6BE0" href="' + esc(BASE + '/webhook/pix-inter-setup?t=' + encodeURIComponent(t)) + '">Registrar webhook no Inter</a>'
  + '<small>Webhook: ' + esc(BASE + '/webhook/pix-inter-webhook') + '</small></div>';
corpo += '<div class="card"><b>Como funciona</b><ul><li>Com o Inter ligado, qualquer falha (token, certificado, API) cai automaticamente no Pagar.me.</li><li>Cartao e boleto continuam no Pagar.me.</li><li>A confirmacao do PIX Inter cria o pedido na Shopify pelo mesmo fluxo de sempre.</li></ul></div>';

const aviso = mudar
  ? ('\u{1F501} <b>PIX do checkout</b> mudou para <b>' + nome(novo) + '</b>.' + (novo === 'inter' ? '\nVoltar ao Pagar.me a 1 clique: <a href="' + link('pagarme') + '">clique aqui</a>' : '\nLigar o Inter de novo: <a href="' + link('inter') + '">clique aqui</a>'))
  : '';
return [{ json: { html: pagina('PIX do checkout', corpo), mudar: mudar, novo: novo, atual: atual, aviso: aviso, chat: String(cfg.telegram_chat_id || ''), thread: String(cfg.telegram_thread_id || '') } }];
