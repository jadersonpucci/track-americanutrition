// [Serena WhatsApp] Arquivar Backlog (cron 10 min)  —  id HvPyooEhiSyasV16
// Versao definitiva (03/09/2026, 16h16): a primeira versao tentava arquivar os ~2.200 chats de uma vez
// e o WhatsApp devolveu "rate-overlimit" em 2.099 deles. Agora roda a cada 10 minutos, 100 chats por
// rodada, 1 a cada 4 segundos, do mais antigo para o mais novo; so os que deram certo sao registrados,
// os que falharam voltam na proxima rodada. Quando a lista acabar, o workflow pode ser desativado
// (o cron "Arquivar Encerradas" de 30 min cuida das conversas novas).
//
// Fluxo: (Executar | A cada 10 minutos) -> Excluir (Postgres) -> Listar Chats (Evolution findChats)
//        -> Preparar (Code) -> Arquivar (Evolution archiveChat, batch 1 / 4000 ms) -> Avaliar (Code) -> Registrar (Postgres)

const EVO_BASE = 'http://evolution-api-aru6-api-1:8080';
const EVO = { httpHeaderAuth: { id: 'EVO_CRED_ID', name: 'Evolution API (apikey)' } };
const PG = { postgres: { id: 'PG_CRED_ID', name: 'Supabase Postgres' } };

// Quem NAO pode ser arquivado: fila humana aberta, cliente esperando resposta (24h), pausados,
// os lids desses telefones e quem ja foi arquivado nos ultimos 30 dias.
const SQL_EXCLUIR = `with tel as (select regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as t from serena_contatos c where exists (select 1 from serena_atribuicoes a where a.contato_id = c.id and a.status = 'aberto') or exists (select 1 from serena_mensagens m where m.contato_id = c.id and m.papel = 'cliente' and m.criado_em > now() - interval '24 hours' and not exists (select 1 from serena_mensagens m2 where m2.contato_id = c.id and m2.papel <> 'cliente' and m2.criado_em > m.criado_em)) union select telefone from serena_wpp_pausas where ate > now()) select coalesce((select jsonb_agg(distinct t) from tel where t <> ''), '[]'::jsonb) as telefones, coalesce((select jsonb_agg(distinct w.lid) from wa_identidades w join tel on w.telefone = tel.t where nullif(w.lid, '') is not null), '[]'::jsonb) as lids, coalesce((select jsonb_agg(telefone) from serena_wpp_arquivadas where resultado = 'arquivado' and arquivado_em > now() - interval '30 days'), '[]'::jsonb) as ja`;

const JS_PREPARAR = `// Chats que a Evolution conhece, menos grupos, fila humana, pausados, clientes esperando resposta, ja arquivados (30 dias) e chats com mensagem nas ultimas 12h.
// Mais antigos primeiro, 100 por rodada, para nao bater no limite de velocidade do WhatsApp (rate-overlimit).
const ex = $('Excluir').first().json || {};
const tels = new Set((ex.telefones || []).map(String));
const lids = new Set((ex.lids || []).map(String));
const ja = new Set((ex.ja || []).map(String));
const raw = $input.all().map(i => i.json);
let lista = [];
for (const r of raw) { if (Array.isArray(r)) lista = lista.concat(r); else if (r && Array.isArray(r.data)) lista = lista.concat(r.data); else if (r && Array.isArray(r.chats)) lista = lista.concat(r.chats); else if (r && r.remoteJid) lista.push(r); }
const agora = Math.floor(Date.now() / 1000);
const out = [];
let pulados = 0, semMsg = 0, recentes = 0, feitos = 0;
for (const c of lista) {
  const jid = String(c.remoteJid || c.id || '');
  if (!jid || /@g\\.us$|@broadcast$|@newsletter$|status@/.test(jid)) continue;
  const num = jid.split('@')[0].replace(/\\D/g, '');
  const chaveReg = /@lid$/.test(jid) ? 'lid:' + num : num;
  if (tels.has(num) || lids.has(num)) { pulados++; continue; }
  if (ja.has(chaveReg)) { feitos++; continue; }
  const lm = c.lastMessage || c.last_message || null;
  const key = lm && lm.key ? lm.key : null;
  if (!key || !key.id) { semMsg++; continue; }
  const ts = Number(lm.messageTimestamp || lm.timestamp || 0) || 0;
  if (ts && (agora - ts) < 12 * 3600) { recentes++; continue; }
  out.push({ json: { vazio: false, jid: jid, num: num, chave: chaveReg, nome: c.pushName || c.name || '', ts: ts, lastMessage: { key: { remoteJid: key.remoteJid || jid, fromMe: !!key.fromMe, id: String(key.id) }, messageTimestamp: ts || agora } } });
}
out.sort((a, b) => a.json.ts - b.json.ts);
const lote = out.slice(0, 100);
if (!lote.length) return [{ json: { vazio: true, total_chats: lista.length, pulados: pulados, sem_msg: semMsg, recentes: recentes, ja_arquivados: feitos } }];
return lote;`;

