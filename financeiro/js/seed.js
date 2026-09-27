// Dados iniciais: empresa, contas, plano de contas (mesma estrutura DRE do Nibo, melhorada),
// centro de custo, contatos e lançamentos de exemplo (marcados com exemplo:true).
import { uid, today, addDays, addMonths, monthStart, toISO, fromISO, round2 } from './utils.js';

export const GRUPOS = [
  { id: 1, nome: 'Receita bruta',            tipo: 'in',  cor: '#17924A' },
  { id: 2, nome: 'Deduções da receita',      tipo: 'out', cor: '#5B667E' },
  { id: 3, nome: 'Custos variáveis',         tipo: 'out', cor: '#B26A00' },
  { id: 4, nome: 'Despesas operacionais',    tipo: 'out', cor: '#E8262C' },
  { id: 5, nome: 'Resultado financeiro',     tipo: 'mix', cor: '#0E7C6B' },
  { id: 6, nome: 'Investimentos',            tipo: 'out', cor: '#2F6BE0' },
  { id: 7, nome: 'Sócios e financiamentos',  tipo: 'mix', cor: '#8E44AD' },
];

// [nome, tipo, grupo, subgrupo, codigo, icone]
const CATS = [
  ['Vendas',                          'in', 1, 'Receita de vendas',        '1.1.01', 'ti-shopping-cart'],
  ['Serviços',                        'in', 1, 'Receita de vendas',        '1.1.02', 'ti-tool'],
  ['Outras receitas',                 'in', 1, 'Outras receitas',          '1.2.01', 'ti-plus'],
  ['Devoluções recebidas',            'in', 1, 'Outras receitas',          '1.2.02', 'ti-arrow-back-up'],
  ['Descontos recebidos',             'in', 1, 'Outras receitas',          '1.2.03', 'ti-discount-check'],

  ['Chargebacks e estornos',          'out',2, 'Devoluções e estornos',    '2.1.01', 'ti-receipt-refund'],
  ['Descontos concedidos',            'out',2, 'Devoluções e estornos',    '2.1.02', 'ti-discount'],
  ['Impostos sobre vendas',           'out',2, 'Impostos sobre vendas',    '2.2.01', 'ti-file-percent'],

  ['Matéria-prima',                   'out',3, 'Produto',                  '3.1.01', 'ti-flask'],
  ['Embalagens e rótulos',            'out',3, 'Produto',                  '3.1.02', 'ti-package'],
  ['Análises laboratoriais',          'out',3, 'Produto',                  '3.1.03', 'ti-microscope'],
  ['Fretes',                          'out',3, 'Logística',                '3.2.01', 'ti-truck'],
  ['Taxas de gateway e cartão',       'out',3, 'Vendas',                   '3.3.01', 'ti-credit-card'],
  ['Taxas de marketplace e checkout', 'out',3, 'Vendas',                   '3.3.02', 'ti-building-store'],
  ['Comissões e afiliados',           'out',3, 'Vendas',                   '3.3.03', 'ti-users-group'],
  ['Repasse parceiros',               'out',3, 'Vendas',                   '3.3.04', 'ti-arrows-exchange'],

  ['Tráfego pago',                    'out',4, 'Marketing',                '4.1.01', 'ti-ad'],
  ['Marketing · Agências e conteúdo', 'out',4, 'Marketing',                '4.1.02', 'ti-speakerphone'],
  ['Gráfica e brindes',               'out',4, 'Marketing',                '4.1.03', 'ti-printer'],
  ['Salários',                        'out',4, 'Pessoas',                  '4.2.01', 'ti-users'],
  ['Pró-labore',                      'out',4, 'Pessoas',                  '4.2.02', 'ti-user-star'],
  ['Encargos sobre salários',         'out',4, 'Pessoas',                  '4.2.03', 'ti-file-invoice'],
  ['Férias e 13º',                    'out',4, 'Pessoas',                  '4.2.04', 'ti-beach'],
  ['Benefícios e alimentação',        'out',4, 'Pessoas',                  '4.2.05', 'ti-gift'],
  ['Diárias e ajuda de custo',        'out',4, 'Pessoas',                  '4.2.06', 'ti-coins'],
  ['Rescisões',                       'out',4, 'Pessoas',                  '4.2.07', 'ti-door-exit'],
  ['Empréstimo Funcionários',         'out',4, 'Pessoas',                  '4.2.08', 'ti-coin'],
  ['Aluguel e condomínio',            'out',4, 'Ocupação e utilidades',    '4.3.01', 'ti-home'],
  ['Luz',                             'out',4, 'Ocupação e utilidades',    '4.3.02', 'ti-bolt'],
  ['Água',                            'out',4, 'Ocupação e utilidades',    '4.3.03', 'ti-droplet'],
  ['Telefone e internet',             'out',4, 'Ocupação e utilidades',    '4.3.04', 'ti-wifi'],
  ['Manutenção predial',              'out',4, 'Ocupação e utilidades',    '4.3.05', 'ti-hammer'],
  ['Manutenção de equipamentos e veículos', 'out',4, 'Ocupação e utilidades', '4.3.06', 'ti-tools'],
  ['Sistemas e software',             'out',4, 'Tecnologia',               '4.4.01', 'ti-apps'],
  ['Contabilidade e honorários',      'out',4, 'Administrativas',          '4.5.01', 'ti-calculator'],
  ['Jurídico, registros e licenças',  'out',4, 'Administrativas',          '4.5.02', 'ti-license'],
  ['Material de escritório',          'out',4, 'Administrativas',          '4.5.03', 'ti-paperclip'],
  ['Viagens e hospedagem',            'out',4, 'Administrativas',          '4.5.04', 'ti-plane'],
  ['Doações',                         'out',4, 'Administrativas',          '4.5.05', 'ti-heart'],
  ['Acordos e indenizações',          'out',4, 'Administrativas',          '4.5.06', 'ti-scale'],
  ['A classificar',                   'out',4, 'Administrativas',          '4.5.99', 'ti-help-circle'],
  ['Impostos e taxas',                'out',4, 'Tributos',                 '4.6.01', 'ti-receipt-tax'],
  ['Taxas e contribuições',           'out',4, 'Tributos',                 '4.6.02', 'ti-building'],

  ['Rendimentos de aplicações',       'in', 5, 'Receitas financeiras',     '5.1.01', 'ti-trending-up'],
  ['Juros recebidos',                 'in', 5, 'Receitas financeiras',     '5.1.02', 'ti-percentage'],
  ['Multas recebidas',                'in', 5, 'Receitas financeiras',     '5.1.03', 'ti-gavel'],
  ['Tarifas bancárias',               'out',5, 'Despesas financeiras',     '5.2.01', 'ti-building-bank'],
  ['Juros e IOF',                     'out',5, 'Despesas financeiras',     '5.2.02', 'ti-percentage'],
  ['Multas pagas',                    'out',5, 'Despesas financeiras',     '5.2.03', 'ti-alert-triangle'],

  ['Equipamentos e máquinas',         'out',6, 'Investimentos',            '6.1.01', 'ti-device-laptop'],
  ['Compra de ativo fixo',            'out',6, 'Investimentos',            '6.1.02', 'ti-building-warehouse'],
  ['Construção e reformas',           'out',6, 'Investimentos',            '6.1.03', 'ti-crane'],
  ['Aporte em coligadas (USA)',       'out',6, 'Investimentos',            '6.1.04', 'ti-world'],
  ['Venda de ativo fixo',             'in', 6, 'Investimentos',            '6.2.01', 'ti-tag'],

  ['Empréstimos obtidos',             'in', 7, 'Financiamentos',           '7.1.01', 'ti-cash-banknote'],
  ['Pagamento de empréstimos',        'out',7, 'Financiamentos',           '7.1.02', 'ti-cash-off'],
  ['Devolução de empréstimo',         'in', 7, 'Financiamentos',           '7.1.03', 'ti-cash-banknote'],
  ['Aporte de capital',               'in', 7, 'Sócios',                   '7.2.01', 'ti-arrow-down-circle'],
  ['Retiradas de sócios',             'out',7, 'Sócios',                   '7.2.02', 'ti-arrow-up-circle'],
  ['Distribuição de lucros',          'out',7, 'Sócios',                   '7.2.03', 'ti-chart-pie'],
];

