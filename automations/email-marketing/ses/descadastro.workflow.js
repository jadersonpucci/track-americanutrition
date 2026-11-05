// n8n Workflow SDK — [Email] Descadastro (GET e POST /webhook/descadastro)
// Link do rodape e do cabecalho List-Unsubscribe: ?e=<email em base64url>&t=<token>, gerado por
// email_link_descadastro(email) no Supabase (descadastro.sql). O segredo do token fica so no banco.
// GET mostra a pagina (nunca muda nada: robos de antivirus abrem links). POST confirma: pelo botao da pagina
// ou pelo "cancelar inscricao" do Gmail/Apple (List-Unsubscribe-Post: One-Click).
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const abrir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Abrir link', parameters: { httpMethod: 'GET', path: 'descadastro', responseMode: 'responseNode', options: {} } }, output: [{ query: { e: 'x', t: 'y' } }] });
const confirmar = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Confirmar', parameters: { httpMethod: 'POST', path: 'descadastro', responseMode: 'responseNode', options: {} } }, output: [{ query: { e: 'x', t: 'y' }, body: { acao: 'descadastrar' } }] });

const LER = `
function de64(s) {
  try {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64').toString('utf8').trim().toLowerCase();
  } catch (e) { return ''; }
}
const j = $input.first().json;
const q = j.query || {};
`;

