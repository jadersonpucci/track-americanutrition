// Node "Validar dados" do workflow "[Serena Tool] Gerar PIX" (n8n SkETGTmcqtlTR0Lp).
// Valida itens e dados obrigatorios do cliente para cobranca PIX.
const body = $input.first().json.body || $input.first().json;

let itens = [];
if (body.itens_str) {
  for (const par of body.itens_str.split(',')) {
    const [vid, qty] = par.split(':').map(s => (s || '').trim());
    if (vid && qty) itens.push({ variant_id: parseInt(vid), quantity: parseInt(qty) || 1 });
  }
} else if (Array.isArray(body.itens)) {
  itens = body.itens.map(i => ({ variant_id: parseInt(i.variant_id), quantity: parseInt(i.quantity) || 1 }));
}

if (!itens.length) {
  return [{ json: { erro: true, mensagem: 'Nenhum item informado para o pedido.' } }];
}

const nome = (body.nome || body.nome_cliente || '').toString().trim();
const cpfRaw = (body.cpf || body.documento || '').toString().replace(/\D/g, '');
const email = (body.email || '').toString().trim();
const telefoneRaw = (body.telefone || '').toString().replace(/\D/g, '');

const rua = (body.rua || body.endereco || '').toString().trim();
const numero = (body.numero || 'S/N').toString().trim();
const bairro = (body.bairro || '').toString().trim();
const cidade = (body.cidade || '').toString().trim();
const estado = (body.estado || body.uf || '').toString().trim().toUpperCase();
const cepRaw = (body.cep || '').toString().replace(/\D/g, '');
const complemento = (body.complemento || '').toString().trim();

// DESCONTO (11/09/2026). Antes disto o campo 'cupom' chegava aqui e era DESCARTADO em silencio:
// o draft saia sempre no valor cheio. Em 11/09 a Serena mandou cupom IMUNOFOSFO para o Alexandre,
// o Pix veio R$ 597,00 sem desconto, e ela explicou ao cliente que o cupom "ja tinha sido usado" -
// que era invencao, porque nunca foi nem tentado. O cliente ficou chateado, com razao.
// Agora: desconto_pct e a fonte da verdade e vira appliedDiscount no draft da Shopify.
// Se vier cupom SEM desconto_pct, o cupom NAO e aplicado e a resposta diz isso em voz alta,
// para a Serena falar a verdade em vez de inventar um motivo.
const cupom = (body.cupom || '').toString().trim().toUpperCase().slice(0, 40);
let descontoPct = Number(body.desconto_pct != null ? body.desconto_pct : body.desconto);
if (!isFinite(descontoPct) || descontoPct <= 0) descontoPct = 0;
descontoPct = Math.min(50, Math.round(descontoPct * 100) / 100);

const faltando = [];
if (!nome || nome.split(' ').length < 2) faltando.push('nome completo');
if (cpfRaw.length !== 11) faltando.push('CPF valido');
if (!email || !email.includes('@')) faltando.push('email');
if (telefoneRaw.length < 10) faltando.push('telefone');
if (!rua) faltando.push('rua');
if (!bairro) faltando.push('bairro');
if (!cidade) faltando.push('cidade');
if (estado.length !== 2) faltando.push('estado (UF)');
if (cepRaw.length !== 8) faltando.push('CEP');

if (faltando.length) {
  return [{ json: {
    erro: true,
    mensagem: 'Para gerar o PIX preciso de: ' + faltando.join(', ') + '.'
  }}];
}

let telefone = telefoneRaw;
if (telefone.startsWith('55') && telefone.length >= 12) {
  telefone = telefone.slice(2);
}
const ddd = telefone.slice(0, 2);
const numeroTel = telefone.slice(2);

const cpfFmt = cpfRaw.slice(0,3) + '.' + cpfRaw.slice(3,6) + '.' + cpfRaw.slice(6,9) + '-' + cpfRaw.slice(9,11);

return [{ json: {
  erro: false,
  itens: itens,
  cupom: cupom,
  desconto_pct: descontoPct,
  cliente: {
    nome: nome,
    cpf: cpfRaw,
    cpf_formatado: cpfFmt,
    email: email,
    ddd: ddd,
    numero_telefone: numeroTel,
    telefone_full: '55' + telefone
  },
  endereco: {
    rua: rua,
    numero: numero,
    bairro: bairro,
    cidade: cidade,
    estado: estado,
    cep: cepRaw,
    complemento: complemento
  }
}}];
