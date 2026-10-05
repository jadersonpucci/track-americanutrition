// Pedidos FICTÍCIOS para o modo demonstração do painel. Produtos e preços vêm do catálogo real;
// clientes, endereços, CPFs e telefones são inventados. Mesmas consultas que a loja_api faz no banco.

const NOMES = ['Ana Paula Ribeiro', 'Carlos Eduardo Lima', 'Mariana Souza', 'João Pedro Alves', 'Fernanda Castro', 'Ricardo Mendes', 'Juliana Rocha', 'Paulo Henrique Dias',
  'Beatriz Nogueira', 'Marcos Vinícius Teixeira', 'Luciana Freitas', 'Roberto Carvalho', 'Camila Barros', 'Eduardo Pires', 'Patrícia Moura', 'Gustavo Ferreira',
  'Aline Cardoso', 'Sérgio Ramos', 'Vanessa Duarte', 'Fábio Monteiro', 'Renata Azevedo', 'Thiago Correia', 'Cláudia Martins', 'Rafael Gomes'];
const CIDADES = [['São Paulo', 'SP', '01310'], ['Rio de Janeiro', 'RJ', '22041'], ['Belo Horizonte', 'MG', '30130'], ['Curitiba', 'PR', '80010'], ['Porto Alegre', 'RS', '90010'],
  ['Salvador', 'BA', '40020'], ['Recife', 'PE', '50010'], ['Fortaleza', 'CE', '60060'], ['Goiânia', 'GO', '74003'], ['Campinas', 'SP', '13010'], ['Florianópolis', 'SC', '88010'], ['Brasília', 'DF', '70040']];
const RUAS = ['Rua das Flores', 'Av. Brasil', 'Rua Sete de Setembro', 'Rua XV de Novembro', 'Av. Paulista', 'Rua das Palmeiras', 'Rua São José', 'Av. Independência'];
const PAG = [['cartao', 'pagarme'], ['pix', 'inter'], ['pix', 'inter'], ['cartao', 'pagarme'], ['boleto', 'inter']];
const AFIL = [null, null, null, null, 'SERENA01', null, 'MARIA10', null];

