create table if not exists email_templates (
  slug text primary key,
  nome text,
  assunto text not null,
  previa text,
  html text not null,
  atualizado_em timestamptz default now()
);
