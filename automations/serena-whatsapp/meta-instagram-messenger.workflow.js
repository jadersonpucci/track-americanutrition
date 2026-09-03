// id ntmDA1FhQFZkvQNM
// n8n Workflow SDK — [Serena Meta] Instagram + Messenger (webhook GET/POST serena-meta + saida a cada minuto)
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const CFG_SQL = "select coalesce((select valor from serena_config where chave = 'meta_ativo'), 'off') as ativo, coalesce((select valor from serena_config where chave = 'meta_page_token'), '') as page_token, coalesce((select valor from serena_config where chave = 'meta_ig_token'), '') as ig_token, coalesce((select valor from serena_config where chave = 'meta_verify_token'), '') as verify_token, coalesce((select valor from serena_config where chave = 'meta_app_secret'), '') as app_secret, coalesce((select valor from serena_config where chave = 'meta_page_id'), '') as page_id, coalesce((select valor from serena_config where chave = 'meta_ig_id'), '') as ig_id";

// ---- 1) Verificacao do webhook (GET) ----
const verifyIn = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Meta Verify (GET)', parameters: { httpMethod: 'GET', path: 'serena-meta', responseMode: 'responseNode', options: {} } },
  output: [{ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '123' } }] });
const cfgVerify = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config (verify)', parameters: { operation: 'executeQuery', query: CFG_SQL, options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ ativo: 'off', page_token: '', ig_token: '', verify_token: '', app_secret: '', page_id: '', ig_id: '' }] });
const verificar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Checar Token', parameters: { jsCode: `const q = ($('Meta Verify (GET)').first().json || {}).query || {};
const cfg = $input.first().json || {};
const ok = q['hub.mode'] === 'subscribe' && cfg.verify_token && q['hub.verify_token'] === cfg.verify_token;
return [{ json: { ok: ok, body: ok ? String(q['hub.challenge'] || '') : 'token invalido', code: ok ? 200 : 403 } }];` } }, output: [{ ok: true, body: '123', code: 200 }] });
const responderVerify = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder Verify', parameters: { respondWith: 'text', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.code }}' } } }, output: [{}] });

// ---- 2) Eventos (POST): responde 200 na hora e processa em seguida ----
const eventosIn = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Meta Eventos (POST)', parameters: { httpMethod: 'POST', path: 'serena-meta', responseMode: 'onReceived', options: { rawBody: true } } },
  output: [{ headers: { 'x-hub-signature-256': 'sha256=abc' }, body: { object: 'instagram', entry: [{ id: '1', messaging: [{ sender: { id: '9' }, recipient: { id: '1' }, message: { mid: 'm1', text: 'oi' } }] }] } }] });
const cfgEventos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config (eventos)', parameters: { operation: 'executeQuery', query: CFG_SQL, options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ ativo: 'off', page_token: '', ig_token: '', verify_token: '', app_secret: '', page_id: '', ig_id: '' }] });
const processar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Processar Mensagens', parameters: { jsCode: `// Instagram Direct e Messenger chegam no mesmo formato (entry[].messaging[]). Identidade do cliente = id da conta (nao ha telefone):
// o contato fica em serena_contatos.session_site como ig:<id> ou fb:<id>. A resposta da Serena e enviada pela Graph API e marcada como entregue.
const cfg = $input.first().json || {};
const ev = $('Meta Eventos (POST)').first();
const body = (ev.json && ev.json.body) || {};
const headers = (ev.json && ev.json.headers) || {};
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
if (String(cfg.ativo || 'off') !== 'on') return [{ json: { ignorado: 'meta_ativo=off' } }];

// Assinatura (opcional, quando meta_app_secret esta configurado)
if (cfg.app_secret) {
  try {
    const crypto = require('crypto');
    const raw = await this.helpers.getBinaryDataBuffer(0, 'data');
    const esperado = 'sha256=' + crypto.createHmac('sha256', cfg.app_secret).update(raw).digest('hex');
    const recebido = String(headers['x-hub-signature-256'] || '');
    if (!recebido || recebido !== esperado) return [{ json: { ignorado: 'assinatura invalida' } }];
  } catch (e) { return [{ json: { ignorado: 'nao foi possivel validar assinatura: ' + e.message } }]; }
}

