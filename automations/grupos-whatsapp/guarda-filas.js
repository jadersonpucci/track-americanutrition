// Node "Guardar Filas" do workflow "Filas | Guarda de Represamento" (n8n z75qStbDY4Xu2pUv).
// Cron de 15 minutos, mais GET /webhook/filas-guarda?t=TOKEN (&teste=1 so conta).
// Chaves reais so no n8n.
//
// POR QUE EXISTE
// Em 08/09/2026 o numero do Samuel foi banido depois de despejar 150 convites de grupo em duas
// horas. A tabela convites_grupo tinha 1.207 convites vencidos, o mais antigo agendado para
// 24/06: o disparador passou meses sem entregar, a fila engordou, e quando ele voltou soltou
// tudo de uma vez. Fila represada + disparador que volta = disparo em massa = banimento.
// A mesma armadilha estava montada em carrinhos_abandonados: 124 carrinhos 'pendente' vencidos,
// o mais antigo de 22/06, num cron de 1 minuto.
//
// A REGRA
// Mensagem atrasada demais nao e mensagem atrasada: e mensagem que nao deve mais existir.
// Um convite de grupo de tres meses atras, um carrinho abandonado em junho, um lembrete de
// avaliacao vencido ha semanas - nada disso ajuda o cliente e tudo isso parece spam para o
// WhatsApp. Entao aqui, a cada 15 minutos:
//   1) tudo que passou do TTL vira 'expirado' e nunca mais e enviado;
//   2) se ainda sobrar fila vencida acima do limite, a equipe recebe alerta no Telegram.
// O item (2) e o que impede a proxima surpresa: o represamento vira aviso, nao descoberta
// depois do estrago.
//
// COMO VIGIAR UMA FILA NOVA
// Acrescente uma linha em FILAS. 'prazo' e a coluna de quando deveria sair, 'enviado' a coluna
// que marca o envio (null quando a tabela nao tem uma), 'estados' os status que ainda estao na
// fila, 'ttl_h' o quanto de atraso ainda faz sentido e 'alerta' a partir de quantos vencidos a
// equipe precisa saber. Nada aqui monta SQL a partir de dado do banco: os nomes de tabela e
// coluna sao fixos neste arquivo, de proposito.
const FILAS = [
  { tabela: 'convites_grupo', prazo: 'enviar_em', enviado: 'enviado_em', estados: ['agendado'], ttl_h: 72, alerta: 30, o_que: 'convite para o grupo de WhatsApp' },
  { tabela: 'carrinhos_abandonados', prazo: 'abandonar_em', enviado: null, estados: ['pendente'], ttl_h: 72, alerta: 30, o_que: 'recuperacao de carrinho' },
  { tabela: 'scheduled_messages', prazo: 'send_at', enviado: 'enviada_em', estados: ['pendente'], ttl_h: 48, alerta: 30, o_que: 'transacional (pago, enviado, entregue)' },
  { tabela: 'review_convites', prazo: 'enviar_em', enviado: 'enviado_em', estados: ['agendado', 'pendente'], ttl_h: 168, alerta: 30, o_que: 'convite de avaliacao' },
  { tabela: 'serena_reposicao', prazo: 'avisar_em', enviado: 'enviado_em', estados: ['agendado'], ttl_h: 168, alerta: 30, o_que: 'lembrete de reposicao' },
  { tabela: 'broadcasts_grupos', prazo: 'enviar_em', enviado: 'enviado_em', estados: ['agendado'], ttl_h: 24, alerta: 3, o_que: 'broadcast agendado para os grupos' }
];
// Um unico expurgo nao deveria passar disso. Acima daqui alguma coisa esta errada de verdade
// e a equipe tem que olhar, mesmo que o expurgo em si ja tenha protegido o numero.
const AVISAR_EXPIRADOS = 10;
const TOKEN = 'an-filas-7Qm2Xv';

const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const TG = 'https://api.telegram.org/bot<TOKEN_ALERTAS>/sendMessage';
// grupo "America Nutrition Alertas", topico 289 (operacional)
const TG_GRUPO = '-1003766435449';
const TG_TOPICO = 289;
const NL = String.fromCharCode(10);
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
async function sql(q) {
  const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 60000 });
  if (r && r.error) return { erro: String(r.message || r.error).slice(0, 200) };
  return Array.isArray(r) ? r : [];
}
const lista = (a) => a.map((s) => "'" + String(s).replace(/'/g, "''") + "'").join(',');
// O cron entra sem query nenhuma e roda normal. Pelo webhook o endpoint mexe em dado de
// producao, entao exige token: ?t=... . ?teste=1 so conta, nao expira nada.
const q = ($json.query || $json.body || $json) || {};
const veioDaWeb = !!($json.query || $json.headers);
if (veioDaWeb && String(q.t || '') !== TOKEN) return [{ json: { erro: 'token invalido' } }];
const soTestar = String(q.teste || '') === '1';

const linhas = [];
let totalExpirado = 0;
let precisaAvisar = false;

for (const f of FILAS) {
  const cond = 'status in (' + lista(f.estados) + ')' + (f.enviado ? (' and ' + f.enviado + ' is null') : '');
  let expirados = 0;
  if (!soTestar) {
    const r = await sql('update ' + f.tabela + " set status = 'expirado' where " + cond + ' and ' + f.prazo + " < now() - interval '" + f.ttl_h + " hours' returning 1");
    if (r && r.erro) { linhas.push({ fila: f.tabela, erro: r.erro }); continue; }
    expirados = Array.isArray(r) ? r.length : 0;
  }
  const c = await sql('select count(*)::int as vencidos, to_char(min(' + f.prazo + "), 'DD/MM/YY') as mais_antigo from " + f.tabela + ' where ' + cond + ' and ' + f.prazo + ' <= now()');
  if (c && c.erro) { linhas.push({ fila: f.tabela, erro: c.erro }); continue; }
  const d = (c && c[0]) || {};
  const vencidos = Number(d.vencidos || 0);
  totalExpirado += expirados;
  if (expirados >= AVISAR_EXPIRADOS || vencidos > f.alerta) precisaAvisar = true;
  linhas.push({ fila: f.tabela, o_que: f.o_que, ttl_h: f.ttl_h, expirados: expirados, vencidos_agora: vencidos, mais_antigo: d.mais_antigo || null });
}

if (precisaAvisar && !soTestar) {
  let t = '\u{1F6A6} <b>Guarda de filas</b>' + NL + NL;
  for (const l of linhas) {
    if (l.erro) { t += '\u{26A0} ' + l.fila + ': ' + l.erro + NL; continue; }
    if (l.expirados < AVISAR_EXPIRADOS && l.vencidos_agora === 0) continue;
    t += '<b>' + l.fila + '</b> (' + l.o_que + ')' + NL;
    if (l.expirados) t += '  expirados agora: ' + l.expirados + NL;
    if (l.vencidos_agora) t += '  ainda vencidos: ' + l.vencidos_agora + (l.mais_antigo ? (', desde ' + l.mais_antigo) : '') + NL;
  }
  t += NL + 'Fila represada e o que derrubou o numero em 08/09. Antes de religar qualquer disparador, esvazie a fila.';
  await req({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: TG_GRUPO, message_thread_id: TG_TOPICO, parse_mode: 'HTML', disable_web_page_preview: true, text: t } });
}

return [{ json: { modo: soTestar ? 'teste' : 'normal', expirados: totalExpirado, avisou: precisaAvisar && !soTestar, filas: linhas } }];