// gerador determinístico: os mesmos pedidos em todo navegador
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function gerarPedidos(produtos) {
  const r = rng(20261005);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const vars = produtos.filter((p) => (p.status || 'ativo') === 'ativo').flatMap((p) => (p.variantes || []).filter((v) => v.disponivel).map((v) => ({ p, v })));
  // ImunoFosfo vende mais: entra com peso maior
  const peso = vars.flatMap((x) => (/imunofosfo/.test(x.p.handle) ? [x, x, x] : [x]));
  const clientes = NOMES.map((nome, i) => {
    const [cidade, uf, cep] = CIDADES[i % CIDADES.length];
    const email = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@exemplo.com';
    return { nome, email, telefone: `119${String(80000000 + Math.floor(r() * 9999999)).slice(0, 8)}`, cpf: `000.${String(100 + i).padStart(3, '0')}.${String(Math.floor(r() * 900) + 100)}-${String(Math.floor(r() * 90) + 10)}`,
      endereco: { cep: `${cep}-${String(Math.floor(r() * 900) + 100)}`, logradouro: pick(RUAS), numero: String(Math.floor(r() * 1800) + 10), bairro: 'Centro', cidade, uf, pais: 'BR' } };
  });
  const agora = Date.now();
  const pedidos = [];
  for (let i = 0; i < 64; i++) {
    const c = i < 6 ? clientes[i % 3] : pick(clientes); // alguns clientes recorrentes
    const dias = i < 4 ? r() * 0.4 : Math.pow(r(), 1.6) * 34;
    const criado = new Date(agora - dias * 864e5 - r() * 36e5);
    const itens = [];
    const n = r() < 0.65 ? 1 : r() < 0.8 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const { p, v } = pick(peso);
      if (itens.some((x) => x.variante_id === v.id)) continue;
      const qtd = r() < 0.75 ? 1 : r() < 0.7 ? 2 : 3;
      itens.push({ variante_id: v.id, produto_id: p.id, titulo: p.titulo, variante: v.titulo, sku: v.sku, qtd, preco: v.preco, imagem: p.imagens?.[0]?.url });
    }
    const subtotal = +itens.reduce((s, x) => s + x.preco * x.qtd, 0).toFixed(2);
    const cupom = r() < 0.18 ? pick(['BEMVINDO10', 'OUTUBRO15', 'VOLTA10']) : null;
    const desconto = cupom ? +(subtotal * (cupom === 'OUTUBRO15' ? 0.15 : 0.1)).toFixed(2) : 0;
    const frete = subtotal - desconto >= 250 ? 0 : pick([19.9, 24.9, 32.5]);
    const [metodo, gateway] = pick(PAG);
    const idade = (agora - criado) / 864e5;
    let st_pag = 'pago', st_ent = 'nao_enviado', rastreio = null;
    const sorte = r();
    if (metodo !== 'cartao' && idade < 0.15 && sorte < 0.5) st_pag = 'pendente';
    else if (sorte < 0.04) st_pag = 'cancelado';
    else if (sorte < 0.06) st_pag = 'reembolsado';
    if (st_pag === 'pago') {
      if (idade > 6) st_ent = r() < 0.92 ? 'entregue' : 'enviado';
      else if (idade > 1) st_ent = 'enviado';
      else if (idade > 0.3) st_ent = r() < 0.5 ? 'preparando' : 'nao_enviado';
      if (st_ent === 'enviado' || st_ent === 'entregue') rastreio = `AD${String(100000000 + Math.floor(r() * 899999999))}BR`;
    }
    const em = (h) => new Date(criado.getTime() + h * 36e5).toISOString();
    const eventos = [{ em: criado.toISOString(), texto: st_pag === 'pendente' ? 'Pedido criado (aguardando pagamento)' : 'Pedido criado e pago', por: 'checkout' }];
    if (rastreio) eventos.push({ em: em(20), texto: 'Enviado · ' + rastreio, por: 'sistema' });
    if (st_ent === 'entregue') eventos.push({ em: em(24 * 5), texto: 'Entrega: entregue', por: 'sistema' });
    if (st_pag === 'cancelado' || st_pag === 'reembolsado') eventos.push({ em: em(6), texto: 'Pagamento: ' + st_pag, por: 'Demonstração' });
    pedidos.push({
      id: 'demo-' + (i + 1), numero: 50064 - i, criado_em: criado.toISOString(), atualizado_em: criado.toISOString(),
      origem: pick(['checkout', 'checkout', 'checkout', 'pix', 'serena']), cliente: { nome: c.nome, email: c.email, telefone: c.telefone, cpf: c.cpf }, endereco: c.endereco,
      itens, subtotal, desconto, frete, frete_servico: frete ? 'PAC' : 'Frete grátis', total: +(subtotal - desconto + frete).toFixed(2), cupom,
      pagamento: { metodo, gateway, transacao: (gateway === 'inter' ? 'inter_' : 'or_') + Math.floor(r() * 1e12).toString(36), parcelas: metodo === 'cartao' ? pick([1, 1, 3, 6, 12]) : 1 },
      status_pagamento: st_pag, status_entrega: st_ent, rastreio, transportadora: rastreio ? 'Correios' : null, ref: pick(AFIL), notas: '', tags: ['demonstração'], eventos,
    });
  }
  // numeração em ordem de data, como no checkout
  pedidos.sort((a, b) => b.criado_em.localeCompare(a.criado_em)).forEach((p, i) => { p.numero = 15780 + pedidos.length - i; });
  return pedidos;
}

const dig = (s) => String(s || '').replace(/\D/g, '');
const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const inicioMes = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function filtrarPedidos(lista, f = {}) {
  const q = (f.q || '').trim().toLowerCase();
  return lista.filter((p) => (!f.pagamento || p.status_pagamento === f.pagamento) && (!f.entrega || p.status_entrega === f.entrega) && (!q
    || (dig(q) && String(p.numero) === dig(q)) || (p.rastreio || '').toLowerCase().startsWith(q) || (p.cliente.nome || '').toLowerCase().includes(q) || (p.cliente.email || '').includes(q)
    || (dig(q) && (dig(p.cliente.cpf) === dig(q) || dig(p.cliente.telefone).includes(dig(q))))))
    .filter((p) => !f.desde || p.criado_em >= f.desde).slice(0, f.limite || 100).map(({ eventos, ...x }) => x);
}