const JS_AVALIAR = `const itens = $('Preparar').all().map(i => i.json);
const resp = $input.all().map(i => i.json || {});
if (itens.length === 1 && itens[0].vazio) return [{ json: Object.assign({ payload: '[]', arquivados: 0, falhas: 0 }, itens[0]) }];
const rows = []; let ok = 0; const erros = {};
for (let i = 0; i < itens.length; i++) {
  const it = itens[i]; const r = resp[i] || {};
  const deu = r.archived === true || (r.chatId && r.archived !== false);
  if (deu) { ok++; rows.push({ telefone: it.chave, resultado: 'arquivado' }); }
  else { const e = JSON.stringify(r).slice(0, 200); erros[e] = (erros[e] || 0) + 1; }
}
// so os que deram certo sao registrados; os que falharam voltam na proxima rodada
return [{ json: { payload: JSON.stringify(rows), total: itens.length, arquivados: ok, falhas: itens.length - ok, erros: erros } }];`;

const SQL_REGISTRAR = `with p as (select $1::jsonb j) insert into serena_wpp_arquivadas (telefone, ultima_msg_em, arquivado_em, resultado) select x->>'telefone', now(), now(), x->>'resultado' from p, jsonb_array_elements(p.j) x on conflict (telefone) do update set ultima_msg_em = now(), arquivado_em = now(), resultado = excluded.resultado returning telefone`;

const wf = workflow('HvPyooEhiSyasV16', '[Serena WhatsApp] Arquivar Backlog (cron 10 min)', { settings: { executionOrder: 'v1' } });

const manual = trigger('n8n-nodes-base.manualTrigger', { name: 'Executar', typeVersion: 1 });
const cron = trigger('n8n-nodes-base.scheduleTrigger', { name: 'A cada 10 minutos', typeVersion: 1.3, parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } });

const excluir = node('n8n-nodes-base.postgres', { name: 'Excluir', typeVersion: 2.6, credentials: PG, alwaysOutputData: true,
  parameters: { operation: 'executeQuery', query: SQL_EXCLUIR, options: { queryBatching: 'single' } } });

const listar = node('n8n-nodes-base.httpRequest', { name: 'Listar Chats (Evolution)', typeVersion: 4.2, credentials: EVO, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: EVO_BASE + '/chat/findChats/Samuel', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '{}', options: { response: { response: { neverError: true } }, timeout: 120000 } } });

const preparar = node('n8n-nodes-base.code', { name: 'Preparar', typeVersion: 2, parameters: { jsCode: JS_PREPARAR } });

const arquivar = node('n8n-nodes-base.httpRequest', { name: 'Arquivar (Evolution)', typeVersion: 4.2, credentials: EVO, alwaysOutputData: true, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: EVO_BASE + '/chat/archiveChat/Samuel', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify($json.vazio ? { chat: '', archive: false } : { lastMessage: $json.lastMessage, chat: $json.jid, archive: true }) }}",
    options: { batching: { batch: { batchSize: 1, batchInterval: 4000 } }, response: { response: { neverError: true } }, timeout: 30000 } } });

const avaliar = node('n8n-nodes-base.code', { name: 'Avaliar', typeVersion: 2, parameters: { jsCode: JS_AVALIAR } });

const registrar = node('n8n-nodes-base.postgres', { name: 'Registrar', typeVersion: 2.6, credentials: PG, alwaysOutputData: true,
  parameters: { operation: 'executeQuery', query: SQL_REGISTRAR, options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } } });

wf.add(manual.then(excluir).then(listar).then(preparar).then(arquivar).then(avaliar).then(registrar));
wf.add(cron.then(excluir));
return wf;
