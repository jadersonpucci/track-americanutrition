// Node "Vigiar" do workflow "Grupos | Sentinela de Bolhas" (cron 2 min). Chaves reais so no n8n.
//
// 16/09/2026: as 11:06 a sessao do Samuel mandou sozinha 27 mensagens VAZIAS (conversation "") para
// tres grupos, em 100 segundos, sem nenhum fluxo do n8n rodando. Foi o mesmo padrao que antecedeu o
// banimento de 09/09 (sessao do Baileys quebrada). Esta sentinela le as ultimas mensagens gravadas na
// Evolution a cada 2 minutos e, se achar rajada de mensagens nossas vazias em grupo, avisa a equipe e
// reinicia a instancia (sessao nova, sem QR) para cortar a rajada. Envio duplicado para @lid (o outro
// sintoma visto antes da rajada) so gera aviso.
// Desligar o restart automatico sem mexer em codigo: serena_config sentinela_reiniciar = off.
const EVO = 'http://evolution-api-aru6-api-1:8080';
const EVO_KEY = 'EVO_API_KEY';
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const TG = 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage';
const TG_CHAT = '-1003766435449';
const TOPICOS = [289, 1630];
const JANELA_MIN = 6;
const LIMIAR_VAZIAS = 4;
const LIMIAR_LID = 6;
const DEDUPE_MIN = 20;
const req = async (o) => this.helpers.httpRequest(o);
const sql = async (q) => { try { const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 10000 }); return Array.isArray(r) ? r : []; } catch (e) { return []; } };
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let recs = [];
try {
  const r = await req({ method: 'POST', url: EVO + '/chat/findMessages/Samuel', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: { where: {}, page: 1, offset: 100 }, json: true, timeout: 30000 });
  recs = (r && r.messages && r.messages.records) || [];
} catch (e) { return [{ json: { ok: false, erro: 'findMessages: ' + String(e.message).slice(0, 120) } }]; }

const agora = Date.now();
const corte = Math.floor(agora / 1000) - JANELA_MIN * 60;
const minhas = recs.filter((m) => m && m.key && m.key.fromMe === true && Number(m.messageTimestamp || 0) >= corte);
const vazias = minhas.filter((m) => /@g\.us$/.test(String(m.key.remoteJid || '')) && m.message && typeof m.message.conversation === 'string' && m.message.conversation.trim() === '');
const lids = minhas.filter((m) => /@lid$/.test(String(m.key.remoteJid || '')));
const alertaVazias = vazias.length >= LIMIAR_VAZIAS;
const alertaLid = lids.length >= LIMIAR_LID;
if (!alertaVazias && !alertaLid) return [{ json: { ok: true, vazias: vazias.length, duplicadas_lid: lids.length, lidas: recs.length } }];

const st = $getWorkflowStaticData('global');
if (st.ultimo_alerta && agora - Number(st.ultimo_alerta) < DEDUPE_MIN * 60 * 1000) return [{ json: { ok: true, dedupe: true, vazias: vazias.length, duplicadas_lid: lids.length } }];
st.ultimo_alerta = agora;

let reiniciar = true;
const cfg = await sql("select valor from serena_config where chave = 'sentinela_reiniciar'");
if (cfg[0] && String(cfg[0].valor).trim().toLowerCase() === 'off') reiniciar = false;

const porGrupo = {};
for (const m of vazias) { const j = String(m.key.remoteJid); porGrupo[j] = (porGrupo[j] || 0) + 1; }
let acao = 'so aviso';
if (alertaVazias && reiniciar) {
  try { await req({ method: 'PUT', url: EVO + '/instance/restart/Samuel', headers: { apikey: EVO_KEY }, json: true, timeout: 30000 }); acao = 'instancia Samuel REINICIADA (sessao nova, sem QR)'; }
  catch (e) { acao = 'falhou ao reiniciar: ' + String(e.message).slice(0, 100); }
} else if (alertaVazias) { acao = 'restart automatico desligado (sentinela_reiniciar=off)'; }

let t = '\u{1F6A8} <b>SENTINELA DE BOLHAS</b>\n\n';
if (alertaVazias) t += esc(vazias.length) + ' mensagens VAZIAS nossas em grupo nos ultimos ' + JANELA_MIN + ' min:\n' + Object.keys(porGrupo).map((j) => '• ' + esc(j) + ': ' + porGrupo[j]).join('\n') + '\n';
if (alertaLid) t += esc(lids.length) + ' envios duplicados para @lid nos ultimos ' + JANELA_MIN + ' min (sessao instavel).\n';
t += '\nAcao: ' + esc(acao) + '\n\nE o padrao de sessao quebrada que antecedeu o banimento de 09/09. Se continuar depois do restart: desconecte a instancia e reinicie o container da Evolution antes de conectar de novo.';
for (const topico of TOPICOS) {
  try { await req({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: TG_CHAT, message_thread_id: topico, parse_mode: 'HTML', disable_web_page_preview: true, text: t } }); } catch (e) {}
}
return [{ json: { alerta: true, vazias: vazias.length, duplicadas_lid: lids.length, por_grupo: porGrupo, acao: acao } }];
