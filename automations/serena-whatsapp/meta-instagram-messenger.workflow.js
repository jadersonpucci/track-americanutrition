// n8n Workflow SDK — [Serena Meta] Instagram + Messenger (webhook GET/POST serena-meta + saida a cada minuto)
// 12/11/2026: reescrito para a credencial do n8n "Meta DM Instagram" (token de pagina do app America Nutrition - Serena,
// so para mensagens; o token dos comentarios fica na "Meta Graph API" e nao e tocado). Nenhum token no banco nem no codigo.
// serena_config.meta_ativo: off | teste | on. Em teste a Serena so responde aos @ listados em meta_teste_usernames
// (separados por virgula); os demais ficam sem resposta automatica (a equipe ve pelo app do Instagram).
// O texto da Serena vem no estilo WhatsApp (*negrito*, _italico_); Instagram e Messenger nao formatam: vai sem marcadores.
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const DM = { httpHeaderAuth: { id: 'hL0Ld5Jkr2pz5S7U', name: 'Meta DM Instagram' } };
const CFG_SQL = "select coalesce((select valor from serena_config where chave = 'meta_ativo'), 'off') as ativo, coalesce((select valor from serena_config where chave = 'meta_verify_token'), '') as verify_token, coalesce((select valor from serena_config where chave = 'meta_teste_usernames'), '') as teste";
const SEM_ERRO = { response: { response: { neverError: true } } };

// ---- 1) Verificacao do webhook (GET) ----
const verifyIn = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Meta Verify (GET)', parameters: { httpMethod: 'GET', path: 'serena-meta', responseMode: 'responseNode', options: {} } },
  output: [{ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '123' } }] });
