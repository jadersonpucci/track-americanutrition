-- Descadastro dos emails de marketing (sistema proprio, Amazon SES). 05/11/2026.
-- O segredo do link e gerado dentro do banco e nunca sai dele: o n8n so chama as funcoes.

create table if not exists email_config (
  chave text primary key,
  valor text not null
);
alter table email_config enable row level security;
insert into email_config (chave, valor)
values ('descadastro_segredo', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (chave) do nothing;

-- Lista de contatos de email marketing. status: inscrito | descadastrado | bounce | reclamacao
create table if not exists email_contatos (
  email text primary key,
  nome text,
  shopify_customer_id text,
  status text not null default 'inscrito',
  motivo text,
  origem text,
  descadastrado_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
alter table email_contatos enable row level security;

-- Historico (descadastro, reinscricao e, depois, bounce/reclamacao/entrega vindos do SNS)
create table if not exists email_eventos (
  id bigserial primary key,
  email text not null,
  tipo text not null,
  detalhe jsonb,
  criado_em timestamptz default now()
);
create index if not exists email_eventos_email_idx on email_eventos (email);
alter table email_eventos enable row level security;
alter table email_templates enable row level security;

-- Token do link: HMAC-SHA256 do email (minusculo) com o segredo, 24 caracteres hex
create or replace function email_token(p_email text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select substr(encode(extensions.hmac(lower(trim(p_email)), (select valor from email_config where chave = 'descadastro_segredo'), 'sha256'), 'hex'), 1, 24)
$$;

-- Link pronto para o rodape e para o cabecalho List-Unsubscribe
create or replace function email_link_descadastro(p_email text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select 'https://n8n.americanutrition.com/webhook/descadastro?e='
         || translate(rtrim(replace(encode(convert_to(lower(trim(p_email)), 'UTF8'), 'base64'), chr(10), ''), '='), '+/', '-_')
         || '&t=' || email_token(p_email)
$$;

-- Situacao de um email para a pagina (valida o token)
create or replace function email_consultar(p_email text, p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p_email is null or p_token is null or email_token(p_email) <> p_token
    then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'email', lower(trim(p_email)),
      'status', coalesce((select status from email_contatos where email = lower(trim(p_email))), 'inscrito'))
  end
$$;

-- Descadastrar ou reinscrever (valida o token, grava contato e evento)
create or replace function email_descadastrar(p_email text, p_token text, p_acao text, p_motivo text, p_origem text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_status text;
begin
  if v_email = '' or p_token is null or email_token(v_email) <> p_token then
    return jsonb_build_object('ok', false);
  end if;
  v_status := case when p_acao = 'reinscrever' then 'inscrito' else 'descadastrado' end;
  insert into email_contatos (email, status, motivo, origem, descadastrado_em, atualizado_em)
  values (v_email, v_status, nullif(p_motivo, ''), p_origem, case when v_status = 'descadastrado' then now() end, now())
  on conflict (email) do update set
    status = excluded.status,
    motivo = coalesce(excluded.motivo, email_contatos.motivo),
    origem = excluded.origem,
    descadastrado_em = case when excluded.status = 'descadastrado' then now() else null end,
    atualizado_em = now();
  insert into email_eventos (email, tipo, detalhe)
  values (v_email, case when v_status = 'inscrito' then 'reinscricao' else 'descadastro' end,
          jsonb_build_object('motivo', p_motivo, 'origem', p_origem));
  return jsonb_build_object('ok', true, 'email', v_email, 'status', v_status);
end $$;

revoke all on function email_token(text), email_link_descadastro(text), email_consultar(text, text),
  email_descadastrar(text, text, text, text, text) from public, anon, authenticated;
grant execute on function email_token(text), email_link_descadastro(text), email_consultar(text, text),
  email_descadastrar(text, text, text, text, text) to postgres, service_role;
