// n8n Workflow SDK — [Serena WhatsApp] Saida Painel -> Samuel + Config (id BTJBa03LiBillfHy)
import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const EVO = { httpHeaderAuth: { id: 'PgPwcyexFAbimWtd', name: 'Evolution Samuel' } };

const cron = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 1 minuto', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } }, output: [{ timestamp: '2026-09-03T12:00:00Z' }] });

const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Pendentes do Painel', parameters: { operation: 'executeQuery',
  query: "select m.id::text as id, m.texto, regexp_replace(c.telefone, '\\D', '', 'g') as number from serena_mensagens m join serena_contatos c on c.id = m.contato_id where m.papel = 'humano' and m.canal = 'whatsapp' and m.entregue = false and coalesce(m.autor, '') <> 'celular' and m.criado_em > now() - interval '24 hours' and c.telefone is not null and length(regexp_replace(c.telefone, '\\D', '', 'g')) between 10 and 15 order by m.criado_em asc limit 20",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ id: '1', texto: 'Oi, aqui e o Rafael do atendimento', number: '5511999999999' }] });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Enviar pelo Samuel', parameters: {
  method: 'POST', url: 'http://evolution-api-aru6-api-1:8080/message/sendText/Samuel', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ number: $json.number, text: $json.texto, delay: 1200 }) }}'),
  options: { batching: { batch: { batchSize: 1, batchInterval: 1500 } }, response: { response: { neverError: true } }, timeout: 60000 } }, credentials: EVO },
  output: [{ key: { id: 'BAE5...' }, status: 'PENDING' }] });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir Envios', parameters: {
  jsCode: "const pend = $('Pendentes do Painel').all().map(i => i.json);\nconst resp = $input.all().map(i => i.json || {});\nconst ok = [];\nconst falhas = [];\nfor (let i = 0; i < pend.length; i++) {\n  const r = resp[i] || {};\n  const enviado = !!(r.key && r.key.id) || !!r.messageId;\n  if (enviado) ok.push(pend[i].id); else falhas.push({ id: pend[i].id, erro: JSON.stringify(r).slice(0, 200) });\n}\nif (!ok.length) return [];\nreturn [{ json: { entregues: ok.length, falhas: falhas, payload: JSON.stringify(ok) } }];" } },
  output: [{ entregues: 1, falhas: [], payload: '["1"]' }] });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar Entregues', parameters: { operation: 'executeQuery',
  query: 'update serena_mensagens set entregue = true where id::text in (select jsonb_array_elements_text($1::jsonb)) returning id::text as id',
  options: { queryReplacement: expr('{{ [$json.payload] }}'), queryBatching: 'single' } }, credentials: PG }, output: [{ id: '1' }] });

const configIn = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Config IN', parameters: { httpMethod: 'GET', path: 'serena-wpp-config', responseMode: 'lastNode', responseData: 'firstEntryJson', options: {} } }, output: [{ query: { t: 'TOKEN', chave: 'wpp_modo', valor: 'producao' } }] });

const validarConfig = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar Config', parameters: {
  jsCode: "const TOKEN = 'an-wpp-7Qm3Vz9K';\nconst q = $input.first().json.query || {};\nif (String(q.t || '') !== TOKEN) { return [{ json: { ok: false, erro: 'nao autorizado', chave: '', valor: '', liberar: '' } }]; }\n\nconst CHAVES = ['wpp_modo', 'wpp_teste_numeros', 'wpp_max_por_hora', 'wpp_pausa_humano_min', 'wpp_ignorar_regex', 'wpp_debounce_seg'];\nlet chave = String(q.chave || '').trim();\nlet valor = q.valor === undefined ? '' : String(q.valor).trim();\nconst liberar = String(q.liberar || '').replace(/\\D/g, '');\n\nif (chave) {\n  if (CHAVES.indexOf(chave) < 0) return [{ json: { ok: false, erro: 'chave invalida. use: ' + CHAVES.join(', '), chave: '', valor: '', liberar: '' } }];\n  if (chave === 'wpp_modo' && ['teste', 'producao', 'off'].indexOf(valor) < 0) return [{ json: { ok: false, erro: 'wpp_modo aceita: teste, producao, off', chave: '', valor: '', liberar: '' } }];\n  if (chave === 'wpp_teste_numeros') valor = valor.split(/[\\s,;]+/).map(n => n.replace(/\\D/g, '')).filter(n => n.length >= 10).join(',');\n  if (['wpp_max_por_hora', 'wpp_pausa_humano_min', 'wpp_debounce_seg'].indexOf(chave) >= 0 && !/^\\d+$/.test(valor)) return [{ json: { ok: false, erro: chave + ' precisa ser numero inteiro', chave: '', valor: '', liberar: '' } }];\n  if (chave === 'wpp_ignorar_regex' && valor) { try { new RegExp(valor, 'i'); } catch (e) { return [{ json: { ok: false, erro: 'regex invalida', chave: '', valor: '', liberar: '' } }]; } }\n}\nreturn [{ json: { ok: true, erro: null, chave: chave, valor: valor, liberar: liberar } }];" } },
  output: [{ ok: true, erro: null, chave: 'wpp_modo', valor: 'producao', liberar: '' }] });

