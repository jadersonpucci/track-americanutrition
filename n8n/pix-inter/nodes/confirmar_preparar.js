// Decide se precisa consultar a cobranca no Inter. Chamado pelo polling do checkout (a cada 5s) e pelo webhook do Inter.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const j = $input.first().json || {};
const cfg = j.cfg || {};
const cob = j.cobranca || null;
const root = $('Confirmar: Requisição').first().json;
const body = root.body || root || {};
const force = body.force === true;
if (!cob) return [{ json: { fim: true, paid: false, status: 'not_found' } }];
if (cob.confirmado_em) return [{ json: { fim: true, paid: true, status: 'paid', ja_confirmado: true } }];

// Polling: no maximo 1 consulta ao Inter a cada 12s por cobranca (o webhook do Inter chega em tempo real de qualquer forma).
const sd = $getWorkflowStaticData('global');
sd.consulta_em = sd.consulta_em || {};
const ultima = Number(sd.consulta_em[cob.txid] || 0);
if (!force && Date.now() - ultima < 12000) return [{ json: { fim: true, paid: false, status: cob.status || 'ATIVA', throttled: true } }];
sd.consulta_em[cob.txid] = Date.now();
if (Object.keys(sd.consulta_em).length > 5000) { sd.consulta_em = {}; }

let tk;
try {
  tk = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-token', json: true, timeout: 30000, body: { k: cfg.pix_admin_token } });
  if (!tk || !tk.ok || !tk.token) throw new Error((tk && tk.erro) || 'token Inter indisponivel');
} catch (e) { return [{ json: { fim: true, paid: false, status: 'erro', erro: 'token: ' + String(e && e.message || e).slice(0, 200) } }]; }

return [{ json: { fim: false, txid: cob.txid, token: tk.token, base: tk.base, conta: String(cfg.inter_conta_corrente || '').trim() } }];
