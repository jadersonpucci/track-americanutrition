// Painel de NF-e, no 'Montar resposta': junta o pedido (Agir), a situacao da nota (Reler NF-e) e o que aconteceu.
const A = $('Agir').first().json;
if (!A.ok) return [{ json: { ok: false, erro: A.erro } }];
const row = $('Reler NF-e').first().json || {};
const out = { ok: true, pedido: A.pedido, acao: A.acao, shopify: A.shopify, avisos: (A.avisos || []).slice(),
  nfe: { status: row.status || 'sem registro', mensagem: row.mensagem || '',
    numero: A.mf.numero || (row.numero ? row.numero + ' / serie ' + row.serie : ''), chave: A.mf.chave || row.chave || '',
    danfe: A.mf.danfe || row.danfe_url || '', xml: row.xml_url || '' } };
const roboErro = (rb) => {
  if (!rb) return '';
  if (rb.error) { const m = typeof rb.error === 'string' ? rb.error : String(rb.error.message || 'falhou'); return /credential/i.test(m) ? 'O emissor não foi chamado: falta cadastrar a credencial "NF-e robo (token manual)" no n8n.' : 'Emissor: ' + m.slice(0, 200); }
  if (rb.ok === false) return 'Emissor: ' + (rb.erro || 'falhou');
  return '';
};
try { const v = $('Avaliar reenvio').first().json; if (v) { out.reenvio = { aceito: v.aceito, http: v.http }; if (v.aviso) out.avisos.push(v.aviso); } } catch (e) {}
try { const m = roboErro($('Robô').first().json); if (m) out.avisos.push(m); } catch (e) {}
try { const v = $('Avaliar reenvio').first().json; if (!v.naoEnviado) { const m = roboErro($('Robô (acompanhar)').first().json); if (m) out.avisos.push(m); } } catch (e) {}
return [{ json: out }];
