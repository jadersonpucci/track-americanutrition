// Cada credito do extrato vira um recebimento no Nibo (dedupe por endToEndId para PIX, idTransacao para o resto).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const b = r.body || {};
const prep = $('Nibo Extrato: Preparar').first().json;
const cfg = $('Nibo Extrato: Config').first().json.cfg || {};
if (!(st >= 200 && st < 300)) return [{ json: { ok: false, erro: 'Inter extrato HTTP ' + st + ': ' + JSON.stringify(b).slice(0, 300), periodo: [prep.dataInicio, prep.dataFim] } }];
const trans = Array.isArray(b.transacoes) ? b.transacoes : [];
const res = { ok: true, periodo: [prep.dataInicio, prep.dataFim], total: trans.length, creditos: 0, lancados: 0, duplicados: 0, ignorados: 0, erros: 0, totalPaginas: b.totalPaginas || 1, detalhes: [] };
for (const t of trans) {
  if (String(t.tipoOperacao || '').toUpperCase() !== 'C') continue;
  res.creditos++;
  const det = (t.detalhes && typeof t.detalhes === 'object') ? t.detalhes : {};
  const tipo = String(t.tipoTransacao || 'OUTRO').toUpperCase();
  const e2e = String(det.endToEndId || '').trim();
  const idT = String(t.idTransacao || '').trim();
  const chave = e2e ? ('pix:' + e2e) : (idT ? ('inter:' + idT) : ('inter:' + [t.dataTransacao || t.dataEntrada, t.valor, t.titulo].join('|').slice(0, 100)));
  const nome = det.nomePagador || det.nomeEmpresaPagador || det.nomeRemetente || '';
  const ev = {
    k: cfg.pix_admin_token, chave: chave, origem: 'extrato', tipo: tipo,
    valor: Number(String(t.valor || '0').replace(',', '.')),
    data: String(t.dataTransacao || t.dataEntrada || '').slice(0, 10),
    nome: nome, documento: det.cpfCnpjPagador || det.cpfCnpjRemetente || '',
    descricao: [t.titulo, t.descricao, det.descricaoPix, det.descricaoTransferencia].filter(Boolean).join(' - ').slice(0, 200),
    referencia: e2e || idT, txid: det.txId || det.txid || '', end_to_end_id: e2e, id_transacao: idT,
    detalhes: { tipoDetalhe: det.tipoDetalhe || '', titulo: t.titulo || '', dataInclusao: t.dataInclusao || '' }
  };
  try {
    const l = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-nibo-lancar', json: true, timeout: 45000, body: ev });
    if (l && l.lancado) res.lancados++; else if (l && l.duplicado) res.duplicados++; else if (l && l.ignorado) res.ignorados++; else { res.erros++; res.detalhes.push({ chave: chave, erro: (l && (l.erro || l.motivo)) || 'sem resposta' }); }
  } catch (e) { res.erros++; res.detalhes.push({ chave: chave, erro: String(e && e.message || e).slice(0, 200) }); }
}
res.detalhes = res.detalhes.slice(0, 20);
return [{ json: res }];
