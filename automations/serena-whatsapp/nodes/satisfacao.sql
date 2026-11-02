-- 02/11/2026 · Pesquisa de satisfacao da Serena (workflow TyoNLLLgAoGVtd89 + Entrada, no Chamar Serena Core).
create table if not exists serena_satisfacao (
  id bigserial primary key,
  contato_id uuid,
  telefone text,
  nome text,
  status text,                -- enviado | simulado | pulado_ia
  motivo text,                -- motivo da IA ao pular
  texto text,
  msg_id bigint,              -- mensagem da pesquisa em serena_mensagens
  enviado_em timestamptz default now(),
  nota int,
  respondido_em timestamptz,
  comentario text,
  comentario_em timestamptz
);
create index if not exists serena_satisfacao_tel on serena_satisfacao (telefone, enviado_em desc);
insert into serena_config (chave, valor) values ('satisfacao', 'simulacao'), ('satisfacao_dia', '15') on conflict (chave) do nothing;