export function seedEmpresa(nome = 'America Nutrition', cnpj = '11.298.909/0001-94') {
  return { id: uid(), nome, cnpj, cor: '#07388E', criado_em: new Date().toISOString() };
}

export function seedCadastros(empresaId) {
  const t = today(); const ini = monthStart(addMonths(t, -3));
  const contas = [
    { nome: 'Inter',    banco: 'inter',    tipo: 'corrente', agencia: '0001', numero: '', saldo_inicial: 12480.55, data_saldo_inicial: ini, ordem: 1 },
    { nome: 'BTG',      banco: 'btg',      tipo: 'corrente', agencia: '0050', numero: '00517883-3', saldo_inicial: 141056.74, data_saldo_inicial: ini, ordem: 2 },
    { nome: 'Stone',    banco: 'stone',    tipo: 'corrente', agencia: '0001', numero: '49128535-9', saldo_inicial: 3210.9,  data_saldo_inicial: ini, ordem: 3 },
    { nome: 'Pagar.me', banco: 'pagarme',  tipo: 'gateway',  agencia: '', numero: '', saldo_inicial: 32455.07, data_saldo_inicial: ini, ordem: 4 },
    { nome: 'Caixa',    banco: 'caixinha', tipo: 'caixa',    agencia: '', numero: '', saldo_inicial: 42188.89, data_saldo_inicial: ini, ordem: 5 },
    { nome: 'Clara · Cartão', banco: 'clara', tipo: 'cartao', agencia: '', numero: '', saldo_inicial: 0, data_saldo_inicial: ini, ordem: 6, arquivada: false, dia_fechamento: 25, dia_vencimento: 5 },
  ].map(c => ({ id: uid(), empresa_id: empresaId, arquivada: false, cor: null, ...c }));

  const categorias = CATS.map(([nome, tipo, grupo, subgrupo, codigo, icone], i) => ({ id: uid(), empresa_id: empresaId, nome, tipo, grupo, subgrupo, codigo, icone, ordem: i, arquivada: false }));

  const centros = [{ id: uid(), empresa_id: empresaId, nome: 'Brasil', cor: '#07388E', arquivado: false }, { id: uid(), empresa_id: empresaId, nome: 'Estados Unidos', cor: '#B26A00', arquivado: false }];

  const contatos = [
    ['Pagar.me', 'ambos', 'gateway'], ['Banco Inter · PIX', 'cliente', 'gateway'], ['Mercado Livre', 'ambos', 'gateway'], ['Shopify', 'fornecedor', 'software'],
    ['Meta Ads', 'fornecedor', 'marketing'], ['Google Ads', 'fornecedor', 'marketing'], ['Apple', 'fornecedor', 'software'], ['Anthropic', 'fornecedor', 'software'],
    ['Klaviyo', 'fornecedor', 'software'], ['n8n', 'fornecedor', 'software'], ['Hostinger', 'fornecedor', 'software'], ['Contabilizei', 'fornecedor', 'contabilidade'],
    ['Labor Química Alquimia', 'fornecedor', 'materia-prima'], ['Klabin', 'fornecedor', 'embalagem'], ['Envia.com', 'fornecedor', 'logistica'], ['Correios', 'fornecedor', 'logistica'],
    ['Braspress', 'fornecedor', 'logistica'], ['Ocean Offices', 'fornecedor', 'aluguel'], ['CPFL Energia', 'fornecedor', 'utilidades'], ['Claro', 'fornecedor', 'utilidades'],
    ['Receita Federal', 'fornecedor', 'impostos'], ['Prefeitura de Santos', 'fornecedor', 'impostos'], ['Eleven Labs', 'fornecedor', 'software'], ['Confiart Gráfica', 'fornecedor', 'grafica'],
    ['Tadeu Henrique Leite', 'socio', ''], ['Miguel Leite', 'socio', ''], ['Agrantis Fertilizantes', 'ambos', 'grupo'], ['Abbazion', 'ambos', 'grupo'],
  ].map(([nome, tipo, segmento]) => ({ id: uid(), empresa_id: empresaId, nome, tipo, segmento, documento: '', email: '', telefone: '', pix: '', cidade: '', uf: '', observacoes: '', arquivado: false }));

  const tags = [['Recorrente', '#2F6BE0'], ['USA', '#B26A00'], ['Urgente', '#E8262C'], ['Revisar', '#8E44AD']].map(([nome, cor]) => ({ id: uid(), empresa_id: empresaId, nome, cor }));

  return { contas, categorias, centros, contatos, tags };
}

