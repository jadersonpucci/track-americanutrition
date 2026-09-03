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
await sql("insert into serena_wpp_lock (telefone, ate) values ('" + telefone + "', now() + interval '120 seconds') on conflict (telefone) do update set ate = excluded.ate");

let r;
try {
  r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-core', json: true, timeout: 180000, body: corpo });
} catch (e) {
  await soltar();
  throw new Error('Serena Core indisponivel: ' + e.message);
}

// pausada = um humano assumiu essa conversa no painel; sem resposta = erro no Core (fica no log)
if (!r || r.pausada === true) { await soltar(); return []; }
if (!r.resposta) { await soltar(); throw new Error('Serena Core sem resposta: ' + (r.erro || 'desconhecido')); }

const resposta = String(r.resposta);
// Audio de resposta: so quando o cliente mandou audio, a resposta e curta e nao tem link
const audioOk = p.audio === true && !!p.voz_id && resposta.length <= 400 && !/https?:\/\//i.test(resposta);

return [{ json: { telefone: telefone, contato_id: r.contato_id || null, resposta: resposta, ferramentas: r.ferramentas || [], handoff: !!r.handoff, audio_ok: audioOk, voz_id: p.voz_id || '' } }];
