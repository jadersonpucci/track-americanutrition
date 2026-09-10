// Node "Avaliar" do workflow "[Serena WhatsApp] Watchdog -> Telegram" (n8n sYBUj3v8LGAtZYR8).
// Chaves reais so no n8n.
//
// O alerta de fila humana virava ruido: reavisava de hora em hora com a MESMA lista, so com os
// minutos crescendo. Em 09/09 a mesma fila de 7 pessoas foi anunciada varias vezes na mesma
// noite (Suely ha 3476 min, depois 3541 min...) e a equipe parou de ler. Alerta que repete o
// que ja foi dito nao e alerta, e barulho.
// Agora ele fala quando ENTRA gente nova na fila, e so relembra uma vez a cada 12h se nada
// mudou. A comparacao e pelo conjunto de contatos, guardado em serena_config.fila_humano_ids.
//
// Antes disso, higiene: atribuicao que ja teve resposta humana depois do handoff, ou que e de
// um numero da propria equipe, nao e cliente esperando. Enquanto isso ficava aberto, a fila
// nunca esvaziava e o alerta nunca calava.
const d = $input.first().json || {};
const ev = $('Estado do Samuel').first().json || {};
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
// numeros da equipe: teste interno nunca deve aparecer como cliente esperando
const EQUIPE = ['5513981885555', '16464270203', '13472225493'];
const RELEMBRAR_MIN = 720;
const NL = String.fromCharCode(10);
const self = this;
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
async function sql(q) {
  const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 30000 });
  return Array.isArray(r) ? r : [];
}
const estado = String((ev.instance && ev.instance.state) || ev.state || '').toLowerCase();
const alertas = d.alertas || {};
const agora = Date.now();
function minutosDesde(k) { return alertas[k] ? (agora - new Date(alertas[k]).getTime()) / 60000 : Infinity; }
const modo = String(d.modo || 'teste').toLowerCase();
const out = [];

// 1) conexao do Samuel com o WhatsApp
if (estado !== 'open') {
  if (minutosDesde('evolution_down') > 30) {
    out.push({ chave: 'evolution_down', acao: 'set', texto: '\u{1F534} <b>Samuel desconectado do WhatsApp</b>' + NL + 'Estado na Evolution: <code>' + esc(estado || 'sem resposta') + '</code>' + NL + NL + 'A Serena nao consegue receber nem responder por WhatsApp. Abra a Evolution e leia o QR code de novo.' });
  }
} else if (alertas.evolution_down) {
  out.push({ chave: 'evolution_down', acao: 'del', texto: '\u{1F7E2} <b>Samuel reconectado</b>' + NL + 'A Serena voltou a receber e responder normalmente.' });
}

// 2) clientes esperando a Serena (ativa, sem pausa) ha mais de wpp_alerta_min
const lista = Array.isArray(d.lista) ? d.lista : [];
const teste = String(d.teste_numeros || '').split(/[\s,;]+/).map((n) => n.replace(/\D/g, '')).filter(Boolean);
const filaSerena = lista.filter((x) => !x.pausada && (modo === 'producao' || (modo === 'teste' && teste.indexOf(String(x.telefone || '').replace(/\D/g, '')) >= 0)));
if (modo !== 'off' && filaSerena.length && minutosDesde('serena_sem_resposta') > 30) {
  out.push({ chave: 'serena_sem_resposta', acao: 'set', texto: '\u{26A0} <b>Serena sem responder</b>' + NL + filaSerena.length + ' cliente(s) esperando ha mais de ' + d.min_espera + ' min com a Serena ativa:' + NL + filaSerena.slice(0, 8).map((x) => '• ' + esc(x.nome || 'Sem nome') + ' (' + esc(x.telefone || x.canal || '') + ') ha ' + x.minutos + ' min').join(NL) + NL + NL + 'Confira as execucoes de Entrada Samuel e Serena Core no n8n.' + NL + '<a href="' + INBOX + '">Abrir o Inbox</a>' });
} else if (!filaSerena.length && alertas.serena_sem_resposta) {
  out.push({ chave: 'serena_sem_resposta', acao: 'del', texto: '' });
}

