const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const ROUTER = 'https://n8n.americanutrition.com/webhook/serena-router';
const ESCALAR = 'https://n8n.americanutrition.com/webhook/serena-escalar';
const ALERTA = 'https://n8n.americanutrition.com/webhook/serena-alerta';
const TROCA = 'https://n8n.americanutrition.com/webhook/serena-troca';

const ctx = $input.first().json;
const entrada = $('Normalizar').first().json.entrada;
const proativo = entrada.modo === 'proativo';
const reprocessar = entrada.modo === 'reprocessar';
// modo sugerir: o Inbox pede um rascunho de resposta para o atendente; nada e gravado nem enviado
const sugerir = entrada.modo === 'sugerir';

if (ctx.ia_pausada === true && !sugerir) {
  return [{ json: { pausada: true, contato_id: ctx.contato_id, resposta: null, payload: JSON.stringify({ msgs: [], handoff: false }) } }];
}
if (proativo && entrada.tipo_proativo === 'carrinho' && String(ctx.carrinho_via_serena || 'on') !== 'on') {
  return [{ json: { pausada: false, desligado: true, contato_id: ctx.contato_id, resposta: null, payload: JSON.stringify({ msgs: [], handoff: false }) } }];
}

const ACOES = ['consultar_produto','calcular_frete','consultar_frete_regiao','buscar_pedido_numero','buscar_pedido_telefone','buscar_pedido_email','consultar_status_pedido','rastrear_pedido','gerar_checkout','gerar_pix','gerar_boleto','alterar_endereco','escalar_humano','consultar_memoria','gerar_cupom_ig','carrinho_cupom_ig','finalizar_cupom_ig','registrar_troca'].filter(a => !sugerir || (a !== 'escalar_humano' && a !== 'registrar_troca'));

const tools = [{
  name: 'consultar_sistema',
  description: 'Unica ferramenta para interagir com o sistema da America Nutrition: produtos, precos, estoque, frete, pedidos, rastreio, checkout, PIX, boleto, endereco, escalonamento e abertura de troca/devolucao (registrar_troca). Sempre use esta ferramenta em vez de inventar dados.',
  input_schema: {
    type: 'object',
    properties: {
      acao: { type: 'string', enum: ACOES, description: 'A acao a executar' },
      dados: { type: 'string', description: 'JSON em texto com os parametros da acao' }
    },
    required: ['acao','dados']
  }
}];

const historico = Array.isArray(ctx.historico) ? ctx.historico : [];
const fatos = (ctx.fatos || []).map(f => '- ' + f.chave + ': ' + f.valor + (f.origem === 'manual' ? ' (nota da equipe)' : '')).join('\n');
const temHistorico = historico.length > 0;

// Identidade conhecida do canal: permite consultar pedidos sem pedir dados ao cliente
const telDigits = String(entrada.telefone || '').replace(/\D/g, '');
const identidade = [];
if (telDigits) identidade.push('Telefone do cliente (do proprio canal, confiavel): +' + telDigits + '.');
if (entrada.email) identidade.push('Email do cliente: ' + entrada.email + '.');
const regraPedidos = telDigits
  ? 'REGRA DE PEDIDOS: se o cliente perguntar sobre pedido, ultimo pedido, entrega, rastreio ou prazo sem informar numero do pedido, NAO peca telefone nem email: chame consultar_sistema com acao buscar_pedido_telefone e dados {"telefone":"' + telDigits + '"}. Considere o pedido mais recente da lista como "o ultimo pedido". Se ele quiser saber onde esta ou o rastreio, chame em seguida consultar_status_pedido com o codigo_rastreio (ou numero_pedido) desse pedido e responda com o resultado. So peca email ou numero do pedido se a busca por telefone nao encontrar nada.'
  : '';

