// n8n Workflow SDK — [Serena WhatsApp] Arquivar Encerradas (id yxmtI8rj4UU3XeYB, cron 30 min)
// Versao final (apos criacao, os nodes Candidatas / Montar / Arquivar / Avaliar foram ajustados via update_workflow; este arquivo ja reflete o estado atual).
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const EVO = { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 30 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } }, output: [{ timestamp: '2026-01-01T00:00:00Z' }] });

const tabela = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Garantir Tabela e Config', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_wpp_arquivadas (telefone text primary key, ultima_msg_em timestamptz, arquivado_em timestamptz not null default now(), resultado text); insert into serena_config (chave, valor) select v.c, v.v from (values ('wpp_arquivar', 'on'), ('wpp_arquivar_horas', '12')) as v(c, v) where not exists (select 1 from serena_config s where s.chave = v.c)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

// Conversa encerrada: ultima mensagem foi nossa ha mais de wpp_arquivar_horas, ou o cliente escreveu por ultimo ha 7 dias sem resposta.
// Nunca: fila humana aberta ou pausa ativa. O jid usa o @lid do wa_identidades quando conhecido (chats novos do WhatsApp), senao telefone@s.whatsapp.net.
const candidatas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Candidatas', parameters: { operation: 'executeQuery',
  query: "with cfg as (select coalesce((select valor from serena_config where chave = 'wpp_arquivar'), 'on') as ativo, coalesce((select valor from serena_config where chave = 'wpp_arquivar_horas'), '12')::int as horas), ult as (select distinct on (m.contato_id) m.contato_id, m.papel, m.criado_em from serena_mensagens m where m.canal = 'whatsapp' and m.criado_em > now() - interval '60 days' order by m.contato_id, m.criado_em desc), cand as (select c.id, regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') as telefone, c.nome, u.papel, u.criado_em from ult u join serena_contatos c on c.id = u.contato_id, cfg where cfg.ativo = 'on' and length(regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g')) between 10 and 15 and ((u.papel <> 'cliente' and u.criado_em < now() - make_interval(hours => cfg.horas)) or (u.papel = 'cliente' and u.criado_em < now() - interval '7 days')) and not exists (select 1 from serena_atribuicoes a where a.contato_id = c.id and a.status = 'aberto') and not exists (select 1 from serena_wpp_pausas p where p.telefone = regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') and p.ate > now()) and not exists (select 1 from serena_wpp_arquivadas w where w.telefone = regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') and w.ultima_msg_em >= u.criado_em - interval '1 second')) select cand.id::text as contato_id, cand.telefone, cand.nome, cand.criado_em as ultima_msg_em, (select w.lid from wa_identidades w where w.telefone = cand.telefone and nullif(w.lid, '') is not null order by w.atualizado_em desc limit 1) as lid, coalesce((select w.lid || '@lid' from wa_identidades w where w.telefone = cand.telefone and nullif(w.lid, '') is not null order by w.atualizado_em desc limit 1), cand.telefone || '@s.whatsapp.net') as jid from cand order by cand.criado_em desc limit 60",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ contato_id: 'x', telefone: '5511999999999', nome: 'Maria', ultima_msg_em: '2026-01-01T00:00:00Z', lid: null, jid: '5511999999999@s.whatsapp.net' }] });

// O WhatsApp exige a chave da ultima mensagem do chat para arquivar
const ultima = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Ultima Mensagem (Evolution)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/chat/findMessages/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ where: { key: { remoteJid: $json.jid } }, page: 1, offset: 1 }) }}",
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } }, response: { response: { neverError: true } }, timeout: 30000 } }, credentials: EVO, onError: 'continueRegularOutput' },
  output: [{ messages: { records: [{ key: { remoteJid: 'x', fromMe: true, id: 'abc' } }] } }] });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar Arquivamento', parameters: { jsCode: `// So os chats que a Evolution conhece (tem mensagem gravada) seguem para o arquivamento; os demais viram 'sem_chat' no Avaliar
