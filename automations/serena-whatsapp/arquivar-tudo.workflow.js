// n8n Workflow SDK — [Serena WhatsApp] Arquivar TUDO (manual, id HvPyooEhiSyasV16)
// Rodar a mao quando quiser limpar o celular do Samuel: lista os chats na Evolution (findChats) e arquiva todos,
// pulando grupos, fila humana aberta, pausados e clientes esperando resposta. O cron "Arquivar Encerradas" cuida das proximas.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const EVO = { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } };

const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Executar' }, output: [{}] });

const excluir = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Excluir', parameters: { operation: 'executeQuery',
  query: "with tel as (select regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as t from serena_contatos c where exists (select 1 from serena_atribuicoes a where a.contato_id = c.id and a.status = 'aberto') or exists (select 1 from serena_mensagens m where m.contato_id = c.id and m.papel = 'cliente' and m.criado_em > now() - interval '24 hours' and not exists (select 1 from serena_mensagens m2 where m2.contato_id = c.id and m2.papel <> 'cliente' and m2.criado_em > m.criado_em)) union select telefone from serena_wpp_pausas where ate > now()) select coalesce(jsonb_agg(distinct t), '[]'::jsonb) as telefones, coalesce((select jsonb_agg(distinct w.lid) from wa_identidades w join tel on w.telefone = tel.t where nullif(w.lid, '') is not null), '[]'::jsonb) as lids from tel where t <> ''",
  options: { queryBatching: 'single' } }, credentials: PG, alwaysOutputData: true }, output: [{ telefones: [], lids: [] }] });

const chats = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Listar Chats (Evolution)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/chat/findChats/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "{}",
  options: { response: { response: { neverError: true } }, timeout: 120000 } }, credentials: EVO, onError: 'continueRegularOutput' },
  output: [{ data: [] }] });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const ex = $('Excluir').first().json || {};
const tels = new Set((ex.telefones || []).map(String));
const lids = new Set((ex.lids || []).map(String));
const raw = $input.all().map(i => i.json);
let lista = [];
for (const r of raw) { if (Array.isArray(r)) lista = lista.concat(r); else if (r && Array.isArray(r.data)) lista = lista.concat(r.data); else if (r && Array.isArray(r.chats)) lista = lista.concat(r.chats); else if (r && r.remoteJid) lista.push(r); }
const out = [];
let pulados = 0, semMsg = 0;
for (const c of lista) {
  const jid = String(c.remoteJid || c.id || '');
  if (!jid || /@g\\.us$|@broadcast$|@newsletter$|status@/.test(jid)) continue;
  const num = jid.split('@')[0].replace(/\\D/g, '');
  if (tels.has(num) || lids.has(num)) { pulados++; continue; }
  const lm = c.lastMessage || c.last_message || null;
  const key = lm && lm.key ? lm.key : null;
  if (!key || !key.id) { semMsg++; continue; }
  const ts = Number(lm.messageTimestamp || lm.timestamp || 0) || Math.floor(Date.now() / 1000);
  out.push({ json: { vazio: false, jid: jid, num: num, nome: c.pushName || c.name || '', lastMessage: { key: { remoteJid: key.remoteJid || jid, fromMe: !!key.fromMe, id: String(key.id) }, messageTimestamp: ts } } });
}
if (!out.length) return [{ json: { vazio: true, total_chats: lista.length, pulados: pulados, sem_msg: semMsg, amostra: JSON.stringify(lista.slice(0, 2)).slice(0, 1500) } }];
return out;` } }, output: [{ vazio: false, jid: 'x@s.whatsapp.net', num: '5511999999999', nome: 'x', lastMessage: { key: { remoteJid: 'x', fromMe: true, id: 'abc' }, messageTimestamp: 1 } }] });

const arquivar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Arquivar (Evolution)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/chat/archiveChat/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($json.vazio ? { chat: '', archive: false } : { lastMessage: $json.lastMessage, chat: $json.jid, archive: true }) }}",
  options: { batching: { batch: { batchSize: 1, batchInterval: 500 } }, response: { response: { neverError: true } }, timeout: 30000 } }, credentials: EVO, onError: 'continueRegularOutput', alwaysOutputData: true },
  output: [{ chatId: 'x', archived: true }] });

const avaliar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avaliar', parameters: { jsCode: `const itens = $('Preparar').all().map(i => i.json);
const resp = $input.all().map(i => i.json || {});
if (itens.length === 1 && itens[0].vazio) return [{ json: Object.assign({ payload: '[]', arquivados: 0, falhas: 0 }, itens[0]) }];
const rows = []; let ok = 0; const erros = {};
for (let i = 0; i < itens.length; i++) {
  const it = itens[i]; const r = resp[i] || {};
  const deu = r.archived === true || (r.chatId && r.archived !== false);
  if (deu) ok++; else { const e = JSON.stringify(r).slice(0, 120); erros[e] = (erros[e] || 0) + 1; }
  if (it.num && it.num.length >= 10 && it.num.length <= 15 && !/@lid$/.test(it.jid)) rows.push({ telefone: it.num, resultado: deu ? 'arquivado' : 'falha' });
}
return [{ json: { payload: JSON.stringify(rows), total: itens.length, arquivados: ok, falhas: itens.length - ok, erros: erros } }];` } }, output: [{ payload: '[]', total: 0, arquivados: 0, falhas: 0, erros: {} }] });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into serena_wpp_arquivadas (telefone, ultima_msg_em, arquivado_em, resultado) select x->>'telefone', now(), now(), x->>'resultado' from p, jsonb_array_elements(p.j) x on conflict (telefone) do update set ultima_msg_em = now(), arquivado_em = now(), resultado = excluded.resultado returning telefone",
  options: { queryReplacement: "={{ [$json.payload || '[]'] }}", queryBatching: 'single' } }, credentials: PG, alwaysOutputData: true }, output: [{ telefone: 'x' }] });

const nota = sticky('## Arquivar TUDO (rodar a mao)\n\nPega a lista de chats que a Evolution tem do aparelho (findChats), pula grupos, quem esta na fila humana, pausados e clientes esperando resposta, e arquiva o resto com a chave da ultima mensagem que o proprio findChats devolve. Registra em serena_wpp_arquivadas. O cron de 30 min cuida das proximas.', { color: 5, width: 420, height: 180 });

export default workflow('serena-wpp-arquivar-tudo', '[Serena WhatsApp] Arquivar TUDO (manual)', { settings: { executionOrder: 'v1' } })
  .add(start).to(excluir).to(chats).to(preparar).to(arquivar).to(avaliar).to(registrar).add(nota);