export function resumo(lista) {
  const pagos = lista.filter((p) => p.status_pagamento === 'pago');
  const de = (t) => pagos.filter((p) => new Date(p.criado_em).getTime() >= t);
  const soma = (a) => +a.reduce((s, p) => s + p.total, 0).toFixed(2);
  const hoje = de(inicioDia()), sem = de(Date.now() - 7 * 864e5), mes = de(inicioMes());
  return { hoje_total: soma(hoje), hoje_pedidos: hoje.length, sem_total: soma(sem), sem_pedidos: sem.length, mes_total: soma(mes), mes_ticket: mes.length ? soma(mes) / mes.length : 0,
    a_enviar: pagos.filter((p) => ['nao_enviado', 'preparando'].includes(p.status_entrega)).length,
    ultimos: lista.slice(0, 8).map((p) => ({ id: p.id, numero: p.numero, criado_em: p.criado_em, cliente: p.cliente, total: p.total, status_pagamento: p.status_pagamento })) };
}

export function clientes(lista, f = {}) {
  const q = (f.q || '').trim().toLowerCase();
  const g = new Map();
  for (const p of lista.filter((x) => x.status_pagamento === 'pago')) {
    const k = (p.cliente.email || dig(p.cliente.cpf) || p.id).toLowerCase();
    const c = g.get(k) || { nome: p.cliente.nome, email: p.cliente.email, telefone: p.cliente.telefone, cpf: p.cliente.cpf, cidade: p.endereco?.cidade, pedidos: 0, total: 0, primeiro: p.criado_em, ultimo: p.criado_em };
    c.pedidos++; c.total = +(c.total + p.total).toFixed(2);
    if (p.criado_em < c.primeiro) c.primeiro = p.criado_em; if (p.criado_em > c.ultimo) c.ultimo = p.criado_em;
    g.set(k, c);
  }
  return [...g.values()].filter((c) => !q || c.nome.toLowerCase().includes(q) || (c.email || '').includes(q) || (dig(q) && dig(c.telefone).includes(dig(q)))).sort((a, b) => b.total - a.total);
}

// pedido manual no modo demonstração (mesmo formato de entrada da loja_pedido_criar)
export function criar(lista, x, produtos) {
  const vs = new Map(produtos.flatMap((p) => (p.variantes || []).map((v) => [String(v.id), { p, v }])));
  const itens = (x.shopify_items || []).map((i) => { const m = vs.get(String(i.variant_id)) || {}; return { variante_id: String(i.variant_id), produto_id: m.p?.id, titulo: m.p?.titulo || 'Produto', variante: m.v?.titulo, sku: m.v?.sku, qtd: i.quantity, preco: i.price, imagem: m.p?.imagens?.[0]?.url }; });
  const subtotal = +itens.reduce((s, i) => s + i.preco * i.qtd, 0).toFixed(2);
  const agora = new Date().toISOString();
  const p = { id: 'demo-m' + Date.now(), numero: Math.max(15780, ...lista.map((y) => y.numero)) + 1, criado_em: agora, atualizado_em: agora, origem: 'manual',
    cliente: { nome: x.customer?.name, email: x.customer?.email, telefone: x.customer?.phone, cpf: x.customer?.cpf },
    endereco: { cep: x.shipping_address?.zip, logradouro: x.shipping_address?.address1, numero: x.shipping_address?.number, bairro: x.shipping_address?.neighborhood, cidade: x.shipping_address?.city, uf: x.shipping_address?.province_code },
    itens, subtotal, desconto: x.discount_amount || 0, frete: x.shipping_price || 0, frete_servico: x.shipping_price ? 'Manual' : 'Sem frete', total: +(subtotal - (x.discount_amount || 0) + (x.shipping_price || 0)).toFixed(2),
    cupom: x.discount_code ? String(x.discount_code).toUpperCase() : null, pagamento: { metodo: x.payment?.method, gateway: 'manual' }, status_pagamento: x.paid ? 'pago' : 'pendente', status_entrega: 'nao_enviado',
    rastreio: null, ref: null, notas: x.note || '', tags: ['demonstração'], eventos: [{ em: agora, texto: 'Criado no painel', por: 'Demonstração' }] };
  lista.unshift(p);
  return p;
}
