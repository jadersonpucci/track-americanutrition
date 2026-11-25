// Serena | Telegram — node "Botao Social" (Code), ligado em paralelo ao "Tratar Mensagem" a partir do webhook
// "Telegram IN". O bot da Serena tem um unico webhook, e o "Tratar Mensagem" descarta tudo que nao e conversa
// privada. Os botoes dos avisos de moderacao de comentarios (grupo Alertas, topico 284) chegam como
// callback_query com data "soc:oc|ok|re:<comment_id>": aqui eles sao repassados ao workflow
// [Serena Social] Comentarios IG FB (POST /webhook/serena-social-botao), que oculta/reexibe pela Graph e edita o aviso.
const upd = $json.body || $json;
const cq = upd.callback_query || null;
if (!cq || !/^soc:/.test(String(cq.data || ''))) return [];
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-social-botao', json: true, timeout: 30000, body: { t: 'an-social-btn-5Rk9Tq', callback: cq } });
} catch (e) {
  return [{ json: { ok: false, acao: 'botao_social', erro: String((e && e.message) || e) } }];
}
return [{ json: { ok: true, acao: 'botao_social', data: String(cq.data) } }];
