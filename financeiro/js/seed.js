// Dados iniciais: empresa, contas, plano de contas (mesma estrutura DRE do Nibo, melhorada),
// centro de custo, contatos e lançamentos de exemplo (marcados com exemplo:true).
import { uid, today, addDays, addMonths, monthStart, toISO, fromISO, round2 } from './utils.js';

export const GRUPOS = [
  { id: 1, nome: 'Receitas operacionais',   tipo: 'in',  cor: '#17924A' },
  { id: 2, nome: 'Custos operacionais',     tipo: 'out', cor: '#B26A00' },
  { id: 3, nome: 'Despesas operacionais',   tipo: 'out', cor: '#E8262C' },
  { id: 4, nome: 'Investimentos',           tipo: 'out', cor: '#2F6BE0' },
  { id: 5, nome: 'Financiamentos e sócios', tipo: 'out', cor: '#8E44AD' },
];

// [nome, tipo, grupo, subgrupo, codigo, icone]
const CATS = [
  ['Vendas',                      'in', 1, 'Receita de vendas',   '1.1.001', 'ti-shopping-cart'],
  ['Serviços',                    'in', 1, 'Receita de vendas',   '1.1.002', 'ti-tool'],
  ['Rendimentos',                 'in', 1, 'Outras receitas',     '1.1.003', 'ti-trending-up'],
  ['Juros recebidos',             'in', 1, 'Outras receitas',     '1.1.004', 'ti-percentage'],
  ['Multas recebidas',            'in', 1, 'Outras receitas',     '1.1.005', 'ti-gavel'],
  ['Outras receitas',             'in', 1, 'Outras receitas',     '1.1.006', 'ti-plus'],
  ['Devoluções recebidas',        'in', 1, 'Outras receitas',     '1.1.007', 'ti-arrow-back-up'],
  ['Descontos concedidos',        'out',1, 'Deduções',            '1.2.001', 'ti-discount'],

  ['Matéria prima',               'out',2, 'Produto',             '2.1.001', 'ti-flask'],
  ['Embalagens e rótulos',        'out',2, 'Produto',             '2.1.002', 'ti-package'],
  ['Serviços de produção',        'out',2, 'Produto',             '2.1.003', 'ti-settings'],
  ['Fretes',                      'out',2, 'Logística',           '2.1.004', 'ti-truck'],
  ['Taxas de gateway e cartão',   'out',2, 'Vendas',              '2.1.005', 'ti-credit-card'],
  ['Chargebacks e estornos',      'out',2, 'Vendas',              '2.1.006', 'ti-receipt-refund'],
  ['Comissões e afiliados',       'out',2, 'Vendas',              '2.1.007', 'ti-users-group'],
  ['Repasse parceiros',           'out',2, 'Vendas',              '2.1.008', 'ti-arrows-exchange'],
  ['Impostos sobre vendas',       'out',2, 'Impostos',            '2.1.009', 'ti-file-percent'],
  ['Taxas e contribuições',       'out',2, 'Impostos',            '2.1.010', 'ti-building'],
  ['Sistemas e software',         'out',2, 'Operação',            '2.1.011', 'ti-apps'],
  ['Honorários contábeis',        'out',2, 'Operação',            '2.1.012', 'ti-calculator'],
  ['Análises laboratoriais',      'out',2, 'Operação',            '2.1.013', 'ti-microscope'],
  ['Acordos',                     'out',2, 'Operação',            '2.1.014', 'ti-scale'],

  ['Salários',                    'out',3, 'Pessoas',             '3.1.001', 'ti-users'],
  ['Pró-labore',                  'out',3, 'Pessoas',             '3.1.002', 'ti-user-star'],
  ['Férias e 13º',                'out',3, 'Pessoas',             '3.1.003', 'ti-beach'],
  ['Benefícios',                  'out',3, 'Pessoas',             '3.1.004', 'ti-gift'],
  ['Ajuda de custo e diárias',    'out',3, 'Pessoas',             '3.1.005', 'ti-coins'],
  ['Rescisões',                   'out',3, 'Pessoas',             '3.1.006', 'ti-door-exit'],
  ['Empréstimo a funcionários',   'out',3, 'Pessoas',             '3.1.007', 'ti-hand-coin'],
  ['Aluguel e condomínio',        'out',3, 'Fixas',               '3.2.001', 'ti-home'],
  ['Luz',                         'out',3, 'Fixas',               '3.2.002', 'ti-bolt'],
  ['Água',                        'out',3, 'Fixas',               '3.2.003', 'ti-droplet'],
  ['Telefone e internet',         'out',3, 'Fixas',               '3.2.004', 'ti-wifi'],
  ['Material de escritório',      'out',3, 'Fixas',               '3.2.005', 'ti-paperclip'],
  ['Manutenção predial',          'out',3, 'Fixas',               '3.2.006', 'ti-hammer'],
  ['Manutenção de equipamentos',  'out',3, 'Fixas',               '3.2.007', 'ti-tools'],
  ['Marketing',                   'out',3, 'Marketing',           '3.3.001', 'ti-speakerphone'],
  ['Tráfego pago',                'out',3, 'Marketing',           '3.3.002', 'ti-ad'],
  ['Gráfica e brindes',           'out',3, 'Marketing',           '3.3.003', 'ti-printer'],
  ['Conteúdo e criadores',        'out',3, 'Marketing',           '3.3.004', 'ti-video'],
  ['Viagens e hospedagem',        'out',3, 'Administrativas',     '3.4.001', 'ti-plane'],
  ['Tarifas bancárias',           'out',3, 'Administrativas',     '3.4.002', 'ti-building-bank'],
  ['Juros e multas pagos',        'out',3, 'Administrativas',     '3.4.003', 'ti-alert-triangle'],
  ['Doações',                     'out',3, 'Administrativas',     '3.4.004', 'ti-heart'],
  ['Devoluções a clientes',       'out',3, 'Administrativas',     '3.4.005', 'ti-arrow-back'],
  ['Outras despesas',             'out',3, 'Administrativas',     '3.4.006', 'ti-dots'],
  ['Descontos recebidos',         'in', 3, 'Administrativas',     '3.4.007', 'ti-discount-check'],

  ['Compra de ativo fixo',        'out',4, 'Investimentos',       '4.1.001', 'ti-building-warehouse'],
  ['Equipamentos',                'out',4, 'Investimentos',       '4.1.002', 'ti-device-laptop'],
  ['Construção e reformas',       'out',4, 'Investimentos',       '4.1.003', 'ti-crane'],
  ['Venda de ativo fixo',         'in', 4, 'Investimentos',       '4.2.001', 'ti-tag'],

  ['Obtenção de empréstimo',      'in', 5, 'Financiamentos',      '5.1.001', 'ti-cash-banknote'],
  ['Pagamento de empréstimo',     'out',5, 'Financiamentos',      '5.1.002', 'ti-cash-off'],
  ['Aporte de capital',           'in', 5, 'Sócios',              '5.2.001', 'ti-arrow-down-circle'],
  ['Retirada de capital',         'out',5, 'Sócios',              '5.2.002', 'ti-arrow-up-circle'],
  ['Distribuição de lucros',      'out',5, 'Sócios',              '5.2.003', 'ti-pie-chart'],
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
