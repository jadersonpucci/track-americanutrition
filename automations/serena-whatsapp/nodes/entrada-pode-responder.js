const r = $input.first().json || {};

if (!r.buffer_id) return [];
// lista de numeros que a Serena nunca responde automaticamente (serena_wpp_bloqueados)
if (r.bloqueado === true) return [];
const modo = String(r.modo || 'teste').toLowerCase();
if (modo === 'off') return [];
const tel = String(r.telefone || '').replace(/\D/g, '');
if (modo === 'teste') {
  const lista = String(r.teste_numeros || '').split(/[\s,;]+/).map(n => n.replace(/\D/g, '')).filter(Boolean);
  if (lista.indexOf(tel) < 0) return [];
}
if (r.pausada_ate) return [];
if (Number(r.respostas_1h || 0) >= Number(r.max_por_hora || 30)) return [];
if (r.ignorar_regex) {
  try { if (new RegExp(String(r.ignorar_regex), 'i').test(String(r.texto || ''))) return []; } catch (e) {}
}
// Anti-spam: numero desconhecido (sem historico e sem pedido) na primeira mensagem passa por um classificador rapido (Haiku).
// Vendedor, golpe, bot ou divulgacao: entra na lista de bloqueio (motivo antispam) e a Serena nao gasta resposta. Reversivel no Inbox.
const desconhecido = Number(r.msgs_anteriores || 0) === 0 && r.cliente_conhecido !== true;
if (String(r.antispam || 'on') === 'on' && desconhecido && String(r.tipo || 'texto') !== 'humano') {
  const texto = String(r.texto || '');
  const suspeito = /https?:\/\/|wa\.me|bit\.ly|renda extra|ganhe|promo[cç][aã]o|divulga|parceria|investimento|empr[eé]stimo|cart[aã]o de cr[eé]dito|sorteio|marketing digital|tr[aá]fego pago|or[cç]amento gr[aá]tis|seguidores|consultoria|revenda|distribuidor|fornecedor|atacado|catalogo|cat[aá]logo/i.test(texto) || texto.length > 600;
  if (suspeito) {
    let spam = null;
    try {
      const hr = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/claude-call', json: true, timeout: 15000,
        body: { model: 'claude-haiku-4-5-20251001', max_tokens: 60, system: 'Voce filtra a primeira mensagem recebida no WhatsApp de uma loja de suplementos. Responda SOMENTE um JSON: {"spam":true|false,"tipo":"vendedor|golpe|bot|divulgacao|cliente|outro","confianca":0-1}. spam=true apenas para mensagens de quem quer VENDER algo para a loja (servicos, marketing, fornecimento, parceria), golpes, correntes, listas de transmissao ou bots. Qualquer pessoa perguntando sobre produtos, pedidos, entrega, pagamento, saude ou reclamando e cliente (spam=false), mesmo com link.',
          messages: [{ role: 'user', content: texto.slice(0, 900) }] } });
      const t = (hr.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
      const m = t.match(/\{[\s\S]*\}/); if (m) spam = JSON.parse(m[0]);
    } catch (e) { spam = null; }
    if (spam && spam.spam === true && Number(spam.confianca || 0) >= 0.8) {
      // bloqueia pelo endpoint de config (mesma lista do Inbox; reversivel em Bloqueados > desbloquear) e avisa a equipe
      const det = String(spam.tipo || 'spam') + ': ' + texto.replace(/\s+/g, ' ').slice(0, 160);
      try { await this.helpers.httpRequest({ method: 'GET', url: 'https://n8n.americanutrition.com/webhook/serena-wpp-config?t=an-wpp-7Qm3Vz9K&bloquear=' + tel + '&motivo=antispam&detalhe=' + encodeURIComponent(det), json: true, timeout: 15000 }); } catch (e) {}
      try { await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot8872435172:AAGA-EmIy8MKA8e0p3DhtIAtqRQfcFCI7vk/sendMessage', json: true, timeout: 10000, body: { chat_id: '-1003766435449', message_thread_id: 289, parse_mode: 'HTML', disable_web_page_preview: true, text: '\u{1F6AB} <b>Anti-spam: numero bloqueado</b>' + String.fromCharCode(10) + '+' + tel + ' (' + String(spam.tipo || 'spam') + ')' + String.fromCharCode(10) + '<i>' + texto.replace(/[<>&]/g, ' ').slice(0, 200) + '</i>' + String.fromCharCode(10) + String.fromCharCode(10) + 'Se for cliente de verdade, desbloqueie no Inbox (menu Bloqueados).' } }); } catch (e) {}
      return [];
    }
  }
}
const debounce = Math.max(2, Math.min(30, Number(r.debounce_seg || 8)));
const tipo = String(r.tipo || 'texto');

// Resposta em duas etapas: confirma na hora que esta verificando, quando o assunto exige consulta
// (pedido, rastreio, frete...). So na primeira mensagem do lote e se a Serena nao falou nos ultimos 10 min.
let ack = false;
if (String(r.ack_rapido || 'off') === 'on' && r.ack_regex && Number(r.pendentes_antes || 0) === 0 && tipo !== 'humano') {
  const quieto = !r.ultima_resposta_em || (Date.now() - new Date(r.ultima_resposta_em).getTime()) > 10 * 60000;
  try { ack = quieto && new RegExp(String(r.ack_regex), 'i').test(String(r.texto || '')); } catch (e) { ack = false; }
}
// Audio de resposta: cliente mandou audio e a voz esta configurada
const audio = String(r.audio_resposta || 'off') === 'on' && tipo === 'audio' && !!r.voz_id;

return [{ json: { responder: true, buffer_id: String(r.buffer_id), telefone: tel, nome: r.nome || '', debounce_seg: debounce, ack: ack, ack_texto: String(r.ack_texto || ''), audio: audio, voz_id: String(r.voz_id || ''), tipo: tipo, payload: JSON.stringify({ telefone: tel, buffer_id: String(r.buffer_id) }) } }];
