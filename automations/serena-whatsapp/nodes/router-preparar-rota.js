// Etapa 1: resolve a rota pela 'acao'. Desempacota 'dados' (JSON string ou objeto).
// Se acao faltar/invalida, marca pra classificacao via Haiku.
const body = $input.first().json.body || $input.first().json;

const ROTAS = {
  calcular_frete: 'calcular-frete',
  consultar_frete_regiao: 'consultar-frete-regiao',
  consultar_produto: 'consultar-produto',
  buscar_pedido_numero: 'buscar-pedido-numero',
  buscar_pedido_telefone: 'buscar-pedidos-telefone',
  buscar_pedido_email: 'buscar-cliente-email',
  gerar_checkout: 'gerar-checkout',
  alterar_endereco: 'alterar-endereco',
  rastrear_pedido: 'serena-status-pedido',
  consultar_status_pedido: 'serena-status-pedido',
  gerar_cupom_ig: 'gerar-cupom-instagram',
  carrinho_cupom_ig: 'carrinho-cupom-instagram',
  finalizar_cupom_ig: 'finalizar-link-cupom',
  escalar_humano: 'serena-escalar',
  consultar_memoria: 'serena-memoria-consultar',
  gerar_boleto: 'serena-gerar-boleto',
  gerar_pix: 'serena-gerar-pix'
};

const acao = (body.acao || '').toString().trim().toLowerCase();

// Desempacota 'dados': aceita objeto, string JSON, ou vazio.
let payload = {};
const dadosRaw = body.dados;
if (dadosRaw) {
  if (typeof dadosRaw === 'object') {
    payload = dadosRaw;
  } else {
    try {
      payload = JSON.parse(dadosRaw.toString());
    } catch (e) {
      payload = {};
    }
  }
}

// Compatibilidade: se vierem campos soltos no body (sem usar 'dados'), aproveita.
// 'canal' (whatsapp/instagram/messenger) vem do Core e define a tag do pedido na Shopify (WPP etc.).
const camposSoltos = ['nome_produto','cep','itens_str','numero_pedido','telefone','email','desconto_percentual','rua','numero','bairro','cidade','estado','complemento','rastreio','codigo_rastreio','servico','nome','contact_id','first_name','action','produtos','tipo','nome_cliente','motivo','tentado','cpf','documento','uf','canal'];
for (const c of camposSoltos) {
  if (body[c] !== undefined && payload[c] === undefined) {
    payload[c] = body[c];
  }
}

if (acao && ROTAS[acao]) {
  return [{ json: {
    precisa_classificar: false,
    acao: acao,
    rota_path: ROTAS[acao],
    payload: payload,
    body_original: body
  }}];
}

return [{ json: {
  precisa_classificar: true,
  acao_recebida: acao || '(vazia)',
  payload: payload,
  body_original: body
}}];
