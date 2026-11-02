// No "Chamar Serena Core" da Entrada Samuel (zeJ8nScEpt7TckFb). SUPABASE_SERVICE_KEY fica so no n8n.
const c = $input.first().json || {};
const p = $('Pode Responder?').first().json || {};
const telefone = String(c.telefone || p.telefone || '').replace(/\D/g, '');
const texto = String(c.texto || '').trim();
if (!telefone || !texto) return [];

const corpo = { canal: 'whatsapp', telefone: telefone, texto: texto };
if (c.nome || p.nome) corpo.nome = c.nome || p.nome;

// Trava por telefone (serena_wpp_lock): mensagens que chegarem enquanto a Serena esta respondendo esperam
// a resposta sair (Coletar Buffer segura enquanto a trava existe). Evita duas respostas cruzadas e link repetido.
// A trava e apagada no Marcar Entregue; vence sozinha em 120 s se algo falhar no meio.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const sql = async (q) => { try { await this.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 10000 }); } catch (e) {} };
const soltar = () => sql("delete from serena_wpp_lock where telefone = '" + telefone + "'");

// PESQUISA DE SATISFACAO (02/11/2026): o [Serena] Pesquisa de Satisfacao pergunta "de 1 a 5, como foi?". Se a ultima fala
// da Serena para o contato e essa pergunta e o cliente responde com a nota (numero, estrelas ou por extenso), a nota vai
// para serena_satisfacao e a resposta sai daqui mesmo, sem o Core. Nota ate 3: pergunta o que faltou e avisa no Telegram.
// A mensagem seguinte (o comentario) segue para o Core normalmente e tambem e gravada e avisada.
const TG_BOT = '<TOKEN_ALERTAS>';
const sqlR = async (q) => { try { const r = await this.helpers.httpRequest({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 10000 }); return Array.isArray(r) ? r : []; } catch (e) { return []; } };
const Q = (v) => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
const alertar = async (t) => { try { await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + TG_BOT + '/sendMessage', json: true, timeout: 10000, body: { chat_id: '-1003766435449', message_thread_id: 289, parse_mode: 'HTML', disable_web_page_preview: true, text: t } }); } catch (e) {} };
const h = (s) => String(s == null ? '' : s).replace(/[<>&]/g, ' ');
function lerNota(t) {
  const s = String(t || '').trim().toLowerCase();
  if (!s || s.length > 120) return null;
  const estrelas = (s.match(/⭐|🌟/g) || []).length;
  if (estrelas >= 1 && estrelas <= 5 && /^[⭐🌟\s!.]+$/u.test(s)) return { nota: estrelas, resto: '' };
  const ext = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5 };
  const m = s.match(/^(?:nota\s*)?([1-5]|um|uma|dois|duas|tr[eê]s|quatro|cinco)(?![0-9])(?:\s*(?:\/\s*5|de\s*5|estrelas?|[⭐🌟]+))?\s*[!.,;:-]*\s*([\s\S]*)$/u);
  if (!m) return null;
  // por extenso so vale sozinho ("cinco"); "uma duvida" ou "dois frascos" nao e nota
  if (!/^[1-5]$/.test(m[1]) && String(m[2] || '').trim()) return null;
  const n = /^[1-5]$/.test(m[1]) ? Number(m[1]) : ext[m[1]];
  return n ? { nota: n, resto: String(m[2] || '').trim() } : null;
}
const pesq = await sqlR("select id, contato_id, nome, nota, comentario, respondido_em > now() - interval '24 hours' as recente from serena_satisfacao where status = 'enviado' and serena_tel_canon(telefone) = serena_tel_canon(" + Q(telefone) + ") and enviado_em > now() - interval '48 hours' order by enviado_em desc limit 1");
if (pesq.length) {
  const s = pesq[0];
  const ult = await sqlR("select autor from serena_mensagens where contato_id = " + Q(s.contato_id) + "::uuid and papel = 'serena' order by criado_em desc limit 1");
  const ultAutor = ult[0] ? String(ult[0].autor || '') : '';
  const lida = (s.nota == null && ultAutor === 'proativo:satisfacao') ? lerNota(texto) : null;
  if (lida) {
    const coment = lida.nota <= 3 && lida.resto.length >= 8 ? lida.resto : null;
    let resp;
    if (lida.nota === 5) resp = 'Que bom saber! 💙 Obrigada pelo retorno, fico muito feliz em ajudar. Qualquer coisa, é só me chamar por aqui.';
    else if (lida.nota === 4) resp = 'Obrigada pelo retorno! 💙 Se tiver algo que eu possa fazer melhor, me conta, tá?';
    else if (coment) resp = 'Obrigada por me contar, e sinto muito que não foi como você esperava 🙏 Já passei o que você escreveu para a nossa equipe, que vai olhar com cuidado.';
    else resp = 'Obrigada por me contar, e sinto muito que não foi como você esperava 🙏 O que eu poderia ter feito melhor? Sua resposta vai direto para a nossa equipe.';
    await sqlR("update serena_satisfacao set nota = " + lida.nota + ", respondido_em = now()" + (coment ? ", comentario = " + Q(coment) + ", comentario_em = now()" : "") + " where id = " + Number(s.id));
    await sqlR("insert into serena_mensagens (contato_id, papel, texto, canal, criado_em) values (" + Q(s.contato_id) + "::uuid, 'cliente', " + Q(texto) + ", 'whatsapp', now()); "
      + "insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) values (" + Q(s.contato_id) + "::uuid, 'serena', " + Q(resp) + ", 'whatsapp', 'satisfacao:resposta', false, now() + interval '1 second')");
    if (lida.nota <= 3) await alertar('⚠️ <b>Nota ' + lida.nota + ' na pesquisa da Serena</b>' + String.fromCharCode(10) + h(s.nome || telefone) + ' · https://wa.me/' + telefone + (coment ? String.fromCharCode(10) + '💬 ' + h(coment).slice(0, 600) : ''));
    return [{ json: { telefone: telefone, contato_id: s.contato_id, resposta: resp, lista: null, arquivo: null, ferramentas: [], handoff: false, audio_ok: false, voz_id: p.voz_id || '' } }];
  }
  if (s.nota != null && Number(s.nota) <= 3 && !s.comentario && s.recente === true && ultAutor === 'satisfacao:resposta') {
    await sqlR("update serena_satisfacao set comentario = " + Q(texto.slice(0, 2000)) + ", comentario_em = now() where id = " + Number(s.id));
    await alertar('💬 <b>O que faltou (nota ' + s.nota + ')</b>' + String.fromCharCode(10) + h(s.nome || telefone) + ' · https://wa.me/' + telefone + String.fromCharCode(10) + h(texto).slice(0, 800));
  }
}