// Pedidos do cliente na loja (cache de 6h em serena_pedidos_cache; consulta a Shopify quando vencido). Cliente recorrente e tratado como conhecido.
const SB = 'https://supabase.americanutrition.com/pg/query';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk5MzQ2MDEsImV4cCI6MjA5NTI5NDYwMX0.-unrUEZisjdJ_Pjje72_ccV4qwLB3S0mAjjpndUhOhQ';
let pedidos = (ctx.pedidos_cache && typeof ctx.pedidos_cache === 'object') ? ctx.pedidos_cache : null;
const cacheVelho = !pedidos || !pedidos.atualizado_em || (Date.now() - new Date(pedidos.atualizado_em).getTime()) > 6 * 3600000;
if (telDigits && cacheVelho && !sugerir) {
  try {
    const rp = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/buscar-pedidos-telefone', json: true, timeout: 12000, body: { telefone: telDigits } });
    const lista = (rp && rp.encontrado && Array.isArray(rp.pedidos)) ? rp.pedidos.slice(0, 5).map(p => ({ numero: p.numero, data: p.data, status: p.status, valor: p.valor_total, itens: p.itens, rastreio: p.rastreio || null })) : [];
    // Cadastro do ultimo pedido (endereco, CPF, email): evita pedir dado a dado quem ja comprou.
    let cad = null;
    if (rp && rp.encontrado && rp.customer_id) {
      try {
        const ro = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 15000, body: { acao: 'consultar', endpoint: 'customers/' + rp.customer_id + '/orders.json', params: { status: 'any', limit: 1, fields: 'id,name,created_at,email,phone,shipping_address,billing_address,note_attributes' } } });
        const o = (ro && ro.ok && ro.dados && Array.isArray(ro.dados.orders)) ? ro.dados.orders[0] : null;
        if (o) {
          const lp = t => String(t == null ? '' : t).replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').trim();
          const ad = o.shipping_address || o.billing_address || {};
          const na = {};
          (o.note_attributes || []).forEach(x => { if (x && x.name) na[String(x.name).toLowerCase()] = x.value; });
          // Shopify guarda rua e numero juntos em address1 ("Rua X, 1100"); separa para as ferramentas de pagamento
          const a1 = lp(ad.address1);
          const mnum = a1.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/);
          const a2 = lp(ad.address2);
          const partes2 = a2 ? a2.split(',').map(x => x.trim()).filter(Boolean) : [];
          cad = {
            pedido: o.name || null,
            data: String(o.created_at || '').slice(0, 10),
            nome: lp(ad.name) || [lp(ad.first_name), lp(ad.last_name)].filter(Boolean).join(' ') || (rp.cliente_nome || ''),
            cpf: lp(na.cpf || na['cpf/cnpj'] || na.documento || ''),
            email: lp(o.email || rp.cliente_email || ''),
            telefone: lp(ad.phone || o.phone || rp.cliente_telefone || ''),
            endereco: {
              rua: mnum ? lp(mnum[1]) : a1,
              numero: mnum ? mnum[2] : 'S/N',
              complemento: partes2.length > 1 ? partes2.slice(0, -1).join(', ') : a2,
              bairro: partes2.length > 1 ? partes2[partes2.length - 1] : '',
              cidade: lp(ad.city),
              estado: lp(ad.province_code || ad.province),
              cep: lp(ad.zip)
            }
          };
        }
      } catch (e) { cad = null; }
    }
    pedidos = { pedidos: lista, total: Number((rp && rp.total_pedidos) || lista.length || 0), nome: (rp && rp.cliente_nome) || null, cadastro: cad, atualizado_em: new Date().toISOString() };
    const E = v => "'" + String(v).replace(/'/g, "''") + "'";
    await this.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, json: true, timeout: 8000, body: { query: 'insert into serena_pedidos_cache (telefone, cliente_nome, total, pedidos, cadastro, atualizado_em) values (' + E(telDigits) + ',' + (pedidos.nome ? E(pedidos.nome) : 'null') + ',' + pedidos.total + ',' + E(JSON.stringify(lista)) + '::jsonb, ' + (cad ? E(JSON.stringify(cad)) + '::jsonb' : 'null') + ', now()) on conflict (telefone) do update set cliente_nome = excluded.cliente_nome, total = excluded.total, pedidos = excluded.pedidos, cadastro = coalesce(excluded.cadastro, serena_pedidos_cache.cadastro), atualizado_em = now()' } });
  } catch (e) { /* segue sem pedidos */ }
}
let pedidosTxt = '';
if (pedidos && Array.isArray(pedidos.pedidos) && pedidos.pedidos.length) {
  pedidosTxt = 'PEDIDOS DESTE CLIENTE NA LOJA (' + pedidos.total + ' no total, mais recentes primeiro):\n'
    + pedidos.pedidos.slice(0, 3).map(p => '- ' + p.numero + ' (' + p.data + '): ' + p.itens + ', ' + p.valor + ', ' + p.status + (p.rastreio ? ', rastreio ' + p.rastreio : '')).join('\n')
    + '\nE cliente que ja comprou: trate como conhecido, nao explique o produto do zero. Se quiser comprar de novo, ofereca repetir o ultimo produto (mesma versao) e so confirme o que mudou. Para status ou rastreio use estes dados sem pedir numero de pedido; se precisar do status atual, chame consultar_status_pedido com o rastreio.';
}
// Cadastro conhecido: em vez de pedir dado a dado, a Serena mostra o que ja tem e pede so a confirmacao.
let cadastroTxt = '';
const cadC = pedidos && pedidos.cadastro;
if (cadC && (cadC.cpf || (cadC.endereco && cadC.endereco.cep))) {
  const en = cadC.endereco || {};
  const ruaNum = [en.rua, en.numero && en.numero !== 'S/N' ? en.numero : ''].filter(Boolean).join(', ');
  const endLinha = [ruaNum, en.complemento, en.bairro, [en.cidade, en.estado].filter(Boolean).join('/'), en.cep ? 'CEP ' + en.cep : ''].filter(Boolean).join(', ');
  const linhas = [];
  if (cadC.nome) linhas.push('- Nome: ' + cadC.nome);
  if (cadC.cpf) linhas.push('- CPF: ' + cadC.cpf);
  if (cadC.email) linhas.push('- Email: ' + cadC.email);
  if (endLinha) linhas.push('- Endereco: ' + endLinha);
  cadastroTxt = 'CADASTRO QUE JA TEMOS DESTE CLIENTE (do pedido ' + (cadC.pedido || 'anterior') + (cadC.data ? ', ' + cadC.data : '') + '):\n' + linhas.join('\n')
    + '\nUSE ASSIM: para gerar PIX, boleto ou checkout, NAO pergunte esses dados um a um. Mande UMA mensagem curta repetindo nome, CPF e endereco acima e pergunte se continua tudo certo (ou se prefere outro endereco). Se o cliente confirmar, chame a ferramenta com exatamente esses dados. Se ele corrigir algo, troque so o que ele corrigiu e mantenha o resto. Pergunte item a item apenas o que estiver faltando aqui em cima.';
}
// Arquivos que a Serena pode mandar no WhatsApp (serena_config.documentos). Ela so marca; a Entrada envia.
let docsLista = [];
try { docsLista = Array.isArray(ctx.documentos) ? ctx.documentos : JSON.parse(ctx.documentos || '[]'); } catch (e) { docsLista = []; }
docsLista = docsLista.filter(d => d && d.chave && d.url);
const documentosTxt = docsLista.length
  ? 'ARQUIVOS QUE VOCE PODE ENVIAR (o sistema envia o arquivo; voce so marca):\n'
    + docsLista.map(d => '- ' + d.chave + ': ' + (d.nome || d.chave) + (d.quando ? ' \u2014 mande quando ' + d.quando : '')).join('\n')
    + '\nPara mandar, termine a mensagem com uma linha exatamente assim: [[ARQUIVO: ' + docsLista[0].chave + ']] (colchetes duplos, a palavra ARQUIVO em maiusculo e a chave da lista acima). Antes dela, escreva UMA frase curta dizendo que esta enviando o arquivo. Essa linha e a UNICA forma de mandar o arquivo: sem ela nada e enviado. NUNCA escreva no lugar dela algo como (arquivo enviado: ...) nem descreva o anexo em texto \u2014 isso aparece no historico so como registro do sistema, nao envia nada. Se o cliente pedir de novo, repita o marcador. Marque no maximo um arquivo por mensagem e so quando fizer sentido. NUNCA invente outro arquivo nem afirme resultados ou numeros que estejam dentro do documento e nao na base: se o cliente perguntar detalhes, diga que esta tudo no arquivo que voce mandou.'
  : '';

