// id tpxfFjyaCRIypRep — executado em 03/09/2026
// n8n Workflow SDK — [Serena] UTIL v5 Lote 2 (reposicao, lacunas, auditoria, trocas, rastreio, meta)
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'wXEAOLDYpG7MuiLL', name: 'Postgres account' } };
const startTrigger = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Executar uma vez' }, output: [{}] });

const t1 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_reposicao', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_reposicao (id bigserial primary key, referencia text unique, telefone text not null, nome text, pedido text, produtos text, entregue_em timestamptz not null, dura_dias int, avisar_em timestamptz not null, status text not null default 'agendado', motivo text, texto text, enviado_em timestamptz, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()); create index if not exists serena_reposicao_status_idx on serena_reposicao (status, avisar_em)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t2 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_lacunas', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_lacunas (id bigserial primary key, contato_id uuid, canal text, pergunta text not null, resposta_serena text, tema text, status text not null default 'aberta', resolvido_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()); create index if not exists serena_lacunas_status_idx on serena_lacunas (status, criado_em desc)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t3 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_auditorias', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_auditorias (id bigserial primary key, contato_id uuid not null, dia date not null, nota int, resolveu boolean, problemas jsonb, resumo text, sugestao text, modelo text, msgs int, criado_em timestamptz not null default now(), unique (contato_id, dia)); create index if not exists serena_auditorias_dia_idx on serena_auditorias (dia desc, nota)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t4 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_trocas', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_trocas (id bigserial primary key, contato_id uuid, telefone text, nome text, canal text, tipo text not null default 'troca', pedido text, produtos text, motivo text, detalhes text, fotos text, status text not null default 'aberta', responsavel text, resolucao text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()); create index if not exists serena_trocas_status_idx on serena_trocas (status, criado_em desc)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t5 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Criar serena_rastreio_alertas', parameters: { operation: 'executeQuery',
  query: "create table if not exists serena_rastreio_alertas (codigo text primary key, pedido text, telefone text, nome text, ultimo_evento_em timestamptz, status_chave text, status_txt text, avisado_em timestamptz, avisos int not null default 0, entregue boolean not null default false, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now())",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t6 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Alterar tabelas existentes', parameters: { operation: 'executeQuery',
  query: "alter table serena_atribuicoes add column if not exists resumo text; alter table serena_atribuicoes add column if not exists resumo_em timestamptz; alter table serena_wpp_bloqueados add column if not exists detalhe text",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const t7 = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Semear config nova', parameters: { operation: 'executeQuery',
  query: "insert into serena_config (chave, valor) select v.c, v.v from (values ('reposicao_ativa','on'), ('reposicao_dias_antes','5'), ('reposicao_min_dias','15'), ('reposicao_hora_ini','9'), ('reposicao_hora_fim','20'), ('antispam','on'), ('auditoria_ativa','on'), ('auditoria_amostra','15'), ('auditoria_nota_alerta','6'), ('rastreio_proativo','on'), ('rastreio_parado_dias','3'), ('detectar_lacunas','on'), ('meta_ativo','off'), ('meta_page_token',''), ('meta_verify_token','an-meta-' || substr(md5(random()::text), 1, 12)), ('meta_app_secret',''), ('meta_ig_id',''), ('meta_page_id','')) as v(c, v) where not exists (select 1 from serena_config s where s.chave = v.c)",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ success: true }] });

const listar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Listar resultado', parameters: { operation: 'executeQuery',
  query: "select 'config' as tipo, chave as nome, valor as detalhe from serena_config where chave in ('reposicao_ativa','reposicao_dias_antes','reposicao_min_dias','antispam','auditoria_ativa','auditoria_amostra','rastreio_proativo','rastreio_parado_dias','detectar_lacunas','meta_ativo','meta_verify_token') union all select 'tabela', table_name, string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_name in ('serena_reposicao','serena_lacunas','serena_auditorias','serena_trocas','serena_rastreio_alertas','serena_atribuicoes') group by table_name order by 1, 2",
  options: { queryBatching: 'single' } }, credentials: PG }, output: [{ tipo: 'config', nome: 'antispam', detalhe: 'on' }] });

export default workflow('serena-util-v5', '[Serena] UTIL v5 Lote 2 (tabelas)', { settings: { executionOrder: 'v1' } })
  .add(startTrigger).to(t1).to(t2).to(t3).to(t4).to(t5).to(t6).to(t7).to(listar);