await sql("insert into serena_wpp_lock (telefone, ate) values ('" + telefone + "', now() + interval '120 seconds') on conflict (telefone) do update set ate = excluded.ate");

let r;
try {
  r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-core', json: true, timeout: 180000, body: corpo });
} catch (e) {
  await soltar();
  throw new Error('Serena Core indisponivel: ' + e.message);
}

// RESPOSTA AUTOMATICA DE AUSENCIA (15/10/2026): o WhatsApp Business do cliente responde sozinho ("no momento
// nao posso atender, retorno assim que possivel"). A Serena fica calada, e esta certo; mas a segunda tentativa
// e o reprocessamento liam o silencio como falha e mandavam responder "a tudo o que ficou pendente". No caso
// Sheila (14/10 18:57) ela escreveu para a cliente a propria justificativa de nao responder. Mesmo detector do
// [Serena WhatsApp] Reprocessar sem resposta: precisa de "estou indisponivel" + "retorno", e cai fora com
// pergunta ou palavra de compra, para nunca calar um pedido de verdade.
const normA = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function ehAutoResposta(txt) {
  const t = normA(txt);
  if (!t || t.length > 600 || /^\[cliente enviou/.test(t) || /\?/.test(t)) return false;
  if (/\b(quero|queria|link|pedido|frasco|preco|valor|comprar|pix|boleto|cartao|imunofosfo)\b/.test(t)) return false;
  const ausente = /(nao (estamos|estou) (disponive|disponiv)|nao (posso|podemos|consigo) (atender|responder)|no momento (nao (posso|podemos|estamos|estou)|estamos ocupad|estou ocupad)|estarei ausente|estou ausente|fora do horario|deixe sua mensagem|mensagem automatica|resposta automatica)/.test(t);
  const retorno = /(assim que (possivel|puder)|em breve|retornare(i|mos)|retorno|responde(rei|remos)|entrare(i|mos) em contato|lhe atenderemos|atenderemos)/.test(t);
  return ausente && retorno;
}
const autoResposta = ehAutoResposta(texto);

// SEGUNDA TENTATIVA (15/09/2026): de vez em quando o Core responde ok sem texto (o modelo encerrou sem
// escrever; caso Marizel, 14/09 22:43, atendida so pelo reprocessamento 7 min depois). Antes de desistir,
// pede de novo em modo reprocessar: nao regrava a pergunta e responde a tudo o que ficou pendente.
// Resposta automatica de ausencia nao ganha segunda tentativa: o silencio ali e a resposta certa.
if (r && !r.resposta && r.pausada !== true && !autoResposta) {
  await new Promise((ok) => setTimeout(ok, 1500));
  try {
    const r2 = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-core', json: true, timeout: 180000, body: Object.assign({}, corpo, { modo: 'reprocessar' }) });
    if (r2 && (r2.resposta || r2.pausada === true)) { r = r2; }
    else if (r2 && r2.erro && !r.erro) { r.erro = r2.erro; }
  } catch (e) { if (!r.erro) r.erro = 'segunda tentativa: ' + e.message; }
}

// pausada = um humano assumiu essa conversa no painel; sem resposta = erro no Core (fica no log)
if (!r || r.pausada === true) { await soltar(); return []; }
if (!r.resposta && autoResposta) { await soltar(); return []; }
if (!r.resposta) { await soltar(); throw new Error('Serena Core sem resposta: ' + (r.erro || 'desconhecido')); }

const resposta = String(r.resposta);
// Audio de resposta: so quando o cliente mandou audio, a resposta e curta e nao tem link
const audioOk = p.audio === true && !!p.voz_id && resposta.length <= 400 && !/https?:\/\//i.test(resposta);

// NOTA FISCAL (02/11/2026): quando o cliente pede a nota, a Serena responde com o link do DANFE que esta nos fatos
// do contato (gravado pelo gatilho nfe_fato_serena quando a nota e autorizada). Aqui o link sai do texto e vira o
// PDF anexado, pelo mesmo caminho do [[ARQUIVO]]. A resposta com link nunca vai em audio (audioOk acima).
let textoFinal = resposta;
let arquivo = r.arquivo || null;
const mNf = resposta.match(/https:\/\/api\.focusnfe\.com\.br\/arquivos\/\S+?\/DANFEs\/\d{44}\.pdf/);
if (mNf && !arquivo) {
  const ped = (resposta.match(/AN-\d{3,}/i) || [''])[0].toUpperCase();
  arquivo = { chave: 'nota-fiscal', url: mNf[0], tipo: 'document', nome: 'Nota fiscal' + (ped ? ' ' + ped : '') + '.pdf', legenda: '' };
  textoFinal = resposta.replace(mNf[0], '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || ('Segue a nota fiscal' + (ped ? ' do seu pedido ' + ped : '') + ' 💙');
}

// lista e arquivo (PDF/imagem marcado com [[ARQUIVO: chave]]) precisam atravessar ate o Fatiar Resposta,
// que os prende na ultima parte da mensagem para o Enviar Lista / Enviar Arquivo despacharem.
return [{ json: { telefone: telefone, contato_id: r.contato_id || null, resposta: textoFinal, lista: r.lista || null, arquivo: arquivo, ferramentas: r.ferramentas || [], handoff: !!r.handoff, audio_ok: audioOk, voz_id: p.voz_id || '' } }];