const nomeCliente = ctx.nome || (pedidos && pedidos.nome ? String(pedidos.nome).split(' ')[0] : '');

// Carrinho abandonado recente: recuperacao conversacional (no modo proativo o contexto vem do disparo)
let carrinhoTxt = '';
const car = (entrada.contexto && entrada.contexto.carrinho) || ctx.carrinho;
if (car && (car.itens || car.checkout_url)) {
  let itens = car.itens;
  if (typeof itens === 'string') { try { const j = JSON.parse(itens); if (Array.isArray(j)) itens = j; } catch (e) {} }
  if (Array.isArray(itens)) itens = itens.map(i => typeof i === 'string' ? i : ((i.quantity || i.qtd || i.quantidade || 1) + 'x ' + (i.title || i.nome || i.name || i.produto || ''))).join(', ');
  carrinhoTxt = 'CARRINHO ABANDONADO (compra nao finalizada) deste cliente: ' + String(itens || 'itens nao informados')
    + (car.total ? '; total R$ ' + car.total : '')
    + (car.coupon ? '; cupom aplicado ' + car.coupon : '')
    + (car.recusa_cartao ? '; o cartao foi RECUSADO pelo banco' : '')
    + (car.boleto_pendente ? '; boleto gerado e ainda nao pago' + (car.boleto_line ? ' (codigo de barras: ' + car.boleto_line + ')' : '') : '')
    + (car.checkout_url ? '; link oficial para retomar o pagamento: ' + car.checkout_url : '')
    + '. Se o cliente falar de compra, pagamento, cupom, valor ou desses produtos, ajude a concluir esse carrinho: pode mandar o link acima (ele e oficial, nao precisa gerar outro) e tirar duvidas. Se houve recusa de cartao, ofereca PIX ou boleto. Se ele veio por outro assunto, resolva o assunto primeiro e so depois, se fizer sentido, lembre do carrinho em uma frase.';
}

// Correcoes feitas pela equipe no Inbox: aprendizado continuo
const cors = Array.isArray(ctx.correcoes) ? ctx.correcoes : [];
const correcoesTxt = cors.length
  ? 'CORRECOES RECENTES FEITAS PELA EQUIPE (aprenda com elas, nao repita o erro e siga a versao correta):\n' + cors.map(c => '- Serena disse: "' + String(c.erro || '').replace(/\s+/g, ' ').slice(0, 200) + '" -> Correto: ' + String(c.correcao || '')).join('\n')
  : '';

// Troca e devolucao guiada: a Serena coleta tudo e so entao registra (a equipe recebe o caso pronto)
const trocasAbertas = Array.isArray(ctx.trocas) ? ctx.trocas : [];
const trocaTxt = sugerir ? '' : ('TROCAS E DEVOLUCOES: se o cliente quiser trocar, devolver, reclamar de produto errado, danificado, vencido ou pedir reembolso, conduza voce mesma a coleta, uma pergunta por vez: (1) numero do pedido (se nao souber, busque pelo telefone), (2) qual produto e a quantidade, (3) o motivo em detalhes (o que aconteceu, quando chegou, lacre/validade), (4) se houver dano ou produto errado, peca uma foto (se ja mandou imagem, use a descricao que veio na mensagem). Quando tiver pedido, produto e motivo, chame consultar_sistema com acao registrar_troca e dados {"tipo":"troca|devolucao|reembolso","numero_pedido":"...","produtos":"...","motivo":"...","detalhes":"...","fotos":"descricao das fotos recebidas ou vazio"}. Depois informe o protocolo devolvido e diga que a equipe analisa e responde por aqui em ate 1 dia util. Nao prometa reembolso, prazo de troca ou postagem gratis sem a base de treinamento dizer isso.'
  + (trocasAbertas.length ? ' Este cliente JA TEM caso aberto: ' + trocasAbertas.map(t => '#' + t.id + ' (' + t.tipo + ', pedido ' + (t.pedido || '?') + ', status ' + t.status + ')').join('; ') + '. Se ele perguntar do andamento, diga que esta em analise pela equipe e nao abra outro caso igual.' : ''));

const sugerirTxt = sugerir
  ? 'MODO SUGESTAO PARA ATENDENTE: um atendente humano' + (entrada.nome ? ' (' + entrada.nome + ')' : '') + ' vai enviar a proxima mensagem desta conversa e pediu um rascunho. Escreva somente a mensagem que ele deve mandar ao cliente, em primeira pessoa, no tom da America Nutrition, sem se apresentar como Serena e sem explicar que e um rascunho. Pode consultar pedidos e rastreio pela ferramenta para deixar a resposta completa. Se a ultima mensagem for uma INSTRUCAO INTERNA do atendente, siga-a.'
  : '';

const proativoTxt = proativo
  ? 'MODO PROATIVO: nao ha mensagem nova do cliente. A equipe pediu que VOCE inicie a conversa (instrucao na ultima mensagem, marcada como INSTRUCAO INTERNA). Escreva somente a mensagem que sera enviada ao cliente no WhatsApp: curta, natural, no seu tom, sem cabecalhos, sem explicar que recebeu uma instrucao. Se ja conversou com esse cliente antes, use o historico com naturalidade.'
  : (reprocessar ? 'ATENCAO: a(s) ultima(s) mensagem(ns) do cliente ficou(aram) sem resposta por uma falha tecnica nossa. Responda agora a tudo o que ele perguntou por ultimo; se a espera foi longa, comece com um pedido de desculpas breve pela demora.' : '');

