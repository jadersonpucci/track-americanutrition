const fs = require('fs');
function run(file, { input, nodes = {}, http = async () => ({}) }) {
  const code = fs.readFileSync(require('path').join(__dirname, file), 'utf8');
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = name => { if (!(name in nodes)) throw new Error('node nao mockado: ' + name); return { first: () => ({ json: nodes[name] }), all: () => [{ json: nodes[name] }] }; };
  const calls = [];
  const fn = new Function('$input', '$', 'return (async function(){\n' + code + '\n}).call(this)');
  return fn.call({ helpers: { httpRequest: async (o) => { calls.push(o); return http(o); } } }, $input, $).then(out => ({ out, calls }));
}
const base = { itens_str: '44436756234412:1', nome: 'Emerson Silva', cpf: '11648531754', email: 'x@y.com', telefone: '19997604850', rua: 'Rua do Pedreiro', numero: '59', bairro: 'Jose Ometto', cidade: 'Araras', estado: 'SP', cep: '13600000', frete_gratis: true };
(async () => {
  for (const f of ['gerar_boleto_validar_dados.js', 'gerar_pix_validar_dados.js']) {
    let r = await run(f, { input: { body: base } });
    console.assert(r.out[0].json.erro === true && r.out[0].json.motivo === 'cpf_invalido' && /116\.485\.317-54/.test(r.out[0].json.mensagem) && /NAO fale em instabilidade/.test(r.out[0].json.mensagem), f + ' cpf invalido: ' + JSON.stringify(r.out[0].json).slice(0, 200));
    r = await run(f, { input: { body: Object.assign({}, base, { cpf: '111.444.777-35' }) } });
    console.assert(r.out[0].json.erro === false && r.out[0].json.cliente.cpf === '11144477735', f + ' cpf valido');
    r = await run(f, { input: { body: Object.assign({}, base, { cpf: '11111111111' }) } });
    console.assert(r.out[0].json.motivo === 'cpf_invalido', f + ' cpf repetido');
    r = await run(f, { input: { body: Object.assign({}, base, { cpf: '1234' }) } });
    console.assert(/CPF valido/.test(r.out[0].json.mensagem), f + ' cpf curto');
  }
  for (const f of ['gerar_boleto_extrair_draft.js', 'gerar_pix_extrair_draft.js']) {
    const ctx = { cliente: { cpf_formatado: '116.485.317-54' }, frete: { valor: 0 } };
    let r = await run(f, { input: { data: { draftOrderCreate: { draftOrder: null, userErrors: [{ field: null, message: 'Enter a valid CPF/CNPJ' }] } } }, nodes: { 'Montar draft': { ctx } } });
    console.assert(r.out[0].json.motivo === 'cpf_invalido' && /116\.485\.317-54/.test(r.out[0].json.mensagem), f + ' shopify cpf');
    r = await run(f, { input: { data: { draftOrderCreate: { draftOrder: null, userErrors: [{ field: null, message: 'Outro erro' }] } } }, nodes: { 'Montar draft': { ctx } } });
    console.assert(r.out[0].json.erro === true && !r.out[0].json.motivo, f + ' outro erro');
  }
  // frete: CEP generico -> vizinho
  const okResp = { sucesso: true, opcoes: [{ valor: 13.41 }] };
  let r = await run('calcular_frete_validar_e_parsear.js', { input: { body: { cep: '13600-000', itens_str: '44436756234412:1' } }, http: async (o) => o.body.cep === '13600000' ? '' : (o.body.cep === '13601000' ? okResp : { sucesso: false }) });
  console.assert(r.out[0].json.cep === '13601000' && r.out[0].json.cep_original === '13600000' && /vizinho 13601-000/.test(r.out[0].json.cep_aviso) && r.calls.every(c => c.body._sem_vizinhos === true) && r.calls.length === 2, 'vizinho ' + JSON.stringify(r.out[0].json));
  r = await run('calcular_frete_validar_e_parsear.js', { input: { body: { cep: '13600000', itens_str: '44436756234412:1' } }, http: async () => okResp });
  console.assert(r.out[0].json.cep === '13600000' && r.out[0].json.cep_aviso === '' && r.calls.length === 1, 'generico que cota');
  r = await run('calcular_frete_validar_e_parsear.js', { input: { body: { cep: '13600000', itens_str: '44436756234412:1', _sem_vizinhos: true } }, http: async () => { throw new Error('nao deveria'); } });
  console.assert(r.out[0].json.cep === '13600000' && r.calls.length === 0, 'sem loop');
  r = await run('calcular_frete_validar_e_parsear.js', { input: { body: { cep: '13601123', itens_str: '44436756234412:1' } }, http: async () => { throw new Error('nao deveria'); } });
  console.assert(r.out[0].json.cep === '13601123' && r.calls.length === 0, 'cep normal nao sonda');
  r = await run('calcular_frete_validar_e_parsear.js', { input: { body: { cep: '13600000', itens_str: '44436756234412:1' } }, http: async () => '' });
  console.assert(r.out[0].json.cep === '13600000' && r.out[0].json.cep_aviso === '' && r.calls.length === 11, 'nenhum vizinho cota -> segue com o original');
  // formatar
  const nodesF = (cepAviso, cepOrig) => ({ 'Calcular peso e subtotal': { cep: '13601000', peso_total_kg: 0.3, subtotal: 327, subtotal_fmt: 'R$ 327,00', elegivel_frete_gratis: true, falta_frete_gratis: 0 }, 'Cotar Correios': {}, 'Cotar J&T': { data: [{ totalPrice: '13.41', serviceDescription: 'J&T STANDART', deliveryEstimate: '1-2 dias', serviceId: 844 }] }, 'Validar e parsear': { cep: '13601000', cep_original: cepOrig, cep_aviso: cepAviso } });
  r = await run('calcular_frete_formatar_resposta.js', { input: {}, nodes: nodesF('O CEP 13600-000 e generico ... vizinho 13601-000', '13600000') });
  let j = r.out[0].json;
  console.assert(j.sucesso && j.cep === '13600000' && j.cep_cotado === '13601000' && /13600-000/.test(j.resultado) && /vizinho 13601-000/.test(j.resultado) && j.aviso, 'formatar com aviso ' + j.resultado);
  r = await run('calcular_frete_formatar_resposta.js', { input: {}, nodes: nodesF('', '13601000') });
  j = r.out[0].json; console.assert(j.sucesso && j.cep === '13601000' && j.aviso === null && !/ℹ️/.test(j.resultado), 'formatar sem aviso');
  const semCot = nodesF('', '13600000'); semCot['Cotar J&T'] = {}; 
  r = await run('calcular_frete_formatar_resposta.js', { input: {}, nodes: semCot }); j = r.out[0].json;
  console.assert(j.sucesso === false && /CEP da rua/.test(j.mensagem) && /13600-000/.test(j.resultado), 'sem cotacao generico');
  console.log('TESTES SERENA OK');
})().catch(e => { console.error('FALHA', e); process.exit(1); });