// Lançamentos de exemplo: 3 meses passados + 2 futuros, realistas para a operação.
export function seedLancamentos(empresaId, { contas, categorias, contatos, centros }) {
  const C = n => categorias.find(c => c.nome === n)?.id;
  const K = n => contatos.find(c => c.nome === n)?.id;
  const A = n => contas.find(c => c.nome === n)?.id;
  const t = today(); const base = monthStart(t);
  const out = []; let seq = 15480;
  const mk = (o) => { const id = uid(); out.push({ id, empresa_id: empresaId, exemplo: true, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), status: 'aberto', baixas: [], tags: [], anexos: [], rateio_categorias: [], rateio_centros: [], observacoes: '', referencia: '', forma_pagamento: 'pix', ...o }); return id; };
  const paid = (venc, conta, valor, extra = {}) => ({ baixas: [{ id: uid(), data: venc, valor: Math.abs(valor), conta_id: conta, juros: 0, multa: 0, desconto: 0, ...extra }] });
  const rnd = (a, b) => round2(a + Math.random() * (b - a));
  const past = (iso) => iso < t;

  for (let m = -3; m <= 1; m++) {
    const ms = addMonths(base, m); const isPast = m < 0;
    const fixos = [
      ['Aluguel escritório · Ocean Offices', 'Ocean Offices', 'Aluguel e condomínio', 5, 2890, 'BTG', 'boleto'],
      ['Energia · CPFL', 'CPFL Energia', 'Luz', 12, rnd(380, 520), 'Inter', 'boleto'],
      ['Internet e telefonia · Claro', 'Claro', 'Telefone e internet', 15, 289.9, 'Inter', 'debito'],
      ['Shopify Plus · assinatura', 'Shopify', 'Sistemas e software', 3, 1990, 'Clara · Cartão', 'cartao'],
      ['Klaviyo · e-mail marketing', 'Klaviyo', 'Sistemas e software', 8, 1420, 'Clara · Cartão', 'cartao'],
      ['Anthropic · API', 'Anthropic', 'Sistemas e software', 10, rnd(600, 1400), 'Clara · Cartão', 'cartao'],
      ['Apple · developer e iCloud', 'Apple', 'Sistemas e software', 18, 199, 'Clara · Cartão', 'cartao'],
      ['n8n Cloud', 'n8n', 'Sistemas e software', 20, 310, 'Clara · Cartão', 'cartao'],
      ['Hostinger · hospedagem', 'Hostinger', 'Sistemas e software', 22, 89.9, 'Clara · Cartão', 'cartao'],
      ['Contabilizei · honorários', 'Contabilizei', 'Honorários contábeis', 10, 689, 'BTG', 'boleto'],
      ['Salários · folha', null, 'Salários', 5, 18450, 'BTG', 'pix'],
      ['Pró-labore', 'Tadeu Henrique Leite', 'Pró-labore', 5, 8000, 'BTG', 'pix'],
      ['DAS · Simples Nacional', 'Receita Federal', 'Impostos sobre vendas', 20, rnd(9000, 14000), 'BTG', 'boleto'],
      ['Meta Ads · tráfego', 'Meta Ads', 'Tráfego pago', 28, rnd(18000, 26000), 'Clara · Cartão', 'cartao'],
      ['Google Ads · tráfego', 'Google Ads', 'Tráfego pago', 28, rnd(3500, 6000), 'Clara · Cartão', 'cartao'],
    ];
    for (const [desc, kt, cat, dia, valor, conta, forma] of fixos) {
      const venc = addDays(ms, dia - 1); const contaId = A(conta);
      mk({ tipo: 'pagar', descricao: desc, contato_id: kt ? K(kt) : null, categoria_id: C(cat), valor: round2(valor), vencimento: venc, competencia: ms, conta_id: contaId, forma_pagamento: forma, tags: ['Recorrente'], ...(past(venc) ? paid(venc, contaId, valor) : {}) });
    }
    // compras de produção
    if (m % 2 === 0) {
      const venc = addDays(ms, 14);
      mk({ tipo: 'pagar', descricao: 'Matéria prima · lote ImunoFosfo', contato_id: K('Labor Química Alquimia'), categoria_id: C('Matéria prima'), valor: 27800, vencimento: venc, competencia: ms, conta_id: A('BTG'), forma_pagamento: 'boleto', referencia: 'NF 4821', parcela_num: 1, parcela_total: 2, ...(past(venc) ? paid(venc, A('BTG'), 27800) : {}) });
      const venc2 = addDays(venc, 30);
      mk({ tipo: 'pagar', descricao: 'Matéria prima · lote ImunoFosfo', contato_id: K('Labor Química Alquimia'), categoria_id: C('Matéria prima'), valor: 27800, vencimento: venc2, competencia: ms, conta_id: A('BTG'), forma_pagamento: 'boleto', referencia: 'NF 4821', parcela_num: 2, parcela_total: 2, ...(past(venc2) ? paid(venc2, A('BTG'), 27800) : {}) });
      mk({ tipo: 'pagar', descricao: 'Frascos e rótulos', contato_id: K('Klabin'), categoria_id: C('Embalagens e rótulos'), valor: 6420, vencimento: addDays(ms, 9), competencia: ms, conta_id: A('Inter'), forma_pagamento: 'boleto', ...(past(addDays(ms, 9)) ? paid(addDays(ms, 9), A('Inter'), 6420) : {}) });
    }
    // fretes semanais
    for (let w = 0; w < 4; w++) {
      const venc = addDays(ms, 2 + w * 7); const v = rnd(900, 2100);
      mk({ tipo: 'pagar', descricao: 'Fretes · semana ' + (w + 1), contato_id: K('Envia.com'), categoria_id: C('Fretes'), valor: v, vencimento: venc, competencia: ms, conta_id: A('Inter'), forma_pagamento: 'pix', ...(past(venc) ? paid(venc, A('Inter'), v) : {}) });
    }
    // receitas: repasses do gateway e pix
    for (let d = 0; d < 30; d += 2) {
      const venc = addDays(ms, d); if (venc > addMonths(base, 2)) break;
      const v = rnd(4200, 12800); seq++;
      const paidNow = past(venc) || venc === t;
      mk({ tipo: 'receber', descricao: 'Repasse Pagar.me · vendas do dia', contato_id: K('Pagar.me'), categoria_id: C('Vendas'), valor: v, vencimento: venc, competencia: ms, conta_id: A('Pagar.me'), forma_pagamento: 'cartao', referencia: 'AN-' + seq, origem: 'pagarme', ...(paidNow ? paid(venc, A('Pagar.me'), v) : {}) });
      const taxa = round2(v * 0.0389); const taxaId = mk({ tipo: 'pagar', descricao: 'Taxa Pagar.me · cartão e PIX', contato_id: K('Pagar.me'), categoria_id: C('Taxas de gateway e cartão'), valor: taxa, vencimento: venc, competencia: ms, conta_id: A('Pagar.me'), forma_pagamento: 'debito', origem: 'pagarme', ...(paidNow ? paid(venc, A('Pagar.me'), taxa) : {}) });
      if (d % 6 === 0) { const p = rnd(800, 3900); mk({ tipo: 'receber', descricao: 'PIX recebido · pedidos diretos', contato_id: K('Banco Inter · PIX'), categoria_id: C('Vendas'), valor: p, vencimento: venc, competencia: ms, conta_id: A('Inter'), forma_pagamento: 'pix', ...(paidNow ? paid(venc, A('Inter'), p) : {}) }); }
    }
    // mercado livre quinzenal
    for (const d of [10, 25]) { const venc = addDays(ms, d); const v = rnd(2600, 7400); mk({ tipo: 'receber', descricao: 'Repasse Mercado Livre', contato_id: K('Mercado Livre'), categoria_id: C('Vendas'), valor: v, vencimento: venc, competencia: ms, conta_id: A('BTG'), forma_pagamento: 'ted', ...(past(venc) ? paid(venc, A('BTG'), v) : {}) }); }
    // USA — centro de custo
    if (m === -2 || m === 0) {
      const venc = addDays(ms, 18);
      mk({ tipo: 'pagar', descricao: 'Parcela aporte ImunoFosfo USA', contato_id: K('Agrantis Fertilizantes'), categoria_id: C('Pagamento de empréstimo'), valor: 25553.15, vencimento: venc, competencia: ms, conta_id: A('BTG'), forma_pagamento: 'ted', tags: ['USA'], rateio_centros: [{ centro_id: centros[1].id, percent: 100 }], ...(past(venc) ? paid(venc, A('BTG'), 25553.15) : {}) });
    }
    // transferências entre contas (repasse do gateway → BTG)
    for (const d of [7, 21]) {
      const data = addDays(ms, d); if (!past(data)) continue;
      mk({ tipo: 'transferencia', descricao: 'Saque Pagar.me → BTG', valor: rnd(18000, 32000), vencimento: data, competencia: ms, conta_id: A('Pagar.me'), conta_destino_id: A('BTG'), status: 'pago', ...paid(data, A('Pagar.me'), 0) });
    }
  }
  // alguns atrasados e um chargeback pra dar vida ao painel
  mk({ tipo: 'pagar', descricao: 'Gráfica · caixas de envio', contato_id: K('Confiart Gráfica'), categoria_id: C('Gráfica e brindes'), valor: 1840, vencimento: addDays(t, -6), competencia: base, conta_id: A('Inter'), forma_pagamento: 'boleto', tags: ['Urgente'] });
  mk({ tipo: 'receber', descricao: 'Repasse Mercado Livre · contestação', contato_id: K('Mercado Livre'), categoria_id: C('Vendas'), valor: 1290, vencimento: addDays(t, -12), competencia: addMonths(base, -1), conta_id: A('BTG'), forma_pagamento: 'ted', tags: ['Revisar'] });
  mk({ tipo: 'pagar', descricao: 'Chargeback · Pedido AN-15104', contato_id: K('Pagar.me'), categoria_id: C('Chargebacks e estornos'), valor: 387.6, vencimento: addDays(t, 3), competencia: base, conta_id: A('Pagar.me'), forma_pagamento: 'debito', origem: 'pagarme' });
  mk({ tipo: 'pagar', descricao: 'Análise microbiológica · lote 0926', contato_id: null, categoria_id: C('Análises laboratoriais'), valor: 1150, vencimento: addDays(t, 1), competencia: base, conta_id: A('Inter'), forma_pagamento: 'pix' });
  // transferências: as baixas de transferência têm valor 0 (o valor usado é o do lançamento)
  for (const l of out) if (l.tipo === 'transferencia') { l.baixas[0].valor = l.valor; }
  return out;
}
