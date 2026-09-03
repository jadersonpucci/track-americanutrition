// n8n Workflow SDK — [Serena WhatsApp] UTIL Criar Tabelas (id KWmhz68lU6bSUeAr)
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const startTrigger = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Executar uma vez' }, output: [{}] });

const criarBuffer = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_wpp_buffer', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_wpp_buffer (id bigserial primary key, msg_id text unique, telefone text not null, nome text, texto text, processado boolean not null default false, criado_em timestamptz not null default now(), processado_em timestamptz)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const criarIndice = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar indice do buffer', parameters: { operation: 'executeQuery',
  query: 'create index if not exists serena_wpp_buffer_tel_idx on serena_wpp_buffer (telefone, processado, criado_em)',
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const criarPausas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_wpp_pausas', parameters: { operation: 'executeQuery',
  query: 'create table if not exists serena_wpp_pausas (telefone text primary key, ate timestamptz not null, motivo text, atualizado_em timestamptz not null default now())',
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const semearConfig = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Semear chaves wpp_ na serena_config', parameters: { operation: 'executeQuery',
  query: "insert into serena_config (chave, valor) select v.c, v.v from (values ('wpp_modo','teste'), ('wpp_teste_numeros',''), ('wpp_max_por_hora','30'), ('wpp_pausa_humano_min','120'), ('wpp_ignorar_regex','(estrela|saldo do clube|resgat)'), ('wpp_debounce_seg','4')) as v(c, v) where not exists (select 1 from serena_config s where s.chave = v.c)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const listarConfig = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Listar config wpp_', parameters: { operation: 'executeQuery',
  query: "select chave, valor from serena_config where chave like 'wpp_%' order by chave", options: { queryBatching: 'single' } }, credentials: PG, executeOnce: true },
  output: [{ chave: 'wpp_modo', valor: 'teste' }] });

const nota = sticky('## UTIL: tabelas da Serena no WhatsApp\n\nCria as tabelas serena_wpp_buffer (agrupa mensagens picadas) e serena_wpp_pausas (pausa automatica quando um humano responde pelo celular) e semeia as chaves wpp_* na serena_config.\n\nIdempotente: pode rodar mais de uma vez. Deixe inativo depois.', [criarBuffer, criarPausas], { color: 4 });

export default workflow('serena-wpp-util', '[Serena WhatsApp] UTIL Criar Tabelas')
  .add(startTrigger).to(criarBuffer).to(criarIndice).to(criarPausas).to(semearConfig).to(listarConfig).add(nota);
