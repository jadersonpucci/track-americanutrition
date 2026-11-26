// Workflow "[Serena] Claude Passthrough" (pFGLkmnCizme9s7u), no "Preparar Req". POST /webhook/claude-call.
const b = $input.first().json.body || $input.first().json;
if (!b.model || !Array.isArray(b.messages)) { throw new Error('model e messages sao obrigatorios'); }
// 26/11/2026: chamadas da Serena sem ferramentas (modo proativo do Core: carrinho, retomada, lembretes) chegavam sem
// 'tools'. As ferramentas entram antes do system no prefixo do cache, entao essas chamadas nao reaproveitavam o cache
// da base (~178 mil tokens) e regravavam tudo (cerca de US$ 0,71 cada). Aqui elas recebem as MESMAS ferramentas da
// conversa normal, com tool_choice none (o modelo nao chama ferramenta), e passam a ler o cache (~US$ 0,02).
// Se o Core mudar a definicao da ferramenta, copie a nova aqui (senao so volta o custo antigo; nada quebra).
const TOOLS_SERENA = [{"name":"consultar_sistema","description":"Unica ferramenta para interagir com o sistema da America Nutrition: produtos, precos, estoque, frete, pedidos, rastreio, checkout, PIX, boleto, endereco, escalonamento, abertura de troca/devolucao (registrar_troca) assinatura recorrente (gerenciar_assinatura: consultar, pausar, cancelar, reativar) e Clube America (consultar_estrelas para ver o saldo, resgatar_estrelas para trocar Estrelas por cupom). Sempre use esta ferramenta em vez de inventar dados.","input_schema":{"type":"object","properties":{"acao":{"type":"string","enum":["consultar_produto","calcular_frete","consultar_frete_regiao","buscar_pedido_numero","buscar_pedido_telefone","buscar_pedido_email","consultar_status_pedido","rastrear_pedido","gerar_checkout","gerar_pix","gerar_boleto","alterar_endereco","escalar_humano","consultar_memoria","gerar_cupom_ig","carrinho_cupom_ig","finalizar_cupom_ig","registrar_troca","gerenciar_assinatura","consultar_estrelas","resgatar_estrelas"],"description":"A acao a executar"},"dados":{"type":"string","description":"JSON em texto com os parametros da acao"}},"required":["acao","dados"]}}];
const s0 = Array.isArray(b.system) && b.system[0] && typeof b.system[0].text === 'string' ? b.system[0] : null;
if (!b.tools && s0 && s0.cache_control && s0.text.indexOf('Serena: Base de Treinamento') === 0) {
  b.tools = TOOLS_SERENA;
  b.tool_choice = { type: 'none' };
}
return [{ json: { req: b } }];