const cands = $('Candidatas').all().map(i => i.json);
const resp = $input.all().map(i => i.json || {});
const out = [];
for (let i = 0; i < cands.length; i++) {
  const c = cands[i]; const r = resp[i] || {};
  const recs = (r.messages && Array.isArray(r.messages.records)) ? r.messages.records : (Array.isArray(r.records) ? r.records : (Array.isArray(r) ? r : []));
  const k = recs[0] && recs[0].key;
  if (!k || !k.id) continue;
  out.push({ json: { idx: i, telefone: c.telefone, ultima_msg_em: c.ultima_msg_em, jid: k.remoteJid || c.jid, key: { remoteJid: k.remoteJid || c.jid, fromMe: !!k.fromMe, id: String(k.id) } } });
}
return out;` } }, output: [{ idx: 0, telefone: '5511999999999', ultima_msg_em: '2026-01-01T00:00:00Z', jid: 'x', key: { remoteJid: 'x', fromMe: true, id: 'abc' } }] });

const arquivar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Arquivar (Evolution)', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/chat/archiveChat/Samuel',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ lastMessage: { key: $json.key }, chat: $json.jid, archive: true }) }}",
  options: { batching: { batch: { batchSize: 1, batchInterval: 600 } }, response: { response: { neverError: true } }, timeout: 30000 } }, credentials: EVO, onError: 'continueRegularOutput', alwaysOutputData: true },
  output: [{ chatId: 'x', archived: true }] });

const avaliar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avaliar', parameters: { jsCode: `const cands = $('Candidatas').all().map(i => i.json);
let itens = []; try { itens = $('Montar Arquivamento').all().map(i => i.json); } catch (e) { itens = []; }
const resp = $input.all().map(i => i.json || {});
const porIdx = {};
itens.forEach((it, i) => { porIdx[it.idx] = resp[i] || {}; });
const rows = [];
let ok = 0;
for (let i = 0; i < cands.length; i++) {
  const c = cands[i];
  let resultado = 'sem_chat';
  if (porIdx[i] !== undefined) {
    const r = porIdx[i];
    const deu = r.archived === true || (r.chatId && r.archived !== false) || (r.response && r.response.archived === true);
    resultado = deu ? 'arquivado' : 'falha: ' + JSON.stringify(r).slice(0, 160);
    if (deu) ok++;
  }
  rows.push({ telefone: c.telefone, ultima_msg_em: c.ultima_msg_em, resultado: resultado });
}
return [{ json: { payload: JSON.stringify(rows), total: rows.length, arquivados: ok, sem_chat: rows.filter(r => r.resultado === 'sem_chat').length } }];` } }, output: [{ payload: '[]', total: 0, arquivados: 0, sem_chat: 0 }] });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar', parameters: { operation: 'executeQuery',
  query: "with p as (select $1::jsonb j) insert into serena_wpp_arquivadas (telefone, ultima_msg_em, arquivado_em, resultado) select x->>'telefone', (x->>'ultima_msg_em')::timestamptz, now(), x->>'resultado' from p, jsonb_array_elements(p.j) x on conflict (telefone) do update set ultima_msg_em = excluded.ultima_msg_em, arquivado_em = now(), resultado = excluded.resultado returning telefone",
  options: { queryReplacement: "={{ [$json.payload] }}", queryBatching: 'single' } }, credentials: PG }, output: [{ telefone: 'x' }] });

const nota = sticky('## Arquivar conversas encerradas no WhatsApp do Samuel\n\nA cada 30 min: conversas cuja ultima mensagem foi nossa ha mais de wpp_arquivar_horas (12) ou do cliente sem resposta ha 7 dias, sem fila humana aberta e sem pausa, sao arquivadas no aparelho (Evolution chat/archiveChat). Quando o cliente escreve de novo o WhatsApp desarquiva sozinho (manter "Conversas arquivadas permanecem arquivadas" DESLIGADO no celular).\n\nRegistro em serena_wpp_arquivadas (uma vez por conversa, ate chegar mensagem nova). Kill switch: wpp_arquivar=off.', { color: 4, width: 460, height: 230 });

export default workflow('serena-wpp-arquivar', '[Serena WhatsApp] Arquivar Encerradas', { settings: { executionOrder: 'v1' } })
  .add(cron).to(tabela).to(candidatas).to(ultima).to(montar).to(arquivar).to(avaliar).to(registrar).add(nota);