const objeto = String(body.object || '').toLowerCase();
const canal = objeto === 'instagram' ? 'instagram' : 'messenger';
const prefixo = canal === 'instagram' ? 'ig:' : 'fb:';
const token = (canal === 'instagram' && cfg.ig_token) ? cfg.ig_token : cfg.page_token;
const out = [];
for (const entry of (Array.isArray(body.entry) ? body.entry : [])) {
  for (const m of (Array.isArray(entry.messaging) ? entry.messaging : [])) {
    const msg = m.message || {};
    if (!m.sender || !m.sender.id || msg.is_echo || m.read || m.delivery || m.reaction) continue;
    const sid = String(m.sender.id);
    let texto = String(msg.text || '').trim();
    if (!texto && Array.isArray(msg.attachments) && msg.attachments.length) {
      const tipos = msg.attachments.map(a => a.type).join(', ');
      texto = '[O cliente enviou um anexo (' + tipos + ') que nao consigo abrir por aqui. Se precisar do conteudo, peca em texto.]';
    }
    if (!texto && m.postback && m.postback.title) texto = String(m.postback.title);
    if (!texto) continue;

    // nome do perfil (uma chamada por mensagem; barata e ajuda o Inbox)
    let nome = '';
    if (token) {
      try {
        const campos = canal === 'instagram' ? 'name,username' : 'first_name,last_name,name';
        const pr = await this.helpers.httpRequest({ method: 'GET', url: 'https://graph.facebook.com/v21.0/' + sid + '?fields=' + campos + '&access_token=' + encodeURIComponent(token), json: true, timeout: 10000 });
        nome = String(pr.name || [pr.first_name, pr.last_name].filter(Boolean).join(' ') || pr.username || '').trim();
      } catch (e) { nome = ''; }
    }

    let r = null;
    try {
      r = await this.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 180000, body: { canal: canal, session_site: prefixo + sid, nome: nome, texto: texto } });
    } catch (e) { out.push({ canal: canal, sid: sid, erro: 'core: ' + e.message }); continue; }
    if (!r || r.pausada || !r.resposta) { out.push({ canal: canal, sid: sid, contato_id: r && r.contato_id, pausada: !!(r && r.pausada), sem_resposta: !(r && r.resposta), erro: r && r.erro }); continue; }

    // envia (Messenger/Instagram limitam ~1000-2000 caracteres por mensagem)
    const partes = []; let resto = String(r.resposta);
    while (resto.length > 950) { let corte = resto.lastIndexOf(String.fromCharCode(10), 950); if (corte < 400) corte = resto.lastIndexOf(' ', 950); if (corte < 400) corte = 950; partes.push(resto.slice(0, corte).trim()); resto = resto.slice(corte).trim(); }
    if (resto) partes.push(resto);
    let ok = true, erro = null;
    for (const parte of partes) {
      try {
        await this.helpers.httpRequest({ method: 'POST', url: 'https://graph.facebook.com/v21.0/me/messages?access_token=' + encodeURIComponent(token), json: true, timeout: 20000, body: { recipient: { id: sid }, messaging_type: 'RESPONSE', message: { text: parte } } });
      } catch (e) { ok = false; erro = String(e.message).slice(0, 200); break; }
    }
    out.push({ canal: canal, sid: sid, contato_id: r.contato_id, enviado: ok, erro: erro, partes: partes.length });
  }
}
return [{ json: { payload: JSON.stringify(out.filter(o => o.enviado && o.contato_id).map(o => o.contato_id)), resultados: out } }];` } },
  output: [{ payload: '[]', resultados: [] }] });
const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Entregue', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_mensagens m set entregue = true from p, jsonb_array_elements_text(coalesce(p.j, '[]'::jsonb)) c where m.contato_id = c::uuid and m.canal in ('instagram', 'messenger') and m.papel = 'serena' and m.entregue is distinct from true and m.criado_em > now() - interval '10 minutes' returning m.id",
  options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } }, credentials: PG }, output: [{ id: 1 }] });

// ---- 3) Saida a cada minuto: respostas de atendentes (Inbox) e qualquer Serena nao entregue ----
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada minuto', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });
const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Pendentes Meta', parameters: { operation: 'executeQuery',
  query: "with cfg as (" + CFG_SQL + ") select (select row_to_json(cfg) from cfg) as cfg, coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'texto', m.texto, 'canal', m.canal, 'sid', substr(c.session_site, 4)) order by m.criado_em) from serena_mensagens m join serena_contatos c on c.id = m.contato_id where m.entregue is distinct from true and m.canal in ('instagram', 'messenger') and m.papel in ('humano', 'serena') and m.criado_em > now() - interval '2 days' and m.criado_em < now() - interval '20 seconds' and (c.session_site like 'ig:%' or c.session_site like 'fb:%') limit 20), '[]'::jsonb) as lista",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ cfg: {}, lista: [] }] });
const enviarPend = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Enviar pela Graph API', parameters: { jsCode: `const d = $input.first().json || {};
const cfg = d.cfg || {};
const lista = Array.isArray(d.lista) ? d.lista : [];
if (!lista.length || String(cfg.ativo || 'off') !== 'on') return [{ json: { payload: '[]', enviados: 0 } }];
const ok = [], falhas = [];
for (const m of lista) {
  const token = (m.canal === 'instagram' && cfg.ig_token) ? cfg.ig_token : cfg.page_token;
  if (!token || !m.sid) { falhas.push({ id: m.id, erro: 'sem token ou sid' }); continue; }
  try {
    await this.helpers.httpRequest({ method: 'POST', url: 'https://graph.facebook.com/v21.0/me/messages?access_token=' + encodeURIComponent(token), json: true, timeout: 20000, body: { recipient: { id: m.sid }, messaging_type: 'RESPONSE', message: { text: String(m.texto || '').slice(0, 1900) } } });
    ok.push(m.id);
  } catch (e) { falhas.push({ id: m.id, erro: String(e.message).slice(0, 200) }); }
}
return [{ json: { payload: JSON.stringify(ok), enviados: ok.length, falhas: falhas } }];` } }, output: [{ payload: '[]', enviados: 0, falhas: [] }] });
const marcarPend = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Entregue (saida)', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_mensagens m set entregue = true from p, jsonb_array_elements_text(coalesce(p.j, '[]'::jsonb)) i where m.id = i::bigint returning m.id",
  options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } }, credentials: PG }, output: [{ id: 1 }] });

const nota = sticky('## Instagram Direct + Messenger com a Serena\n\nConfigurar no app da Meta (developers.facebook.com): Webhooks > Instagram e Page, campo messages, URL https://n8n.americanutrition.com/webhook/serena-meta, verify token = serena_config.meta_verify_token.\n\nserena_config: meta_ativo=on, meta_page_token (token de pagina de longa duracao), meta_ig_token (opcional, login do Instagram), meta_app_secret (opcional, valida assinatura).\n\nEntrada: cada mensagem vai ao Core (canal instagram/messenger, identidade ig:<id> ou fb:<id>) e a resposta sai pela Graph API. Saida (1 min): respostas do Inbox e qualquer mensagem nao entregue.', { color: 4, width: 460, height: 260 });

export default workflow('serena-meta', '[Serena Meta] Instagram + Messenger', { settings: { executionOrder: 'v1' } })
  .add(verifyIn).to(cfgVerify).to(verificar).to(responderVerify)
  .add(eventosIn).to(cfgEventos).to(processar).to(marcar)
  .add(cron).to(pendentes).to(enviarPend).to(marcarPend)
  .add(nota);
