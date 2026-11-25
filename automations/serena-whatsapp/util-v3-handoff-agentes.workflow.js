// n8n Workflow SDK — [Serena WhatsApp] UTIL v3 Handoff + Agentes + Correcoes (id FRKUmJfZvORXfpST)
// Executado uma vez em 03/09/2026. Idempotente.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };

const startTrigger = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Executar uma vez' }, output: [{}] });

const correcoes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_correcoes', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_correcoes (id bigserial primary key, contato_id uuid, mensagem_id bigint, texto_serena text, correcao text not null, autor text, criado_em timestamptz not null default now()); create index if not exists serena_correcoes_contato_idx on serena_correcoes (contato_id, criado_em desc)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const agentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_agentes', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_agentes (nome text primary key, token text unique, ativo boolean not null default true, criado_em timestamptz not null default now()); insert into serena_agentes (nome, token) values ('Jaderson', 'ag-jaderson-7Hq2'), ('Cris', 'ag-cris-4Wn8'), ('Samuel', 'ag-samuel-9Kd1') on conflict (nome) do nothing",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const atribuicoes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_atribuicoes', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_atribuicoes (contato_id uuid primary key, agente text, status text not null default 'aberto', motivo text, atribuido_em timestamptz not null default now(), atualizado_em timestamptz not null default now())",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const alertas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_alertas', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_alertas (chave text primary key, ultimo_em timestamptz not null default now(), detalhe text)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const semear = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Semear config nova', parameters: { operation: 'executeQuery',
  query: "insert into serena_config (chave, valor) select v.c, v.v from (values ('wpp_pausa_handoff_min','720'), ('wpp_voz_id','CcElPA8NBrawbunFs7rh'), ('wpp_audio_resposta','on'), ('wpp_ack_rapido','on'), ('wpp_ack_regex','(pedido|rastre|frete|cep|entrega|prazo|boleto|pix|cupom|reembolso|troca)'), ('wpp_pos_entrega','on'), ('wpp_alerta_min','10'), ('base_hash','')) as v(c, v) where not exists (select 1 from serena_config s where s.chave = v.c)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const listar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Listar resultado', parameters: { operation: 'executeQuery',
  query: "select 'config' as tipo, chave as nome, valor as detalhe from serena_config where chave in ('wpp_pausa_handoff_min','wpp_voz_id','wpp_audio_resposta','wpp_ack_rapido','wpp_ack_regex','wpp_pos_entrega','wpp_alerta_min') union all select 'agente', nome, token from serena_agentes order by 1, 2",
  options: { queryBatching: 'single' } }, credentials: PG, executeOnce: true }, output: [{ tipo: 'config', nome: 'wpp_voz_id', detalhe: 'x' }] });

const nota = sticky('## UTIL v3: handoff, agentes, correcoes, alertas\n\nCria serena_correcoes (correcoes feitas pelo Inbox), serena_agentes (atendentes com token), serena_atribuicoes (fila/atribuicao), serena_alertas (dedupe do watchdog) e semeia as chaves novas na serena_config.\n\nIdempotente. Deixe inativo depois.', [correcoes, agentes], { color: 4 });

export default workflow('serena-wpp-util-v3', '[Serena WhatsApp] UTIL v3 Handoff + Agentes + Correcoes')
  .add(startTrigger).to(correcoes).to(agentes).to(atribuicoes).to(alertas).to(semear).to(listar).add(nota);
