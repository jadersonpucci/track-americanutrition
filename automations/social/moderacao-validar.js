// Node "Validar Resposta" do workflow "[Serena Social] Comentarios IG FB" (n8n 9KXACZ6PK3Vr7kHZ).
// Chaves reais so no n8n.
// Parse JSON do Claude e validacao. Em caso de erro, vai pra ignorar e loga.
// MODO AVISO (13/09/2026): serena_config.social_ocultar_modo = 'avisar' transforma ocultar em avisar:
// nada e escondido, a equipe recebe no Telegram o que o robo TERIA ocultado, para calibrar a mira.
// 'ocultar' volta a esconder de verdade.
const claudeResponse = $input.item.json;
const dadosOriginais = $('Deduplicação').first().json;

if (claudeResponse.error || !claudeResponse.content || !claudeResponse.content[0]) {
  return [{ json: Object.assign({}, dadosOriginais, { acao: 'ignorar', categoria: 'erro', resposta: '', motivo: 'claude_api_error', erro_claude: true, payload_claude: claudeResponse }) }];
}

let rawText = '';
let decisao = null;
try {
  rawText = claudeResponse.content[0].text.trim();
  rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  decisao = JSON.parse(rawText);
} catch (e) {
  return [{ json: Object.assign({}, dadosOriginais, { acao: 'ignorar', categoria: 'outros', resposta: '', motivo: 'parse_error: ' + (e.message || 'unknown'), raw_claude: rawText, erro_parse: true }) }];
}

let respostaTexto = decisao.resposta || '';

// Site oficial: unico link liberado na resposta publica.
const DOMINIOS_PERMITIDOS = ['americanutrition.com'];
const FALLBACK = 'Oi! Está tudo no site oficial: americanutrition.com/products/imunofosfo 💙 Qualquer dúvida me chama no Direct 🧬';

if (decisao.acao === 'responder') {
  const proibidas = ['cura', 'curado', 'curar', 'trata ', 'tratamento', 'elimina', 'eliminar', 'fortalece imunidade', 'aumenta imunidade', 'wa.me', 'whatsapp', 'R$', 'reais', 'dolar', 'cupom', 'desconto', 'America Nutricao'];
  const respostaLower = respostaTexto.toLowerCase();
  const contemProibida = proibidas.some(palavra => respostaLower.includes(palavra.toLowerCase()));
  const links = respostaTexto.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com\.br|com|net|org|br|io|me|co|shop|store|site|app|link|info|xyz)(?:\/[^\s]*)?/gi) || [];
  const linkDeFora = links.some(link => !DOMINIOS_PERMITIDOS.some(d => link.toLowerCase().includes(d)));
  if (contemProibida || linkDeFora) respostaTexto = FALLBACK;
  if (respostaTexto.length > 280) {
    let corte = respostaTexto.substring(0, 277);
    const ultimoEspaco = corte.lastIndexOf(' ');
    if (ultimoEspaco > 180) corte = corte.substring(0, ultimoEspaco);
    respostaTexto = corte.trim() + '...';
  }
  if (!respostaTexto || respostaTexto.length < 10) respostaTexto = FALLBACK;
}

let acao = decisao.acao || 'ignorar';
let motivo = decisao.motivo || '';
if (acao === 'ocultar') {
  let modo = 'avisar';
  try {
    const SK = 'SUPABASE_SERVICE_KEY';
    const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: "select valor from serena_config where chave = 'social_ocultar_modo'" }, json: true, timeout: 8000 });
    if (Array.isArray(r) && r[0] && r[0].valor) modo = String(r[0].valor).trim().toLowerCase();
  } catch (e) { modo = 'avisar'; }
  if (modo !== 'ocultar') { acao = 'avisar'; motivo = '[modo aviso, nao ocultado] ' + motivo; }
}

return [{ json: Object.assign({}, dadosOriginais, { acao: acao, categoria: decisao.categoria || 'outros', resposta: respostaTexto, motivo: motivo, timestamp_processamento: new Date().toISOString() }) }];
