// [Serena Tool] Escalar Humano (id pENiiK4JvuowUEqn) — node "Montar card" (Code). Versao com resumo automatico (03/09/2026).
// Monta o card de escalonamento/callback para o topico da equipe no Telegram, gera o resumo da conversa e avisa os atendentes por push.
const body = $input.first().json.body || $input.first().json;
const API = 'https://n8n.americanutrition.com/webhook/painel-serena-api';
const CLAUDE = 'https://n8n.americanutrition.com/webhook/claude-call';
const TOKEN = 'an-serena-9Kx4Lm2Q';

function escapeHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const tipo = (body.tipo || 'escalonamento').toString().trim().toLowerCase();
const nomeCliente = (body.nome_cliente || body.nome || 'Cliente').toString();
const motivo = (body.motivo || 'Nao informado').toString();
const numeroPedido = (body.numero_pedido || '').toString().trim();
const tentado = (body.tentado || '').toString().trim();
const canal = (body.canal || '').toString().trim().toLowerCase();
const contatoId = (body.contato_id || '').toString().trim();

// Link WhatsApp a partir do telefone
let whatsappLink = null;
let telefoneFmt = 'Nao informado';
const telRaw = (body.telefone || '').toString();
if (telRaw) {
  let tel = telRaw.replace(/\D/g, '');
  if (tel.length >= 10 && tel.length <= 11) {
    tel = '55' + tel;
  }
  if (tel.length >= 12 && tel.length <= 13) {
    whatsappLink = 'https://wa.me/' + tel;
    telefoneFmt = '+' + tel;
  } else {
    telefoneFmt = telRaw;
  }
}

// Link direto para a conversa no Inbox da Serena (painel admin)
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=' + TOKEN;
const inboxLink = contatoId ? INBOX + '&c=' + encodeURIComponent(contatoId) : INBOX + '&fila=humano';

const ehCallback = tipo === 'callback' || tipo === 'retorno';
const titulo = ehCallback ? 'SOLICITACAO DE RETORNO' : 'ESCALONAMENTO PARA ATENDIMENTO';
const emoji = ehCallback ? '📞' : '🆘';

// Resumo automatico da conversa (Haiku): quem e, o que quer, o que a Serena ja fez, o que falta.
// Fica em serena_atribuicoes.resumo (aparece no Inbox) e vai no card e no push.
let resumo = '';
if (contatoId) {
  try {
    const th = await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 20000, body: { t: TOKEN, acao: 'thread', contato_id: contatoId } });
    const msgs = (th && Array.isArray(th.dados)) ? th.dados : [];
    const linhas = msgs.slice(-24).filter(m => m && m.texto).map(m => (m.papel === 'cliente' ? 'Cliente' : (m.papel === 'humano' ? 'Atendente' : 'Serena')) + ': ' + String(m.texto).replace(/\s+/g, ' ').slice(0, 400));
    if (tentado) linhas.push('[Agora] ' + tentado.replace(/\s+/g, ' ').slice(0, 600));
    if (linhas.length) {
      const hr = await this.helpers.httpRequest({ method: 'POST', url: CLAUDE, json: true, timeout: 30000, body: { model: 'claude-haiku-4-5-20251001', max_tokens: 350,
        system: 'Voce resume conversas de atendimento de e-commerce (suplementos) para o atendente humano que vai assumir agora. Escreva em portugues, no maximo 4 linhas curtas, sem cabecalho e sem markdown, uma por linha, neste formato: Quem/o que quer: ... | Serena ja fez: ... | Falta resolver: ... | Dados uteis (pedido, produto, prazo, valor): ... Seja concreto, use os nomes e numeros que aparecem, nao invente nada.',
        messages: [{ role: 'user', content: 'Motivo do encaminhamento: ' + motivo + '\n\nConversa (da mais antiga para a mais recente):\n' + linhas.join('\n') }] } });
      resumo = (hr.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim().slice(0, 1500);
    }
  } catch (e) { resumo = ''; }
  if (resumo) {
    try { await this.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 15000, body: { t: TOKEN, acao: 'resumo_salvar', contato_id: contatoId, resumo: resumo } }); } catch (e) {}
  }
}

const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

let msg = emoji + ' <b>' + escapeHtml(titulo) + '</b>\n\n';
msg += '👤 <b>Cliente:</b> ' + escapeHtml(nomeCliente) + '\n';
msg += '📱 <b>Telefone:</b> ' + escapeHtml(telefoneFmt) + '\n';
if (canal) {
  msg += '📡 <b>Canal:</b> ' + escapeHtml(canal) + '\n';
}
if (numeroPedido) {
  msg += '📦 <b>Pedido:</b> <code>' + escapeHtml(numeroPedido) + '</code>\n';
}
msg += '\n📝 <b>Motivo:</b>\n' + escapeHtml(motivo) + '\n';
if (resumo) {
  msg += '\n🧾 <b>Resumo da conversa:</b>\n' + escapeHtml(resumo) + '\n';
} else if (tentado) {
  msg += '\n🔧 <b>O que a Serena ja tentou:</b>\n' + escapeHtml(tentado) + '\n';
}
msg += '\n<a href="' + inboxLink + '">🖥 Assumir no Inbox da Serena</a>\n';
if (whatsappLink) {
  msg += '<a href="' + whatsappLink + '">💬 Abrir conversa no WhatsApp</a>\n';
}
if (contatoId && !ehCallback) {
  msg += '\n⏸ A Serena ficou pausada nessa conversa: quem assumir responde pelo Inbox (ou pelo celular do Samuel).\n';
}
msg += '\n🕒 ' + escapeHtml(agora) + ' (BRT)';

// Push para os atendentes com o Inbox instalado no celular (nao bloqueia o fluxo)
let push = null;
try {
  push = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-push', json: true, timeout: 25000,
    body: { titulo: (ehCallback ? '📞 Retorno: ' : '🙋 Aguardando atendente: ') + nomeCliente, corpo: String(resumo ? resumo.split('\n')[0] : motivo).slice(0, 160), url: inboxLink, tag: 'fila-' + (contatoId || 'geral') } });
} catch (e) { push = { erro: String(e.message) }; }

return [{ json: {
  mensagem: msg,
  tipo: ehCallback ? 'callback' : 'escalonamento',
  tem_whatsapp: !!whatsappLink,
  contato_id: contatoId || null,
  resumo: resumo || null,
  push: push
}}];
