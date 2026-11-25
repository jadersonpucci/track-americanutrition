// Node "Registrar Silencio" do workflow "Grupos | Samuel Responde" (n8n 0OwXSCNKh3zpvyFG).
// Chaves reais so no n8n.
// Grava o que o Samuel quis dizer e nao disse, com o motivo. E assim que se audita a mira.
const d = $input.first().json || {};
if (d.registrar !== true) return [{ json: { ok: true, registrado: false, acao: d.acao || null } }];
const c = d.ctx || {};
const SK = 'SUPABASE_SERVICE_KEY';
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 900) + "'");
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, json: true, timeout: 20000, body: { query:
    'insert into grupo_bot_log (grupo_jid, autor, push_name, msg_id, texto, intencao, produto, acao, detalhe) values (' + E(c.jid) + ',' + E(d.autor || c.telefone || String(c.participant || '').split('@')[0]) + ',' + E(c.push_name) + ',' + E(c.msg_id) + ',' + E(c.texto) + ',' + E(d.intencao) + ',' + E(d.produto) + ',' + E(d.acao) + ',' + E((d.motivo || '') + (d.motivo_ia ? ' | ia: ' + d.motivo_ia : '')) + ')'
  } });
} catch (e) { }
return [{ json: { ok: true, registrado: true, acao: d.acao, motivo: d.motivo } }];