const lerGet = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler GET', parameters: { jsCode: LER + `
return [{ json: { email: de64(q.e), t: String(q.t || ''), acao: 'consultar', motivo: '', origem: 'pagina', e64: String(q.e || '') } }];
` } } });

const lerPost = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler POST', parameters: { jsCode: LER + `const b = (j.body && typeof j.body === 'object') ? j.body : {};
const oneClick = String(b['List-Unsubscribe'] || '').toLowerCase() === 'one-click';
const acao = (b.acao === 'reinscrever') ? 'reinscrever' : 'descadastrar';
const motivos = ['muitos_emails', 'sem_interesse', 'nao_cadastrei', 'outro'];
const motivo = motivos.indexOf(String(b.motivo || '')) >= 0 ? String(b.motivo) : '';
const e64 = String(b.e || q.e || '');
return [{ json: { email: de64(e64), t: String(b.t || q.t || ''), acao: acao, motivo: motivo, origem: oneClick ? 'one-click' : 'pagina', e64: e64 } }];
` } } });

const banco = node({ type: 'n8n-nodes-base.postgres', version: 2.6, credentials: PG, config: { name: 'Banco', parameters: {
  operation: 'executeQuery',
  query: "select case when $3 = 'consultar' then email_consultar($1, $2) else email_descadastrar($1, $2, $3, $4, $5) end as r",
  options: { queryReplacement: '={{ [$json.email, $json.t, $json.acao, $json.motivo, $json.origem] }}' } } } });

const pagina = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Shopify e Pagina', parameters: { jsCode: `
const BASE = 'https://n8n.americanutrition.com/webhook/descadastro';
const LOGO = 'https://cdn.shopify.com/s/files/1/0643/9000/4908/files/an-logo-branco-email.png?v=1793847024';
const SERENA = 'https://wa.me/16462068419';
const ent = $input.first().json;
let r = ent.r || {};
if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = {}; } }
const lido = (function(){ try { return $('Ler POST').first().json; } catch (e) { return $('Ler GET').first().json; } })();
const acao = lido.acao;
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Shopify: mesmo consentimento de marketing (o Klaviyo acompanha a Shopify)
let shopify = '';
if (r.ok && acao !== 'consultar') {
  try {
    const gql = async (query, variables) => this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 20000,
      headers: { 'Content-Type': 'application/json' },
      body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
    const c = await gql('query($q:String!){customers(first:1, query:$q){nodes{id}}}', { q: 'email:"' + r.email + '"' });
    const id = (((((c || {}).dados || {}).data || {}).customers || {}).nodes || [])[0];
    if (id && id.id) {
      const consent = acao === 'reinscrever'
        ? { marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN', consentUpdatedAt: new Date().toISOString() }
        : { marketingState: 'UNSUBSCRIBED', consentUpdatedAt: new Date().toISOString() };
      const m = await gql('mutation($i:CustomerEmailMarketingConsentUpdateInput!){customerEmailMarketingConsentUpdate(input:$i){userErrors{message}}}',
        { i: { customerId: id.id, emailMarketingConsent: consent } });
      const err = ((((m || {}).dados || {}).data || {}).customerEmailMarketingConsentUpdate || {}).userErrors || [];
      shopify = err.length ? 'erro: ' + err.map(x => x.message).join('; ') : 'ok';
    } else { shopify = 'sem cliente'; }
  } catch (e) { shopify = 'falhou: ' + String(e.message || e).slice(0, 120); }
}

function mascara(email) {
  const p = String(email || '').split('@');
  if (p.length !== 2) return '';
  const u = p[0];
  const vis = u.length <= 2 ? u.charAt(0) + '*' : u.charAt(0) + '*'.repeat(Math.min(u.length - 2, 6)) + u.charAt(u.length - 1);
  return vis + '@' + p[1];
}
const ocultos = '<input type="hidden" name="e" value="' + esc(lido.e64) + '"><input type="hidden" name="t" value="' + esc(lido.t) + '">';
function botao(txt, cor, acaoForm) {
  return '<form method="post" action="' + BASE + '">' + ocultos + '<input type="hidden" name="acao" value="' + acaoForm + '"><button class="btn" style="background:' + cor + '">' + txt + '</button></form>';
}
function pagina(selo, corSelo, titulo, corpo) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(titulo) + ' · America Nutrition</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box}body{margin:0;background:#E9EEF6;font-family:Inter,Arial,sans-serif;color:#4B5565}' +
    '.w{max-width:520px;margin:0 auto;padding:24px 14px 40px}.top{background:#07388E;background-image:radial-gradient(circle at 85% 15%,#1656C9 0,#07388E 58%);border-radius:20px 20px 0 0;padding:26px 28px 30px}' +
    '.top img{width:132px;display:block}.selo{display:inline-block;margin-top:22px;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:5px 10px;border-radius:6px}' +
    'h1{font-family:"Barlow Condensed","Arial Narrow",Arial,sans-serif;font-size:40px;line-height:42px;color:#fff;margin:14px 0 0}' +
    '.box{background:#F6F8FC;border-radius:0 0 20px 20px;padding:24px 22px 26px}.card{background:#fff;border:1px solid #E3E8F2;border-radius:16px;padding:22px 22px}' +
    'p{font-size:15px;line-height:1.6;margin:0 0 12px}b{color:#0F1B33}.op{display:flex;gap:10px;align-items:center;padding:12px 14px;border:1px solid #E3E8F2;border-radius:12px;margin:0 0 8px;font-size:15px;cursor:pointer}' +
    '.op input{accent-color:#AD0404;width:18px;height:18px}.btn{display:block;width:100%;border:0;border-radius:999px;color:#fff;font:700 16px Inter,Arial,sans-serif;padding:15px 20px;margin-top:16px;cursor:pointer}' +
    '.sec{display:block;text-align:center;margin-top:14px;color:#07388E;font-weight:600;font-size:14px;text-decoration:none}.rod{text-align:center;font-size:12px;color:#8A94A6;margin-top:18px}.rod a{color:#07388E}' +
    '</style></head><body><div class="w"><div class="top"><img src="' + LOGO + '" alt="America Nutrition"><span class="selo" style="background:' + corSelo + '">' + selo + '</span><h1>' + titulo + '</h1></div>' +
    '<div class="box"><div class="card">' + corpo + '</div><div class="rod">Dúvidas? <a href="' + SERENA + '">Fale com a Serena no WhatsApp</a>, 24h por dia.</div></div></div></body></html>';
}

