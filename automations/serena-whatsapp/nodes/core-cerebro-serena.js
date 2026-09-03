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
  ctx.nome ? 'Nome do cliente: ' + ctx.nome + '.' : '',
  identidade.join(' '),
  regraPedidos,
  'MENSAGENS PICADAS: o cliente costuma escrever varias mensagens curtas em sequencia. Se a ultima mensagem so continua ou confirma o que voce acabou de responder ("quero pedir", "e so isso", "ok", "eu uso"), responda em uma frase, sem repetir explicacoes nem links. Nunca envie o mesmo link de pagamento duas vezes: se ja mandou, diga apenas que e so abrir o link acima. So reenvie se o cliente pedir o link de novo ou disser que nao abriu.',
  'ANTES DE GERAR LINK DE PAGAMENTO: confirme produto, versao e tamanho (quantidade de capsulas ou frascos) quando o cliente nao tiver dito. Nao escolha por ele. Gere o link uma unica vez por pedido; se ele mudar o produto, gere outro e diga que o anterior nao vale mais.',
  fatos ? 'O que ja se sabe sobre este cliente:\n' + fatos : '',
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
// Modelos da familia 4.6+ (Sonnet 5, Opus 5...) pensam por padrao; esforco medio mantem a resposta rapida no chat
const modeloNovo = /claude-(sonnet|opus|fable)-5|claude-(sonnet|opus)-4-[678]/.test(String(modelo));
const ferramentasUsadas = [];
let resposta = null;
let erro = null;
let uso = { input: 0, cache_read: 0, cache_write: 0, output: 0, chamadas: 0 };

for (let volta = 0; volta < 6; volta++) {
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
      resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: JSON.stringify(saida).slice(0, 6000) });
    }
    messages.push({ role: 'user', content: resultados });
    continue;
  }

  resposta = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  break;
}

// Link repetido: nao reenvia um link que a Serena ja mandou ha pouco (ultimas 8 mensagens dela), a menos que o cliente peca.
// Tambem tira URL duplicada dentro da mesma resposta. Resolve o caso de varias mensagens curtas seguidas gerando 3 ou 4 links.
let linkRepetido = false;
if (resposta && !proativo && !sugerir) {
  const urls = resposta.match(/https?:\/\/[^\s)>\]]+/g) || [];
  if (urls.length) {
    const pediuLink = /\b(link|manda|mande|envia|envie|de novo|novamente|outra vez|reenvia|n[a\u00e3]o (abr|cheg|receb|consegui|deu))/i.test(String(entrada.texto || ''));
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
      if (!/acima|te mandei|j[a\u00e1] (te )?enviei|mesmo link/i.test(resposta)) resposta += (resposta ? '\n\n' : '') + '\u00c9 s\u00f3 abrir o link que te mandei acima \u261d\ufe0f';
      linkRepetido = true;
    }
  }
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
if (!proativo && !sugerir && !erro && (querHumor || querLacuna)) {
  const ultimas = historico.filter(h => h.papel === 'cliente').slice(0, 5).reverse().map(h => String(h.texto || '').slice(0, 300));
  if (!reprocessar) ultimas.push(String(entrada.texto).slice(0, 500));
  try {
    const hr = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 20000,
      body: { model: 'claude-haiku-4-5-20251001', max_tokens: 220,
        system: 'Voce analisa uma conversa de atendimento de e-commerce (suplementos). Responda SOMENTE um JSON: {"humor":"neutro|insatisfeito|irritado","motivo":"ate 12 palavras","sem_resposta":true|false,"pergunta":"a pergunta que ficou sem resposta, reescrita de forma generica, ate 20 palavras, ou vazio","tema":"produto|pedido|entrega|pagamento|troca|empresa|outro"}. HUMOR: irritado = raiva explicita, ameaca (Procon, Reclame Aqui, processo, chamar de golpe), xingamento, caixa alta agressiva, ou terceira cobranca do mesmo problema sem solucao. insatisfeito = frustracao clara mas educada. Caso contrario, neutro. Pergunta normal, duvida, pressa educada ou brincadeira e neutro. SEM_RESPOSTA: true somente quando o cliente fez uma pergunta objetiva e a resposta da assistente NAO respondeu de fato: disse que nao sabe, que nao tem essa informacao, que vai verificar com a equipe, pediu para aguardar um humano, ou mudou de assunto. Encaminhar para humano por pedido do cliente, cliente irritado ou assunto financeiro NAO conta. Se a assistente respondeu com conteudo real, sem_resposta=false e pergunta vazio.',
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
if (resposta && !sugerir) msgs.push({ c: ctx.contato_id, p: 'serena', t: resposta, ca: entrada.canal, ts: agora + 0.001, au: proativo ? ('proativo:' + (entrada.tipo_proativo || 'equipe')) : (reprocessar ? 'reprocessado' : null) });

return [{ json: {
  pausada: false,
  desligado: false,
  contato_id: ctx.contato_id,
  resposta: resposta,
  erro: erro,
  ferramentas: ferramentasUsadas,
  handoff: sugerir ? false : handoff,
  motivo_handoff: sugerir ? null : motivoHandoff,
  humor: humor,
  lacuna: lacuna,
  sugestao: sugerir,
  tags: sugerir ? [] : tags,
  modelo: modelo,
  uso: uso,
  payload: JSON.stringify(sugerir ? { msgs: [], handoff: false, tags: [], contato_id: ctx.contato_id } : { msgs: msgs, handoff: handoff, motivo_handoff: motivoHandoff, tags: tags, lacuna: lacuna, contato_id: ctx.contato_id, telefone: telDigits, canal: entrada.canal, pausa_min: Number(ctx.pausa_handoff_min || 720) })
} }];
