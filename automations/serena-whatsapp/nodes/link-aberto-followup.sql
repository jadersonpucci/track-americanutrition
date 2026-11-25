-- 02/11/2026 · Follow-up de link aberto sem pagamento (workflow S9dhrGnafRbKMgOI) e correcao do de link nao aberto.
-- Clique humano: o AN Links grava tambem a visita do nosso servidor (ua "node", Boston), que abre todo link segundos
-- depois do envio para montar a previa. Em 14 dias foram 255 dos 753 cliques em links de checkout.
create or replace function anl_click_humano(ua text) returns boolean language sql immutable as $f$
  select coalesce(ua, '') !~* '(whatsapp|facebookexternalhit|meta-externalagent|bot|crawl|spider|preview|curl|wget|python|axios|go-http|okhttp|java/|headless|^node$|^$)'
$f$;

create table if not exists serena_link_aberto_followups (
  msg_id bigint primary key,       -- mensagem da Serena com o link
  contato_id uuid,
  telefone text,
  slug text,
  clique_em timestamptz,           -- primeiro clique humano
  enviado_em timestamptz default now(),
  resultado text,                  -- enviado | simulado | ja_comprou | falha: ...
  texto text
);

insert into serena_config (chave, valor) values ('link_aberto_followup', 'simulacao'), ('link_aberto_followup_horas', '3')
on conflict (chave) do nothing;
