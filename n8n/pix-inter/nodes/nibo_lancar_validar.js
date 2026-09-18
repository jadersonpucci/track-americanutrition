// Normaliza um recebimento do Inter para lancar no Nibo. Exige k = pix_admin_token (chamado so por nos internos).
// body: { k, chave (unica), origem, tipo, valor (reais), data (ISO/YYYY-MM-DD), nome, documento, descricao, referencia, txid, end_to_end_id, id_transacao, detalhes }
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Nibo Lançar: Requisição').first().json;
const b = root.body || root || {};
if (!cfg.pix_admin_token || String(b.k || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado' } }];
const chave = String(b.chave || '').trim().slice(0, 120);
const valor = Math.round(Number(b.valor || 0) * 100) / 100;
if (!chave) return [{ json: { ok: false, erro: 'chave obrigatoria' } }];
if (!(valor > 0)) return [{ json: { ok: false, erro: 'valor invalido' } }];
const dig = s => String(s == null ? '' : s).replace(/[^0-9]/g, '');
let data = String(b.data || '').trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
  const d = data ? new Date(data) : new Date();
  data = (isNaN(d) ? new Date() : d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
return [{ json: {
  ok: true,
  chave: chave,
  origem: String(b.origem || '').slice(0, 40),
  tipo: String(b.tipo || 'PIX').toUpperCase().slice(0, 40),
  valor: valor,
  data: data,
  nome: String(b.nome || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  documento: dig(b.documento).slice(0, 14),
  descricao: String(b.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  referencia: String(b.referencia || '').trim().slice(0, 100),
  txid: String(b.txid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 35),
  end_to_end_id: String(b.end_to_end_id || '').trim().slice(0, 40),
  id_transacao: String(b.id_transacao || '').trim().slice(0, 80),
  detalhes: JSON.stringify(b.detalhes && typeof b.detalhes === 'object' ? b.detalhes : {})
} }];
