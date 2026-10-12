// Node "Resumir status" do workflow "[Serena Tool] Consultar Status Pedido" (n8n 84YAdtnfbX1Iscxa).
// POST /webhook/serena-status-pedido {codigo_rastreio | numero_pedido}.
// v4: resume o payload do webhook interno /rastreio/buscar (motor do track.americanutrition.com)
// + COMPROVANTE DE ENTREGA (ago/2026)
// + CONTA DE DIAS A PARTIR DE HOJE (12/10/2026, caso Lucia +55 19 97101-3382)
//   A Serena nao sabia que dia era hoje e a ferramenta devolvia so datas absolutas ("previsao 11/10",
//   "ultima movimentacao 06/10"). Resultado: no dia 11/10 ela escreveu "a previsao e 11/10, entao ainda
//   esta dentro do prazo" e chamou 5 dias parado de "sem nenhuma ocorrencia". Agora a ferramenta faz a
//   conta e diz em palavras: e hoje / faltam N dias / o prazo passou ha N dias / N dias sem movimentacao.
//   O flag atrasado do motor nao e confiavel (vinha false com a previsao vencida), entao e recalculado aqui.
// FIX: entregue_em vem SEM fuso ("2026-08-12 15:19:09" ja em BRT) -> anexar -03:00 antes de formatar,
//      senao era lido como UTC e exibia 3h a menos que a linha do tempo.
const cons = $('Consolidar').first().json;
const raw = $input.first().json || {};
const resp = raw.body || raw;
const NL = String.fromCharCode(10);
const E_BOX = String.fromCodePoint(0x1F4E6);
const E_OK = String.fromCodePoint(0x2705);
const E_PIN = String.fromCodePoint(0x1F4CD);
const E_CAL = String.fromCodePoint(0x1F5D3) + String.fromCodePoint(0xFE0F);
const E_WARN = String.fromCodePoint(0x26A0) + String.fromCodePoint(0xFE0F);
const E_TAG = String.fromCodePoint(0x1F516);
const E_SEARCH = String.fromCodePoint(0x1F50E);
const E_HEART = String.fromCodePoint(0x1F499);
const E_DOC = String.fromCodePoint(0x1F4C4);
const BULLET = String.fromCodePoint(0x2022);

const codigo = cons.codigo || '';
const linkTrack = 'https://track.americanutrition.com/' + encodeURIComponent(codigo);