const cabecalho = [
  'Voce e a Serena, do atendimento da America Nutrition.',
  'Canal atual: ' + entrada.canal + '.',
  nomeCliente ? 'Nome do cliente: ' + nomeCliente + '.' : '',
  identidade.join(' '),
  regraPedidos,
  'FORMATO NO WHATSAPP: escreva como numa conversa de chat, curto. No maximo 3 paragrafos curtos e uns 500 caracteres; para duvida simples, 1 ou 2 frases. Responda so o que foi perguntado e termine com UMA pergunta que leve a conversa adiante. Na primeira mensagem, apresente-se em uma frase e va direto ao que a pessoa perguntou. No texto corrido, nao despeje todas as versoes e precos: cite no maximo 2 opcoes que fazem sentido para o caso. Quando o cliente precisar ESCOLHER a versao, use a LISTA CLICAVEL (abaixo) com TODAS as versoes do produto. Sem cabecalhos, sem listas longas e sem explicacao tecnica que nao foi pedida. Podem ser mais completos apenas: dados de pedido, rastreio, opcoes de frete e link de pagamento.',
  'MENSAGENS PICADAS: o cliente costuma escrever varias mensagens curtas em sequencia. Se a ultima mensagem so continua ou confirma o que voce acabou de responder ("quero pedir", "e so isso", "ok", "eu uso"), responda em uma frase, sem repetir explicacoes nem links. Nunca envie o mesmo link de pagamento duas vezes: se ja mandou, diga apenas que e so abrir o link acima. So reenvie se o cliente pedir o link de novo ou disser que nao abriu.',
  'LISTA CLICAVEL: quando precisar que o cliente ESCOLHA entre versoes, tamanhos ou opcoes (ate 8), termine a mensagem com uma linha no formato [[LISTA: Qual versão você prefere? | ImunoFosfo 90 cápsulas · R$ 327 | ImunoFosfo 60 cápsulas · R$ 247 | ImunoFosfo 42 cápsulas · R$ 197 | ImunoFosfo Vegano 90 cápsulas · R$ 327 | ImunoFosfo Plus 180 cápsulas · R$ 597 | ImunoFosfo Líquido (frasco) · R$ 137]]. A lista deve trazer TODAS as versoes atuais do produto com o preco da tabela de precos da base (para o ImunoFosfo: 90, 60, 42, Vegano 90, Plus 180 e Liquido; para outros produtos, todas as variacoes da tabela), nunca so as 2 ou 3 que voce citou no texto. Nao repita as opcoes no texto e NAO termine o texto com pergunta (nem "Qual versao voce prefere?"): o titulo da lista ja e a pergunta e ela apareceria duas vezes na tela. Use so em escolha real, nunca em pergunta aberta.',
  'CODIGO DE PAGAMENTO (PIX copia e cola / linha digitavel do boleto): escreva o codigo EXATAMENTE como a ferramenta devolveu, em uma linha sozinha, sem quebrar, encurtar, reescrever nem colocar texto na mesma linha. O sistema envia esse codigo em uma mensagem separada para o cliente conseguir copiar de uma vez no WhatsApp e ja acrescenta a explicacao de colar no app do banco, entao nao repita essa explicacao. Antes do codigo, diga em uma frase que o pedido ja esta registrado e o valor. Se a ferramenta devolver pagina_pix, repita esse link DEPOIS do codigo, em uma linha propria: e a saida de quem nao consegue copiar o codigo no WhatsApp.',
  'ANTES DE GERAR LINK DE PAGAMENTO: confirme produto, versao e tamanho (quantidade de capsulas ou frascos) quando o cliente nao tiver dito. Nao escolha por ele. Gere o link uma unica vez por pedido; se ele mudar o produto, gere outro e diga que o anterior nao vale mais.',
  fatos ? 'O que ja se sabe sobre este cliente:\n' + fatos : '',
  pedidosTxt,
  cadastroTxt,
  documentosTxt,
  carrinhoTxt,
  correcoesTxt,
  trocaTxt,
  sugerirTxt,
  proativoTxt,
  temHistorico ? 'IMPORTANTE: o historico deste cliente ja esta carregado nas mensagens abaixo, incluindo conversas de outros canais e de dias anteriores. Nao chame consultar_memoria, a memoria ja esta aqui. Nunca diga que nao encontrou historico.' : 'Este cliente nao tem conversa anterior registrada.',
  'Siga integralmente a base de treinamento acima. Use a ferramenta consultar_sistema para qualquer dado real (preco, estoque, frete, pedido, rastreio, checkout). Nunca invente valores nem monte URLs de checkout manualmente.'
].filter(Boolean).join('\n\n');

// Base de treinamento primeiro (prefixo identico em toda chamada) para o cache do Claude funcionar;
// cache de 1 hora: as mensagens chegam espacadas e o cache de 5 min expirava entre elas.
// O contexto do cliente, que muda a cada conversa, vai por ultimo.
const system = [];
if (ctx.base) system.push({ type: 'text', text: ctx.base, cache_control: { type: 'ephemeral', ttl: '1h' } });
if (ctx.prompt_extra) system.push({ type: 'text', text: ctx.prompt_extra, cache_control: { type: 'ephemeral', ttl: '1h' } });
system.push({ type: 'text', text: cabecalho });

const hist = historico.slice().reverse();
const messages = [];
for (const h of hist) {
  const papel = (h.papel === 'cliente') ? 'user' : 'assistant';
  const t = String(h.texto || '').trim();
  if (!t) continue;
  if (messages.length && messages[messages.length - 1].role === papel) {
    messages[messages.length - 1].content += '\n' + t;
  } else {
    messages.push({ role: papel, content: t });
  }
}
const textoEntrada = proativo
  ? '[INSTRUCAO INTERNA DA EQUIPE. O cliente NAO escreveu nada agora. Escreva apenas a mensagem que sera enviada a ele.]\n' + (entrada.instrucao || entrada.texto)
  : entrada.texto;
if (sugerir) {
  // historico completo ja carregado; a instrucao do atendente (opcional) entra como nota interna
  const instr = String(entrada.instrucao || '').trim();
  const nota = '[INSTRUCAO INTERNA DO ATENDENTE. O cliente NAO escreveu isto.] ' + (instr || 'Escreva a proxima mensagem para o cliente dando continuidade a conversa.');
  if (messages.length && messages[messages.length - 1].role === 'user') { if (instr) messages[messages.length - 1].content += '\n' + nota; }
  else messages.push({ role: 'user', content: nota });
} else if (reprocessar) {
  // a mensagem do cliente ja esta gravada no historico; so garante que a conversa termina com o cliente falando
  if (!messages.length || messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: entrada.texto });
} else if (messages.length && messages[messages.length - 1].role === 'user') {
  messages[messages.length - 1].content += '\n' + textoEntrada;
} else {
  messages.push({ role: 'user', content: textoEntrada });
}
while (messages.length && messages[0].role !== 'user') messages.shift();

