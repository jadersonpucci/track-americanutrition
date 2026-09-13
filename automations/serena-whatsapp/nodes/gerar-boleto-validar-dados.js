// Node "Validar dados" do workflow "[Serena Tool] Gerar Boleto" (n8n gBgvM4y3bYzbnrE5).
// Valida itens e dados obrigatorios do cliente para emissao de boleto. Mesma regra de frete do Gerar PIX.
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
    mensagem: 'Para gerar o boleto preciso de: ' + faltando.join(', ') + '.'
  }}];
}

let telefone = telefoneRaw;
if (telefone.startsWith('55') && telefone.length >= 12) {
  telefone = telefone.slice(2);
}
const ddd = telefone.slice(0, 2);
const numeroTel = telefone.slice(2);

const cpfFmt = cpfRaw.slice(0,3) + '.' + cpfRaw.slice(3,6) + '.' + cpfRaw.slice(6,9) + '-' + cpfRaw.slice(9,11);


// FRETE (13/09/2026). O Gerar Boleto aceitava frete opcional, mas se a Serena nao mandasse o boleto
// saia so com o produto, o mesmo erro do Pix. Em 12/09 a Eliane (pedido de R$ 197, abaixo do minimo de frete
// gratis) perguntou "cade o frete", a Serena prometeu "gero um novo com o frete" e chamou a mesma
// ferramenta com os mesmos dados: saiu outro Pix de R$ 197. Ela nao tinha como acertar.
// Agora o frete e responsabilidade da ferramenta, nao da memoria da Serena:
//   1) frete_valor (+ frete_titulo) informado pela Serena e respeitado como veio (cliente escolheu SEDEX etc.);
//   2) frete_gratis=true pula a linha de frete (cliente escolheu a opcao gratis acima de R$ 250);
//   3) sem nada disso, a ferramenta cota no calcular-frete com o CEP e os itens: acima de R$ 250 sai gratis,
//      abaixo entra a opcao mais barata. Se a cotacao falhar, NAO gera Pix sem frete: devolve erro pedindo
//      para a Serena chamar calcular_frete e repetir com frete_valor/frete_titulo.
const COTAR = 'https://n8n.americanutrition.com/webhook/calcular-frete';
let freteValor = 0;
const freteRaw = (body.frete != null ? body.frete : (body.valor_frete != null ? body.valor_frete : (body.frete_valor != null ? body.frete_valor : ''))).toString().trim();
if (freteRaw) {
  let limpo = freteRaw.replace(/[^0-9,.\-]/g, '');
  if (limpo.indexOf(',') > -1) limpo = limpo.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpo);
  if (!isNaN(n) && n > 0) freteValor = Math.round(n * 100) / 100;
}
let freteTitulo = ((body.frete_titulo || body.transportadora || '').toString().trim()).slice(0, 80);
let freteOrigem = freteValor > 0 ? 'informado' : '';
let fretePrazo = '';
let subtotalCotado = null;
const freteGratisPedido = /^(1|true|sim|gratis|grátis)$/i.test(String(body.frete_gratis == null ? '' : body.frete_gratis).trim());
if (freteValor > 0 && !freteTitulo) freteTitulo = 'Frete';
if (freteValor <= 0) {
  const itensStr = itens.map(i => i.variant_id + ':' + i.quantity).join(',');
  let cot = null;
  try {
    cot = await this.helpers.httpRequest({ method: 'POST', url: COTAR, json: true, timeout: 40000, headers: { 'Content-Type': 'application/json' }, body: { cep: cepRaw, itens_str: itensStr } });
  } catch (e) { cot = null; }
  const cotOk = !!(cot && cot.sucesso === true);
  if (cotOk && isFinite(Number(cot.subtotal))) subtotalCotado = Number(cot.subtotal);
  const elegivelGratis = cotOk ? (cot.elegivel_frete_gratis === true) : null;
  if (freteGratisPedido || elegivelGratis === true) {
    freteOrigem = 'gratis'; freteTitulo = 'Frete grátis'; freteValor = 0;
  } else if (cotOk && cot.menor_preco && Number(cot.menor_preco.valor) > 0) {
    const m = cot.menor_preco;
    freteValor = Math.round(Number(m.valor) * 100) / 100;
    fretePrazo = String(m.prazo || '').trim();
    const prazoTxt = fretePrazo ? (fretePrazo + (/dias?$/i.test(fretePrazo) ? ' úteis' : '')) : '';
    freteTitulo = (String(m.transportadora || 'Frete').trim() + (prazoTxt ? ' (' + prazoTxt + ')' : '')).slice(0, 80);
    freteOrigem = 'cotado';
  } else {
    return [{ json: {
      erro: true,
      mensagem: 'Nao consegui calcular o frete para o CEP ' + cepRaw + ' agora, e sem frete o boleto sairia errado. Chame calcular_frete com este CEP e itens_str, escolha a opcao com o cliente e repita gerar_boleto passando frete_valor e frete_titulo. Se o pedido passa de R$ 250 e o cliente quer a opcao gratis, repita com frete_gratis=true.'
    }}];
  }
}

return [{ json: {
  erro: false,
  itens: itens,
  frete: { valor: freteValor, titulo: freteTitulo, origem: freteOrigem, prazo: fretePrazo, subtotal_cotado: subtotalCotado },
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
