// Valida CEP e parseia itens (formato variant_id:quantity separados por virgula)
const body = $input.first().json.body || $input.first().json;
const cep = (body.cep || body.cep_destino || '').toString().replace(/\D/g, '');

if (!cep || cep.length !== 8) {
  return [{ json: { erro: true, motivo: 'cep_invalido', mensagem: 'CEP invalido. Informe no formato 00000-000.' } }];
}

let itens = [];

if (body.itens_str) {
  const pares = body.itens_str.split(',');
  for (const par of pares) {
    const [vid, qty] = par.split(':').map(s => s.trim());
    if (vid && qty) {
      itens.push({ variant_id: vid, quantity: parseInt(qty) || 1 });
    }
  }
} else if (Array.isArray(body.itens)) {
  itens = body.itens.map(i => ({
    variant_id: String(i.variant_id),
    quantity: parseInt(i.quantity) || 1
  }));
}

if (!itens.length) {
  // BLINDAGEM: detecta se a Serena chamou errado, mandando nome do produto em vez do Variant ID.
  const camposErrados = ['produto', 'nome', 'nome_produto', 'variante', 'produtos'];
  const mandouNome = camposErrados.some(c => body[c] !== undefined && body[c] !== null && body[c] !== '');

  if (mandouNome) {
    const recebido = {};
    for (const c of camposErrados) {
      if (body[c] !== undefined) recebido[c] = body[c];
    }
    return [{ json: {
      erro: true,
      motivo: 'chamada_invalida',
      mensagem: 'Recebi o nome do produto, mas o calcular_frete precisa do Variant ID. Monte o campo itens_str no formato variant_id:quantidade, pegando o Variant ID na tabela de produtos. Exemplo: para 1 ImunoFosfo 90 capsulas, use dados = {"cep":"11060230","itens_str":"44436756234412:1"}. Se nao tiver o Variant ID, chame consultar_produto antes.',
      campos_recebidos: recebido,
      body_recebido: body
    }}];
  }

  return [{ json: { erro: true, motivo: 'sem_itens', mensagem: 'Nenhum item informado para cotar frete.' } }];
}

// CEP GENERICO (19/09/2026). Cidades menores tem CEP unico terminado em 000 (Araras/SP = 13600-000) e o cliente
// muitas vezes so tem esse. A transportadora nao cota por ele e a resposta vinha vazia: em 19/09 o Emerson ficou sem
// boleto por isso. Agora, se o CEP termina em 000 e a cotacao dele volta vazia, procuramos o CEP vizinho mais
// proximo que cote (13601-000, 13599-000, 13602-000...) e seguimos com ele, avisando na resposta. A chamada
// interna leva _sem_vizinhos=true para nao entrar em loop.
let cepCotar = cep, cepAviso = '';
if (/000$/.test(cep) && !body._sem_vizinhos) {
  const SELF = 'https://n8n.americanutrition.com/webhook/calcular-frete';
  const itensStr = itens.map(i => i.variant_id + ':' + i.quantity).join(',');
  const cota = async (c) => {
    try {
      const r = await this.helpers.httpRequest({ method: 'POST', url: SELF, json: true, timeout: 25000, headers: { 'Content-Type': 'application/json' }, body: { cep: c, itens_str: itensStr, _sem_vizinhos: true } });
      return !!(r && r.sucesso === true && Array.isArray(r.opcoes) && r.opcoes.length);
    } catch (e) { return false; }
  };
  if (!(await cota(cep))) {
    const base = parseInt(cep.slice(0, 5), 10);
    for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      const b = base + d;
      if (b < 1000 || b > 99999) continue;
      const c = String(b).padStart(5, '0') + '000';
      if (await cota(c)) { cepCotar = c; break; }
    }
    if (cepCotar !== cep) {
      const f = x => x.replace(/(\d{5})(\d{3})/, '$1-$2');
      cepAviso = 'O CEP ' + f(cep) + ' e generico (cidade com CEP unico) e a transportadora nao cota por ele; o frete foi cotado pelo CEP vizinho ' + f(cepCotar) + ', da mesma regiao. Pode usar este valor; no pedido continue com o CEP do cliente.';
    }
  }
}

return itens.map(item => ({
  json: {
    cep: cepCotar,
    cep_original: cep,
    cep_aviso: cepAviso,
    variant_id: item.variant_id,
    quantity: item.quantity
  }
}));