// memoria local: responde consultar_memoria sem sair para o Respond.io
function memoriaLocal() {
  if (!temHistorico && !fatos) {
    return { encontrado: false, resultado: 'Sem registro anterior deste cliente.' };
  }
  const resumo = historico.slice(0, 12).reverse()
    .map(h => (h.papel === 'cliente' ? 'Cliente' : 'Serena') + ': ' + String(h.texto || '').slice(0, 200))
    .join('\n');
  return {
    encontrado: true,
    nome: ctx.nome || null,
    fatos: ctx.fatos || [],
    resultado: 'Historico recente deste cliente:\n' + resumo
  };
}

const modelo = ctx.modelo;
const maxTok = Number(ctx.max_tokens || 1500);
let resposta = null;
let uso = { input: 0, cache_read: 0, cache_write: 0, output: 0, chamadas: 0 };

// Mensagem trivial (obrigada, ok, bom dia, emoji): resposta de uma frase pelo Haiku, sem ferramentas nem contexto grande.
// "ok"/"certo"/"combinado" so contam como trivial se a ultima fala da Serena NAO foi uma pergunta (senao pode ser um "sim").
const ehTrivial = (() => {
  if (proativo || sugerir || reprocessar || !temHistorico) return false;
  const bruto = String(entrada.texto || '').trim();
  if (!bruto || bruto.length > 40) return false;
  if (/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2764}\u{1F44D}\u{1F64F}]+$/u.test(bruto)) return true;
  const t = bruto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 30) return false;
  const seguro = /^(valeu|vlw|obrigad[oa]s?|obg|brigad[oa]|muito obrigad[oa]|obrigad[oa] viu|de nada|amem|bom dia|boa tarde|boa noite|ate mais|tchau|abraco|abracos|bjs|beijos|deus abencoe|deus te abencoe)( (viu|entao|serena|querida|obrigad[oa]|tudo bem|tudo bom))*$/;
  if (seguro.test(t)) return true;
  const consentimento = /^(ok|okay|oks|okk+|blz|beleza|show|certo|ta|ta bom|tudo bem|tudo certo|perfeito|combinado|entendi|entendido|otimo|legal|top|joia)( (entao|serena|obrigad[oa]))*$/;
  if (!consentimento.test(t)) return false;
  const ultSerena = historico.find(h => h.papel === 'serena');
  const perguntou = !!(ultSerena && /\?\s*[^a-zA-Z0-9]*$/.test(String(ultSerena.texto || '').trim()));
  return !perguntou;
})();
let trivialOk = false;
if (ehTrivial) {
  try {
    const ult = messages.slice(-6);
    while (ult.length && ult[0].role !== 'user') ult.shift();
    const hr = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 20000, body: { model: 'claude-haiku-4-5-20251001', max_tokens: 80,
      system: 'Voce e a Serena, do atendimento da America Nutrition no WhatsApp. O cliente acabou de mandar uma mensagem curta de cortesia (agradecimento, ok, saudacao ou emoji). Responda em UMA frase curta e calorosa, no tom da conversa, sem link, sem lista, sem nova pergunta, sem repetir o que ja foi dito, com no maximo um emoji. Se nao houver o que acrescentar, responda so com o emoji 💙.',
      messages: ult } });
    const txt = (hr && Array.isArray(hr.content)) ? hr.content.filter(c => c.type === 'text').map(c => c.text).join('').trim() : '';
    if (txt && txt.length <= 300) {
      resposta = txt; trivialOk = true;
      if (hr.usage) { uso.chamadas++; uso.input += Number(hr.usage.input_tokens || 0); uso.output += Number(hr.usage.output_tokens || 0); }
    }
  } catch (e) { trivialOk = false; }
}
// Modelos da familia 4.6+ (Sonnet 5, Opus 5...) pensam por padrao; esforco medio mantem a resposta rapida no chat
const modeloNovo = /claude-(sonnet|opus|fable)-5|claude-(sonnet|opus)-4-[678]/.test(String(modelo));
const ferramentasUsadas = [];
// Link da pagina de pagamento (Pix/boleto) devolvido pela ferramenta: o Core garante que ele va na resposta.
let paginaPix = null;
let erro = null;