const gravarConfig = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar Config', parameters: { operation: 'executeQuery',
  query: "with e as (select $1::jsonb j), upd as (update serena_config s set valor = e.j->>'valor' from e where (e.j->>'ok')::boolean and nullif(e.j->>'chave', '') is not null and s.chave = e.j->>'chave' returning s.chave), ins as (insert into serena_config (chave, valor) select e.j->>'chave', e.j->>'valor' from e where (e.j->>'ok')::boolean and nullif(e.j->>'chave', '') is not null and not exists (select 1 from serena_config s2 where s2.chave = e.j->>'chave') returning chave), lib as (delete from serena_wpp_pausas p using e where (e.j->>'ok')::boolean and nullif(e.j->>'liberar', '') is not null and p.telefone = e.j->>'liberar' returning p.telefone) select (select count(*) from upd) + (select count(*) from ins) as gravadas, (select count(*) from lib) as liberadas",
  options: { queryReplacement: expr('{{ [JSON.stringify($json)] }}'), queryBatching: 'single' } }, credentials: PG }, output: [{ gravadas: 1, liberadas: 0 }] });

const lerConfig = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler Config e Pausas', parameters: { operation: 'executeQuery',
  query: "select (select jsonb_object_agg(chave, valor) from serena_config where chave like 'wpp_%') as config, coalesce((select jsonb_agg(jsonb_build_object('telefone', telefone, 'ate', ate, 'motivo', motivo) order by ate) from serena_wpp_pausas where ate > now()), '[]'::jsonb) as pausas_ativas",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ config: { wpp_modo: 'teste' }, pausas_ativas: [] }] });

const responderConfig = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Responder Config', parameters: {
  jsCode: "const v = $('Validar Config').first().json;\nconst g = $('Gravar Config').first().json || {};\nconst c = $input.first().json || {};\nreturn [{ json: { ok: v.ok, erro: v.erro || null, gravadas: Number(g.gravadas || 0), liberadas: Number(g.liberadas || 0), config: c.config || {}, pausas_ativas: c.pausas_ativas || [], ajuda: { modo: '?t=TOKEN&chave=wpp_modo&valor=teste|producao|off', teste: '?t=TOKEN&chave=wpp_teste_numeros&valor=5511999999999,5511888888888', liberar_pausa: '?t=TOKEN&liberar=5511999999999' } } }];" } },
  output: [{ ok: true, erro: null, gravadas: 1, liberadas: 0, config: { wpp_modo: 'producao' }, pausas_ativas: [], ajuda: {} }] });

const notaSaida = sticky('## Saida do Painel -> Samuel\n\nA cada minuto entrega pelo WhatsApp do Samuel o que o atendente escreveu no Painel da Serena (serena_mensagens papel=humano, canal=whatsapp, entregue=false). Marca entregue=true so quando a Evolution devolve o id da mensagem.', [pendentes, enviar], { color: 4 });
const notaConfig = sticky('## Config da Serena no WhatsApp\n\nGET /webhook/serena-wpp-config?t=TOKEN\n- &chave=wpp_modo&valor=producao (teste | producao | off)\n- &chave=wpp_teste_numeros&valor=55DDDNUMERO,55DDDNUMERO\n- &chave=wpp_max_por_hora&valor=30\n- &chave=wpp_pausa_humano_min&valor=120\n- &chave=wpp_debounce_seg&valor=8\n- &chave=wpp_ignorar_regex&valor=(estrela|saldo do clube|resgat)\n- &liberar=55DDDNUMERO (remove pausa automatica)\n\nSem parametros: so mostra a config e as pausas ativas.', [configIn, validarConfig], { color: 5 });

export default workflow('serena-wpp-saida-config', '[Serena WhatsApp] Saida Painel -> Samuel + Config')
  .add(cron).to(pendentes).to(enviar).to(conferir).to(marcar)
  .add(configIn).to(validarConfig).to(gravarConfig).to(lerConfig).to(responderConfig)
  .add(notaSaida).add(notaConfig);
