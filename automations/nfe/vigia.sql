-- 03/11/2026 · AN · NF-e Vigia: um aviso por pedido a cada 12h.
create table if not exists nfe_vigia_alertas (
  id bigserial primary key,
  pedido text not null,
  status text,
  motivo text,
  alertado_em timestamptz default now()
);
create index if not exists nfe_vigia_alertas_pedido on nfe_vigia_alertas (pedido, alertado_em desc);