for (let volta = 0; volta < (trivialOk ? 0 : 6); volta++) {
  let r;
  try {
    const corpo = { model: modelo, max_tokens: maxTok, system: system, messages: messages };
    if (!proativo) corpo.tools = tools;
    if (modeloNovo) corpo.output_config = { effort: 'medium' };
    r = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 120000, body: corpo });
  } catch (e) { erro = 'claude: ' + e.message; break; }

  if (!r || !Array.isArray(r.content)) { erro = 'resposta invalida: ' + JSON.stringify(r).slice(0, 300); break; }
  if (r.usage) { uso.chamadas++; uso.input += Number(r.usage.input_tokens || 0); uso.cache_read += Number(r.usage.cache_read_input_tokens || 0); uso.cache_write += Number(r.usage.cache_creation_input_tokens || 0); uso.output += Number(r.usage.output_tokens || 0); }

  messages.push({ role: 'assistant', content: r.content });

  if (r.stop_reason === 'tool_use') {
    const resultados = [];
    for (const bloco of r.content) {
      if (bloco.type !== 'tool_use') continue;
      const acao = (bloco.input && bloco.input.acao) || '';
      let dados = (bloco.input && bloco.input.dados) || '{}';
      // garante o telefone do canal nas buscas por telefone, mesmo que o modelo omita
      if (acao === 'buscar_pedido_telefone' && telDigits) {
        try { const d = JSON.parse(dados); if (!d.telefone) { d.telefone = telDigits; dados = JSON.stringify(d); } } catch (e) { dados = JSON.stringify({ telefone: telDigits }); }
      }
      // handoff: leva contato, canal e telefone para o card da equipe ter o link do Inbox
      if (acao === 'escalar_humano') {
        let d = {}; try { d = JSON.parse(dados) || {}; } catch (e) { d = { motivo: String(dados) }; }
        d.contato_id = ctx.contato_id; d.canal = entrada.canal;
        if (!d.telefone && telDigits) d.telefone = telDigits;
        if (!d.nome_cliente && (ctx.nome || entrada.nome)) d.nome_cliente = ctx.nome || entrada.nome;
        dados = JSON.stringify(d);
      }
      ferramentasUsadas.push(acao);
      let saida;
      if (acao === 'consultar_memoria') {
        saida = memoriaLocal();
      } else if (acao === 'registrar_troca') {
        let d = {}; try { d = JSON.parse(dados) || {}; } catch (e) { d = { motivo: String(dados) }; }
        d.contato_id = ctx.contato_id; d.canal = entrada.canal; d.telefone = telDigits; d.nome = ctx.nome || entrada.nome || '';
        if (!d.numero_pedido && d.pedido) d.numero_pedido = d.pedido;
        try { saida = await this.helpers.httpRequest({ method: 'POST', url: TROCA, json: true, timeout: 30000, body: d }); }
        catch (e) { saida = { sucesso: false, resultado: 'Nao consegui registrar agora. Diga ao cliente que a equipe vai retornar por aqui.', erro: String(e.message) }; }
      } else {
        try {
          saida = await this.helpers.httpRequest({
            method: 'POST', url: ROUTER, json: true, timeout: 50000,
            body: { acao: acao, dados: dados, canal: entrada.canal }
          });
        } catch (e) { saida = { erro: String(e.message) }; }
      }
      if ((acao === 'gerar_pix' || acao === 'gerar_boleto') && saida) {
        const pp = saida.pagina_pix || (saida.body && saida.body.pagina_pix) || null;
        if (pp && /^https?:\/\//i.test(String(pp))) paginaPix = String(pp);
      }
      resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: JSON.stringify(saida).slice(0, 6000) });
    }
    messages.push({ role: 'user', content: resultados });
    continue;
  }

  resposta = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  break;
}

// Lista clicavel: [[LISTA: titulo | opcao | opcao ...]] no fim da resposta vira menu nativo do WhatsApp (a Entrada envia).
// No historico fica so o texto com as opcoes entre parenteses.
// LISTA_NATIVA (serena_config.lista_nativa, on/off): o sendList da Evolution 2.3.7 ainda quebra com
// "this.isZero is not a function" (corrigido so na 2.4.0-rc1, que trocou para o listMessage legado).
// Enquanto isso as opcoes vao numeradas no proprio texto e o cliente responde com o numero.
// Quando a Evolution for atualizada, ligar sem mexer em codigo:
//   GET /webhook/serena-wpp-config?t=TOKEN&chave=lista_nativa&valor=on
// Se o sendList falhar mesmo ligado, o no Enviar Lista da Entrada cai no texto numerado sozinho.
const LISTA_NATIVA = String(ctx.lista_nativa || 'off') === 'on';
let lista = null;
let respostaHist = resposta;
if (resposta) {
  const ml = resposta.match(/\[\[\s*LISTA\s*:\s*([^\]]+)\]\]/i);
  if (ml) {
    const partes = ml[1].split('|').map(x => x.trim()).filter(Boolean);
    resposta = resposta.replace(ml[0], '').replace(/\n{3,}/g, '\n\n').trim();
    if (partes.length >= 3 && entrada.canal === 'whatsapp' && LISTA_NATIVA) {
      lista = { titulo: partes[0].slice(0, 60), opcoes: partes.slice(1, 9).map(o => o.slice(0, 72)) };
      respostaHist = resposta + '\n(opções oferecidas: ' + lista.opcoes.join('; ') + ')';
    } else if (partes.length >= 2) {
      // O titulo da lista ja e a pergunta: tira a pergunta solta no fim do texto ("Qual versão voce prefere?").
      // Corta so a FRASE final, nao a linha inteira: ela costuma vir depois de uma explicacao que precisa ficar.
      const linhas = resposta.split('\n');
      const ultima = (linhas[linhas.length - 1] || '').trim();
      if (linhas.length > 1 && /\?\s*[^\w\s]*\s*$/.test(ultima) && !/https?:\/\//i.test(ultima)) {
        const corte = ultima.replace(/(^|[.!?\u2026]\s+)([^.!?\u2026]{0,90}\?)\s*[^\w\s]*\s*$/, '$1').trim();
        if (corte) linhas[linhas.length - 1] = corte; else linhas.pop();
        resposta = linhas.join('\n').trim();
      }
      resposta = resposta + '\n\n' + partes[0] + '\n' + partes.slice(1, 9).map((o, i) => (i + 1) + '. ' + o).join('\n') + '\n_Responde só com o número_ 😉';
      respostaHist = resposta;
    }
  }
}

