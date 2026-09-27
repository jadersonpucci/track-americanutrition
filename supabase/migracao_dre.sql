-- =====================================================================
--  DRE profissional · reorganização das categorias e reclassificação
--  dos lançamentos (uma vez; guardada em checkout_config.fin_dre_v2).
--  Grupos: 1 Receita bruta · 2 Deduções · 3 Custos variáveis ·
--          4 Despesas operacionais · 5 Resultado financeiro ·
--          6 Investimentos · 7 Sócios e financiamentos
-- =====================================================================
do $$
declare
  emp uuid := '6b2e7c1a-0f4d-4a1e-9c3b-2d5e8f7a9b10';
  r record; n int; tot int := 0;
begin
  if exists (select 1 from checkout_config where chave = 'fin_dre_v2') then raise notice 'fin_dre_v2 já aplicada'; return; end if;

  -- ---------- 1) plano de categorias: (nome atual, tipo) -> (nome novo, grupo, subgrupo, código, ícone, arquivar)
  create temp table plano (seq serial, atual text, tipo text, novo text, grupo int, sub text, codigo text, icone text, arquivar boolean default false) on commit drop;
  insert into plano (atual, tipo, novo, grupo, sub, codigo, icone, arquivar) values
  -- 1 · Receita bruta
  ('Vendas','in','Vendas',1,'Receita de vendas','1.1.01','ti-shopping-cart',false),
  ('Serviços','in','Serviços',1,'Receita de vendas','1.1.02','ti-tool',true),
  ('Outras receitas','in','Outras receitas (antiga)',1,'Outras receitas','1.2.09','ti-plus',true),
  ('Outras Receitas','in','Outras receitas',1,'Outras receitas','1.2.01','ti-plus',false),
  ('Devoluções','in','Devoluções recebidas',1,'Outras receitas','1.2.02','ti-arrow-back-up',false),
  ('Descontos Recebidos','in','Descontos recebidos',1,'Outras receitas','1.2.03','ti-discount-check',false),
  -- 2 · Deduções da receita
  ('Devoluções','out','Chargebacks e estornos',2,'Devoluções e estornos','2.1.01','ti-receipt-refund',false),
  ('Descontos Concedidos','out','Descontos concedidos',2,'Devoluções e estornos','2.1.02','ti-discount',false),
  ('ISS Retido sobre a Receita','out','Impostos sobre vendas',2,'Impostos sobre vendas','2.2.01','ti-file-percent',false),
  ('PIS Retido sobre a Receita','out','PIS Retido sobre a Receita',2,'Impostos sobre vendas','2.2.02','ti-file-percent',true),
  ('COFINS Retido sobre a Receita','out','COFINS Retido sobre a Receita',2,'Impostos sobre vendas','2.2.03','ti-file-percent',true),
  ('CSLL Retido sobre a Receita','out','CSLL Retido sobre a Receita',2,'Impostos sobre vendas','2.2.04','ti-file-percent',true),
  ('IRPJ Retido sobre a Receita','out','IRPJ Retido sobre a Receita',2,'Impostos sobre vendas','2.2.05','ti-file-percent',true),
  ('INSS Retido sobre a Receita','out','INSS Retido sobre a Receita',2,'Impostos sobre vendas','2.2.06','ti-file-percent',true),
  ('Outras Retenções sobre a Receita','out','Outras Retenções sobre a Receita',2,'Impostos sobre vendas','2.2.07','ti-file-percent',true),
  ('Impostos de Produtos','out','Impostos de Produtos',2,'Impostos sobre vendas','2.2.08','ti-file-percent',true),
  -- 3 · Custos variáveis
  ('Matéria Prima','out','Matéria-prima',3,'Produto','3.1.01','ti-flask',false),
  ('Gráfica','out','Gráfica e brindes',4,'Marketing','4.1.03','ti-printer',false),
  ('Serviços','out','Análises laboratoriais',3,'Produto','3.1.03','ti-microscope',false),
  ('Análises','out','Análises (antiga)',3,'Produto','3.1.09','ti-microscope',true),
  ('Fretes','out','Fretes',3,'Logística','3.2.01','ti-truck',false),
  ('Tarifa bancária','out','Tarifas bancárias',5,'Despesas financeiras','5.2.01','ti-building-bank',false),
  ('Comissões','out','Comissões e afiliados',3,'Vendas','3.3.03','ti-users-group',false),
  ('Repasse Parceiros','out','Repasse parceiros',3,'Vendas','3.3.04','ti-arrows-exchange',false),
  -- 4 · Despesas operacionais
  ('Trafego Pago','out','Tráfego pago',4,'Marketing','4.1.01','ti-ad',false),
  ('Marketing','out','Marketing · Agências e conteúdo',4,'Marketing','4.1.02','ti-speakerphone',false),
  ('Salários','out','Salários',4,'Pessoas','4.2.01','ti-users',false),
  ('ProLabore','out','Pró-labore',4,'Pessoas','4.2.02','ti-user-star',false),
  ('Décimo Terceiro','out','Férias e 13º',4,'Pessoas','4.2.04','ti-beach',false),
  ('Férias','out','Férias (antiga)',4,'Pessoas','4.2.09','ti-beach',true),
  ('Despesas Funcionários','out','Benefícios e alimentação',4,'Pessoas','4.2.05','ti-gift',false),
  ('Benefícios','out','Benefícios (antiga)',4,'Pessoas','4.2.19','ti-gift',true),
  ('Diárias','out','Diárias e ajuda de custo',4,'Pessoas','4.2.06','ti-coins',false),
  ('Ajuda de Custo','out','Ajuda de Custo (antiga)',4,'Pessoas','4.2.29','ti-coins',true),
  ('Auxílios','out','Auxílios (antiga)',4,'Pessoas','4.2.39','ti-coins',true),
  ('Rescisão','out','Rescisões',4,'Pessoas','4.2.07','ti-door-exit',false),
  ('Empréstimo Funcionários','out','Empréstimo Funcionários',4,'Pessoas','4.2.08','ti-coin',false),
  ('Aluguel e condomínio','out','Aluguel e condomínio',4,'Ocupação e utilidades','4.3.01','ti-home',false),
  ('Luz','out','Luz',4,'Ocupação e utilidades','4.3.02','ti-bolt',false),
  ('Água','out','Água',4,'Ocupação e utilidades','4.3.03','ti-droplet',false),
  ('Telefone e Internet','out','Telefone e internet',4,'Ocupação e utilidades','4.3.04','ti-wifi',false),
  ('Manutenção Predial','out','Manutenção predial',4,'Ocupação e utilidades','4.3.05','ti-hammer',false),
  ('Manutenção Equipamentos','out','Manutenção de equipamentos e veículos',4,'Ocupação e utilidades','4.3.06','ti-tools',false),
  ('Sistemas','out','Sistemas e software',4,'Tecnologia','4.4.01','ti-apps',false),
  ('Honorários Contábeis','out','Contabilidade e honorários',4,'Administrativas','4.5.01','ti-calculator',false),
  ('Material de escritório','out','Material de escritório',4,'Administrativas','4.5.03','ti-paperclip',false),
  ('Despesas de Viagens','out','Viagens e hospedagem',4,'Administrativas','4.5.04','ti-plane',false),
  ('Doações','out','Doações',4,'Administrativas','4.5.05','ti-heart',false),
  ('Acordos','out','Acordos e indenizações',4,'Administrativas','4.5.06','ti-scale',false),
  ('Pagamento de Outras retenções','out','A classificar',4,'Administrativas','4.5.99','ti-help-circle',false),
  ('Impostos','out','Impostos e taxas',4,'Tributos','4.6.01','ti-receipt-tax',false),
  ('Taxas e contribuições','out','Taxas e contribuições',4,'Tributos','4.6.02','ti-building',false),
  ('Pagamento de ISS Retido','out','Pagamento de ISS Retido',4,'Tributos','4.6.11','ti-receipt-tax',true),
  ('Pagamento de PIS Retido','out','Pagamento de PIS Retido',4,'Tributos','4.6.12','ti-receipt-tax',true),
  ('Pagamento de Cofins Retido','out','Pagamento de Cofins Retido',4,'Tributos','4.6.13','ti-receipt-tax',true),
  ('Pagamento de CSLL Retido','out','Pagamento de CSLL Retido',4,'Tributos','4.6.14','ti-receipt-tax',true),
  ('Pagamento de IRPJ Retido','out','Pagamento de IRPJ Retido',4,'Tributos','4.6.15','ti-receipt-tax',true),
  ('Pagamento de INSS Retido','out','Pagamento de INSS Retido',4,'Tributos','4.6.16','ti-receipt-tax',true),
  -- 5 · Resultado financeiro
  ('Rendimentos','in','Rendimentos de aplicações',5,'Receitas financeiras','5.1.01','ti-trending-up',false),
  ('Juros Recebidos','in','Juros recebidos',5,'Receitas financeiras','5.1.02','ti-percentage',false),
  ('Multas Recebidas','in','Multas recebidas',5,'Receitas financeiras','5.1.03','ti-gavel',false),
  ('Juros Pagos','out','Juros e IOF',5,'Despesas financeiras','5.2.02','ti-percentage',false),
  ('Multas Pagas','out','Multas pagas',5,'Despesas financeiras','5.2.03','ti-alert-triangle',false),
  ('ISS Retido sobre Pagamentos','in','ISS Retido sobre Pagamentos',5,'Receitas financeiras','5.1.11','ti-file-percent',true),
  ('PIS Retido sobre Pagamentos','in','PIS Retido sobre Pagamentos',5,'Receitas financeiras','5.1.12','ti-file-percent',true),
  ('COFINS Retido sobre Pagamentos','in','COFINS Retido sobre Pagamentos',5,'Receitas financeiras','5.1.13','ti-file-percent',true),
  ('CSLL Retido sobre Pagamentos','in','CSLL Retido sobre Pagamentos',5,'Receitas financeiras','5.1.14','ti-file-percent',true),
  ('IRPJ Retido sobre Pagamentos','in','IRPJ Retido sobre Pagamentos',5,'Receitas financeiras','5.1.15','ti-file-percent',true),
  ('INSS Retido sobre Pagamentos','in','INSS Retido sobre Pagamentos',5,'Receitas financeiras','5.1.16','ti-file-percent',true),
  ('Outras Retenções sobre Pagamentos','in','Outras Retenções sobre Pagamentos',5,'Receitas financeiras','5.1.17','ti-file-percent',true),
  -- 6 · Investimentos
  ('Equipamentos','out','Equipamentos e máquinas',6,'Investimentos','6.1.01','ti-device-laptop',false),
  ('Compra de ativo fixo','out','Compra de ativo fixo',6,'Investimentos','6.1.02','ti-building-warehouse',false),
  ('Construção','out','Construção e reformas',6,'Investimentos','6.1.03','ti-crane',false),
  ('Venda de ativo fixo','in','Venda de ativo fixo',6,'Investimentos','6.2.01','ti-tag',false),
  -- 7 · Sócios e financiamentos
  ('Obtenção de empréstimo','in','Empréstimos obtidos',7,'Financiamentos','7.1.01','ti-cash-banknote',false),
  ('Pagamento de empréstimo','out','Pagamento de empréstimos',7,'Financiamentos','7.1.02','ti-cash-off',false),
  ('Aporte de capital','in','Aporte de capital',7,'Sócios','7.2.01','ti-arrow-down-circle',false),
  ('Retirada de capital','out','Retiradas de sócios',7,'Sócios','7.2.02','ti-arrow-up-circle',false);

  -- novas categorias (não existiam)
  create temp table novas (nome text, tipo text, grupo int, sub text, codigo text, icone text) on commit drop;
  insert into novas values
  ('Impostos sobre vendas','out',2,'Impostos sobre vendas','2.2.01','ti-file-percent'),
  ('Embalagens e rótulos','out',3,'Produto','3.1.02','ti-package'),
  ('Taxas de gateway e cartão','out',3,'Vendas','3.3.01','ti-credit-card'),
  ('Taxas de marketplace e checkout','out',3,'Vendas','3.3.02','ti-building-store'),
  ('Encargos sobre salários','out',4,'Pessoas','4.2.03','ti-file-invoice'),
  ('Jurídico, registros e licenças','out',4,'Administrativas','4.5.02','ti-license'),
  ('Aporte em coligadas (USA)','out',6,'Investimentos','6.1.04','ti-world'),
  ('Devolução de empréstimo','in',7,'Financiamentos','7.1.03','ti-cash-banknote'),
  ('Distribuição de lucros','out',7,'Sócios','7.2.03','ti-chart-pie');

  -- aplica renomes/regrupos (mantém ids)
  for r in select * from plano order by seq loop
    update categorias set nome = r.novo, grupo = r.grupo, subgrupo = r.sub, codigo = r.codigo, icone = r.icone, arquivada = r.arquivar
      where empresa_id = emp and deletado_em is null and tipo = r.tipo and nome = r.atual;
  end loop;
  -- cria novas (ou reaproveita se já existir com o mesmo nome)
  for r in select * from novas loop
    if exists (select 1 from categorias where empresa_id = emp and deletado_em is null and tipo = r.tipo and nome = r.nome) then
      update categorias set grupo = r.grupo, subgrupo = r.sub, codigo = r.codigo, icone = r.icone, arquivada = false where empresa_id = emp and deletado_em is null and tipo = r.tipo and nome = r.nome;
    else
      insert into categorias (empresa_id, nome, tipo, grupo, subgrupo, codigo, icone) values (emp, r.nome, r.tipo, r.grupo, r.sub, r.codigo, r.icone);
    end if;
  end loop;
  -- ordem = código
  update categorias set ordem = (split_part(codigo,'.',1)::int * 10000 + split_part(codigo,'.',2)::int * 100 + split_part(codigo,'.',3)::int) where empresa_id = emp and codigo ~ '^\d+\.\d+\.\d+$';

  -- ---------- 2) reclassificação de lançamentos por regra (descrição / contato)
  create temp table regra (ordem int, cat_de text, tipo text, cat_para text, re_desc text, re_contato text) on commit drop;
  insert into regra values
  -- Marketing (agora Agências e conteúdo): tráfego pago e comissões saem
  (1,'Marketing · Agências e conteúdo','out','Tráfego pago', 'ads|tráfego|trafego|recarga (meta|google)|crédito publicidade|impulsion', 'META INC|GOOGLE|Clara Internet|TIKTOK|KWAI|PINTEREST'),
  (2,'Marketing · Agências e conteúdo','out','Comissões e afiliados', '^comiss', null),
  -- Salários: retiradas, pró-labore, empréstimos, agências, representantes, diaristas
  (10,'Salários','out','Retiradas de sócios', 'retirada|distribui', null),
  (11,'Salários','out','Pró-labore', 'pr[oó][ -]?labore', null),
  (12,'Salários','out','Empréstimo Funcionários', 'empr[eé]stimo|adiantamento|antecipa', null),
  (13,'Salários','out','Manutenção de equipamentos e veículos', 'manuten[çc][ãa]o ve[íi]culo|ve[íi]culo', null),
  (14,'Salários','out','Marketing · Agências e conteúdo', 'marketing|conte[úu]do|depoimento|publicidade|design', null),
  (15,'Salários','out','Marketing · Agências e conteúdo', null, 'IESNEY|HOOP PERFORMANCE|Motion Brand'),
  (16,'Salários','out','Comissões e afiliados', 'representante', null),
  (17,'Salários','out','Diárias e ajuda de custo', 'diarista|ajudante|ajudanta|di[áa]ria', null),
  -- Pró-labore: empréstimos e compras de equipamento
  (20,'Pró-labore','out','Empréstimo Funcionários', 'empr[eé]stimo|adiantamento', null),
  (21,'Pró-labore','out','Equipamentos e máquinas', 'macbook|notebook|celular|iphone', null),
  -- Gráfica: embalagens x agências x panfletos
  (30,'Gráfica e brindes','out','Marketing · Agências e conteúdo', null, 'Motion Brand|YELLOW IMAGES'),
  (31,'Gráfica e brindes','out','Embalagens e rótulos', 'caixa|r[óo]tulo|etiqueta|fita|lacre|embalagem|sacola|papel seda|c[áa]psula|frasco|adesivo|misturador|amostra', null),
  (32,'Gráfica e brindes','out','Embalagens e rótulos', null, 'FRASPAPER|IMPRESSO BRASIL|ROTULAR|PRINTI|FORTKROL|VISTA PRINT|COR LABEL|PACKSTER|KLABIN'),
  -- Material de escritório: embalagens, equipamentos, multas
  (40,'Material de escritório','out','Embalagens e rótulos', 'caixa|sacola|papel seda|etiqueta|frasco|fita|lacre|pl[áa]stico bolha|saco pp|tinta datadora|embalag', null),
  (41,'Material de escritório','out','Embalagens e rótulos', null, 'KLABIN|FRASPAPER|CENTAURUS|ALIEXPRESS'),
  (42,'Material de escritório','out','Equipamentos e máquinas', 'notebook|impressora|monitor|celular|arm[áa]rio|cadeira|mesa|macbook|mouse|teclado', null),
  (43,'Material de escritório','out','Multas pagas', 'multa', null),
  -- Taxas e contribuições: financeiro, marketplace, jurídico, obras, impostos
  (50,'Taxas e contribuições','out','Juros e IOF', 'iof|juros', null),
  (51,'Taxas e contribuições','out','Taxas de marketplace e checkout', 'tarifa.*venda|tarifa de venda', null),
  (52,'Taxas e contribuições','out','Taxas de marketplace e checkout', null, 'YAMPI|MERCADOLIVRE'),
  (53,'Taxas e contribuições','out','Sistemas e software', null, 'SHOPIFY'),
  (54,'Taxas e contribuições','out','Jurídico, registros e licenças', 'abertura|itin|marca|registro|honor[áa]rio|tarifa anual|legal', 'STRIPE ATLAS|LEGALINC|MULPHA|VANESSA'),
  (55,'Taxas e contribuições','out','Construção e reformas', 'projeto|engenheir|obra', null),
  (56,'Taxas e contribuições','out','Impostos e taxas', 'iptu|taxa an[áa]lise|regulariza|bombeiro|vistoria|alvar[áa]', null),
  -- Tarifas bancárias: gateway, checkout, IOF
  (60,'Tarifas bancárias','out','Taxas de gateway e cartão', 'taxa pagar\.?me|pagar\.?me', 'PAGAR'),
  (61,'Tarifas bancárias','out','Taxas de marketplace e checkout', 'tarifa de vendas|tarifa vendas', 'YAMPI'),
  (62,'Tarifas bancárias','out','Juros e IOF', 'iof', null),
  -- Impostos: encargos de folha
  (70,'Impostos e taxas','out','Encargos sobre salários', '^(inss|fgts|gps)\b|inss|fgts|gps', null),
  -- Pagamento de empréstimos: aporte USA e moinho
  (80,'Pagamento de empréstimos','out','Aporte em coligadas (USA)', 'aporte', null),
  (81,'Pagamento de empréstimos','out','Equipamentos e máquinas', 'moinho|m[áa]quina', null),
  -- Devoluções recebidas: devolução de empréstimo
  (90,'Devoluções recebidas','in','Devolução de empréstimo', 'empr[eé]stimo|emrp[eé]stimo', null),
  -- Auxílios (antiga) -> diárias/ajuda de custo
  (95,'Auxílios (antiga)','out','Diárias e ajuda de custo', null, null),
  (96,'Ajuda de Custo (antiga)','out','Diárias e ajuda de custo', null, null),
  (97,'Férias (antiga)','out','Férias e 13º', null, null),
  (98,'Benefícios (antiga)','out','Benefícios e alimentação', null, null),
  (99,'Análises (antiga)','out','Análises laboratoriais', null, null),
  (100,'Outras receitas (antiga)','in','Outras receitas', null, null),
  (101,'Impostos de Produtos','out','Impostos e taxas', null, null);

  for r in select * from regra order by ordem loop
    update lancamentos l set categoria_id = (select id from categorias where empresa_id = emp and deletado_em is null and tipo = r.tipo and nome = r.cat_para limit 1)
    from categorias c
    where l.empresa_id = emp and l.deletado_em is null and l.tipo in ('pagar','receber') and l.categoria_id = c.id and c.nome = r.cat_de and c.tipo = r.tipo
      and ((r.re_desc is null and r.re_contato is null)
           or (r.re_desc is not null and coalesce(l.descricao,'') ~* r.re_desc)
           or (r.re_contato is not null and exists (select 1 from contatos k where k.id = l.contato_id and k.nome ~* r.re_contato)));
    get diagnostics n = row_count; tot := tot + n;
    if n > 0 then raise notice '% -> % : % lançamentos', r.cat_de, r.cat_para, n; end if;
  end loop;
  -- rateios de categoria que apontam para categorias arquivadas "antigas": não há (rateio raro); ok

  -- lançamentos sem categoria
  update lancamentos set categoria_id = (select id from categorias where empresa_id = emp and deletado_em is null and tipo = 'out' and nome = 'A classificar' limit 1)
    where empresa_id = emp and deletado_em is null and tipo = 'pagar' and categoria_id is null;
  update lancamentos set categoria_id = (select id from categorias where empresa_id = emp and deletado_em is null and tipo = 'in' and nome = 'Outras receitas' limit 1)
    where empresa_id = emp and deletado_em is null and tipo = 'receber' and categoria_id is null;
  insert into checkout_config (chave, valor) values ('fin_dre_v2', now()::text) on conflict (chave) do nothing;
  raise notice 'DRE v2 aplicada: % lançamentos reclassificados', tot;
end $$;
