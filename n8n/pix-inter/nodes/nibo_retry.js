// Reenvia ao Nibo os lancamentos que ficaram em 'erro' (ex.: pedido Shopify ainda nao existia, Nibo fora do ar).
// Roda a cada 10 min: cada linha volta pelo /webhook/inter-nibo-lancar (linhas em 'erro' sao aceitas de novo pelo Registrar).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = $('Nibo Retry: Config').first().json.cfg || {};
const linhas = $input.all().map(i => i.json).filter(r => r && r.chave);
const res = { pendentes: linhas.length, lancados: 0, erros: 0, ignorados: 0, detalhes: [] };
if (String(cfg.nibo_lancar || 'off') !== 'on' || !cfg.pix_admin_token) return [{ json: Object.assign(res, { pulou: true, motivo: 'nibo_lancar=off' }) }];
for (const r of linhas) {
  try {
    const l = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-nibo-lancar', json: true, timeout: 60000, body: {
      k: cfg.pix_admin_token, chave: r.chave, origem: 'retry', tipo: r.tipo || 'PIX', valor: Number(r.valor), data: r.data ? String(r.data).slice(0, 10) : '',
      nome: r.nome || '', documento: r.documento || '', descricao: r.descricao || '', referencia: r.referencia || '', txid: r.txid || '',
      end_to_end_id: r.end_to_end_id || '', id_transacao: r.id_transacao || '', detalhes: r.detalhes || {}
    } });
    if (l && l.lancado) res.lancados++; else if (l && l.ignorado) res.ignorados++; else { res.erros++; res.detalhes.push({ chave: r.chave, erro: (l && (l.erro || l.motivo)) || 'sem resposta' }); }
  } catch (e) { res.erros++; res.detalhes.push({ chave: r.chave, erro: String(e && e.message || e).slice(0, 200) }); }
}
res.detalhes = res.detalhes.slice(0, 20);
return [{ json: res }];
