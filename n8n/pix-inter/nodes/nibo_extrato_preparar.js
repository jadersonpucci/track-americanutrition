// Varredura do extrato do Inter (Banking API, escopo extrato.read): a cada 10 min ou GET /webhook/inter-nibo-varrer?t=TOKEN&dias=N
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
let manual = false, dias = 2;
try {
  const q = $('Nibo Extrato: Varrer (manual)').first().json.query || {};
  if (q && Object.keys(q).length) {
    manual = true;
    if (!cfg.pix_admin_token || String(q.t || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado' } }];
    dias = Math.min(90, Math.max(1, parseInt(q.dias || '2') || 2));
  }
} catch (e) { manual = false; }
if (!manual && String(cfg.nibo_lancar || 'off') !== 'on') return [{ json: { ok: false, pulou: true, motivo: 'nibo_lancar=off' } }];
if (!manual && String(cfg.nibo_extrato || 'on') === 'off') return [{ json: { ok: false, pulou: true, motivo: 'nibo_extrato=off' } }];

let tk;
try {
  tk = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-token', json: true, timeout: 30000, body: { k: cfg.pix_admin_token, escopo: 'extrato' } });
  if (!tk || !tk.ok || !tk.token) throw new Error((tk && tk.erro) || 'token indisponivel');
} catch (e) { return [{ json: { ok: false, erro: 'token extrato: ' + String(e && e.message || e).slice(0, 200) + ' (libere a permissao Extrato na aplicacao da API do Inter)' } }]; }

const fmt = d => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const fim = fmt(new Date());
const ini = fmt(new Date(Date.now() - dias * 86400000));
return [{ json: {
  ok: true, manual: manual, dias: dias, dataInicio: ini, dataFim: fim,
  token: tk.token, base: tk.base, conta: String(cfg.inter_conta_corrente || '').trim(),
  url: tk.base + '/banking/v2/extrato/completo?dataInicio=' + ini + '&dataFim=' + fim + '&tipoOperacao=C&pagina=0&tamanhoPagina=200'
} }];
