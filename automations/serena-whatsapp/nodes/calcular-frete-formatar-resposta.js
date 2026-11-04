// No "Formatar resposta" do workflow [Serena Tool] Calcular Frete (D1l2l3IUrk4Lf9O1), POST /webhook/calcular-frete.
// Usado pela Serena e pelo Gerar PIX / Gerar Boleto (leem opcoes, menor_preco.valor/prazo/servico).
//
// 04/11/2026, pedido do Jaderson: o frete da Serena e o MESMO do checkout. As opcoes vem do /webhook/frete-cotacao
// (Frenet, +2% em cada valor, mesmas regras e prazos exibidos no checkout). Os nos "Cotar Correios"/"Cotar J&T"
// (Envia) continuam rodando e so entram se o checkout nao devolver nada, tambem com +2%.
const MARGEM = 0.02;
const COTACAO_CHECKOUT = 'https://n8n.americanutrition.com/webhook/frete-cotacao';
const dadosBase = $('Calcular peso e subtotal').first().json;
const respCorreios = $('Cotar Correios').first().json;
const respJT = $('Cotar J&T').first().json;
// CEP generico (19/09/2026): se a cotacao saiu por um CEP vizinho, o cliente ve o CEP dele e um aviso.
const entrada = $('Validar e parsear').first().json;
const cepOriginal = String(entrada.cep_original || dadosBase.cep);
const cepAviso = String(entrada.cep_aviso || '');

const cep = dadosBase.cep;
const peso = dadosBase.peso_total_kg;
const subtotal = dadosBase.subtotal;
const eligivelGratis = dadosBase.elegivel_frete_gratis;
const faltaGratis = dadosBase.falta_frete_gratis;
const pesoG = peso * 1000;
const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

const opcoes = [];

// ---------- 1) mesma cotacao do checkout (Frenet +2%) ----------
try {
  const qtd = (dadosBase.itens || []).reduce((s, i) => s + (Number(i.quantidade) || 0), 0) || 1;
  const r = await this.helpers.httpRequest({ method: 'POST', url: COTACAO_CHECKOUT, json: true, timeout: 25000,
    body: { cep: cep, qty: qtd, subtotal: subtotal } });
  for (const o of ((r && r.options) || [])) {
    if (!o || !(Number(o.price) > 0)) continue; // Frete Gratis e tratado a parte (elegivel_frete_gratis)
    const jt = /jt/i.test(String(o.carrier || ''));
    const svc = jt ? 'J&T Express' : (/sedex/i.test(o.service) ? 'SEDEX' : (/pac/i.test(o.service) ? 'PAC' : String(o.service || 'Correios')));
    opcoes.push({
      transportadora: jt ? 'J&T Express' : 'Correios',
      servico: svc,
      valor: Number(o.price),
      valor_fmt: fmt(o.price),
      prazo: o.eta || 'Consultar transportadora',
      carrier: jt ? 'jtexpress' : 'correios',
      service_id: o.id || null,
      fonte: o.fonte || 'checkout'
    });
  }
} catch (e) {}

// ---------- 2) reserva: Envia (nos Cotar Correios / Cotar J&T), +2% ----------
const mais = (p) => Math.round(Number(p) * (1 + MARGEM) * 100) / 100;
if (!opcoes.length) {
  const nomesServico = {
    'sedex': 'SEDEX',
    'pac': 'PAC',
    'sedex_hoje': 'SEDEX Hoje',
    'sedex_12': 'SEDEX 12',
    'sedex_10': 'SEDEX 10'
  };
  if (respCorreios && respCorreios.data && Array.isArray(respCorreios.data)) {
    for (const cot of respCorreios.data) {
      if (cot.totalPrice) {
        const servicoKey = (cot.service || '').toLowerCase();
        if (servicoKey === 'sedex_hoje') continue;
        const nomeServico = nomesServico[servicoKey] || cot.serviceDescription || cot.service || 'Correios';
        const v = mais(cot.totalPrice);
        opcoes.push({ transportadora: 'Correios', servico: nomeServico, valor: v, valor_fmt: fmt(v),
          prazo: cot.deliveryEstimate || 'Consultar transportadora', carrier: 'correios', service_id: cot.serviceId || null, fonte: 'envia' });
      }
    }
  }
  if (respJT && respJT.data && Array.isArray(respJT.data)) {
    for (const cot of respJT.data) {
      if (cot.totalPrice) {
        const v = mais(cot.totalPrice);
        opcoes.push({ transportadora: 'J&T Express', servico: cot.serviceDescription || 'Standard', valor: v, valor_fmt: fmt(v),
          prazo: cot.deliveryEstimate || '5 a 8 dias uteis', carrier: 'jtexpress', service_id: cot.serviceId || null, fonte: 'envia' });
      }
    }
  }
}

if (opcoes.length === 0) {
  const generico = /000$/.test(cepOriginal);
  return [{
    json: {
      sucesso: false,
      cep: cepOriginal,
      erro: true,
      precisa_logar: true,
      mensagem: generico
        ? 'A transportadora nao cota pelo CEP ' + cepOriginal + ' (CEP generico de cidade) nem pelos CEPs vizinhos. Peca ao cliente o CEP da rua dele (o dos Correios) ou de um ponto de referencia na cidade e cote de novo.'
        : 'Nao foi possivel calcular frete neste momento. Tente novamente em instantes.',
      resultado: generico
        ? 'Não consegui cotar o frete pelo CEP ' + cepOriginal.replace(/(\d{5})(\d{3})/, '$1-$2') + '. Você tem o CEP da sua rua? Se não tiver, pode ser o de um ponto de referência perto de você.'
        : 'Nao consegui calcular o frete agora. Pode tentar de novo daqui a pouco?',
      payload_correios: respCorreios,
      payload_jt: respJT,
      contexto: { cep: cep, cep_original: cepOriginal, peso_kg: peso, subtotal: subtotal }
    }
  }];
}

opcoes.sort((a, b) => a.valor - b.valor);
const menorPreco = opcoes[0];

let mensagem = '📦 *Cotação de frete para CEP ' + cepOriginal.replace(/(\d{5})(\d{3})/, '$1-$2') + ':*\n';
mensagem += '_Peso: ' + pesoG + 'g | Subtotal: R$ ' + subtotal.toFixed(2).replace('.', ',') + '_\n\n';

if (eligivelGratis) {
  mensagem += '🎉 *FRETE GRÁTIS* (acima de R$ 250)\nVocê escolhe a opção de envio no checkout.\n\n';
} else if (faltaGratis <= 80 && faltaGratis > 0) {
  mensagem += '💡 _Faltam apenas R$ ' + faltaGratis.toFixed(2).replace('.', ',') + ' para frete grátis!_\n\n';
}

for (const op of opcoes) {
  mensagem += '• *' + op.servico + '* (' + op.transportadora + '): ' + op.valor_fmt + ' - ' + op.prazo + '\n';
}
if (cepAviso) mensagem += '\n_ℹ️ ' + cepAviso + '_\n';

return [{
  json: {
    sucesso: true,
    cep: cepOriginal,
    cep_cotado: cep,
    aviso: cepAviso || null,
    peso_g: pesoG,
    subtotal: subtotal,
    subtotal_fmt: dadosBase.subtotal_fmt,
    elegivel_frete_gratis: eligivelGratis,
    falta_frete_gratis: faltaGratis,
    opcoes: opcoes,
    menor_preco: menorPreco,
    resultado: mensagem,
    erro: false,
    precisa_logar: false
  }
}];