// Arquivo: [[ARQUIVO: chave]] vira um envio de PDF/imagem pela Entrada (webhook serena-samuel-arquivo).
let arquivo = null;
if (resposta && docsLista.length) {
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const acha = chave => docsLista.find(d => norm(d.chave) === norm(chave));
  let doc = null;
  const ma = resposta.match(/\[\[\s*ARQUIVO\s*:\s*([^\]]+)\]\]/i);
  if (ma) {
    resposta = resposta.replace(ma[0], '').replace(/\n{3,}/g, '\n\n').trim();
    doc = acha(ma[1].trim());
  }
  // Rede de seguranca: as vezes o modelo imita o registro do historico e escreve
  // "(arquivo enviado: Nome.pdf)" no lugar do marcador. Isso e um envio de verdade.
  if (!doc) {
    const mf = resposta.match(/\(\s*arquivo\s+enviad[oa]\s*:?\s*([^)]*)\)/i);
    if (mf) {
      resposta = resposta.replace(mf[0], '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      const alvo = norm(mf[1]);
      doc = docsLista.find(d => alvo && (norm(d.nome).indexOf(alvo) >= 0 || alvo.indexOf(norm(d.chave)) >= 0 || (norm(d.nome) && alvo.indexOf(norm(d.nome)) >= 0)))
        || (docsLista.length === 1 ? docsLista[0] : null);
    }
  }
  // Segunda rede: o modelo promete o arquivo ("vou te mandar o laudo") e esquece o marcador.
  // Se a resposta tem verbo de envio e o assunto bate com um documento (na resposta ou no que o cliente pediu), manda.
  if (!doc && !proativo && !sugerir) {
    const txtCli = norm(entrada.texto);
    const txtResp = norm(resposta);
    const verbo = /(segue|segui|mand|envi|anex|encaminh)/.test(txtResp);
    {
      const cand = docsLista.find(d => {
        const gat = (Array.isArray(d.gatilhos) && d.gatilhos.length ? d.gatilhos : [d.chave]).map(norm).filter(g => g.length >= 4);
        // o cliente falou do documento (ex.: "tem laudo?"), ou a Serena prometeu mandar
        return gat.some(g => txtCli.indexOf(g) >= 0) || (verbo && gat.some(g => txtResp.indexOf(g) >= 0));
      });
      if (cand) {
        const marca = '[[arquivo: ' + String(cand.chave).toLowerCase();
        const jaMandou = historico.filter(h => h.papel === 'serena').slice(0, 4).some(h => String(h.texto || '').toLowerCase().indexOf(marca) >= 0);
        const pediuDeNovo = /(de novo|novamente|outra vez|reenvi|mais uma vez|nao (chegou|recebi|veio|abriu)|n[\u00e3a]o (chegou|recebi|veio|abriu))/i.test(String(entrada.texto || ''));
        if (!jaMandou || pediuDeNovo) doc = cand;
      }
    }
  }
  if (doc && !sugerir) {
    arquivo = { chave: doc.chave, url: doc.url, tipo: doc.tipo || 'document', nome: doc.nome || 'arquivo', legenda: doc.legenda || '' };
    // No historico fica o proprio marcador, para o modelo aprender a sintaxe certa em vez de imitar um texto solto.
    respostaHist = resposta + '\n[[ARQUIVO: ' + doc.chave + ']]';
  } else if (ma) {
    respostaHist = resposta;
  }
}

// Link repetido: nao reenvia um link que a Serena ja mandou ha pouco (ultimas 8 mensagens dela), a menos que o cliente peca.
// Tambem tira URL duplicada dentro da mesma resposta. Resolve o caso de varias mensagens curtas seguidas gerando 3 ou 4 links.
let linkRepetido = false;
if (resposta && !proativo && !sugerir) {
  const urls = resposta.match(/https?:\/\/[^\s)>\]]+/g) || [];
  if (urls.length) {
    const pediuLink = /\b(link|manda|mande|envia|envie|de novo|novamente|outra vez|reenvia|n[aã]o (abr|cheg|receb|consegui|deu))/i.test(String(entrada.texto || ''));
    const recentes = historico.filter(h => h.papel === 'serena').slice(0, 8).map(h => String(h.texto || '')).join('\n');
    const vistos = new Set();
    let mudou = false;
    for (const u of urls) {
      const jaMandou = recentes.indexOf(u) >= 0;
      const dup = vistos.has(u);
      vistos.add(u);
      if ((jaMandou && !pediuLink) || dup) {
        resposta = resposta.split('\n').filter(l => l.indexOf(u) < 0).join('\n');
        mudou = true;
      }
    }
    if (mudou) {
      resposta = resposta.replace(/\n{3,}/g, '\n\n').trim();
      if (!/acima|te mandei|j[aá] (te )?enviei|mesmo link/i.test(resposta)) resposta += (resposta ? '\n\n' : '') + 'É só abrir o link que te mandei acima ☝️';
      linkRepetido = true;
    }
  }
}

// Pagina de pagamento: o modelo as vezes resume a mensagem e corta o link. Como ele e a saida para quem nao
// consegue copiar o codigo no WhatsApp, o Core garante que ele esteja na resposta.
if (paginaPix && resposta && !sugerir && resposta.indexOf(paginaPix) < 0) {
  resposta += '\n\nSe preferir, abra esta p\u00e1gina para copiar o c\u00f3digo com um toque ou pagar pelo QR Code:\n' + paginaPix;
  respostaHist = resposta;
}

// Falha da API do Claude (saldo, limite, indisponibilidade): avisa a equipe no Telegram (dedupe de 30 min)
if (erro) {
  const tipoErro = /credit|billing|balance/i.test(erro) ? 'SALDO DA API DA ANTHROPIC ESGOTADO' : (/rate|overload|529|429/i.test(erro) ? 'API do Claude sobrecarregada / limite' : 'Falha na API do Claude');
  try {
    await this.helpers.httpRequest({ method: 'POST', url: ALERTA, json: true, timeout: 10000,
      body: { chave: 'claude_erro', minutos: 30, texto: '🚨 <b>Serena parada: ' + tipoErro + '</b>\nNenhuma mensagem esta sendo respondida em nenhum canal.\n\n<code>' + String(erro).replace(/[<>&]/g, ' ').slice(0, 300) + '</code>\n\n' + (/credit|billing|balance/i.test(erro) ? 'Recarregue em console.anthropic.com (Plans &amp; Billing). ' : '') + 'Depois de resolver, rode o reprocessamento: POST /webhook/serena-reprocessar para responder quem ficou esperando.' } });
  } catch (e) {}
}

// Etiquetas automaticas pelo que a Serena fez nesta conversa
const tags = [];
const temTool = n => ferramentasUsadas.indexOf(n) >= 0;
if (linkRepetido) tags.push('link-repetido');
if (arquivo) tags.push('arquivo-enviado');
if (temTool('gerar_checkout') || temTool('gerar_pix') || temTool('gerar_boleto') || temTool('carrinho_cupom_ig') || temTool('finalizar_cupom_ig')) tags.push('venda');
if (temTool('rastrear_pedido') || temTool('consultar_status_pedido')) tags.push('rastreio');
if (temTool('alterar_endereco')) tags.push('endereco');
if (temTool('calcular_frete') || temTool('consultar_frete_regiao')) tags.push('frete');
if (temTool('registrar_troca')) tags.push('troca');
let handoff = temTool('escalar_humano');
let motivoHandoff = handoff ? 'handoff' : null;
if (handoff) tags.push('humano');