let html;
if (!r.ok) {
  html = pagina('Link inválido', '#AD0404', 'Não conseguimos abrir este link',
    '<p>O link pode estar incompleto. Abra de novo pelo botão <b>Cancelar inscrição</b> no fim de qualquer email nosso.</p><p>Se preferir, fale com a gente no WhatsApp que resolvemos na hora.</p>' +
    '<a class="btn" style="background:#25D366;text-align:center;text-decoration:none" href="' + SERENA + '">Falar com a Serena</a>');
} else if (acao === 'consultar' && r.status !== 'inscrito') {
  html = pagina('Inscrição cancelada', '#5B6475', 'Você já está fora da lista',
    '<p>O email <b>' + esc(mascara(r.email)) + '</b> não recebe mais nossos emails de promoções e novidades.</p>' +
    '<p>Emails sobre os seus pedidos, como confirmação e rastreio, continuam chegando normalmente.</p>' + botao('Quero voltar a receber', '#07388E', 'reinscrever'));
} else if (acao === 'consultar') {
  const ops = [['muitos_emails', 'Recebo emails demais'], ['sem_interesse', 'Não tenho mais interesse'], ['nao_cadastrei', 'Não me lembro de ter me cadastrado'], ['outro', 'Outro motivo']];
  html = pagina('Cancelar inscrição', '#AD0404', 'Que pena ver você sair',
    '<p>Vamos parar de enviar emails de promoções e novidades para <b>' + esc(mascara(r.email)) + '</b>.</p>' +
    '<form method="post" action="' + BASE + '">' + ocultos + '<input type="hidden" name="acao" value="descadastrar">' +
    '<p style="margin-top:6px"><b>Se puder, conta o motivo</b> (opcional):</p>' +
    ops.map(o => '<label class="op"><input type="radio" name="motivo" value="' + o[0] + '">' + o[1] + '</label>').join('') +
    '<button class="btn" style="background:#AD0404">Cancelar minha inscrição</button></form>' +
    '<a class="sec" href="https://americanutrition.com">Mudei de ideia, quero continuar recebendo</a>');
} else if (r.status === 'inscrito') {
  html = pagina('Tudo certo', '#16A34A', 'Que bom ter você de volta!',
    '<p>O email <b>' + esc(mascara(r.email)) + '</b> voltou a receber nossas novidades, conteúdos e ofertas.</p>' +
    '<a class="btn" style="background:#AD0404;text-align:center;text-decoration:none" href="https://americanutrition.com">Ir para a loja</a>');
} else {
  html = pagina('Inscrição cancelada', '#5B6475', 'Pronto, inscrição cancelada',
    '<p>O email <b>' + esc(mascara(r.email)) + '</b> não vai mais receber nossos emails de promoções e novidades.</p>' +
    '<p>Emails sobre os seus pedidos, como confirmação e rastreio, continuam chegando normalmente.</p>' +
    '<p style="margin-top:18px;font-size:14px">Foi sem querer?</p>' + botao('Voltar a receber', '#07388E', 'reinscrever'));
}
return [{ json: { html: html, ok: !!r.ok, acao: acao, status: r.status || '', origem: lido.origem, shopify: shopify } }];
` } } });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: {
  respondWith: 'text', responseBody: '={{ $json.html }}',
  options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }, { name: 'X-Robots-Tag', value: 'noindex' }] } } } } });

const nota = sticky('## Descadastro de email\n\nGET mostra a pagina (nao muda nada). POST grava em email_contatos/email_eventos (funcoes do Supabase validam o token) e muda o consentimento de marketing do cliente na Shopify. Funciona com o One-Click do Gmail/Apple.\n\nLink: select email_link_descadastro(email).');

export default workflow('email-descadastro', '[Email] Descadastro', { settings: { executionOrder: 'v1' } })
  .add(abrir).to(lerGet).to(banco).to(pagina).to(responder)
  .add(confirmar).to(lerPost).to(banco)
  .add(nota);
