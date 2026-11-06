-- Comprovantes de entrega dos Correios baixados do painel da Frenet. 06/11/2026.
-- Usado por [Rastreio] Comprovante Correios (Frenet) (comprovante-correios-frenet.workflow.js).
create table if not exists rastreio_comprovantes (
  codigo text primary key,              -- codigo de rastreio (AE123456789BR)
  origem text default 'frenet_painel',
  shipment_id bigint,                   -- shippingOrderID do painel da Frenet
  mime text,                            -- image/png ou image/jpeg
  imagem bytea,                         -- assinatura do recebedor
  tentativas int default 0,
  ultima_tentativa timestamptz,
  obtido_em timestamptz,
  erro text,                            -- 'ainda nao entregue' | 'indisponivel' | 'sessao vencida' | ...
  criado_em timestamptz default now()
);
alter table rastreio_comprovantes enable row level security;