// ---- calendario, sempre no fuso de Brasilia ----
const TZ = 'America/Sao_Paulo';
const hojeISO = new Date().toLocaleDateString('en-CA', { timeZone: TZ });   // 2026-10-12
const diaNum = s => { const m = String(s == null ? '' : s).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
const difDias = (a, b) => (a === null || b === null) ? null : Math.round((a - b) / 86400000);
const hojeNum = diaNum(hojeISO);
// data de evento -> dia do calendario em BRT (o motor manda com e sem fuso)
function diaDoEvento(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) { s = s.replace(' ', 'T') + '-03:00'; }
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
}
const emPalavras = n => n === null ? '' : (n === 0 ? 'hoje' : (n === 1 ? 'ontem' : ('ha ' + n + ' dias')));
const hojeTxt = (function () {
  try { return new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch (e) { return hojeISO.split('-').reverse().join('/'); }
})();

if (!resp || resp.sucesso !== true || !resp.rastreio) {
  const msgApi = (resp && resp.mensagem) ? resp.mensagem : ('Ainda nao encontrei movimentacoes para o codigo ' + codigo + '. Pode ser que o objeto ainda nao tenha sido postado pela transportadora. Quer que eu verifique de novo mais tarde?');
  return [{ json: { sucesso: false, resultado: msgApi, codigo: codigo, link_rastreio: linkTrack, hoje: hojeTxt } }];
}

const r = resp.rastreio;
const eventos = (Array.isArray(r.eventos) ? r.eventos : []).filter(function (e) { return !e.eh_importacao; });
const entregue = r.status_chave === 'delivered' || /entreg/i.test(r.status_atual || '');
const comp = (r.comprovante && (r.comprovante.url || (r.comprovante.evidencias || []).length)) ? r.comprovante : null;

function fmtDataIso(d) {
  if (!d) return '';
  let s = String(d).trim();
  // sem fuso explicito? o motor entrega em horario de Brasilia
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) { s = s.replace(' ', 'T') + '-03:00'; }
  const t = Date.parse(s);
  if (isNaN(t)) return '';
  try { return new Date(t).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}
function fmtPrevisao(p) {
  if (!p) return '';
  const m = String(p).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  return String(p);
}

const ondeEsta = (eventos[0] && (eventos[0].local_destino || eventos[0].local_origem)) || null;
const prev = fmtPrevisao(r.previsao_entrega);
// dias ATE a previsao: positivo = falta, 0 = e hoje, negativo = o prazo passou
const diasPrev = difDias(diaNum(r.previsao_entrega), hojeNum);
let prevSituacao = null;
if (diasPrev !== null) {
  if (diasPrev > 1) prevSituacao = 'faltam ' + diasPrev + ' dias';
  else if (diasPrev === 1) prevSituacao = 'e amanha';
  else if (diasPrev === 0) prevSituacao = 'e HOJE';
  else if (diasPrev === -1) prevSituacao = 'era ontem, o prazo passou';
  else prevSituacao = 'o prazo passou ha ' + (-diasPrev) + ' dias';
}
// o flag do motor vinha false com previsao vencida: vale o que a conta diz
const atrasado = entregue ? false : ((diasPrev !== null && diasPrev < 0) || r.atrasado === true);
const diasParado = eventos.length ? difDias(hojeNum, diaNum(diaDoEvento(eventos[0].data))) : null;
const parado = !entregue && diasParado !== null && diasParado >= 4;

let msg = (entregue ? (E_OK + ' *Seu pedido foi entregue!*') : (E_BOX + ' *Status do seu pedido*')) + NL + NL;
if (cons.pedido && cons.pedido.numero) msg += '*Pedido:* ' + cons.pedido.numero + NL;
if (r.status_atual) msg += '*Situacao atual:* ' + r.status_atual + NL;
if (r.detalhe_atual && !/\[AVALIACAO_CARD\]/.test(r.detalhe_atual)) msg += '_' + r.detalhe_atual + '_' + NL;
if (ondeEsta && !entregue) msg += E_PIN + ' *Onde esta:* ' + ondeEsta + NL;
if (!entregue && prev) msg += E_CAL + ' *Previsao de entrega:* ' + prev + (prevSituacao ? ' (' + prevSituacao + ')' : '') + NL;
if (atrasado) msg += E_WARN + ' O prazo estimado passou' + (diasPrev !== null && diasPrev < 0 ? (diasPrev === -1 ? ' ontem' : ' ha ' + (-diasPrev) + ' dias') : '') + '.' + NL;
if (parado) msg += E_WARN + ' Sem nova movimentacao ' + emPalavras(diasParado) + '.' + NL;
msg += E_TAG + ' *Codigo:* ' + codigo + NL;

// Comprovante de entrega (canhoto assinado registrado pela transportadora)
if (entregue && comp) {
  const dtEnt = fmtDataIso(comp.entregue_em || r.entregue_em);
  msg += NL + E_DOC + ' *Comprovante de entrega disponivel*' + NL;
  if (comp.recebido_por) { msg += 'Recebido por: *' + comp.recebido_por + '*' + (dtEnt ? (' em ' + dtEnt) : '') + NL; }
  else if (dtEnt) { msg += 'Entrega registrada em ' + dtEnt + NL; }
  msg += '_A foto do comprovante assinado esta na pagina de rastreio abaixo._' + NL;
}

const ultimas = eventos.slice(0, 3);
if (ultimas.length) {
  msg += NL + '*Ultimas movimentacoes:*' + NL;
  for (const e of ultimas) {
    let linha = BULLET + ' ';
    const dt = fmtDataIso(e.data);
    if (dt) linha += dt;
    const quando = difDias(hojeNum, diaNum(diaDoEvento(e.data)));
    if (quando !== null) linha += ' (' + emPalavras(quando) + ')';
    const loc = e.local_destino || e.local_origem || '';
    if (loc) linha += (dt ? ' - ' : '') + loc;
    msg += linha + NL;
    if (e.status) msg += '  ' + e.status + NL;
  }
}

msg += NL + E_SEARCH + ' *Acompanhe em tempo real:*' + NL + linkTrack;
if (!entregue) { msg += NL + NL + 'Assim que tiver novidade, e so me chamar que eu verifico de novo. ' + E_HEART; }

// Instrucao para a Serena: a conta de dias ja esta feita, ela nao precisa (nem deve) estimar data.
const nota = [];
nota.push('Hoje e ' + hojeTxt + '.');
if (!entregue && prev) nota.push('Previsao de entrega ' + prev + ': ' + prevSituacao + '.');
if (diasParado !== null && !entregue) nota.push('Ultima movimentacao ' + emPalavras(diasParado) + '.');
if (atrasado) nota.push('O PRAZO JA PASSOU: nao diga que esta "dentro do prazo" nem "ainda da tempo". Reconheca o atraso, diga que vai acionar a transportadora e chame escalar_humano com o numero do pedido. Nao prometa nova data de entrega.');
else if (diasPrev === 0) nota.push('A previsao e HOJE: nao diga que "ainda esta dentro do prazo" como se houvesse dias de sobra. Diga que a previsao e para hoje e que, se nao chegar hoje, e so chamar que voce aciona a transportadora.');
if (parado && !atrasado) nota.push('Sao ' + diasParado + ' dias sem nova movimentacao: nao chame isso de "sem nenhuma ocorrencia". Diga que esta acompanhando e, se o cliente estiver preocupado, ofereca acionar a transportadora.');
nota.push('Use SOMENTE as contas acima para falar de dias e prazo. Nunca calcule data de cabeca nem repita prazo de uma mensagem antiga da conversa.');

return [{ json: {
  sucesso: true,
  resultado: msg,
  nota_serena: nota.join(' '),
  hoje: hojeTxt,
  status_atual: r.status_atual || null,
  onde_esta: ondeEsta,
  previsao_entrega: prev || null,
  previsao_situacao: prevSituacao,
  dias_para_previsao: diasPrev,
  dias_sem_movimentacao: diasParado,
  entregue: entregue,
  atrasado: atrasado,
  tem_comprovante: !!comp,
  comprovante_url: comp ? (comp.url || null) : null,
  recebido_por: comp ? (comp.recebido_por || null) : null,
  link_rastreio: linkTrack,
  codigo: codigo,
  pedido_numero: (cons.pedido && cons.pedido.numero) || null,
  total_eventos: eventos.length
} }];