const cfgVerify = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config (verify)', parameters: { operation: 'executeQuery', query: CFG_SQL, options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ ativo: 'off', verify_token: '', teste: '' }] });
const verificar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Checar Token', parameters: { jsCode: `const q = ($('Meta Verify (GET)').first().json || {}).query || {};
const cfg = $input.first().json || {};
const ok = q['hub.mode'] === 'subscribe' && cfg.verify_token && q['hub.verify_token'] === cfg.verify_token;
return [{ json: { ok: ok, body: ok ? String(q['hub.challenge'] || '') : 'token invalido', code: ok ? 200 : 403 } }];` } }, output: [{ ok: true, body: '123', code: 200 }] });
const responderVerify = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Responder Verify', parameters: { respondWith: 'text', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.code }}' } } }, output: [{}] });

// ---- 2) Eventos (POST): responde 200 na hora e processa em seguida ----
const eventosIn = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Meta Eventos (POST)', parameters: { httpMethod: 'POST', path: 'serena-meta', responseMode: 'onReceived', options: {} } },
  output: [{ body: { object: 'instagram', entry: [{ id: '1', messaging: [{ sender: { id: '9' }, recipient: { id: '1' }, message: { mid: 'm1', text: 'oi' } }] }] } }] });
const cfgEventos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Config (eventos)', parameters: { operation: 'executeQuery', query: CFG_SQL, options: { queryBatching: 'single' } }, credentials: PG },
  output: [{ ativo: 'off', verify_token: '', teste: '' }] });
const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Separar Mensagens', parameters: { jsCode: `// Instagram Direct e Messenger chegam no mesmo formato (entry[].messaging[]). Uma saida por mensagem do cliente.
const cfg = $input.first().json || {};
const body = ($('Meta Eventos (POST)').first().json || {}).body || {};
const ativo = String(cfg.ativo || 'off');
if (ativo !== 'on' && ativo !== 'teste') return [];
const objeto = String(body.object || '').toLowerCase();
const canal = objeto === 'instagram' ? 'instagram' : 'messenger';
const out = [];
for (const entry of (Array.isArray(body.entry) ? body.entry : [])) {
  for (const m of (Array.isArray(entry.messaging) ? entry.messaging : [])) {
    const msg = m.message || {};
    if (!m.sender || !m.sender.id || msg.is_echo || m.read || m.delivery || m.reaction) continue;
    if (String(m.sender.id) === String(entry.id)) continue; // a propria conta
    let texto = String(msg.text || '').trim();
    if (!texto && msg.quick_reply && msg.quick_reply.payload) texto = String(msg.quick_reply.payload);
    if (!texto && Array.isArray(msg.attachments) && msg.attachments.length) {
      const tipos = msg.attachments.map(a => a.type).join(', ');
      texto = '[O cliente enviou um anexo (' + tipos + ') que nao consigo abrir por aqui. Se precisar do conteudo, peca em texto.]';
    }
    if (!texto && m.postback && m.postback.title) texto = String(m.postback.title);
    if (!texto) continue;
    out.push({ json: { canal: canal, sid: String(m.sender.id), texto: texto.slice(0, 1200), ativo: ativo, teste: String(cfg.teste || '') } });
  }
}
return out;` } }, output: [{ canal: 'instagram', sid: '9', texto: 'oi', ativo: 'teste', teste: 'fulano' }] });
const perfil = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Perfil', parameters: { method: 'GET',
  url: expr("{{ 'https://graph.facebook.com/v21.0/' + $json.sid + '?fields=' + ($json.canal === 'instagram' ? 'name,username' : 'first_name,last_name,name') }}"),
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: SEM_ERRO }, credentials: DM, onError: 'continueRegularOutput' }, output: [{ name: 'Fulano', username: 'fulano' }] });
const serena = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Chamar Serena', parameters: { jsCode: `const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const msgs = $('Separar Mensagens').all();
const perfis = $input.all();
const puro = (t) => String(t || '').replace(/\\[\\[[A-Z]+:[^\\]]*\\]\\]/g, '').replace(/\`\`\`([\\s\\S]+?)\`\`\`/g, '$1').replace(/(^|[\\s(])[*_~](?!\\s)([^*_~\\n]+?)(?<!\\s)[*_~](?=$|[\\s).,!?:;])/gm, '$1$2').trim();
const out = [];
for (let i = 0; i < msgs.length; i++) {
  const m = msgs[i].json;
  const p = (perfis[i] && perfis[i].json) || {};
  const nome = String(p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || '').trim();
  const user = String(p.username || '').toLowerCase().replace(/^@/, '');
  if (m.ativo === 'teste') {
    const lista = m.teste.split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    if (!user || lista.indexOf(user) < 0) continue; // modo teste: so quem esta na lista
  }
  let r = null;
  try {
    r = await this.helpers.httpRequest({ method: 'POST', url: CORE, json: true, timeout: 180000, body: { canal: m.canal, session_site: (m.canal === 'instagram' ? 'ig:' : 'fb:') + m.sid, nome: nome, texto: m.texto } });
  } catch (e) { continue; }
  if (!r || r.pausada || !r.resposta) continue;
  // Instagram e Messenger limitam o tamanho da mensagem: divide em partes de ate ~950 caracteres
  const partes = []; let resto = puro(r.resposta);
  while (resto.length > 950) { let corte = resto.lastIndexOf(String.fromCharCode(10), 950); if (corte < 400) corte = resto.lastIndexOf(' ', 950); if (corte < 400) corte = 950; partes.push(resto.slice(0, corte).trim()); resto = resto.slice(corte).trim(); }
  if (resto) partes.push(resto);
  partes.forEach((t) => out.push({ json: { sid: m.sid, texto: t, contato_id: r.contato_id || null } }));
}
return out;` } }, output: [{ sid: '9', texto: 'Oi!', contato_id: null }] });
const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Enviar Resposta', parameters: { method: 'POST', url: 'https://graph.facebook.com/v21.0/me/messages',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ recipient: { id: $json.sid }, messaging_type: 'RESPONSE', message: { text: $json.texto } }) }}"), options: SEM_ERRO }, credentials: DM, onError: 'continueRegularOutput' }, output: [{ message_id: 'mid' }] });
const resumo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar Envios', parameters: { jsCode: `const pedidos = $('Chamar Serena').all();
const resp = $input.all();
const ok = new Set(), falhas = [];
pedidos.forEach((p, i) => { const r = (resp[i] && resp[i].json) || {}; if (r.message_id && p.json.contato_id) ok.add(p.json.contato_id); else if (!r.message_id) falhas.push({ sid: p.json.sid, erro: JSON.stringify(r.error || r).slice(0, 200) }); });
return [{ json: { payload: JSON.stringify(Array.from(ok)), falhas: falhas } }];` } }, output: [{ payload: '[]', falhas: [] }] });
const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Entregue', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_mensagens m set entregue = true from p, jsonb_array_elements_text(coalesce(p.j, '[]'::jsonb)) c where m.contato_id = c::uuid and m.canal in ('instagram', 'messenger') and m.papel = 'serena' and m.entregue is distinct from true and m.criado_em > now() - interval '10 minutes' returning m.id",
  options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } }, credentials: PG }, output: [{ id: 1 }] });

// ---- 3) Saida a cada minuto: respostas de atendentes (Inbox) e qualquer Serena nao entregue ----
const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada minuto', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });
const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Pendentes Meta', parameters: { operation: 'executeQuery',
  query: "select m.id, m.texto, m.canal, substr(c.session_site, 4) as sid from serena_mensagens m join serena_contatos c on c.id = m.contato_id where (select valor from serena_config where chave = 'meta_ativo') in ('on', 'teste') and m.entregue is distinct from true and m.canal in ('instagram', 'messenger') and m.papel in ('humano', 'serena') and nullif(m.texto, '') is not null and m.criado_em > now() - interval '2 days' and m.criado_em < now() - interval '20 seconds' and (c.session_site like 'ig:%' or c.session_site like 'fb:%') order by m.criado_em limit 20",
  options: {} }, credentials: PG }, output: [{ id: 1, texto: 'oi', canal: 'instagram', sid: '9' }] });
const enviarPend = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Enviar do Inbox', parameters: { method: 'POST', url: 'https://graph.facebook.com/v21.0/me/messages',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: expr("{{ JSON.stringify({ recipient: { id: $json.sid }, messaging_type: 'RESPONSE', message: { text: String($json.texto || '').replace(/\\[\\[[A-Z]+:[^\\]]*\\]\\]/g, '').replace(/(^|[\\s(])[*_~](?!\\s)([^*_~\\n]+?)(?<!\\s)[*_~](?=$|[\\s).,!?:;])/gm, '$1$2').trim().slice(0, 1900) } }) }}"),
  options: SEM_ERRO }, credentials: DM, onError: 'continueRegularOutput' }, output: [{ message_id: 'mid' }] });
const juntarPend = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar Saida', parameters: { jsCode: `const pend = $('Pendentes Meta').all();
const resp = $input.all();
const ok = [];
pend.forEach((p, i) => { const r = (resp[i] && resp[i].json) || {}; if (r.message_id) ok.push(p.json.id); });
return [{ json: { payload: JSON.stringify(ok), enviados: ok.length, tentados: pend.length } }];` } }, output: [{ payload: '[]', enviados: 0 }] });
const marcarPend = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Entregue (saida)', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) update serena_mensagens m set entregue = true from p, jsonb_array_elements_text(coalesce(p.j, '[]'::jsonb)) i where m.id = i::bigint returning m.id",
  options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } }, credentials: PG }, output: [{ id: 1 }] });

const nota = sticky('## Instagram Direct + Messenger com a Serena\n\nToken: credencial "Meta DM Instagram" (so mensagens). A "Meta Graph API" e dos comentarios e nao e usada aqui.\n\nserena_config.meta_ativo: off | teste | on. Em teste, so responde aos @ de meta_teste_usernames.\n\nEntrada: cada mensagem vai ao Core (canal instagram/messenger, identidade ig:<id> ou fb:<id>) e a resposta sai pela Graph API, sem marcadores do WhatsApp. Saida (1 min): respostas do Inbox e o que nao foi entregue.', { color: 4, width: 460, height: 260 });

export default workflow('serena-meta', '[Serena Meta] Instagram + Messenger', { settings: { executionOrder: 'v1' } })
  .add(verifyIn).to(cfgVerify).to(verificar).to(responderVerify)
  .add(eventosIn).to(cfgEventos).to(preparar).to(perfil).to(serena).to(enviar).to(resumo).to(marcar)
  .add(cron).to(pendentes).to(enviarPend).to(juntarPend).to(marcarPend)
  .add(nota);