// 3) clientes esperando um atendente humano
// Higiene: fecha o que nao e espera de verdade. So os dois casos inequivocos - alguem da equipe
// ja respondeu depois do handoff, ou o contato e um numero nosso. Nao mexe em ia_pausada de
// proposito: despausar sozinho poderia fazer a Serena falar por cima de um atendimento em curso.
const fechados = {};
const eq = EQUIPE.map((n) => "'" + n + "'").join(',');
const r1 = await sql("with alvo as (select a.contato_id from serena_atribuicoes a join serena_contatos c on c.id = a.contato_id where a.status = 'aberto' and (exists (select 1 from serena_mensagens m where m.contato_id = a.contato_id and m.papel = 'humano' and m.criado_em > a.atribuido_em) or regexp_replace(coalesce(c.telefone, ''), '\\D', '', 'g') in (" + eq + "))) update serena_atribuicoes s set status = 'resolvido', atualizado_em = now() where s.contato_id in (select contato_id from alvo) returning s.contato_id::text as id");
r1.forEach((x) => { if (x && x.id) fechados[String(x.id)] = 1; });

const vistos = {};
const filaHumano = [];
lista.filter((x) => x.pausada && Number(x.minutos) >= 30 && !fechados[String(x.id)]).forEach((x) => { vistos[x.id] = true; filaHumano.push(x); });
(Array.isArray(d.fila_atrib) ? d.fila_atrib : []).forEach((x) => { if (!vistos[x.id] && !fechados[String(x.id)]) { vistos[x.id] = true; filaHumano.push(x); } });

const linha = (x) => '• ' + esc(x.nome || 'Sem nome') + ' (' + esc(x.telefone || x.canal || '') + ') ha ' + x.minutos + ' min';
const maisVelha = filaHumano.length ? filaHumano.map((x) => Number(x.minutos) || 0).reduce((a, b) => (b > a ? b : a), 0) : 0;
const idsAgora = filaHumano.map((x) => String(x.id)).sort().join(',');
const cfg = await sql("select valor from serena_config where chave = 'fila_humano_ids' limit 1");
const antes = String((cfg[0] && cfg[0].valor) || '').split(',').filter(Boolean);
const novos = filaHumano.filter((x) => antes.indexOf(String(x.id)) < 0);
const desde = minutosDesde('fila_humano');
let gravarIds = null;

if (filaHumano.length && novos.length && desde > 15) {
  // gente nova na fila: isso e noticia, avisa nomeando so quem entrou
  let t = '\u{1F64B} <b>' + (novos.length === 1 ? 'Cliente esperando atendente' : novos.length + ' clientes esperando atendente') + '</b>' + NL + novos.slice(0, 8).map(linha).join(NL);
  if (filaHumano.length > novos.length) t += NL + NL + 'Fila total: ' + filaHumano.length + '. A mais antiga ha ' + maisVelha + ' min.';
  t += NL + NL + '<a href="' + INBOX + '&fila=humano">Abrir a fila no Inbox</a>';
  out.push({ chave: 'fila_humano', acao: 'set', texto: t });
  gravarIds = idsAgora;
} else if (filaHumano.length && desde > RELEMBRAR_MIN) {
  // nada mudou: uma linha a cada 12h, sem repetir a lista inteira
  out.push({ chave: 'fila_humano', acao: 'set', texto: '\u{1F64B} <b>Fila de atendimento parada</b>' + NL + filaHumano.length + ' conversa(s) esperando, a mais antiga ha ' + maisVelha + ' min. Ninguem novo desde o ultimo aviso.' + NL + NL + '<a href="' + INBOX + '&fila=humano">Abrir a fila no Inbox</a>' });
  gravarIds = idsAgora;
} else if (!filaHumano.length && alertas.fila_humano) {
  out.push({ chave: 'fila_humano', acao: 'del', texto: '' });
  gravarIds = '';
}

// Guarda o conjunto so quando avisou. Se alguem entrou dentro dos 15 min de piso, continua
// contando como novo na proxima rodada em vez de passar batido.
if (gravarIds !== null) {
  await sql("insert into serena_config (chave, valor) values ('fila_humano_ids', '" + gravarIds.replace(/'/g, '') + "') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()");
}

return out.map((o) => ({ json: o }));