// Deteccao de cliente irritado (escala sozinha) e de pergunta sem resposta (vira lacuna de treinamento)
let humor = null;
let lacuna = null;
const querHumor = String(ctx.detectar_irritado || 'on') === 'on';
const querLacuna = String(ctx.detectar_lacunas || 'on') === 'on';
if (!proativo && !sugerir && !erro && !trivialOk && (querHumor || querLacuna)) {
  const ultimas = historico.filter(h => h.papel === 'cliente').slice(0, 5).reverse().map(h => String(h.texto || '').slice(0, 300));
  if (!reprocessar) ultimas.push(String(entrada.texto).slice(0, 500));
  try {
    const hr = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 20000,
      body: { model: 'claude-haiku-4-5-20251001', max_tokens: 220,
        system: 'Voce analisa uma conversa de atendimento de e-commerce (suplementos). Responda SOMENTE um JSON: {"humor":"neutro|insatisfeito|irritado","motivo":"ate 12 palavras","sem_resposta":true|false,"pergunta":"a pergunta que ficou sem resposta, reescrita de forma generica, ate 20 palavras, ou vazio","tema":"produto|pedido|entrega|pagamento|troca|empresa|outro"}. HUMOR: irritado e SEMPRE raiva dirigida a NOS (empresa, produto, entrega, atendimento): raiva explicita, ameaca (Procon, Reclame Aqui, processo, chamar de golpe), xingamento, caixa alta agressiva, ou terceira cobranca do mesmo problema sem solucao. insatisfeito = frustracao clara com a EMPRESA, mas educada. Caso contrario, neutro. Pergunta normal, duvida, pressa educada ou brincadeira e neutro. ATENCAO, o erro mais comum: peso emocional NAO e raiva. Tristeza, medo, choro, desespero, angustia, urgencia ou desabafo por causa de doenca grave (cancer, metastase, quimioterapia, AVC), diagnostico ruim, dor ou preocupacao com um familiar sao NEUTRO, por mais pesada que seja a mensagem, e um cliente assim precisa da assistente respondendo, nao de silencio. Idem para quem so tem pressa de comprar ou esta ansioso pelo resultado do produto. So marque irritado se a raiva for contra a empresa e estiver explicita no texto; na duvida, responda neutro. SEM_RESPOSTA: true somente quando o cliente fez uma pergunta objetiva e a resposta da assistente NAO respondeu de fato: disse que nao sabe, que nao tem essa informacao, que vai verificar com a equipe, pediu para aguardar um humano, ou mudou de assunto. Encaminhar para humano por pedido do cliente, cliente irritado ou assunto financeiro NAO conta. Se a assistente respondeu com conteudo real, sem_resposta=false e pergunta vazio.',
        messages: [{ role: 'user', content: 'Mensagens do cliente, da mais antiga para a mais recente:\n' + ultimas.map((t, i) => (i + 1) + '. ' + t).join('\n') + '\n\nResposta da assistente a ultima mensagem:\n' + String(resposta || '(sem resposta)').slice(0, 900) }] } });
    const txt = (hr.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { const j = JSON.parse(m[0]); if (querHumor) humor = { humor: j.humor, motivo: j.motivo }; if (querLacuna && j.sem_resposta === true && j.pergunta && !temTool('escalar_humano')) lacuna = { pergunta: String(j.pergunta).slice(0, 300), tema: String(j.tema || 'outro').slice(0, 30), resposta: String(resposta || '').slice(0, 600) }; }
  } catch (e) { humor = null; }
}
if (lacuna) tags.push('sem-resposta');
if (humor && humor.humor === 'irritado') {
  tags.push('reclamacao'); tags.push('urgente');
  if (!handoff) {
    handoff = true; motivoHandoff = 'irritado';
    try {
      await this.helpers.httpRequest({ method: 'POST', url: ESCALAR, json: true, timeout: 20000,
        body: { tipo: 'escalonamento', nome_cliente: ctx.nome || entrada.nome || 'Cliente', motivo: 'Cliente irritado, detectado automaticamente: ' + String(humor.motivo || ''), tentado: 'Ultima mensagem do cliente: "' + String(entrada.texto).slice(0, 200) + '". Serena respondeu: "' + String(resposta || '').slice(0, 200) + '"', telefone: telDigits, contato_id: ctx.contato_id, canal: entrada.canal } });
    } catch (e) {}
  }
} else if (humor && humor.humor === 'insatisfeito') {
  tags.push('insatisfeito');
}

const agora = Date.now() / 1000;
const msgs = [];
if (!proativo && !reprocessar && !sugerir) msgs.push({ c: ctx.contato_id, p: 'cliente', t: entrada.texto, ca: entrada.canal, ts: agora });
if (resposta && !sugerir) msgs.push({ c: ctx.contato_id, p: 'serena', t: (linkRepetido ? resposta : respostaHist), ca: entrada.canal, ts: agora + 0.001, au: proativo ? ('proativo:' + (entrada.tipo_proativo || 'equipe')) : (reprocessar ? 'reprocessado' : null) });

return [{ json: {
  pausada: false,
  desligado: false,
  contato_id: ctx.contato_id,
  resposta: resposta,
  lista: lista,
  arquivo: arquivo,
  erro: erro,
  ferramentas: ferramentasUsadas,
  handoff: sugerir ? false : handoff,
  motivo_handoff: sugerir ? null : motivoHandoff,
  humor: humor,
  lacuna: lacuna,
  sugestao: sugerir,
  tags: sugerir ? [] : tags,
  modelo: trivialOk ? 'claude-haiku-4-5-20251001' : modelo,
  trivial: trivialOk,
  uso: uso,
  payload: JSON.stringify(sugerir ? { msgs: [], handoff: false, tags: [], contato_id: ctx.contato_id } : { msgs: msgs, handoff: handoff, motivo_handoff: motivoHandoff, tags: tags, lacuna: lacuna, contato_id: ctx.contato_id, telefone: telDigits, canal: entrada.canal, pausa_min: Number(motivoHandoff === 'irritado' ? (ctx.pausa_irritado_min || 60) : (ctx.pausa_handoff_min || 720)) })
} }];
